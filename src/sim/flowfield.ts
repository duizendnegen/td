// Dual Dijkstra flow fields
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Inbound field: multi-source from the treasury
//   - Returning field: multi-source from all active spawns at once
//   - 8-connected, integer costs 1024 orthogonal / 1448 diagonal
//   - Corner-cutting prevented at field-build time, not at move time
//   - Bucket queue keyed on cost — deterministic pop order, no tie-break rule needed

import { DIAG, TILE } from './fixed';
import type { Grid } from './grid';

// Canonical 8-neighbourhood order; index is the value stored in FlowField.dir.
// Even indices are orthogonal, odd are diagonal.
export const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1] as const;
export const DIR_DY = [-1, -1, 0, 1, 1, 1, 0, -1] as const;

export const UNREACHABLE = -1;

export interface FlowField {
  /**
   * Per tile: index into DIR_DX/DIR_DY of the step toward the source, or -1
   * for sources themselves and unreachable tiles (disambiguate via cost).
   */
  dir: Int8Array;
  /** Path cost in fixed-point units; 0 at sources, -1 where no path exists. */
  cost: Int32Array;
}

/**
 * Multi-source Dijkstra outward from `sources`. A diagonal edge exists only
 * if both orthogonally adjacent tiles between its endpoints are walkable, so
 * no field can ever express a corner cut.
 */
export function buildField(grid: Grid, sources: readonly { x: number; y: number }[]): FlowField {
  const size = grid.width * grid.height;
  const dir = new Int8Array(size).fill(UNREACHABLE);
  const cost = new Int32Array(size).fill(UNREACHABLE);

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

  return { dir, cost };
}

/** The tile one field step from (tx, ty), or null at sources/unreachable tiles. */
export function nextTile(
  field: FlowField,
  grid: Grid,
  tx: number,
  ty: number,
): { x: number; y: number } | null {
  const d = field.dir[grid.idx(tx, ty)]!;
  if (d === UNREACHABLE) return null;
  return { x: tx + DIR_DX[d]!, y: ty + DIR_DY[d]! };
}
