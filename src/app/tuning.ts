// Balance tuning dials (scale-world-experiment, debug-tooling spec)
//
// Responsibilities:
//   - Parse the ?rangeScale=…-style dial parameters, failing loudly on any
//     invalid value — never a silent fallback
//   - Patch the RAW level/balance JSON before schema parsing, so validation
//     and the one fixed-point conversion see effective values (design D1)
//   - The sim never learns dials exist; it just receives balance data

/** Parsed dial overrides; absent fields leave authored values untouched. */
export interface Tuning {
  /** Multiplier on every tower level's rangeTiles. */
  rangeScale?: number;
  /** Multiplier on every enemy's hp, rounded once. */
  hpScale?: number;
  carrierSpeedPer100?: number;
  wallCost?: number;
  /** Overrides the level's interestRatePerTick, given in parts-per-million. */
  interestRatePpm?: number;
  /** Overrides the level's startingTreasury, in whole gold. */
  startingTreasury?: number;
  bonusGraceTicks?: number;
  bonusDecayTicks?: number;
  sackRecoveryPer1000?: number;
  refundPer1000?: number;
}

interface DialSpec {
  key: keyof Tuning;
  /** Integer dials reject fractions; multipliers accept them. */
  integer: boolean;
  min: number;
  max: number;
}

const DIALS: readonly DialSpec[] = [
  { key: 'rangeScale', integer: false, min: Number.MIN_VALUE, max: 100 },
  { key: 'hpScale', integer: false, min: Number.MIN_VALUE, max: 1000 },
  { key: 'carrierSpeedPer100', integer: true, min: 1, max: 1000 },
  { key: 'wallCost', integer: true, min: 0, max: 100_000 },
  { key: 'interestRatePpm', integer: true, min: 0, max: 1_000_000 },
  { key: 'startingTreasury', integer: true, min: 0, max: 1_000_000 },
  { key: 'bonusGraceTicks', integer: true, min: 0, max: 1_000_000 },
  { key: 'bonusDecayTicks', integer: true, min: 1, max: 1_000_000 },
  { key: 'sackRecoveryPer1000', integer: true, min: 0, max: 1000 },
  { key: 'refundPer1000', integer: true, min: 0, max: 1000 },
];

/**
 * Read every dial from the query parameters. Throws naming the offending
 * parameter on anything unparsable or out of range (debug-tooling spec:
 * invalid dials fail the load, never silently fall back).
 */
export function parseTuning(params: URLSearchParams): Tuning {
  const tuning: Tuning = {};
  for (const spec of DIALS) {
    const raw = params.get(spec.key);
    if (raw === null) continue;
    const value = Number(raw);
    const valid =
      Number.isFinite(value) &&
      value >= spec.min &&
      value <= spec.max &&
      (!spec.integer || Number.isInteger(value));
    if (!valid) {
      throw new Error(
        `invalid tuning parameter ?${spec.key}=${raw} (expected ${spec.integer ? 'an integer' : 'a number'} in [${spec.min}, ${spec.max}])`,
      );
    }
    tuning[spec.key] = value;
  }
  return tuning;
}

/**
 * Apply dials to raw (pre-schema) level and balance JSON, returning patched
 * deep copies. With no dials set, the inputs are returned untouched, so the
 * authored objects stay referentially identical on the default path.
 */
export function applyTuning(
  levelJson: unknown,
  balanceJson: unknown,
  tuning: Tuning,
): { levelJson: unknown; balanceJson: unknown } {
  if (Object.keys(tuning).length === 0) return { levelJson, balanceJson };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const level = structuredClone(levelJson) as any;
  const balance = structuredClone(balanceJson) as any;

  if (tuning.rangeScale !== undefined) {
    for (const tower of Object.values(balance.towers) as any[]) {
      for (const row of tower.levels) row.rangeTiles *= tuning.rangeScale;
    }
  }
  if (tuning.hpScale !== undefined) {
    for (const enemy of Object.values(balance.enemies) as any[]) {
      enemy.hp = Math.round(enemy.hp * tuning.hpScale);
    }
  }
  if (tuning.carrierSpeedPer100 !== undefined) balance.theft.carrierSpeedPer100 = tuning.carrierSpeedPer100;
  if (tuning.wallCost !== undefined) balance.build.wallCost = tuning.wallCost;
  if (tuning.sackRecoveryPer1000 !== undefined) balance.theft.sackRecoveryPer1000 = tuning.sackRecoveryPer1000;
  if (tuning.refundPer1000 !== undefined) balance.build.removalRefundFraction = tuning.refundPer1000 / 1000;
  if (tuning.bonusGraceTicks !== undefined) balance.waveBonus.graceTicks = tuning.bonusGraceTicks;
  if (tuning.bonusDecayTicks !== undefined) balance.waveBonus.decayTicks = tuning.bonusDecayTicks;
  if (tuning.interestRatePpm !== undefined) {
    level.economy.interestRatePerTick = tuning.interestRatePpm / 1_000_000;
  }
  if (tuning.startingTreasury !== undefined) level.economy.startingTreasury = tuning.startingTreasury;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { levelJson: level, balanceJson: balance };
}
