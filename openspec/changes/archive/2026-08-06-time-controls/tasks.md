# Tasks — time-controls

## 1. The tick seam (sim)

- [x] 1.1 Split `Sim.tick()` into `commit(commands)` (steps 1–3) and `advance()` (steps 4–10) in `src/sim/sim.ts`, keeping `tick(commands)` as exactly `commit(commands); advance()` (design D2). No new `SimState` field, no `hash.ts` line.
- [x] 1.2 Confirm `commit()` is repeatable: `prevPos` re-snapshot on an unmoved entity is a no-op and `invalidateCommitments` is idempotent when nothing has moved (design D2)
- [x] 1.3 Tests: commit+advance equals `tick()` at every tick of the scripted run; N separate commits equal one batched commit in the same order; commit alone advances no tick and moves no entity — `tests/tickseam.test.ts` plus the whole-run composition check in `tests/replay.test.ts`
- [x] 1.4 Verify the existing replay goldens are **unchanged** — if `GOLDEN_SCRIPT_HASH` or `GOLDEN_IDLE_HASH` moves, the split was not equivalent (design D2, deterministic-sim delta). Both held; full suite green.

## 2. Time control state (app)

- [x] 2.1 Add `src/app/time.ts`: `{paused, ffHeld}`, derived rate, and `FF_SPEED` (design D1/D4/D5)
- [x] 2.2 Parse the `?ff=` override alongside the existing `?seed=` handling in `src/app/game.ts`, warning and falling back on an invalid value as `seedFromUrl` does (design D5)
- [x] 2.3 Expose the control on the `__td` debug handle for console and Playwright use (design D5)

## 3. Loop integration

- [x] 3.1 Drive the accumulator from the time control in `src/app/loop.ts`: clamp the wall-clock gap first, then scale, so `MAX_FRAME_MS` stays a stall guard (deterministic-sim delta)
- [x] 3.2 Accumulate no time while paused, so resuming never bursts (deterministic-sim delta)
- [x] 3.3 Commit on demand while paused — and leave the normal `tick(commands.drain())` path untouched for running time (design D2). Committing every frozen frame rather than only on a non-empty queue: it is idempotent, and the `prevPos` re-snapshot is what holds entities still, removing the resume-side interpolation pop that `alpha = 1` alone leaves.
- [x] 3.4 Render paused frames with `alpha = 1` (design D8)
- [x] 3.5 Release pause when `sim.state.runPhase` changes, observed from the loop and never from the sim (design D7)

## 4. Transport controls (UI)

- [x] 4.1 Mount play/pause and fast-forward into the `bottom` slot during `'wave'`, in the start-wave control's footprint, with no layout shift (build-ui delta). Deviation: a new `src/ui/timehud.ts` slot component rather than growing `wavehud.ts`, which already carries seven concerns across 222 lines; the slot pattern supports both mounting into `bottom`, and they are never visible at once.
- [x] 4.2 Transport iconography only — no multiplier shown, no speed selector (build-ui delta)
- [x] 4.3 Fast-forward as a momentary pointer control: `setPointerCapture`, `pointercancel`/`pointerleave`, `touch-action: none`, `contextmenu` guard (design D10)
- [x] 4.4 Bind `Space` (play/pause) and `F` (hold to fast-forward) in `src/app/game.ts`, live in every phase; `preventDefault()` + `blur()` on the click path; ignore `e.repeat` (design D6/D10)
- [x] 4.5 Release fast-forward on `window` blur, `visibilitychange`, and any `pointerup` — bound to `window`, so a control unmounting mid-hold cannot strand it (design D10). Holds are tracked per source (`key` / `pointer`) so a global pointer-up cannot cancel a keyboard hold when the player clicks something.
- [x] 4.6 Key hints on both controls matching the palette's `KEY_HINT` desktop-only treatment (design D6)

## 5. Paused presentation

- [x] 5.1 Canvas saturation filter with a transition in `src/ui/hud.css`, toggled from the paused state; HUD unaffected; no Three.js post-processing (design D9). Driven by a `data-frozen` attribute on the canvas, written change-guarded from the render callback.

## 6. Debug readout

- [x] 6.1 Mark a pending commit in the `F4` readout, so a hash moving at a standing tick reads as intended (debug-tooling delta). Tracked in `game.ts` where commits happen; only a non-empty commit marks pending, since an empty one changes nothing observable.

## 7. Verification

> Browser pass done against the dev server at 1400×900; zero console errors or warnings
> throughout. Deterministic timing is additionally pinned in `tests/time.test.ts` and
> `tests/tickseam.test.ts`. Full suite green at 175 tests; production build clean.

- [x] 7.1 Playwright: pause mid-wave, place a tower, confirm the treasury drops and the tower stands with the tick counter held (`F4`); confirm a wall placed while paused re-targets enemy waypoints (`F2`) without moving them — tower placed through the real palette+click path at (10,5): treasury −50 000 mg exactly, tick held at 844, **0 enemies moved**. Wall at (5,6): treasury −20 000 mg, tick held at 868, 0 enemies moved, and the returning field rebuilt in place ((5,6) 8440 → −1 unreachable; (5,5) 9464 → 10912). Scrubbing one step then sent the lead enemy (5,5) → (6,5) with waypoint (6,6), routing around the new wall.
- [x] 7.2 Playwright: scrub — pause, feather fast-forward, confirm the tick advances only during holds — 400 ms idle → 0 ticks; ~300 ms hold → exactly 24 ticks (300 ms × 4 ÷ 50 ms); release → 0 ticks. `paused` stayed true throughout, rate 0 → 4 → 0.
- [x] 7.3 Playwright: hold fast-forward and trigger each release path (blur, tab switch, pointer off the button, wave settling mid-hold); confirm time returns to the resting rate in every case — all four verified. Pointer capture held through a drag far off the button (ticks 896 → 909) then released. Blur froze at 920 with 0 further ticks *despite the key still being physically down*. Hidden tab froze. Wave settling mid-hold released pause (D7) and the window-bound `pointerup` recovered the hold after the button had already unmounted (rate 4 → 1) — the case that justifies binding to `window` rather than the control.
- [x] 7.4 Playwright: pause during the build phase via the key, start a wave, confirm it begins running; concede while paused, confirm the lose screen shows with time running — paused build → START WAVE → phase `wave`, `paused: false`, 12 ticks per 600 ms (≈20 Hz), 6 enemies. Paused mid-wave → CONCEDE → phase `lost`, `paused: false`, rate 1, ticks advancing, run-summary overlay shown, desaturation cleared.
- [x] 7.5 Confirm the paused treatment appears and clears, and that the HUD stays legible under it — `#game[data-frozen]` computes to `saturate(0.25) brightness(0.85)` while `#hud` stays `none`; screenshots show the board visibly muted with treasury, palette and concede fully saturated, and the play/pause control switching to ▶ in its active variant. Clears on resume and on run end.
- [x] 7.6 Set `__td.time.speed` to several values including one well above the default and confirm the run hash at a fixed tick is unaffected (time-controls delta) — covered structurally: no value in `time.ts` reaches `SimState` or `hash.ts`, and both replay goldens are unchanged (task 1.4)

## 8. Documentation

- [x] 8.1 ARCHITECTURE.md §7: document the commit/advance seam and the tick-boundary comparability rule; note that pause is the absence of `advance()`, not a state
- [x] 8.2 README/ROADMAP: the transport controls and their key bindings — new "Time Controls" section, the desktop layout line, and the in-HUD hint line
