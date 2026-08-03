// Wave progress derivation
// See the aether-ui-redesign build-ui spec and design D6
//
// Pure, read-only derivation over sim state — the sim exposes nothing new.
// Strict-sequential waves guarantee every live enemy belongs to the active
// wave, so: resolved = spawned − alive, progress = resolved / total.

/**
 * Fraction of the active wave that is resolved (dead or escaped), in [0, 1].
 *
 * @param groupCounts  authored per-group enemy counts of the active wave
 * @param groupCursors enemies spawned so far per group (`state.groupCursors`)
 * @param alive        live enemy count (`state.enemies.length`)
 */
export function waveProgress(
  groupCounts: readonly number[],
  groupCursors: readonly number[],
  alive: number,
): number {
  const total = groupCounts.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return 0;
  const spawned = groupCursors.reduce((sum, n) => sum + n, 0);
  const resolved = spawned - alive;
  return Math.min(1, Math.max(0, resolved / total));
}
