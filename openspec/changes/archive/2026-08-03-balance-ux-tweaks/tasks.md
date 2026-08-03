## 1. Balance & economy data

- [x] 1.1 Retune `src/data/balance.json`: area damage 26/34/44 → 20/26/34; slow costs 40/70/120 → 60/100/170; wall cost 4 → 20 (design D3/D6); update the `$note` tuning commentary
- [x] 1.2 Add the `waveBonus: { baseGold, graceTicks, decayTicks }` block to balance data and its schema validation in `src/data/schema.ts` (design D4)
- [x] 1.3 Lower `interestRatePerTick` to 0.0002 in both level files (design D5)

## 2. Wave speed bonus (sim)

- [x] 2.1 Compute each wave's last scheduled spawn tick from the resolved groups in `src/sim/waves.ts`
- [x] 2.2 Implement the settlement bonus per D4's formula in `src/sim/economy.ts`/`src/sim/sim.ts`: integer-mg linear decay, credited after sack return and before the solvency/win judgement; store `lastWaveBonusMg` in hashed state (`types.ts`, `hash.ts`)
- [x] 2.3 Tests: faster clear pays ≥ slower clear; over-window wave pays zero; bonus can rescue solvency before the judgement; replay/hash determinism updated in one deliberate pass (goldens re-minted once with the level re-author, tests/replay.test.ts)
- [x] 2.4 Surface the credited bonus in the wave HUD (settlement toast or wave summary line)

## 3. Enemy rendering

- [x] 3.1 Shrink the tank's render scale to 0.8 in `TYPE_MODELS` (`src/render/enemies.ts`, design D2)
- [x] 3.2 Add grounding shadow discs per enemy — shared geometry/material, radius from type scale, flat at terrain height, tracking interpolated position, removed with the mesh (design D1)
- [x] 3.3 Verify shadows are render-only: replay hash unchanged with rendering on/off (render-pipeline spec scenario)

## 4. Mobile camera

- [x] 4.1 Reproduce the missing zoom/pan under Playwright touch emulation and identify the root cause (design D7 — do not fix blind). Found: true-mobile landscape works; portrait is the by-design rotate prompt; the real gap is hybrid devices (hover+fine+touch screen) where PointerDriver gave touch no camera control AND let touch taps insta-place
- [x] 4.2 Fix the confirmed cause: PointerDriver now ignores touch pointers; hybrid devices (`maxTouchPoints > 0` alongside hover+fine) get a `TouchCameraController` (touch-only pinch/pan) alongside PointerDriver in `src/app/game.ts`
- [x] 4.3 Verify one-finger pan returns when a tool is deselected and two-finger pan/pinch works with a tool selected; confirm `touch-action: none` holds on the canvas (Playwright touch emulation, screenshots)
- [x] 4.4 Add regression coverage for the confirmed cause in `tests/camera.test.ts` (hybrid controller: touch pinch zooms, touch drag pans, mouse ignored)

## 5. Levels at 20×10

- [x] 5.1 Re-author `level_01.json` at 20×10 keeping every instrumented-gauntlet feature (S-curve via two gapped walls, two corner-to-corner pairs, diagonal-favoured stretch, dead-end pocket, both sockets) and update its `$note`
- [x] 5.2 Re-author `level_02.json` at 20×10 keeping the two-front shape (west ridge choke, north spawn from wave 6, sockets on both approaches, rocks half-ringing the treasury) and update its `$note`
- [x] 5.3 Confirm load-time validation and reachability pass on both new boards; update `tests/level.test.ts` fixtures that assume 30×20
- [x] 5.4 Review wave schedules against the shorter approach paths — stretched the dense swarm-wave intervals in level_01 (waves 7–10); validated via the re-derived scripted full run (winnable, real pressure: near-broke waves and a mid-wave overdraw) and the leak harness
- [x] 5.5 Confirm default camera framing fits a 20×10 board on desktop and mobile aspect ratios (isometric-camera delta: board-size-generic)

## 6. Level progression

- [x] 6.1 Add the static level sequence (level_01 → level_02) as `src/app/levels.ts` and resolve the current level's successor URL, carrying `?seed=` through when present (design D9)
- [x] 6.2 Add the "Next level" button to the win overlay in `src/ui/screens.ts` — shown only when won with a successor; navigation starts the fresh run; lost or final-level summaries unchanged
- [x] 6.3 Test: sequence/successor-URL logic unit-tested in `tests/levels.test.ts`; the button itself is verified by playing (7.2), per the project's test policy for ui/

## 7. Harness & verification

- [x] 7.1 Re-derive leak-harness fixtures (`tests/leakData.ts`) from the new costs at exact spend parity (observed: 75k/208k/120k mono vs 0 countered); re-derive the replay script against the 20×10 board via a temporary auto-play harness and re-mint both golden hashes once (all milestones incl. overdraw and zero escapes)
- [x] 7.2 Full test suite green (157 tests); played in-browser on desktop + emulated mobile: shadows ground every enemy, tank at 0.8, both 20×10 boards frame correctly, wave bonus toast fires at settlement (+14g on a stretched wave — decay works), next-level flow verified (won+successor shows the button and navigates to ?level=2; final-level win and losses show nothing)
