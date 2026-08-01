// Tile storage, blocked mask, footprints
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Blocked mask as a typed array
//   - 2x2 tower and 1x1 wall footprint helpers (Phase 2)

export class Grid {
  readonly width: number;
  readonly height: number;
  /** 1 = blocked. Row-major, y * width + x. */
  readonly blocked: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.blocked = new Uint8Array(width * height);
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
}
