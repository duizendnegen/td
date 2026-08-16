# Tasks — tower-damage-stats

## 1. Counters as hashed state (sim)

- [ ] 1.1 Add `Structure.waveDamage: number` and `Structure.totalDamage: number` to `src/sim/types.ts` with doc comments naming the reset point and the effective-damage rule, and add both `mix()` lines to the structure loop in `src/sim/hash.ts` immediately after `provisional` — same commit, per standing rule D-P1-2 (design D1)
- [ ] 1.2 Initialise both to `0` in `applyPlace` (`src/sim/sim.ts`); walls carry them at zero like `nextFireTick`
- [ ] 1.3 Test in `tests/hash.test.ts`: two states differing only in one structure's `totalDamage` hash differently (tower-combat delta, "Both counters are hashed")

## 2. Recording effective damage

- [ ] 2.1 In `fireTowers` (`src/sim/tower.ts`), at the rapid/sniper hit compute `dealt = Math.min(target.hp, stats.damage)` before the subtraction and add it to `t.waveDamage` and `t.totalDamage` (design D2)
- [ ] 2.2 In the area burst loop, do the same per struck enemy so each contributes its own effective damage; the slow case touches nothing
- [ ] 2.3 Tests in `tests/tower.test.ts`: a full hit counts the stat value; an overkill hit on a low-hp enemy counts only the remainder; an area burst over three enemies with mixed hp counts the sum of effective damage; a slow tower's counters stay 0 across many ticks

## 3. The wave reset

- [ ] 3.1 In `applyStartWave` (`src/sim/sim.ts`), zero `waveDamage` on every structure in the same tick the command applies; nothing else writes it to zero (design D3)
- [ ] 3.2 Tests in `tests/tower.test.ts`: after a wave settles the wave counter still holds the wave's figure; the next `startWave` zeroes it while `totalDamage` is unchanged; a tower placed mid-wave counts only from placement

## 4. Upgrade and move preserve

- [ ] 4.1 Tests in `tests/tower.test.ts` (or `tests/upgrade.test.ts` / `tests/placement.test.ts` where the helpers already live): an upgrade leaves both counters unchanged and later damage continues onto them; a build-phase move carries both counters to the new tile (design D4, tower-combat delta). No sim code expected — the tests pin the in-place mutation

## 5. Determinism

- [ ] 5.1 Re-mint `GOLDEN_SCRIPT_HASH` once, deliberately, adding a header note in `tests/replay.test.ts` in the style of the `provisional` note: two mixed fields per structure, trajectory unchanged, every milestone (kills at its recorded count) still holds (design D6)
- [ ] 5.2 Confirm `GOLDEN_IDLE_HASH` does **not** move — that run places nothing, so the walk never reaches structure fields. If it moves, stop: the edit reached further than intended
- [ ] 5.3 Run the full suite (`npm test`) and `npm run typecheck`; `tests/scenario.test.ts` and `tests/capture.test.ts` must be untouched by the change

## 6. Inspector — the Performance block

- [ ] 6.1 In `src/ui/inspector.ts`, add a second stats container below the existing one, separated by a `border-surface-bright` rule and using the same `STAT_ROW` / `STAT_LABEL` / `STAT_VALUE` variants; on mobile it is its own flex row, not an extension of the stat container's `mobile:flex-row` (design D5, build-ui delta)
- [ ] 6.2 Render two rows for every archetype except `slow`: the wave figure labelled `This wave` when `runPhase === 'wave'` and `Last wave` otherwise — shown as `—` when outside a wave and `totalDamage === 0` — and `Total`; plain integers, no unit. Hide the container entirely for the slow tower
- [ ] 6.3 Add `waveDamage` and `totalDamage` to the inspector's `contentKey` so the block refreshes as damage lands in every phase, including the build phase where nothing else in the key changes
- [ ] 6.4 Playwright: select a rapid tower during a wave and confirm both figures rise as it fires; let the wave settle and confirm the label flips to `Last wave` with the figure retained; start the next wave and confirm it reads `This wave` at 0 while `Total` holds
- [ ] 6.5 Playwright: a tower placed in the build phase shows `—` and `Total 0`; a slow tower shows no performance block; the mobile sheet (below the breakpoint) shows the block on its own row without widening the stat columns

## 7. Documentation

- [ ] 7.1 `ARCHITECTURE.md` §7 (attack resolution): one sentence that each hit records its effective damage on the firing tower as hashed state, reset per wave at wave start
- [ ] 7.2 `ARCHITECTURE.md` §9 (inspector): add the performance block to the inspector's one-line description
- [ ] 7.3 Update the `Responsibilities` header comments in `src/sim/tower.ts` and `src/ui/inspector.ts`
