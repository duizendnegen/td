// Placement validation and removal timers
// See ARCHITECTURE.md §7 and phase-2 design D1–D3
//
// Responsibilities:
//   - Bounds, occupancy, and no-enemy-in-footprint checks
//   - Reachability: every active spawn AND every live enemy
//   - Purity: the tentative mask is unconditionally restored; fields are
//     rebuilt into caller-owned scratch buffers (spare-buffer swap)
//   - Removal delay 80 ticks; the tile stays blocked throughout

import { toTile } from './fixed';
import type { FlowField } from './flowfield';
import { buildFieldInto } from './flowfield';
import type { Grid } from './grid';
import type { Enemy, SimState, Structure, StructureKind } from './types';

export interface FootprintTile {
  x: number;
  y: number;
}

/** Footprint tiles for a structure kind at north-west tile (tx, ty). */
export function footprintFor(kind: StructureKind, tx: number, ty: number): FootprintTile[] {
  if (kind === 'wall') return [{ x: tx, y: ty }];
  return [
    { x: tx, y: ty },
    { x: tx + 1, y: ty },
    { x: tx, y: ty + 1 },
    { x: tx + 1, y: ty + 1 },
  ];
}

/** The structure whose footprint contains (tx, ty), or null. */
export function structureAt(
  structures: readonly Structure[],
  tx: number,
  ty: number,
): Structure | null {
  for (const s of structures) {
    const size = s.kind === 'wall' ? 1 : 2;
    if (tx >= s.tx && tx < s.tx + size && ty >= s.ty && ty < s.ty + size) return s;
  }
  return null;
}

export type PlacementVerdict =
  | 'ok'
  | 'no-funds'
  | 'out-of-bounds'
  | 'occupied'
  | 'enemy-in-footprint'
  | 'seals-spawn'
  | 'strands-enemy';

/**
 * The six-check pipeline (design D1), pure in the observable sense: the
 * footprint is tentatively blocked, both fields are rebuilt into `scratch`,
 * and the mask is unconditionally restored before returning. On 'ok' the
 * scratch fields hold exactly the post-placement fields, so an accepting
 * caller re-blocks the footprint and swaps them in without a second rebuild.
 *
 * Committed waypoints are deliberately NOT checked (design D2): acceptance is
 * judged on current tiles only, and the invalidation sweep repairs stale
 * commitments after the mask change.
 */
export function validatePlacement(
  grid: Grid,
  enemies: readonly Enemy[],
  activeSpawns: readonly { x: number; y: number }[],
  treasury: { x: number; y: number },
  footprint: readonly FootprintTile[],
  scratch: { inbound: FlowField; returning: FlowField },
): PlacementVerdict {
  for (const t of footprint) {
    if (!grid.inBounds(t.x, t.y)) return 'out-of-bounds';
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
  for (const s of activeSpawns) {
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
 */
export function tickRemovals(state: SimState, grid: Grid, refundPer1000: number): boolean {
  let changed = false;
  for (const s of state.structures) {
    if (s.removalCompleteTick < 0 || state.tick < s.removalCompleteTick) continue;
    for (const t of footprintFor(s.kind, s.tx, s.ty)) grid.setBlocked(t.x, t.y, false);
    state.treasuryMg += Math.floor((s.paidMg * refundPer1000) / 1000);
    s.removalCompleteTick = -2; // reaped below
    changed = true;
  }
  if (changed) {
    state.structures = state.structures.filter((s) => s.removalCompleteTick !== -2);
  }
  return changed;
}
