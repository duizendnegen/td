// The power step: draw, supply merit order, coverage, the grid bill
// See ARCHITECTURE.md §5 (units) and §7 (tick order), and the
// energy-infrastructure design D1–D5, D8
//
// Responsibilities:
//   - Draw per structure (D1): a tower draws its rating while it has a target
//     this tick, a standby share of it otherwise; walls and panels draw nothing
//   - Solar: the constant output of every standing panel
//   - Storage capacity: the pooled store's ceiling, count(battery) × one
//     battery's capacity (add-battery design D2)
//   - resolvePower (D4, add-battery D3): the per-tick merit order — solar
//     first, then the store (charging from surplus, discharging against the
//     deficit), then the grid up to the connection tier's capacity and up to
//     what the positive treasury can pay at the tariff — yielding the
//     store's movement, the grid share, coverage in SCALE, and the bill
//   - Everything here is pure integer arithmetic on hashed inputs; the one
//     thing that persists — the store's delta — is applied by the sim in
//     step 7, not here (D2)

import type { GameData } from '../data/schema';
import type { Structure } from './types';

/**
 * Coverage fixed point: full coverage is COVERAGE_SCALE, matching the
 * position fixed-point so per-tick fractions never truncate to zero and the
 * stretched fire interval `ceil(interval × SCALE / coverage)` stays exact in
 * a JS number.
 */
export const COVERAGE_SCALE = 1024;

/** The tick's supply resolution, derived once per wave tick. */
export interface PowerResolution {
  /** What the store discharged toward the deficit this tick, in mp (add-battery design D3). */
  batterySupplyMp: number;
  /** Surplus solar the store took this tick, in mp; the rest of the surplus is wasted. */
  chargedMp: number;
  /** What the grid supplied this tick, in mp. */
  gridSupplyMp: number;
  /** supplied ÷ draw in COVERAGE_SCALE, capped at full; full when draw is 0. */
  coverage: number;
  /** The tick's grid bill in milli-gold, floored once — debited in step 9. */
  billMg: number;
}

/**
 * The tick's draw of one structure (D1). Engagement is a state — "has a
 * target in range this tick" — not a shot, so the load curve follows the
 * wave (quiet, peak, tail) and a battery has something to shave, while the
 * bill stays smooth enough to read live.
 */
export function drawOf(s: Structure, engaged: boolean, data: GameData): number {
  if (s.kind !== 'tower') return 0;
  const rated = data.towers[s.archetypeId]!.levels[s.level - 1]!.ratedPowerMp;
  return engaged ? rated : Math.floor((rated * data.standbyPer1000) / 1000);
}

/** The constant solar output of every standing panel, in mp. Batteries produce nothing. */
export function solarOf(structures: readonly Structure[], data: GameData): number {
  let total = 0;
  for (const s of structures) if (s.kind === 'panel') total += data.panelOutputMp;
  return total;
}

/**
 * The pooled store's capacity, in mp·tick: the number of standing batteries
 * times one battery's capacity (add-battery design D2). Derived wherever it
 * is needed, never stored — so a battery placed mid-wave enlarges the pool
 * from that tick, and one removed shrinks it (the removal path clamps the
 * store to what remains).
 */
export function storageCapacityOf(structures: readonly Structure[], data: GameData): number {
  let total = 0;
  for (const s of structures) if (s.kind === 'battery') total += data.batteryCapacityMpTick;
  return total;
}

/**
 * The rated total of every standing tower — the build-phase planning read
 * (build-ui delta): what the peak would draw if everything engaged at once,
 * against the connection's capacity. Not a sim input.
 */
export function ratedTotalMp(structures: readonly Structure[], data: GameData): number {
  let total = 0;
  for (const s of structures) if (s.kind === 'tower') total += drawOf(s, true, data);
  return total;
}

/** The current connection tier's capacity, in mp. */
export function tierCapacityMp(data: GameData, gridTier: number): number {
  return data.gridTiers[gridTier]!.capacityMp;
}

/**
 * The supply merit order for one wave tick (D4, add-battery design D3):
 *
 *   solar → store → grid
 *
 * Solar covers first. What it leaves over — the surplus — charges the store
 * up to its room (`capacity − stored`), and only the surplus beyond that is
 * discarded: not sold, not carried over. What it falls short by — the
 * deficit — the store supplies up to everything it holds, and only the
 * remainder is asked of the grid. Surplus and deficit cannot both be
 * positive, so a tick charges or discharges, never both, without a rule
 * saying so. With no batteries the room is zero, the store is empty, and
 * the order reads exactly as it did before storage existed.
 *
 * The store has no rate limit (the `min` is against the whole store and the
 * whole room), no round-trip loss, and never charges from the grid — each a
 * recorded lever in the add-battery design, not a rule here. The store's
 * delta `chargedMp − batterySupplyMp` is returned for the sim to apply in
 * step 7; this function stays pure.
 *
 * The grid is bounded twice: by the tier's capacity, and by what the POSITIVE
 * balance can pay at the tariff — so the bill can bring the balance to
 * exactly zero and never below it, and at ≤ 0 the grid supplies nothing
 * (broke means cut off; a bounty that brings the balance positive restores
 * supply the tick it lands). The store is unaffected by the balance: a
 * charged store carries a broke tick.
 *
 * A zero tariff is a free grid: nothing is bought, so the treasury bound
 * does not apply and the connection never cuts off. (This is the edge the
 * design's formula leaves undefined — a division by zero — and the reading
 * every test fixture that is not about power relies on.)
 *
 * Coverage is supplied ÷ draw in COVERAGE_SCALE, capped at full, and full
 * when nothing draws; the bill takes the one floor.
 */
export function resolvePower(
  drawMp: number,
  solarMp: number,
  storedMpTick: number,
  capacityMpTick: number,
  tierCapacityMp: number,
  treasuryMg: number,
  tariffMgPer1000: number,
): PowerResolution {
  const surplus = Math.max(0, solarMp - drawMp);
  const chargedMp = Math.min(surplus, Math.max(0, capacityMpTick - storedMpTick));
  const deficit = Math.max(0, drawMp - solarMp);
  const batterySupplyMp = Math.min(deficit, storedMpTick);
  const remaining = deficit - batterySupplyMp;
  let affordable: number;
  if (tariffMgPer1000 === 0) {
    affordable = remaining;
  } else if (treasuryMg > 0) {
    affordable = Math.floor((treasuryMg * 1000) / tariffMgPer1000);
  } else {
    affordable = 0;
  }
  const gridSupplyMp = Math.min(remaining, tierCapacityMp, affordable);
  const supplied = Math.min(drawMp, solarMp) + batterySupplyMp + gridSupplyMp;
  const coverage =
    drawMp === 0
      ? COVERAGE_SCALE
      : Math.min(COVERAGE_SCALE, Math.floor((supplied * COVERAGE_SCALE) / drawMp));
  const billMg = Math.floor((gridSupplyMp * tariffMgPer1000) / 1000);
  return { batterySupplyMp, chargedMp, gridSupplyMp, coverage, billMg };
}

/**
 * The stretched next-shot delay for a tower firing at `coverage` (D2/D3):
 * `ceil(interval × SCALE / coverage)`, an integer ceiling. Full coverage is
 * exactly the authored interval; half coverage doubles it. Never called at
 * coverage 0 — a due tower holds its fire there and re-checks next tick.
 */
export function stretchedInterval(fireIntervalTicks: number, coverage: number): number {
  return Math.floor((fireIntervalTicks * COVERAGE_SCALE + coverage - 1) / coverage);
}
