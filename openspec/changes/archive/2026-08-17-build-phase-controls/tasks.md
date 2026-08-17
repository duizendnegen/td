## 1. Phase-aware Space binding

- [x] 1.1 In `src/app/game.ts`, replace the unconditional Space→togglePaused branch with a
      dispatch on `sim.state.runPhase`: `'build'` issues `{ kind: 'startWave' }` on the command
      queue (guarded by `!e.repeat`), `'wave'` keeps `time.togglePaused()` (guarded by
      `!e.repeat`), any other phase does nothing; `preventDefault` stays unconditional for Space.
      Update the surrounding design-D6 comment to describe the phase-scoped bindings (design D3).
- [x] 1.2 Verify F fast-forward and the F2/F3/F4/F8 debug keys are untouched by the edit.

## 2. HUD affordances

- [x] 2.1 Extract the `hint()` key-hint helper from `src/ui/timehud.ts` into a shared location
      (or mirror its treatment) and add a `Space` hint to the start-wave button in
      `src/ui/wavehud.ts`, desktop-only like the transport hints (design D4).
- [x] 2.2 Update the hint line in `src/ui/input.ts`: `Space pause` becomes phase-aware copy
      (e.g. `Space start wave / pause`).

## 3. Settlement arming delay

- [x] 3.1 In `src/app/game.ts`, stamp `performance.now() + 1000` on every transition into the
      build phase (in the existing phase-change observer) and make the Space build branch inert
      before that instant (design D5). Boot-time build phase stays immediately armed.
- [x] 3.2 Playwright: settle a wave, press Space within the delay (no wave starts), press after
      the delay (wave starts); the start-wave button stays immediate inside the delay.

## 4. Verify

- [x] 4.1 `npm run typecheck` and `npm test` pass (no sim changes — replay goldens must be
      untouched).
- [x] 4.2 Playwright exploratory pass (per project apply guidance): Space starts a wave in a
      solvent build phase; Space during that wave pauses and resumes; Space while wave-locked by
      debt starts nothing; holding Space in build starts exactly one wave and does not pause the
      new wave via auto-repeat; Space in build with debug-spawned enemies does not freeze them
      while hold-F still fast-forwards; clicking start-wave then pressing Space does not
      double-trigger the button.
