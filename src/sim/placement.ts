// Placement validation and removal
// See ARCHITECTURE.md §7, phase-2 design D1–D3, and phase-4 designs D4/D6
//
// Responsibilities:
//   - Terrain buildability: dirt takes walls, solar panels and batteries, and
//     towers on walls; a socket is a built-in foundation that takes towers
//     directly and never a ground structure; grass/rock nothing
//     (structure-placement spec, energy-infrastructure and add-battery deltas)
//   - Two layers per tile: the GROUND layer — a wall, a panel or a battery,
//     at most one (isGround), the only thing besides terrain that blocks —
//     and the tower on top of it. A panel or a battery (the utilities,
//     isUtility) rides the wall's path everywhere here — validation, move,
//     refund, removal gate — and differs from a wall in two ways only: it is
//     not a foundation (a tower stands on a wall or a socket, never on a
//     utility — otherwise it would strictly dominate the wall), and the
//     power step reads something off it: an output from a panel, a capacity
//     from a battery (energy-infrastructure design D7, add-battery design D1)
//   - Only the ground layer (and terrain) blocks: a tower is payload on a
//     foundation (build-over-walls). Tower placements skip path and enemy
//     validation entirely — the foundation tile is already blocked, so the
//     mask and fields are unaffected — generalising the phase-4 socket fast
//     path (D6)
//   - Per-layer tile lookups (groundAt / wallAt / towerAt / topAt): a tile
//     holds at most one ground structure and one tower, so "the structure
//     here" is not a well-defined question and every call site names which
//     layer it means
//   - Bounds, occupancy, and no-enemy-in-footprint checks
//   - Reachability: every DECLARED spawn (dormant included, D4) AND every
//     live enemy — inbound enemies in the inbound field, returning enemies
//     each in its origin spawn's field (return-to-origin-spawn spec)
//   - Purity: the tentative mask is unconditionally restored; fields are
//     rebuilt into caller-owned scratch buffers (spare-buffer swap)
//   - The removal gate (canRemove) — the one predicate the sim and every UI
//     remove control share, reading the phase AND the structure, since a wave
//     gates only committed construction
//   - The move gate (moveOpenIn) — build phase only; validateMove takes the
//     origin tile's stack and lets the destination decide what lands: bare
//     dirt relocates the ground structure (a wall with its tower, or a
//     panel), a foundation takes the tower alone (build-over-walls design D4)
//   - Immediate removal: refund and drop in the calling tick; the tile is
//     unblocked only when the structure owned the mask there — a ground
//     structure on dirt — never for a tower, never on a socket (D6); a
//     battery's removal also clamps the pooled store to the capacity that
//     remains (add-battery design D5)

import type { GameData } from '../data/schema';
import { refundMg } from './economy';
import { toTile } from './fixed';
import type { FlowField } from './flowfield';
import { buildFieldInto } from './flowfield';
import type { Grid } from './grid';
import { TERRAIN } from './grid';
import { storageCapacityOf } from './power';
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

/**
 * Whether `kind` is a ground structure — a wall, a panel or a battery: the
 * layer that owns a dirt tile's mask, at most one per tile (add-battery
 * design D1). The one predicate behind every "wall or panel" check here, so
 * a further kind is a line in this list, not a fourth branch.
 */
export function isGround(kind: StructureKind): boolean {
  return kind === 'wall' || kind === 'panel' || kind === 'battery';
}

/**
 * Whether `kind` is a utility — a ground structure that is not a foundation:
 * the panel and the battery. Nothing stands on one and nothing moves onto
 * one (energy-infrastructure design D7, add-battery design D1).
 */
export function isUtility(kind: StructureKind): boolean {
  return kind === 'panel' || kind === 'battery';
}

/**
 * The ground structure on tile (tx, ty) — the wall, panel or battery,
 * whichever stands there — or null. The layer that owns the tile's mask on
 * dirt.
 */
export function groundAt(structures: readonly Structure[], tx: number, ty: number): Structure | null {
  for (const s of structures) {
    if (isGround(s.kind) && s.tx === tx && s.ty === ty) return s;
  }
  return null;
}

/** The wall on tile (tx, ty), or null — a utility is not a wall (it is no foundation). */
export function wallAt(structures: readonly Structure[], tx: number, ty: number): Structure | null {
  for (const s of structures) {
    if (s.kind === 'wall' && s.tx === tx && s.ty === ty) return s;
  }
  return null;
}

/** The tower on tile (tx, ty), or null. */
export function towerAt(structures: readonly Structure[], tx: number, ty: number): Structure | null {
  for (const s of structures) {
    if (s.kind === 'tower' && s.tx === tx && s.ty === ty) return s;
  }
  return null;
}

/**
 * The topmost structure on tile (tx, ty) — the tower if one stands there,
 * else the ground structure (wall, panel or battery), else null. What a
 * removal peels and what the move tool names when it lifts a tile (design
 * D3/D5).
 */
export function topAt(structures: readonly Structure[], tx: number, ty: number): Structure | null {
  return towerAt(structures, tx, ty) ?? groundAt(structures, tx, ty);
}

/**
 * The origin tile's stack, as validateMove and the sim's move path see it:
 * the ground layer (a wall, a panel or a battery) and the tower layer.
 */
export interface Stack {
  ground: Structure | null;
  tower: Structure | null;
}

/** Both layers of tile (tx, ty) at once. */
export function stackAt(structures: readonly Structure[], tx: number, ty: number): Stack {
  return { ground: groundAt(structures, tx, ty), tower: towerAt(structures, tx, ty) };
}

/**
 * Whether tile (tx, ty) is a foundation a tower can stand on: an in-bounds
 * socket, or a dirt tile holding a wall (design D2/D4) — never a utility.
 * Says nothing about whether a tower already stands there.
 */
export function isFoundation(
  grid: Grid,
  structures: readonly Structure[],
  tx: number,
  ty: number,
): boolean {
  if (!grid.inBounds(tx, ty)) return false;
  const terrain = grid.terrainAt(tx, ty);
  if (terrain === TERRAIN.socket) return true;
  return terrain === TERRAIN.dirt && wallAt(structures, tx, ty) !== null;
}

export type PlacementVerdict =
  | 'ok'
  | 'no-funds'
  | 'out-of-bounds'
  | 'not-buildable'
  | 'occupied'
  | 'needs-wall'
  | 'enemy-in-footprint'
  | 'seals-spawn'
  | 'strands-enemy';

/**
 * The validation pipeline (phase-2 design D1 + phase-4 terrain rules), pure
 * in the observable sense: the footprint is tentatively blocked, every field
 * — inbound plus one returning field per declared spawn — is rebuilt into
 * `scratch`, and the mask is unconditionally restored before returning. On a
 * wall 'ok' the scratch fields hold exactly the post-placement fields, so an
 * accepting caller re-blocks the footprint and swaps them in without a
 * second rebuild.
 *
 * A tower placement returns WITHOUT touching the mask or scratch
 * (build-over-walls design D2, generalising the phase-4 socket fast path):
 * a tower stands on a foundation — a bare wall on dirt, or an empty socket —
 * whose tile is already blocked, so there is nothing to re-validate and the
 * caller must not swap fields for it. Bare dirt refuses a tower with
 * 'needs-wall'; a foundation already carrying a tower is 'occupied'.
 *
 * Spawn reachability iterates every DECLARED spawn — dormant included — so
 * the no-sealing invariant already holds when a spawn activates mid-run (D4).
 * The strand check is per-origin (return-to-origin-spawn spec): a returning
 * enemy is checked against ITS origin spawn's field, so cutting a carrier
 * off from its own exit is rejected even when another spawn stays reachable.
 */
export function validatePlacement(
  grid: Grid,
  kind: StructureKind,
  structures: readonly Structure[],
  enemies: readonly Enemy[],
  allSpawns: readonly { x: number; y: number }[],
  treasury: { x: number; y: number },
  footprint: readonly FootprintTile[],
  scratch: { inbound: FlowField; returning: FlowField[] },
): PlacementVerdict {
  for (const t of footprint) {
    if (!grid.inBounds(t.x, t.y)) return 'out-of-bounds';
    const terrain = grid.terrainAt(t.x, t.y);
    if (terrain === TERRAIN.grass || terrain === TERRAIN.rock) return 'not-buildable';
    if (kind === 'tower') {
      // The foundation branch (D2): occupancy is the structure list — the
      // mask says blocked for every foundation — and no path or enemy checks
      // apply. Returns before any mask work, whatever the verdict. A utility
      // is not a foundation: bare dirt, a panel and a battery all read
      // 'needs-wall'.
      if (terrain !== TERRAIN.socket && !wallAt(structures, t.x, t.y)) return 'needs-wall';
      if (towerAt(structures, t.x, t.y)) return 'occupied';
      return 'ok';
    }
    // A ground structure on a socket is not-buildable — sockets are free
    // tower platforms, never free maze tiles, free power or free storage.
    if (terrain === TERRAIN.socket) return 'not-buildable';
    if (groundAt(structures, t.x, t.y)) return 'occupied';
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    const etx = toTile(e.pos.x);
    const ety = toTile(e.pos.y);
    if (footprint.some((t) => t.x === etx && t.y === ety)) return 'enemy-in-footprint';
  }

  // Tentative mask; every return path below restores it.
  for (const t of footprint) grid.setBlocked(t.x, t.y, true);
  buildFieldInto(grid, [treasury], scratch.inbound, allSpawns);
  allSpawns.forEach((s, i) => {
    buildFieldInto(grid, [s], scratch.returning[i]!, allSpawns);
  });

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
      const field = e.mode === 'inbound' ? scratch.inbound : scratch.returning[e.originSpawn]!;
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
 * The move validation pipeline (build-over-walls design D4). The unit of a
 * move is the origin tile's `stack` — on dirt the ground structure (a wall
 * with any tower on it, or a utility), on a socket the tower — and the
 * destination decides what lands:
 *
 *   - bare dirt (no ground structure) → the ground structure relocates, a
 *     wall with its tower: the same conditions ground placement verifies at
 *     the destination, with the path and enemy checks evaluated against the
 *     mask with the origin tile freed and the destination blocked, both
 *     applied together — so a maze line can shift into the space it opens
 *     up. A stack with no ground structure (a socket origin) is 'needs-wall'
 *     there.
 *   - a foundation — a bare wall, or an empty socket — → the tower alone
 *     transfers: the origin wall stays, no tile changes walkability, so no
 *     path or enemy check applies and the mask is never touched. A stack
 *     with no tower is 'occupied' on a wall and 'not-buildable' on a socket,
 *     exactly as a wall placement there would be.
 *   - a foundation already carrying a tower → 'occupied'.
 *   - a utility (a panel or a battery) → 'occupied': it is no foundation
 *     (energy-infrastructure design D7, add-battery design D1), so nothing
 *     transfers onto it and nothing relocates there.
 *   - the stack's own tile → 'occupied' (the verdict vocabulary is reused,
 *     not extended; the UI treats that drop as a put-down and never issues
 *     it — tower-drag-move design D4/D6).
 *
 * Pure in the observable sense, like validatePlacement: both mask edits are
 * unconditionally restored before returning. On a relocate 'ok' (and its
 * seal/strand rejections) `scratch` holds exactly the post-move fields, so
 * an accepting caller applies both edits and swaps them in without a second
 * rebuild; a transfer never rebuilds, and leaves `scratch` stale.
 *
 * `stack` must hold at least one structure; the caller resolves the origin.
 */
export function validateMove(
  grid: Grid,
  stack: Stack,
  toTx: number,
  toTy: number,
  structures: readonly Structure[],
  enemies: readonly Enemy[],
  allSpawns: readonly { x: number; y: number }[],
  treasury: { x: number; y: number },
  scratch: { inbound: FlowField; returning: FlowField[] },
): PlacementVerdict {
  const origin = (stack.tower ?? stack.ground)!;
  if (toTx === origin.tx && toTy === origin.ty) return 'occupied';
  if (!grid.inBounds(toTx, toTy)) return 'out-of-bounds';
  const terrain = grid.terrainAt(toTx, toTy);
  if (terrain === TERRAIN.grass || terrain === TERRAIN.rock) return 'not-buildable';

  // Transfer branches: the destination is a foundation. Occupancy is the
  // structure list — the mask says blocked for every foundation.
  if (terrain === TERRAIN.socket) {
    if (towerAt(structures, toTx, toTy)) return 'occupied';
    return stack.tower ? 'ok' : 'not-buildable';
  }
  const there = groundAt(structures, toTx, toTy);
  if (there) {
    // A utility is no foundation: occupied for every mover.
    if (isUtility(there.kind) || towerAt(structures, toTx, toTy)) return 'occupied';
    return stack.tower ? 'ok' : 'occupied';
  }

  // Relocate branch: bare dirt takes the ground structure — a wall with its
  // tower, or a utility.
  const ground = stack.ground;
  if (!ground) return 'needs-wall';
  const footprint = footprintFor(toTx, toTy);
  for (const e of enemies) {
    if (!e.alive) continue;
    const etx = toTile(e.pos.x);
    const ety = toTile(e.pos.y);
    if (footprint.some((t) => t.x === etx && t.y === ety)) return 'enemy-in-footprint';
  }

  // Both tentative mask edits together; every return path below restores them.
  grid.setBlocked(ground.tx, ground.ty, false);
  for (const t of footprint) grid.setBlocked(t.x, t.y, true);
  buildFieldInto(grid, [treasury], scratch.inbound, allSpawns);
  allSpawns.forEach((s, i) => {
    buildFieldInto(grid, [s], scratch.returning[i]!, allSpawns);
  });

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
      const field = e.mode === 'inbound' ? scratch.inbound : scratch.returning[e.originSpawn]!;
      if (field.cost[grid.idx(toTile(e.pos.x), toTile(e.pos.y))]! < 0) {
        verdict = 'strands-enemy';
        break;
      }
    }
  }

  for (const t of footprint) grid.setBlocked(t.x, t.y, false);
  grid.setBlocked(ground.tx, ground.ty, true);
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
 * Remove `s` outright — credit the refund it is owed (full while provisional,
 * the floored fraction once committed), drop the structure, and unblock its
 * tile if the structure owned the mask there — all in the calling tick.
 * Returns whether the blocked mask changed, in which case the caller rebuilds
 * the live fields and runs the commitment-invalidation sweep.
 *
 * No validation runs here beyond what the caller already checked, and none is
 * needed: unblocking a tile is monotone on the flow fields (every cost stays
 * equal or falls), so a removal can never seal a spawn or strand an enemy,
 * and no enemy can stand on a blocked tile to begin with.
 *
 * Only a ground structure — a wall, a panel or a battery — on dirt owns its
 * tile's mask (build-over-walls design D3): a tower's tile is held by the
 * wall or socket beneath it, and a socket tile is terrain-blocked — so
 * neither removal unblocks anything or counts as a mask change; the refund
 * is the only effect.
 *
 * A battery's departure shrinks the pooled store's capacity, and the store
 * is clamped to what remains in this same tick (add-battery design D5): the
 * excess is sunk, like an upgrade — not refunded, and no ledger row's
 * business, since it happens outside any wave tick's supply resolution.
 * Eager rather than at the next power step, so hashed state never exceeds
 * the capacity the meter shows.
 */
export function removeStructure(
  state: SimState,
  grid: Grid,
  s: Structure,
  data: GameData,
): boolean {
  let changed = false;
  if (isGround(s.kind) && grid.terrainAt(s.tx, s.ty) !== TERRAIN.socket) {
    grid.setBlocked(s.tx, s.ty, false);
    changed = true;
  }
  const refund = refundMg(s, data.refundPer1000);
  state.treasuryMg += refund;
  // The refund nets against the period's construction (wave-ledger design D3).
  state.ledger.constructionMg -= refund;
  state.structures = state.structures.filter((x) => x !== s);
  if (s.kind === 'battery') {
    state.storedMpTick = Math.min(state.storedMpTick, storageCapacityOf(state.structures, data));
  }
  return changed;
}
