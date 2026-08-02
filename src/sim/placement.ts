// Placement validation and removal timers
// See ARCHITECTURE.md §7, phase-2 design D1–D3, and phase-4 designs D4/D6
//
// Responsibilities:
//   - Terrain buildability: dirt takes walls+towers, socket towers only,
//     grass/rock nothing (phase-4 structure-placement spec)
//   - Socket placements skip path and enemy validation entirely — the tile
//     was never navigable, so the mask and fields are unaffected (D6)
//   - Bounds, occupancy, and no-enemy-in-footprint checks
//   - Reachability: every DECLARED spawn (dormant included, D4) AND every
//     live enemy in the field matching its state
//   - Purity: the tentative mask is unconditionally restored; fields are
//     rebuilt into caller-owned scratch buffers (spare-buffer swap)
//   - Removal delay 80 ticks; a dirt tile stays blocked throughout, a socket
//     tile is never unblocked or rebuilt over (D6)

import { toTile } from './fixed';
import type { FlowField } from './flowfield';
import { buildFieldInto } from './flowfield';
import type { Grid } from './grid';
import { TERRAIN } from './grid';
import type { Enemy, SimState, Structure, StructureKind } from './types';

export interface FootprintTile {
  x: number;
  y: number;
}

/**
 * Footprint tiles for a structure at (tx, ty). Every structure is 1×1
 * (phase-3 design D1: towers are wall segments that shoot), so this is a
 * single tile; the array shape survives for the validation pipeline and the
 * placementRejected event.
 */
export function footprintFor(tx: number, ty: number): FootprintTile[] {
  return [{ x: tx, y: ty }];
}

/** The structure on tile (tx, ty), or null. */
export function structureAt(
  structures: readonly Structure[],
  tx: number,
  ty: number,
): Structure | null {
  for (const s of structures) {
    if (s.tx === tx && s.ty === ty) return s;
  }
  return null;
}

export type PlacementVerdict =
  | 'ok'
  | 'no-funds'
  | 'out-of-bounds'
  | 'not-buildable'
  | 'occupied'
  | 'enemy-in-footprint'
  | 'seals-spawn'
  | 'strands-enemy';

/**
 * The validation pipeline (phase-2 design D1 + phase-4 terrain rules), pure
 * in the observable sense: the footprint is tentatively blocked, both fields
 * are rebuilt into `scratch`, and the mask is unconditionally restored before
 * returning. On a dirt 'ok' the scratch fields hold exactly the
 * post-placement fields, so an accepting caller re-blocks the footprint and
 * swaps them in without a second rebuild.
 *
 * A socket placement returns 'ok' WITHOUT touching the mask or scratch (D6):
 * the tile was never navigable, so there is nothing to re-validate and the
 * caller must not swap fields for it.
 *
 * Spawn reachability iterates every DECLARED spawn — dormant included — so
 * the no-sealing invariant already holds when a spawn activates mid-run (D4).
 * The returning scratch field keeps active-spawn sources, matching what live
 * enemies actually steer by.
 */
export function validatePlacement(
  grid: Grid,
  kind: StructureKind,
  structures: readonly Structure[],
  enemies: readonly Enemy[],
  allSpawns: readonly { x: number; y: number }[],
  activeSpawns: readonly { x: number; y: number }[],
  treasury: { x: number; y: number },
  footprint: readonly FootprintTile[],
  scratch: { inbound: FlowField; returning: FlowField },
): PlacementVerdict {
  for (const t of footprint) {
    if (!grid.inBounds(t.x, t.y)) return 'out-of-bounds';
    const terrain = grid.terrainAt(t.x, t.y);
    if (terrain === TERRAIN.grass || terrain === TERRAIN.rock) return 'not-buildable';
    if (terrain === TERRAIN.socket) {
      if (kind !== 'tower') return 'not-buildable';
      // Socket branch (D6): occupancy is the structure list — the mask says
      // blocked for every socket — and no path or enemy checks apply.
      if (structureAt(structures, t.x, t.y)) return 'occupied';
      return 'ok';
    }
    if (grid.isBlocked(t.x, t.y)) return 'occupied';
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    const etx = toTile(e.pos.x);
    const ety = toTile(e.pos.y);
    if (footprint.some((t) => t.x === etx && t.y === ety)) return 'enemy-in-footprint';
  }

  // Tentative mask; every return path below restores it.
  for (const t of footprint) grid.setBlocked(t.x, t.y, true);
  buildFieldInto(grid, [treasury], scratch.inbound);
  buildFieldInto(grid, activeSpawns, scratch.returning);

  let verdict: PlacementVerdict = 'ok';
  for (const s of allSpawns) {
    if (scratch.inbound.cost[grid.idx(s.x, s.y)]! < 0) {
      verdict = 'seals-spawn';
      break;
    }
  }
  if (verdict === 'ok') {
    for (const e of enemies) {
      if (!e.alive) continue;
      const field = e.mode === 'inbound' ? scratch.inbound : scratch.returning;
      if (field.cost[grid.idx(toTile(e.pos.x), toTile(e.pos.y))]! < 0) {
        verdict = 'strands-enemy';
        break;
      }
    }
  }

  for (const t of footprint) grid.setBlocked(t.x, t.y, false);
  return verdict;
}

/**
 * Tick step 3: complete due removals — unblock the footprint, credit the
 * refund (floored, from the paid price), and drop the structure. Returns
 * whether the blocked mask changed, in which case the caller rebuilds the
 * live fields and runs the commitment-invalidation sweep.
 *
 * Socket asymmetry (D6): a socket structure's tile is terrain-blocked, not
 * structure-blocked, so its removal never unblocks the tile and never counts
 * as a mask change — the refund is the only effect.
 */
export function tickRemovals(state: SimState, grid: Grid, refundPer1000: number): boolean {
  let changed = false;
  let reap = false;
  for (const s of state.structures) {
    if (s.removalCompleteTick < 0 || state.tick < s.removalCompleteTick) continue;
    if (grid.terrainAt(s.tx, s.ty) !== TERRAIN.socket) {
      grid.setBlocked(s.tx, s.ty, false);
      changed = true;
    }
    state.treasuryMg += Math.floor((s.paidMg * refundPer1000) / 1000);
    s.removalCompleteTick = -2; // reaped below
    reap = true;
  }
  if (reap) {
    state.structures = state.structures.filter((s) => s.removalCompleteTick !== -2);
  }
  return changed;
}
