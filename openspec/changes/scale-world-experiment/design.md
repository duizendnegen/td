# scale-world-experiment — design

## Context

See proposal.md for motivation. Constraints that shape the approach:

- The sim is deterministic fixed-point (`TILE = 1024`, milli-gold, 20 Hz); all balance flows
  through one load path (`src/data/balance.json` → `src/data/schema.ts`) where tiles convert to
  fixed-point units exactly once. The schema enforces the 2-axis-per-archetype invariant
  (`schema.ts:181-207`).
- The carrier speed factor is hardcoded `trunc(speed × 4/5)` in `src/sim/enemy.ts`, inside a
  pinned modifier order (carrier factor, then slow) that is a determinism contract. The slow
  percentage is already data-driven (`slowSpeedPer100` threaded into `stepEnemies`), so a
  precedent exists for the shape of the change.
- Settlement returns sacks in full in `src/sim/economy.ts` (`settleWave`), called from step 9 of
  `Sim.advance`; the run-lifecycle settlement order (sacks → bonus → interest stop → judgement)
  is specced and must not change.
- Levels are hand-authored JSON with a terrain char-map and a `grid` block; `?level=2` in
  `src/app/levels.ts` is the existing query-param pattern.
- Exploration verified the surrounding systems absorb 40×20 without work: the fit-to-board
  camera stays readable at half tile size, and the O(W×H) flow-field rebuilds (including the
  per-hover-frame validation Dijkstras) are trivial at 800 tiles.

## Goals / Non-Goals

**Goals:**

- Land the new baseline as *authored data* (balance.json and level files contain the final
  values), with the dial layer as a thin multiplicative/override sweep around that baseline.
- Keep every determinism contract intact: dials are load-time inputs; the modifier order and
  settlement order do not move.
- Make iteration after the playtest a data-edit or a URL change, never a code change.

**Non-Goals:**

- No construction-time mechanic, no per-archetype range exceptions, no map-size dial, no live
  re-tuning of a running sim, no camera/zoom work, no wave recomposition, no level editor.

## Decisions

### D1: Dials apply to raw values before schema parsing, not to parsed data

The tuning layer patches the raw balance/level JSON values (multiplying `rangeTiles` by
`rangeScale`, `hp` by `hpScale`; replacing absolute fields) and then hands the result to the
existing schema parse. Fixed-point conversion happens once, downstream, exactly as today
(`rangeUnits = round(rangeTiles × 1024)` sees the already-scaled tiles).

*Why*: the effective values — not the authored ones — get schema validation, including the
2-axis invariant (which uniform multipliers preserve). *Alternative rejected*: patching parsed
data post-validation would bypass validation and duplicate conversion/rounding logic, creating a
second rounding site and a determinism hazard.

### D2: Levels are re-authored at 40×20 as committed data, not upscaled at load

Each terrain char-map cell duplicates into a 2×2 block (rows doubled, each char doubled),
`grid` becomes 40×20, and treasury/spawn coordinates multiply by 2 (the top-left cell of each
2×2 block; border spawns stay on the border under doubling). Wave definitions are untouched.

*Why*: map size is deliberately not a dial, and committed 40×20 char-maps are what the user will
hand-edit when iterating terrain — a load-time transform would leave the authored files at the
wrong resolution for that. The upscale is mechanical enough to do once and commit.

### D3: `carrierSpeedPer100` replaces the hardcoded 4/5, threaded like `slowSpeedPer100`

New top-level balance field, parsed to an integer, passed into `stepEnemies` alongside
`slowSpeedPer100`; the movement code computes `trunc(speed × carrierSpeedPer100 / 100)` in the
same pinned slot the 4/5 factor occupies today. Note `trunc(s × 4/5) ≡ trunc(s × 80/100)` for
all integer speeds, so the refactor at value 80 is hash-identical to today — a useful
intermediate check before flipping the value to 130.

### D4: Sack recovery fraction applies only at settlement, floored per sack in milli-gold

`settleWave` credits `floor(sackMg × sackRecoveryPer1000 / 1000)` per sack, in the existing
deterministic sack order, and removes the sack; the remainder simply never credits. Mid-wave
pickup by enemies transfers full value, unchanged. At 1000 the arithmetic reproduces today's
behavior exactly (the spec keeps that expressible).

*Why per-sack flooring*: it composes with sack merging (sacks already merge per tile) and avoids
order-dependence a summed-then-floored total would not — the per-sack credit is deterministic
regardless of how the ground gold happens to be partitioned.

### D5: Dial parsing lives in the app layer and fails loudly

A small parser next to the `?level=` handling reads the ten dial parameters, validates
type/range (positive multipliers, non-negative integers where applicable), and throws with the
offending parameter name on anything invalid — never a silent fallback. The result is a plain
overrides object handed to the data loader; the sim never learns dials exist, it just receives
balance data. `interestRatePpm` and `startingTreasury` override the level's parsed economy
values.

## Risks / Trade-offs

- [Effective hp scaling can make mid-run waves economically unwinnable] → This risk FIRED at the
  initial ×5 sweep: with bounties unchanged, the sack tax made killing a loaded swarm net
  negative and scripted best-play death-spiraled by wave 4. The dial sweep is exactly the
  designed retreat path, and the calibrated finals (hp ×2, ranges ×1.8, wall 3, sack 900,
  startingTreasury 500) were verified by a scripted full clear of level 1 (158 kills, zero
  escapes, solvent win — now the replay golden).
- [Carrier 130% + cheap walls + ungated mid-wave placement enables wall-drop micro in front of
  fleeing carriers] → Known and accepted for this experiment; construction time was explicitly
  scoped out. Revisit after further play.
- [State hashes and any test pinned to old constants (80% carrier, full sack return, ranges, hp,
  wall cost) break] → Expected; this is a new baseline. Update fixtures alongside; use the D3
  hash-identity at 80 to separate refactor errors from intentional retunes.
- [Settlement loss pushes marginal runs toward `settled-locked` more often] → Intended pressure
  (10% at the calibrated recovery fraction); the solvency-gate liquidation path already handles
  it.

## Migration Plan

Pure data + small sim/app change; no persisted state to migrate. Implement in hash-safe stages:
(1) data-plumb `carrierSpeedPer100=80` and `sackRecoveryPer1000=1000` — determinism suite must
pass unchanged; (2) flip values and land the rest of the balance/level data; (3) add the dial
layer. Rollback is a data revert; most "rollbacks" should instead be dial sweeps.
