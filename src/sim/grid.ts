// Tile storage, terrain kinds, blocked mask, footprints
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Blocked mask as a typed array — the single pathfinding truth
//   - Terrain kinds beside the mask (phase-4 design D5): immutable level
//     data read by buildability, never by the flowfield or steering

/** Terrain kind ids, stored per tile in Grid.terrain. */
export const TERRAIN = { dirt: 0, grass: 1, rock: 2, socket: 3 } as const;
export type TerrainKind = keyof typeof TERRAIN;

export class Grid {
  readonly width: number;
  readonly height: number;
  /** 1 = blocked. Row-major, y * width + x. */
  readonly blocked: Uint8Array;
  /** Terrain kind id per tile (TERRAIN values). Immutable after level load. */
  readonly terrain: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.blocked = new Uint8Array(width * height);
    this.terrain = new Uint8Array(width * height); // all dirt
  }

  idx(tx: number, ty: number): number {
    return ty * this.width + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && tx < this.width && ty >= 0 && ty < this.height;
  }

  /** Out-of-bounds counts as blocked. */
  isBlocked(tx: number, ty: number): boolean {
    return !this.inBounds(tx, ty) || this.blocked[this.idx(tx, ty)] === 1;
  }

  isWalkable(tx: number, ty: number): boolean {
    return !this.isBlocked(tx, ty);
  }

  setBlocked(tx: number, ty: number, blocked: boolean): void {
    this.blocked[this.idx(tx, ty)] = blocked ? 1 : 0;
  }

  /** Terrain kind id at (tx, ty); callers bounds-check first. */
  terrainAt(tx: number, ty: number): number {
    return this.terrain[this.idx(tx, ty)]!;
  }

  /**
   * Level-load only: set the terrain kind and initialize the blocked mask
   * from it (design D5: blocked ⇔ kind ≠ dirt on starting terrain).
   */
  setTerrain(tx: number, ty: number, kind: number): void {
    const i = this.idx(tx, ty);
    this.terrain[i] = kind;
    this.blocked[i] = kind === TERRAIN.dirt ? 0 : 1;
  }
}
