// The power step: draw, supply merit order, coverage, the grid bill
// See ARCHITECTURE.md §5 (units) and §7 (tick order), and the
// energy-infrastructure design D1–D5, D8
//
// Responsibilities:
//   - Draw per structure (D1): a tower draws its rating while it has a target
//     this tick, a standby share of it otherwise; walls and panels draw nothing
//   - Solar: the constant output of every standing panel
//   - resolvePower (D4): the per-tick merit order — solar first, [the storage
//     slot the battery change fills], then the grid up to the connection
//     tier's capacity and up to what the positive treasury can pay at the
//     tariff — yielding the grid share, coverage in SCALE, and the bill
//   - Everything here is pure integer arithmetic on hashed inputs; nothing
//     is stored, so nothing is hashed (D2)

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

/** The constant solar output of every standing panel, in mp. */
export function solarOf(structures: readonly Structure[], data: GameData): number {
  let total = 0;
  for (const s of structures) if (s.kind === 'panel') total += data.panelOutputMp;
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
 * The supply merit order for one wave tick (D4):
 *
 *   solar → [storage slot: the battery change inserts
 *            min(deficit, dischargeRate, charge) here and charges the battery
 *            from surplus solar before it is discarded] → grid
 *
 * The grid is bounded twice: by the tier's capacity, and by what the POSITIVE
 * balance can pay at the tariff — so the bill can bring the balance to
 * exactly zero and never below it, and at ≤ 0 the grid supplies nothing
 * (broke means cut off; a bounty that brings the balance positive restores
 * supply the tick it lands). Surplus solar is discarded: not stored, not
 * sold, not carried over.
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
  tierCapacityMp: number,
  treasuryMg: number,
  tariffMgPer1000: number,
): PowerResolution {
  const deficit = Math.max(0, drawMp - solarMp);
  let affordable: number;
  if (tariffMgPer1000 === 0) {
    affordable = deficit;
  } else if (treasuryMg > 0) {
    affordable = Math.floor((treasuryMg * 1000) / tariffMgPer1000);
  } else {
    affordable = 0;
  }
  const gridSupplyMp = Math.min(deficit, tierCapacityMp, affordable);
  const supplied = Math.min(drawMp, solarMp) + gridSupplyMp;
  const coverage =
    drawMp === 0
      ? COVERAGE_SCALE
      : Math.min(COVERAGE_SCALE, Math.floor((supplied * COVERAGE_SCALE) / drawMp));
  const billMg = Math.floor((gridSupplyMp * tariffMgPer1000) / 1000);
  return { gridSupplyMp, coverage, billMg };
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
