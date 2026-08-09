# scale-world-experiment

## Why

Rounds are short and tower influence is small, so the game's three intended pillars — interest as
a real economic decision, maze structure as the main skill expression, and tower placement as a
combinatorial choice — barely register. This change is a deliberate, non-uniform scale-up
experiment to make them register: a bigger world (longer rounds → interest compounds), much larger
tower ranges relative to corridor width (maze routing through coverage pays off), and weaker
per-encounter damage (the deficit must be recovered through routing and economy, not raw DPS).
The values are a starting point; the change ships tuning dials so the fun point can be found by
sweeping, not re-implementing.

## What Changes

- Both authored levels grow 20×10 → 40×20 via mechanical 2×2 cell duplication (terrain char-map
  doubled in both axes; treasury and spawn coordinates ×2). Wave compositions unchanged.
- All tower `rangeTiles` ×3 in balance data (rapid 7.5; sniper 15/17.25/19.5; area 7.5/9/10.5;
  slow 7.5/9/10.5). No per-archetype exceptions.
- All enemy `hp` ×5 (swarm 250, tank 4500, runner 2400, brute 3000). HP goes up instead of damage
  going down so hand-authored integer damage values stay intact.
- `wallCost` 20 → 5 — walls become the game's raw material; give the player play room.
- **BREAKING (behavior)**: carrier speed factor flips from a penalty to a boost — 80% → 130% of
  base speed, and becomes balance data (`carrierSpeedPer100`) instead of a hardcoded constant.
  Escapes get urgent; dragging out the return trip stops being free interest.
- **BREAKING (behavior)**: end-of-wave settlement returns only a balance-data fraction of
  unclaimed sack gold (`sackRecoveryPer1000`, default 700) instead of 100%; the remainder is
  permanently lost. Killing carriers becomes damage control, not full recovery — the only
  lossless defense kills enemies before the treasury.
- Wave speed bonus windows stretch to match ×2 paths: `graceTicks` 150 → 300, `decayTicks`
  600 → 1500.
- New dev tuning-dial layer: URL query parameters (same pattern as `?level=2`) override balance
  values once at load, before fixed-point conversion — `rangeScale`, `hpScale`,
  `carrierSpeedPer100`, `wallCost`, `interestRatePpm`, `bonusGraceTicks`, `bonusDecayTicks`,
  `sackRecoveryPer1000`, `refundPer1000`. Restart per tweak; no live re-tune. Map size is not a
  dial.

Explicitly unchanged: interest rate (0.0002/tick — the ×2 wave duration already lifts per-wave
accrual from ~+22% to ~+49%), damage values, tower costs, bounties, carry capacities, wave
compositions and spawn intervals, committed-removal refund fraction (50%, though exposed as a
dial), the provisional/committed placement rules, and the enemy speed-modifier order (carrier
factor before slow — determinism contract). Construction time is out of scope.

Expected iteration knobs after the first playtests: `sackRecoveryPer1000`, `carrierSpeedPer100`,
`wallCost`, and the interest rate.

## Capabilities

### New Capabilities

None — all behavior changes land in existing capabilities.

### Modified Capabilities

- `theft-economy`: two requirement changes. (1) Carriers move at a balance-data percentage of
  base speed, default 130% — replacing the pinned 80% slowdown. (2) Settlement credits unclaimed
  sacks at a balance-data recovery fraction (default 700/1000), replacing "credited in full";
  the remainder is lost.
- `debug-tooling`: new requirement — a load-time tuning-dial layer via URL query parameters that
  overrides balance values before fixed-point conversion, as deterministic sim inputs.

Range, HP, wall-cost, and bonus-window changes are data-only: `tower-combat`, `enemy-variety`,
`structure-placement`, and `run-lifecycle` already delegate those values to balance data, and
`level-data` does not pin grid dimensions — no requirement changes there.

## Impact

- `src/data/balance.json` — ranges, hp, wallCost, bonus windows, new `carrierSpeedPer100` and
  `sackRecoveryPer1000` fields.
- `src/data/levels/level_01.json`, `level_02.json` — 40×20 upscale, coords ×2.
- `src/data/schema.ts` — parse/validate the two new balance fields; the 2-axis-per-archetype
  invariant must survive (uniform multipliers preserve it).
- `src/sim/enemy.ts` — carrier factor reads balance data instead of the hardcoded 4/5; modifier
  order unchanged.
- `src/sim/economy.ts` / `src/sim/sim.ts` — settlement applies the sack recovery fraction.
- `src/app/levels.ts` (or sibling app-layer module) — query-param tuning layer feeding balance
  load.
- Tests asserting the 80% carrier factor, full sack return, wall cost, ranges, or hp values will
  need updating; determinism/hash tests must pass with dials as load-time inputs.
- Camera, pathfinding, and rendering need no changes: the fit-to-board camera and O(W×H) flow
  fields absorb 40×20 (verified during exploration).
