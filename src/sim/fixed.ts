// Fixed-point arithmetic — the numeric foundation of the deterministic sim.
// See ARCHITECTURE.md §5
//
// All sim state is integer. Math.sqrt is the ONLY permitted float operation, and
// its result is immediately re-quantised to an integer: IEEE-754 requires sqrt to
// be correctly rounded, so it is exact and portable. sin/cos/pow/atan2/hypot are
// NOT required to be correctly rounded and are banned inside sim/.

/** Fixed-point units per tile. */
export const TILE = 1024;

/** Tile-centre offset. */
export const HALF = 512;

/** Diagonal step cost: round(TILE * sqrt(2)). */
export const DIAG = 1448;

/** Milli-gold per whole gold. The treasury is held in thousandths. */
export const GOLD = 1000;

/** Simulation rate. */
export const TICK_HZ = 20;
export const TICK_MS = 50;

/** Removal delay, in ticks (4.0 s). The tile stays blocked for the whole delay. */
export const REMOVAL_TICKS = 80;

/** Fixed-point unit coordinate → tile coordinate. Positions are never negative. */
export function toTile(u: number): number {
  return Math.trunc(u / TILE);
}

/** Tile coordinate → the fixed-point unit coordinate of that tile's centre. */
export function tileCentre(t: number): number {
  return t * TILE + HALF;
}

/**
 * Integer length of the offset (dx, dy).
 *
 * The single place a float appears inside sim/: IEEE-754 requires sqrt to be
 * correctly rounded, so the intermediate is exact and portable, and it is
 * re-quantised to an integer before it leaves.
 */
export function length(dx: number, dy: number): number {
  return Math.trunc(Math.sqrt(dx * dx + dy * dy));
}

/** Scale the offset (dx, dy) to length `len`, in integer units. */
export function normalize(dx: number, dy: number, len: number): [number, number] {
  const d = length(dx, dy);
  if (d === 0) return [0, 0];
  return [Math.trunc((dx * len) / d), Math.trunc((dy * len) / d)];
}
