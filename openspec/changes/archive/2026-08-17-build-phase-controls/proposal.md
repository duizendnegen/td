## Why

During the build phase there is nothing for pause to stop — the simulation only matters once a
wave is running — yet Space still toggles pause there, invisibly (the transport buttons are only
mounted during a wave). A player who taps Space in the build phase silently freezes time and gets
no feedback; worse, Space is the natural "go" key, and right now the natural thing it should do —
start the next wave — needs a mouse trip to the button in the corner.

## What Changes

- Pause becomes unavailable during the build phase: the pause toggle (Space today, plus any future
  affordance) only operates while a wave is running. Combined with the existing
  release-on-phase-change rule, a build phase can never be paused.
- Space becomes phase-sensitive: during the build phase it activates the start-wave action —
  same validation as the start-wave button (solvent, waves remaining) — and during a wave it
  keeps its pause-toggle meaning. In the remaining phases (settled-locked, won, lost) it does
  nothing beyond suppressing the browser's default activation of a focused control.
- A ~1 s arming delay after a wave settles keeps a mistimed pause press at the settlement
  boundary from starting the next wave; the delay applies to the key only, not the button.
- The start-wave button carries a `Space` key hint in the same desktop treatment the transport
  buttons use, and the HUD hint line reflects the phase-dependent meaning.
- Fast-forward (hold F) keeps its phase-agnostic binding — it remains the debug lever for
  build phases holding debug-spawned enemies. **Note:** the build-ui spec's "keys live in every
  phase" requirement is narrowed; build-phase pause for debugging moves to the `__td.time`
  console handle.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `time-controls`: pause scoped to the running-wave phase — the play/pause toggle only operates
  while a wave is active, so the build phase cannot be paused.
- `build-ui`: the start-wave control gains a Space key binding in the build phase; the
  "time controls are keyboard-operable" requirement is narrowed from "keys live in every run
  phase" to phase-scoped bindings (pause during waves, fast-forward everywhere).

## Impact

- `src/app/game.ts` — the time-control keydown handler becomes phase-aware (reads
  `sim.state.runPhase`, issues `startWave` via the existing command queue in build phase).
- `src/ui/wavehud.ts` — start-wave button gains the key-hint span (shared treatment with
  `src/ui/timehud.ts`).
- `src/ui/input.ts` — hint line copy update.
- No simulation changes: `startWave` validation already lives in the sim (build phase, balance
  ≥ 0, waves remaining), so an invalid Space press is an ignored command. State hash and replay
  goldens are untouched.
