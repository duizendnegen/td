## Context

See proposal.md — Why. The relevant machinery is already in place:

- `TimeControl` (`src/app/time.ts`) is a pure render-loop rate holder; it knows nothing about run
  phases, and the sim can never observe it (time-controls design D1).
- The Space/F keydown handler in `src/app/game.ts` toggles pause in every phase (the old design
  D6), with `preventDefault` so a focused button is not re-activated.
- The start-wave button (`src/ui/wavehud.ts`) issues `{ kind: 'startWave' }` on the command
  queue; the sim validates it (build phase ∧ balance ≥ 0 ∧ waves remaining) and ignores it
  otherwise. Commands drain both on ticks and on frozen-frame commits.
- Pause already releases on any run-phase change (`releasePauseOnPhaseChange` in game.ts), so no
  phase can start paused.
- Transport buttons (`src/ui/timehud.ts`) mount only during the wave phase and carry key-hint
  spans; the buttons `blur()` after click so the Space binding cannot double-fire them.

## Goals / Non-Goals

**Goals:**

- One phase-aware Space binding: startWave in build, pause toggle in wave, inert elsewhere.
- No player-reachable path into a paused build phase.
- Zero simulation changes — hashes and replay goldens untouched.

**Non-Goals:**

- No new pause affordances or phase gating inside `TimeControl` itself.
- Fast-forward (F key and transport button) behavior is unchanged.
- No touch/mobile equivalent for starting waves — the key binding is desktop-only, like every
  other keyboard shortcut; touch keeps the button.

## Decisions

### D1: Gate at the input handler, not inside TimeControl

The phase check lives in the game.ts keydown handler (which already has `sim` in scope), not in
`TimeControl.togglePaused()`. TimeControl stays a dumb rate holder with no sim dependency — the
layering that keeps time provably outside the simulation — and the `__td.time` console handle
keeps working in every phase as the debug escape hatch (replacing the build-phase pause debugging
the old D6 allowed). Alternative rejected: passing a phase supplier into TimeControl would gate
the console handle too and tangle the layers for no observable gain.

### D2: Space issues the startWave command; the sim stays the validator

The build-phase Space branch issues `{ kind: 'startWave' }` on the existing command queue —
exactly what the button does — rather than checking solvency UI-side. The sim's existing
validation makes an insolvent or waveless press a no-op, so the key can never disagree with the
button about when starting is legal. Guard with `!e.repeat` so auto-repeat issues one command;
repeats that land after the phase flips to 'wave' must not fall through to the pause branch
(covered by the repeat guard already on the pause toggle).

### D3: Phase dispatch order in the handler

One handler, dispatching on `sim.state.runPhase`: `'build'` → issue startWave; `'wave'` → toggle
pause; other phases → nothing. `preventDefault` fires for Space in every phase (unchanged), so a
focused button — including the start-wave button, which does not `blur()` after click — is never
re-activated by the key. The F fast-forward branch stays phase-agnostic.

### D4: Key hint via the shared helper

Reuse the `hint('Space')` treatment from timehud.ts on the start-wave button (extract the helper
or duplicate the three lines — implementer's choice; extraction preferred). Hint line in
`src/ui/input.ts` becomes phase-aware copy, e.g. `Space start wave / pause`.

## Risks / Trade-offs

- [Losing build-phase pause as a debug tool — the old D6 rationale] → F fast-forward remains, and
  `__td.time.setPaused(true)` from the console covers the rare need to freeze debug-spawned
  enemies during build.
- [Space now has two meanings; a player mashing Space at the wave→build settlement boundary could
  start the next wave unintentionally] → Accepted: startWave requires a fresh keydown
  (`!e.repeat`), settlement is visually loud (toast, slot swap), and this is the standard TD
  convention (Space = start/pause). No debounce window is added; revisit in playtesting if it
  bites.
- [Tests: the keydown handler lives in game.ts, which the vitest suite does not mount] → The
  sim-side behavior (startWave validation) is already covered; the binding itself is verified by
  Playwright exploratory testing during apply, per project convention.
