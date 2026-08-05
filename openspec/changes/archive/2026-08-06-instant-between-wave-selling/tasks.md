## 1. Sim: immediate removal behind a phase gate

- [x] 1.1 In `src/sim/placement.ts`, replace `tickRemovals` with `removeStructure(state, grid, structure, refundPer1000): boolean` — credit `floor(paidMg * refundPer1000 / 1000)`, drop the structure from `state.structures`, unblock the footprint only when the tile is not `TERRAIN.socket`, and return whether the mask changed (D2)
- [x] 1.2 In `src/sim/placement.ts`, export `canRemove(phase: RunPhase): boolean` returning true only for `'build'` and `'settled-locked'`, with a comment stating why `won`/`lost` are excluded (D1); update the file header's responsibilities list
- [x] 1.3 In `src/sim/sim.ts`, rewrite the `remove` command case: reject via `placementRejected` on the tile when `!canRemove(runPhase)` or no structure is there; otherwise call `removeStructure` and set a private `removalUnblocked` flag on a mask change (D1, D2)
- [x] 1.4 In `src/sim/sim.ts`, replace step 3's `tickRemovals` call with the flag check — rebuild both live fields once, set `maskChanged`, clear the flag — leaving the `invalidateCommitments` sweep untouched (D2, D4); update the tick-order comment
- [x] 1.5 Drop the removal-countdown clause from `applyUpgrade`'s validity check in `src/sim/sim.ts`
- [x] 1.6 Delete `removalCompleteTick` from `Structure` in `src/sim/types.ts`, its mix in `src/sim/hash.ts`, and `REMOVAL_TICKS` from `src/sim/fixed.ts`; fix every remaining reference until `npm run typecheck` is clean

## 2. Tests: the new contract

- [x] 2.1 Rewrite `tests/placement.test.ts`'s "removal keeps the tile blocked for all 80 ticks" as an immediate-removal test: one tick, tile unblocked, structure gone, half the paid cost credited, fields reflecting the new mask
- [x] 2.2 Rewrite the socket-removal test in `tests/placement.test.ts`: refunded and dropped in the command's tick, tile still terrain-blocked, socket placeable again
- [x] 2.3 Add `tests/placement.test.ts` cases for the phase gate: a mid-wave removal is rejected with an unchanged state hash versus the same tick without the command, the same command succeeds in the build phase, and a placement mid-wave still succeeds
- [x] 2.4 Drop the `REMOVAL_TICKS` waits in `tests/economy.test.ts` — the wave-locked-unlock and `settled-locked`-win tests now assert the refund, the unlock, and the win all land in the removal command's own tick
- [x] 2.5 Drop the `REMOVAL_TICKS` wait in `tests/upgrade.test.ts`'s refund-base test; keep the base-plus-upgrades assertion
- [x] 2.6 Remove the `removalCompleteTick` fixtures and mutation case from `tests/hash.test.ts` and the field from `tests/replay.test.ts`'s integer leak sweep
- [x] 2.7 Run `npm test` and confirm every suite except `replay.test.ts`'s scripted golden is green

## 3. Render and UI

- [x] 3.1 In `src/render/towers.ts`, delete `CountdownLabel`, the `labels` map, and their sprite lifecycle, including the dispose loop for dropped ids (D6)
- [x] 3.2 In `src/ui/inspector.ts`, replace the `REM_COUNTDOWN` state with a wave-unavailable state driven by `canRemove(state.runPhase)`: disabled, naming the wave as the reason; keep the `Dismantle · 50% of Ng back` label for the available state and include the gate in `lastContentKey` (D5, D6)
- [x] 3.3 In `src/ui/palette.ts`, give the remove tool an unavailable state from a new `removalAllowed` argument to `refresh`, deselect it when the gate flips false, and refuse `select('remove')` while gated (D5)
- [x] 3.4 In `src/ui/inputcore.ts`, guard `commitRemove` on `canRemove(this.sim.state.runPhase)` and a structure being present, flashing the footprint on refusal (D5)
- [x] 3.5 In `src/app/game.ts`, pass the gate into `palette.refresh` from live sim state
- [x] 3.6 Run `npm run typecheck` and `npm test`, then drive the app with the Playwright plugin: sell between waves and watch the structure vanish with the refund in the same frame, start a wave and confirm the palette tool, desktop inspector, and mobile sheet all read unavailable, then settle and confirm they return
  - Verified in-browser via Playwright against the vite dev server, driving the real command queue and clicking the real controls: selling between waves drops the structure and credits the refund in the next tick (−10g → +15g, structure gone, start-wave enabled in that same tick, no countdown); during a wave the palette tool, desktop inspector and mobile bottom sheet all read `Dismantle locked · wave in progress` / blocked, an already-selected remove tool is deselected on wave start, and inspector-click, rail-click and a direct `select('remove')` all no-op with the structure surviving; after settlement every control returns, and removal stays available while wave-locked at a negative balance even though building is blocked. No countdown label renders anywhere; zero console errors or warnings.

## 4. Docs

- [x] 4.1 `ARCHITECTURE.md`: update the `placement.ts` line in the module map, drop `removalCompleteTick` from the timers list, rewrite step 3 of the tick order, and replace the "Removal delay: 4.0 s = 80 ticks" note with the phase-gate rule and its monotone-unblock rationale
- [x] 4.2 `ARCHITECTURE.md`: update the palette and inspector UI descriptions, the `placement.test.ts` row in the test table, and the open questions that ask about the removal delay and turn-around penalisation
- [x] 4.3 `README.md`: rewrite the anti-juggling bullet (line ~89) as the between-waves rule, and the phase-2 line that names "removal delay"
- [x] 4.4 `ROADMAP.md`: update the phase-2 removal bullet, the phase-3 "removal countdown" UI bullet, and the two open questions about the delay

## 5. Re-mint the golden hash

- [x] 5.1 With every other suite green, re-mint `GOLDEN_SCRIPT_HASH` in `tests/replay.test.ts` from a fresh run and confirm `GOLDEN_IDLE_HASH` still matches unchanged (D3)
- [x] 5.2 Add a provenance note to that file's header, alongside the phase-4 and balance-ux notes, recording that the scripted golden was re-minted for immediate removal and why the idle golden was not
- [x] 5.3 Run the full `npm test` and `npm run build` to close out
