// Dual Dijkstra flow fields
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Inbound field: multi-source from the treasury
//   - Returning field: multi-source from all active spawns at once
//   - 8-connected, integer costs 1024 orthogonal / 1448 diagonal
//   - Corner-cutting prevented at field-build time, not at move time
//   - Bucket queue keyed on cost — deterministic pop order, no tie-break rule needed
//   - Tracing a field into the ordered route a follower would walk

import { DIAG, TILE } from './fixed';
import type { Grid } from './grid';

// Canonical 8-neighbourhood order; index is the value stored in FlowField.dir.
// Even indices are orthogonal, odd are diagonal.
export const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1] as const;
export const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1] as const;

export const UNREACHABLE = -1;

/** A tile coordinate pair — the element type of a traced route. */
export interface TileXY {
  x: number;
  y: number;
}

export interface FlowField {
  /**
   * Per tile: index into DIR_DX/DIR_DY of the step toward the source, or -1
   * for sources themselves and unreachable tiles (disambiguate via cost).
   */
  dir: Int8Array;
  /** Path cost in fixed-point units; 0 at sources, -1 where no path exists. */
  cost: Int32Array;
}

/** A field buffer of the right size for `grid`, ready for buildFieldInto. */
export function allocField(grid: Grid): FlowField {
  const size = grid.width * grid.height;
  return { dir: new Int8Array(size), cost: new Int32Array(size) };
}

/**
 * Multi-source Dijkstra outward from `sources`. A diagonal edge exists only
 * if both orthogonally adjacent tiles between its endpoints are walkable, so
 * no field can ever express a corner cut.
 */
export function buildField(grid: Grid, sources: readonly { x: number; y: number }[]): FlowField {
  const field = allocField(grid);
  buildFieldInto(grid, sources, field);
  return field;
}

/**
 * buildField writing into a caller-owned buffer — the spare-buffer variant
 * placement validation rebuilds into so a rejected attempt allocates nothing
 * (ARCHITECTURE.md §7).
 */
export function buildFieldInto(
  grid: Grid,
  sources: readonly { x: number; y: number }[],
  out: FlowField,
): void {
  const { dir, cost } = out;
  dir.fill(UNREACHABLE);
  cost.fill(UNREACHABLE);

  // Bucket queue keyed on cost: pop order is (cost, insertion order), which
  // is deterministic without any explicit tie-break.
  const buckets: number[][] = [];
  let pending = 0;
  const push = (tileIdx: number, c: number): void => {
    (buckets[c] ??= []).push(tileIdx);
    pending++;
  };

  for (const s of sources) {
    const i = grid.idx(s.x, s.y);
    if (cost[i] === 0) continue; // duplicate source
    cost[i] = 0;
    push(i, 0);
  }

  for (let c = 0; c < buckets.length && pending > 0; c++) {
    const bucket = buckets[c];
    if (!bucket) continue;
    // Entries appended to the current bucket while scanning it are impossible:
    // relaxations always increase cost.
    for (const i of bucket) {
      pending--;
      if (cost[i] !== c) continue; // stale entry, superseded by a cheaper path
      const tx = i % grid.width;
      const ty = (i - tx) / grid.width;
      for (let d = 0; d < 8; d++) {
        const nx = tx + DIR_DX[d]!;
        const ny = ty + DIR_DY[d]!;
        if (!grid.isWalkable(nx, ny)) continue;
        const diagonal = (d & 1) === 1;
        // Corner rule: both orthogonal in-between tiles must be walkable.
        if (diagonal && !(grid.isWalkable(nx, ty) && grid.isWalkable(tx, ny))) continue;
        const ni = grid.idx(nx, ny);
        const next = c + (diagonal ? DIAG : TILE);
        if (cost[ni] !== UNREACHABLE && cost[ni]! <= next) continue;
        cost[ni] = next;
        // Step direction FROM the neighbour back toward this tile.
        dir[ni] = (d + 4) % 8;
        push(ni, next);
      }
    }
  }
}

/** The tile one field step from (tx, ty), or null at sources/unreachable tiles. */
export function nextTile(field: FlowField, grid: Grid, tx: number, ty: number): TileXY | null {
  const d = field.dir[grid.idx(tx, ty)]!;
  if (d === UNREACHABLE) return null;
  return { x: tx + DIR_DX[d]!, y: ty + DIR_DY[d]! };
}

/**
 * The ordered tiles a follower of `field` visits from `from` — a nextTile
 * walk, always including `from` itself (path-preview design D2).
 *
 * Termination is structural: a Dijkstra parent chain is acyclic and strictly
 * decreasing in cost, so the walk reaches a source. The tile-count cap is
 * insurance against a malformed field, not part of the normal path.
 *
 * A source tile traces to itself alone; so does an unreachable one — callers
 * that need to tell those apart read `field.cost`.
 */
export function tracePath(field: FlowField, grid: Grid, from: TileXY): TileXY[] {
  const path: TileXY[] = [{ x: from.x, y: from.y }];
  const cap = grid.width * grid.height;
  let tx = from.x;
  let ty = from.y;
  for (let steps = 0; steps < cap; steps++) {
    const next = nextTile(field, grid, tx, ty);
    if (!next) break;
    path.push(next);
    tx = next.x;
    ty = next.y;
  }
  return path;
}
