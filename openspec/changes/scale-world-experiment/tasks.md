# scale-world-experiment — tasks

## 1. Hash-safe data plumbing (design D3/D4 stage 1 — no behavior change yet)

- [x] 1.1 Add `carrierSpeedPer100` (authored value 80 for now) and `sackRecoveryPer1000`
      (authored value 1000 for now) to `src/data/balance.json` and parse/validate both in
      `src/data/schema.ts` (positive integers; carry them on the parsed balance data)
- [x] 1.2 Replace the hardcoded `trunc(speed × 4/5)` carrier factor in `src/sim/enemy.ts` with
      `trunc(speed × carrierSpeedPer100 / 100)`, threaded like `slowSpeedPer100`, keeping the
      pinned modifier order (carrier factor before slow)
- [x] 1.3 Apply `sackRecoveryPer1000` in `settleWave` (`src/sim/economy.ts`): credit
      `floor(sackMg × per1000 / 1000)` per sack in the existing deterministic order
- [x] 1.4 Run the determinism suite / state-hash tests and confirm hashes are bit-identical to
      main with the neutral values (80 / 1000) — separates refactor bugs from retunes

## 2. Balance value flips

- [x] 2.1 Flip `carrierSpeedPer100` to 130 and `sackRecoveryPer1000` to 700 in balance.json
- [x] 2.2 Set `wallCost` to 5, `graceTicks` to 300, `decayTicks` to 1500
- [x] 2.3 Multiply all tower `rangeTiles` by 3 (rapid 7.5 at every level; sniper 15/17.25/19.5;
      area 7.5/9/10.5; slow 7.5/9/10.5) and confirm schema validation (2-axis invariant) passes
- [x] 2.4 Multiply all enemy `hp` by 5 (swarm 250, tank 4500, runner 2400, brute 3000)
- [x] 2.5 Update tests/fixtures pinned to the old constants (80% carrier speed, full sack
      return, wall cost 20, old ranges/hp/bonus windows)

## 3. Level upscale to 40×20 (design D2)

- [x] 3.1 Upscale `level_01.json`: duplicate each terrain char into a 2×2 block, set grid to
      40×20, multiply treasury and spawn coordinates by 2; waves untouched
- [x] 3.2 Upscale `level_02.json` the same way (both spawns, incl. the wave-6 north spawn)
- [x] 3.3 Verify both levels load, spawns sit on the border, flow fields build, and enemies
      path spawn→treasury→spawn on the upscaled maps

## 4. Tuning dial layer (design D1/D5)

- [x] 4.1 Add a query-param tuning parser in the app layer (next to the `?level=` handling in
      `src/app/levels.ts`): `rangeScale`, `hpScale`, `carrierSpeedPer100`, `wallCost`,
      `interestRatePpm`, `bonusGraceTicks`, `bonusDecayTicks`, `sackRecoveryPer1000`,
      `refundPer1000`; invalid values throw with the offending parameter name
- [x] 4.2 Apply the overrides to the raw balance/level JSON before schema parsing — multipliers
      on `rangeTiles`/`hp` (round once), absolute replacement for the rest,
      `interestRatePpm` overriding the level's parsed rate — so validation and fixed-point
      conversion see effective values
- [x] 4.3 Test: no params → authored behavior bit-identical; a dialed run replayed twice →
      identical hashes; an invalid dial → visible load error

## 5. Verification and playtest

- [x] 5.1 Full test suite green; determinism probe passes on both upscaled levels
- [x] 5.2 Exploratory playtest with the Playwright plugin: wave 1 of level 1 is clearable with
      a modest build; a killed carrier's sack settles at 70%; a loaded carrier visibly
      outruns its base speed; wave bonus is nonzero on a brisk clear
- [x] 5.3 Screenshot the 40×20 board at desktop fit to confirm readability is acceptable

## 6. Playtest calibration (added after the feel test)

- [x] 6.1 Calibrate values from the dial sweep: ranges ×3 → ×1.8, hp ×5 → ×2, wallCost 5 → 3,
      sackRecoveryPer1000 700 → 900 (the ×5 sweep death-spiraled the economy by wave 4)
- [x] 6.2 Raise `level_01` startingTreasury to 500 — starting money is the per-level balancing
      lever; add the `startingTreasury` tuning dial
- [x] 6.3 Re-tune the leak harness and re-derive both replay goldens at the calibrated values
      (scripted full clear: 158 kills incl. 2 injected tanks, theft overdraw in wave 5, zero
      escapes, solvent win)
- [x] 6.4 Retime `.github/capture/scenario.json` (PR-preview capture) to the new board using the
      replay golden's proven timeline

## 7. Wave-length dial (added after the calibration playtest)

- [x] 7.1 Add the `waveScale` dial: multiply every wave group's `count` and `delay` (round once,
      count clamped to ≥ 1), leave `spawnInterval` alone so spawned hp per tick holds; groups
      authored with `count` 1 keep count 1 (only their delay scales) so set-piece spawns don't
      stack (design D6)
- [x] 7.2 Test: `waveScale=5` on level 1 gives 5× counts at unchanged intervals and 5× delays;
      level 2's lone tank stays a single tank; fractional scales never drop a group below one
      enemy; `waveScale=0` fails loudly
