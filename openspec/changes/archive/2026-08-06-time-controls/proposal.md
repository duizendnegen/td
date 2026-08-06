# Time Controls

## Why

A run currently has exactly one speed. That hurts two audiences at once.

Players who want to optimise have no way to stop and read the board. The build phase is already
untimed, so planning *between* waves is free — but the moment a wave is live, every decision is
made under time pressure with no way to pause and look. Meanwhile the tail of a wave, where two
stragglers walk home through a maze that has already decided the outcome, plays out at the same
20 Hz as the interesting part.

Development has the same problem from the other end: verifying a feature means watching a wave at
real speed, and the only fast-forward that exists (`F8`) jumps a fixed 2 000 ticks with nothing
visible in between.

Both wants are served by the same small mechanism, and it costs almost nothing: the simulation has
no clock. `Sim.tick()` is a pure function of `(state, commands)` and `state.tick` is an integer
counter. How fast ticks are driven is a property of the render loop, not of the simulation — which
is exactly what the existing `F8` probe already proves by running 2 000 ticks synchronously and
being required to match a real-time run to the same tick.

Two consequences make this cheaper than it looks:

- **Determinism is untouched by construction.** The hash at tick N is identical whether that tick
  was reached at 1×, at 4×, or instantly. No simulation state is added for speed or pause.
- **Balance is untouched by construction.** The wave speed bonus is measured in simulation ticks
  (`tick − waveStartTick`), and interest accrues per tick. Fast-forwarding cannot farm a better
  bonus and cannot dodge one.

## What Changes

- **Pause and fast-forward.** Play/pause is a toggle; fast-forward is a **momentary override** —
  held, time runs at a configured multiplier; released, it returns to whatever the toggle was set
  to. Because the override composes with pause, a paused game plus a feathered fast-forward button
  is a time *scrubber*: the resting state is frozen and the player drives time forward in small
  increments. That is the control that makes careful optimisation possible.

- **The tick splits into commit and advance.** So that a paused game stays responsive, `Sim.tick()`
  is decomposed at a seam its documented tick order already has: steps 1–3 absorb player intent
  (snapshot, apply commands, rebuild fields and sweep commitments) and steps 4–10 let time pass
  (spawn, move, resolve, settle, increment). While paused, commands commit on demand and take
  effect immediately; `advance()` runs only when time runs. `tick()` remains their composition, so
  every replay reproduces exactly as before.

  This is what makes pause *responsive* rather than merely frozen: placing a tower while paused
  charges the treasury, blocks the tile, rebuilds the flow fields and re-targets enemy waypoints
  immediately — all visible on a still board.

- **The speed multiplier is configuration, not UI.** One named constant, overridable at runtime.
  The right value is a playtesting question (4× is watchable; 10× may serve the skip-the-tail need
  better) and it should be answerable without a code change and without a decision in the HUD.

- **The controls are the classic tape transport.** Play/pause and fast-forward occupy the
  bottom-slot footprint that the start-wave control vacates during a wave — that slot is already
  empty while a wave runs, so nothing is displaced.

- **A paused board reads as paused.** Desaturating the canvas signals stopped time without dimming
  the HUD out of readability, and distinguishes a pause from a hang.

## Capabilities

### New Capabilities

- `time-controls`: the pause / fast-forward rate model, the commit-on-demand behaviour that makes
  a paused game responsive, the phase-change release rule, and the paused presentation.

### Modified Capabilities

- `deterministic-sim`: the tick gains a documented commit/advance seam, and state comparability is
  defined at tick boundaries — a committed-but-not-advanced simulation is mid-tick.
- `debug-tooling`: the simulation readout distinguishes a pending commit, and the "stable when
  paused" scenario is corrected — a player-caused change during a pause is correct behaviour, not
  drift.
- `build-ui`: the time controls and their keyboard bindings; the start-wave control's slot is
  shared with them across phases.

## Non-Goals

- **An unbounded "as fast as possible" speed.** At roughly 0.02 ms/tick, a per-frame budget would
  resolve an entire wave in about one frame — that is not a speed, it is a skip, and it would show
  the player nothing. `F8` already covers the development need for an instant jump.
- **Undo.** Commands committed during a pause are real. The experimentation window is the subject
  of the `provisional-construction` change, which stacks on this one.
- **Mobile parity for the keyboard bindings.** The buttons work on touch; the key hints are
  desktop-only, matching the existing palette hints.
- **Snapshot history or rollback** — out of scope per ARCHITECTURE.md §14, and nothing here needs
  it.

## Impact

- `src/app/loop.ts` — rate from the time control; commit-on-demand while paused; `alpha = 1` when
  paused.
- `src/app/time.ts` (new) — `{paused, ffHeld}`, the speed constant, the URL override.
- `src/sim/sim.ts` — `tick()` decomposed into `commit()` + `advance()`, with `tick()` kept as their
  composition. No new simulation state; no hash change; goldens do not move.
- `src/app/game.ts` — key bindings with their release guards; `__td.time` handle.
- `src/ui/wavehud.ts` — the transport controls in the `bottom` slot.
- `src/ui/hud.css`, `index.html` — the paused canvas treatment.
- `openspec/specs/` — via the deltas above.
- `tests/` — commit/advance equivalence against `tick()`; the existing replay goldens as the
  regression guard.
