// The power meter's derivation — pure, so it is testable without a DOM
// See the energy-infrastructure build-ui delta ("Power meter beside the
// treasury readout", "Connection upgrade control")
//
// Responsibilities:
//   - Turn the sim's derived power readout, the standing towers' rated total,
//     the connection tier table and the treasury into the meter's state:
//     live mode during a wave (draw vs the ceiling, solar/grid split, gold per
//     second, warning while coverage < 1), planning mode between waves (rated
//     total vs the ceiling, so a peak's headroom is visible before START)
//   - The connection-upgrade control's states, palette-consistent:
//     affordable / debt-warned / blocked below 0 / maxed at the last tier
//   - Unit formatting: mp → kW for the HUD (presentation only, design D8)

import type { GridTier } from '../data/schema';
import { GOLD, POWER, TICK_HZ } from '../sim/fixed';
import { COVERAGE_SCALE } from '../sim/power';
import type { PowerReadout } from '../sim/sim';
import type { RunPhase } from '../sim/types';

/** mp → a kW figure with one decimal, e.g. 1500 → "1.5 kW". */
export function formatKw(mp: number): string {
  return `${(mp / POWER).toFixed(1)} kW`;
}

/** A per-tick milli-gold bill as gold per second, one decimal. */
export function formatGoldPerSecond(billMgPerTick: number): string {
  return `${((billMgPerTick * TICK_HZ) / GOLD).toFixed(1)} g/s`;
}

export interface MeterInputs {
  runPhase: RunPhase;
  treasuryMg: number;
  gridTier: number;
  tiers: readonly GridTier[];
  /** Σ rated power of every standing tower (power.ts ratedTotalMp). */
  ratedTotalMp: number;
  /** Σ output of every standing panel (power.ts solarOf). */
  solarMp: number;
  /** The sim's derived readout for the last advanced tick. */
  power: Readonly<PowerReadout>;
}

export type UpgradeControl =
  | { kind: 'maxed' }
  | { kind: 'blocked'; capacityMp: number; costMg: number }
  | { kind: 'debt'; capacityMp: number; costMg: number }
  | { kind: 'affordable'; capacityMp: number; costMg: number };

export interface MeterState {
  /** Live during a wave; planning in every other phase. */
  mode: 'live' | 'planning';
  /** What the bar measures: the tick's draw (live) or the rated total (planning). */
  loadMp: number;
  /** The connection's capacity at the current tier. */
  capacityMp: number;
  /** The panels' output — the part of the ceiling that is never billed. */
  solarMp: number;
  /** capacity + solar: the most that could be supplied on any tick. */
  ceilingMp: number;
  /** Live: the tick's grid supply. Planning: 0. */
  gridMp: number;
  /** Live: the tick's bill, per tick. Planning: 0. */
  billMgPerTick: number;
  /** In COVERAGE_SCALE; full outside a wave. */
  coverage: number;
  /** Live and coverage below full: the brownout state. */
  warning: boolean;
  /** Load above the ceiling: a peak that would (planning) or does (live) brown out. */
  over: boolean;
  /** 1-based tier for display, and how many the level has. */
  tier: number;
  tierCount: number;
  upgrade: UpgradeControl;
}

export function meterState(input: MeterInputs): MeterState {
  const live = input.runPhase === 'wave';
  const capacityMp = input.tiers[input.gridTier]!.capacityMp;
  const ceilingMp = capacityMp + input.solarMp;
  const loadMp = live ? input.power.drawMp : input.ratedTotalMp;
  const coverage = live ? input.power.coverage : COVERAGE_SCALE;
  const next = input.tiers[input.gridTier + 1];
  let upgrade: UpgradeControl;
  if (!next) {
    upgrade = { kind: 'maxed' };
  } else if (input.treasuryMg < 0) {
    upgrade = { kind: 'blocked', capacityMp: next.capacityMp, costMg: next.costMg };
  } else if (next.costMg > input.treasuryMg) {
    upgrade = { kind: 'debt', capacityMp: next.capacityMp, costMg: next.costMg };
  } else {
    upgrade = { kind: 'affordable', capacityMp: next.capacityMp, costMg: next.costMg };
  }
  return {
    mode: live ? 'live' : 'planning',
    loadMp,
    capacityMp,
    solarMp: input.solarMp,
    ceilingMp,
    gridMp: live ? input.power.gridSupplyMp : 0,
    billMgPerTick: live ? input.power.billMg : 0,
    coverage,
    warning: live && coverage < COVERAGE_SCALE,
    over: loadMp > ceilingMp,
    tier: input.gridTier + 1,
    tierCount: input.tiers.length,
    upgrade,
  };
}
