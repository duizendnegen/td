// Placement validation and removal
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
//   - The removal gate (canRemove) — the one predicate the sim and every UI
//     remove control share, reading the phase AND the structure, since a wave
//     gates only committed construction
//   - The move gate (moveOpenIn) — build phase only, every structure kind;
//     validateMove applies the mover's own terrain rule at the destination
//   - Immediate removal: unblock, refund, drop, all in the calling tick; a
//     socket tile is never unblocked or rebuilt over (D6)

import { refundMg } from './economy';
import { toTile } from './fixed';
import type { FlowField } from './flowfield';
import { buildFieldInto } from './flowfield';
import type { Grid } from './grid';
import { TERRAIN } from './grid';
import type { Enemy, RunPhase, SimState, Structure, StructureKind } from './types';

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
 * The move validation pipeline (tower-drag-move design D2): the same
 * conditions placement validates for the mover's kind at the destination —
 * dirt takes walls and towers, a socket takes towers only — with the path and
 * enemy checks evaluated against the mask with the origin tile freed and the
 * destination blocked, both applied together — so a tower can slide along its
 * own wall line, a wall can shift a maze line, or either can swap into the
 * space it opens up. A destination equal to the mover's own tile maps onto
 * 'occupied' (the verdict vocabulary is reused, not extended; the UI treats
 * that drop as a put-down and never issues it — design D4/D6).
 *
 * Pure in the observable sense, like validatePlacement: both mask edits are
 * unconditionally restored before returning. On an 'ok' that changed the
 * mask, `scratch` holds exactly the post-move fields, so an accepting caller
 * applies both edits and swaps them in without a second rebuild.
 *
 * Socket asymmetry (D6): a socket destination skips path and enemy checks —
 * the tile was never navigable, and freeing the origin can only lower costs,
 * so no seal or strand is possible — but a mask-blocked origin still frees,
 * so unlike placement's socket fast-path the scratch fields ARE rebuilt for
 * the caller to swap in. A socket→socket move touches no mask and rebuilds
 * nothing.
 */
export function validateMove(
  grid: Grid,
  mover: Structure,
  toTx: number,
  toTy: number,
  structures: readonly Structure[],
  enemies: readonly Enemy[],
  allSpawns: readonly { x: number; y: number }[],
  activeSpawns: readonly { x: number; y: number }[],
  treasury: { x: number; y: number },
  scratch: { inbound: FlowField; returning: FlowField },
): PlacementVerdict {
  if (toTx === mover.tx && toTy === mover.ty) return 'occupied';
  if (!grid.inBounds(toTx, toTy)) return 'out-of-bounds';
  const terrain = grid.terrainAt(toTx, toTy);
  if (terrain === TERRAIN.grass || terrain === TERRAIN.rock) return 'not-buildable';
  // A tower's origin is mask-blocked exactly when it stands off socket
  // ground; a socket origin is terrain-blocked either way and never frees.
  const originFrees = grid.terrainAt(mover.tx, mover.ty) !== TERRAIN.socket;
  if (terrain === TERRAIN.socket) {
    if (mover.kind !== 'tower') return 'not-buildable';
    // Occupancy is the structure list — the mask says blocked for every
    // socket. The mover reports itself only on its own tile, already rejected.
    if (structureAt(structures, toTx, toTy)) return 'occupied';
    if (originFrees) {
      grid.setBlocked(mover.tx, mover.ty, false);
      buildFieldInto(grid, [treasury], scratch.inbound);
      buildFieldInto(grid, activeSpawns, scratch.returning);
      grid.setBlocked(mover.tx, mover.ty, true);
    }
    return 'ok';
  }
  if (grid.isBlocked(toTx, toTy)) return 'occupied';
  const footprint = footprintFor(toTx, toTy);
  for (const e of enemies) {
    if (!e.alive) continue;
    const etx = toTile(e.pos.x);
    const ety = toTile(e.pos.y);
    if (footprint.some((t) => t.x === etx && t.y === ety)) return 'enemy-in-footprint';
  }

  // Both tentative mask edits together; every return path below restores them.
  if (originFrees) grid.setBlocked(mover.tx, mover.ty, false);
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
  if (originFrees) grid.setBlocked(mover.tx, mover.ty, true);
  return verdict;
}

/**
 * Whether structures may be moved in `phase` (structure-placement delta): the
 * build phase only — a wave refuses even provisional construction (remove +
 * re-place already covers mid-wave revision, at full refund), and so does the
 * settled lock. One predicate, no per-structure twin (design D7): every kind
 * moves in the build phase and nothing moves outside it. Shared like
 * removalOpenIn: the palette's move tool, the authoritative apply, the
 * speculative previews, and the UI lift all read this one gate so they
 * cannot drift.
 */
export function moveOpenIn(phase: RunPhase): boolean {
  return phase === 'build';
}

/**
 * Whether `s` may be removed in `phase` (structure-placement spec).
 *
 * An allowlist, not `phase !== 'wave'`: 'won' and 'lost' are refused too,
 * because a refund landing after the run ended would rewrite a final balance
 * the run summary already reported. 'settled-locked' MUST stay open — that
 * liquidation is the only way back to solvency and to the win.
 *
 * The wave prohibition consults the structure (provisional-construction design
 * D3): it bans opening and closing an ESTABLISHED maze mid-wave. A provisional
 * structure has not existed for a single advanced tick of that wave, so
 * unwinding it cannot alter the maze the wave began against.
 *
 * Shared, like canSpend: the authoritative apply and every UI surface that
 * renders a remove control call this one predicate so they cannot drift.
 */
export function canRemove(phase: RunPhase, s: Structure): boolean {
  if (phase === 'build' || phase === 'settled-locked') return true;
  return phase === 'wave' && s.provisional;
}

/**
 * Whether ANY structure could be removable in `phase` — the gate for controls
 * that have no target yet, the palette's remove tool above all. True through
 * a wave now that provisional construction stays sellable (build-ui spec); the
 * per-structure verdict lands at the click, through canRemove.
 */
export function removalOpenIn(phase: RunPhase): boolean {
  return phase === 'build' || phase === 'settled-locked' || phase === 'wave';
}

/**
 * Remove `s` outright — unblock the footprint, credit the refund it is owed
 * (full while provisional, the floored fraction once committed), and drop the
 * structure — all in the calling tick.
 * Returns whether the blocked mask changed, in which case the caller rebuilds
 * the live fields and runs the commitment-invalidation sweep.
 *
 * No validation runs here beyond what the caller already checked, and none is
 * needed: unblocking a tile is monotone on the flow fields (every cost stays
 * equal or falls), so a removal can never seal a spawn or strand an enemy,
 * and no enemy can stand on a blocked tile to begin with.
 *
 * Socket asymmetry (D6): a socket structure's tile is terrain-blocked, not
 * structure-blocked, so its removal never unblocks the tile and never counts
 * as a mask change — the refund is the only effect.
 */
export function removeStructure(
  state: SimState,
  grid: Grid,
  s: Structure,
  refundPer1000: number,
): boolean {
  let changed = false;
  if (grid.terrainAt(s.tx, s.ty) !== TERRAIN.socket) {
    grid.setBlocked(s.tx, s.ty, false);
    changed = true;
  }
  state.treasuryMg += refundMg(s, refundPer1000);
  state.structures = state.structures.filter((x) => x !== s);
  return changed;
}
