# Design — time-controls

## Context

See proposal.md for motivation. Relevant current state:

- `src/app/loop.ts` is a 34-line fixed-timestep accumulator: `accumulator += min(now − last,
  MAX_FRAME_MS)`, drain in `TICK_MS` steps, then `render(accumulator / TICK_MS, frameDt)`.
  `MAX_FRAME_MS = 5 × TICK_MS` is a stall guard, not a speed cap.
- `Sim.tick(commands)` (`src/sim/sim.ts`) runs a fixed, documented 10-step order. Steps 1–3 are
  reactive to commands (snapshot `prevPos`, apply commands, rebuild fields when
  `removalUnblocked`, sweep commitments when `maskChanged`). Steps 4–10 are time passing (wave
  spawns, movement, arrivals, firing, deaths, progression, compact + `tick++`).
- The simulation reads no clock. `state.tick` is an integer; wall time enters nowhere.
- `Sim.previewPlacement` validates the ghost against **live** state; `validatePlacement`
  (`src/sim/placement.ts`) builds its own scratch fields from the current grid mask and the
  accepting caller swaps them in, so it does not depend on step 3 having run.
- Render animation takes wall-clock `performance.now()`: `enemies.sync(…, now, tick)` (hover bob,
  yaw spin), `sacks.sync(…, now)`, `fx.drain(sim.events, now)` and `fx.update(now)` (tracer 110 ms,
  muzzle 90 ms, impact 160 ms, burst 320 ms).
- `PaletteUI` already binds `1`–`6` and `Escape` and renders per-item key hints via `KEY_HINT`
  (`mobile:hidden`) — keyboard shortcuts for common actions are established precedent.
- `WaveHud` mounts the start-wave control into the `bottom` slot and sets
  `startButton.style.display = 'none'` during a wave — the slot is empty while a wave runs.
- `window.__td` already exposes `sim`, `stats`, `probe`, `commands`, `palette`, `inspector` for
  console debugging and automated exploration; `?seed=` and `?level=` are established URL
  overrides.
- The debug spawn panel's `spawn` command is **not** gated on `runPhase`, and `stepEnemies` runs
  unconditionally — so debug-spawned enemies move during the build phase.

## Goals / Non-Goals

**Goals:**

- Pause and fast-forward without adding one field to `SimState` or one line to the hash walk.
- A paused game that responds immediately to building, so optimisation is a real activity.
- A speed multiplier that can be retuned during a playtest without a rebuild.

**Non-Goals:**

- An uncapped speed (see proposal Non-Goals).
- Changing how render effects are timed. They stay on wall clock; at 4× that means roughly 3.5
  concurrent tracers instead of 0.9, which is not a problem worth machinery.
- Touch-device keyboard parity.

## Decisions

### D1 — Speed lives in the render loop; the simulation never learns about it

`app/time.ts` owns `{paused: boolean, ffHeld: boolean}` and derives a rate. `loop.ts` reads it.
`SimState` gains nothing, `hash.ts` gains nothing, the replay goldens do not move.

The load-bearing consequence is that **pause is an absence, not a state**: paused means
`advance()` is not called. The simulation has no way to observe it, and therefore no way for a
future change to accidentally couple to it.

*Alternative rejected*: a `paused` flag or speed scalar inside the simulation. It would put
wall-clock intent inside the determinism boundary and invite exactly the class of bug the contract
exists to prevent (implementing pause by skipping the wave scheduler, or by scaling enemy speed).

### D2 — The tick splits at the seam its own step order already has

```
  ┌─ commit()  — absorb intent ────────────────────────┐
  │  1. snapshot prevPos                               │  on demand while paused
  │  2. apply commands                                 │
  │  3. rebuild fields / sweep commitments             │
  └────────────────────────────────────────────────────┘
  ┌─ advance() — let time pass ────────────────────────┐
  │  4. wave spawns          8. deaths                 │  only when time runs
  │  5. enemy movement       9. progression            │
  │  6. arrivals            10. compact; tick++        │
  │  7. tower firing                                   │
  └────────────────────────────────────────────────────┘

  tick(commands)  ≡  commit(commands); advance()
```

`tick()` is retained as exactly that composition, so every existing caller — the replay tests, the
`F8` probe, `tickOnce` — is unchanged in behaviour.

**Commit is repeatable.** `validatePlacement` builds its scratch fields from the live mask and the
accepting caller swaps them in, so committing one command at a time is equivalent to committing
them as a batch. Step 1 re-snapshots `prevPos` to an unmoved position (a no-op), and
`invalidateCommitments` is idempotent when nothing has moved. `commit()` may therefore be called
any number of times before an `advance()`.

**The loop needs no special case.** While paused, commit whenever the queue is non-empty. On
unpause, the ordinary `tick(commands.drain())` commits an empty array — a harmless no-op — and
advances.

**Replay equivalence.** A live session that commits `place A`, `place B`, `remove A` across a pause
and then advances produces the same state as a replay applying `[place A, place B, remove A]` in
step 2 of that tick and advancing. Everything happens in commit; advance is the only thing that
consumes time.

*Alternative rejected*: retrofitting commands into the **previous** tick. Unsound — that tick's
field rebuild and enemy movement have already run, so a replay applying the command at its step 2
would move enemies differently. The seam is the *front* of the next tick, not the back of the last.

*Alternative rejected*: running a full tick per command while paused. That is turn-based time, not
pause.

*Alternative rejected*: leaving commands queued and making the UI optimistic. The killer is
reachability: the no-sealing rule is a global property of the mask, so validating a fifth
speculative wall requires the mask including the first four — i.e. reimplementing steps 2–3 against
a shadow grid. Committing for real is both simpler and correct, and it keeps the ghost honest for
free, since `previewPlacement` already reads live state.

### D3 — State comparability is defined at tick boundaries

The split introduces a state that did not previously exist: committed but not advanced. "The hash
at tick N" is therefore no longer a single value.

The contract becomes: **simulation states are comparable at tick boundaries; commit-then-advance is
atomic with respect to comparison.** Nothing that compares hashes today pauses — the two-machine
gate check and the replay goldens both run `tick()` — so nothing breaks. But the rule is written
down, because a future reader will otherwise find the F4 hash moving while the tick counter stands
still and reasonably assume a bug.

`F4` gains a pending marker for exactly that reason (see the debug-tooling delta).

### D4 — Fast-forward is momentary; the rate model is two orthogonal controls

```
                   │  FF not held  │   FF held
   ────────────────┼───────────────┼────────────
     playing       │      1×       │   FF_SPEED
     paused        │      0×       │   FF_SPEED
```

Play/pause sets the resting rate; fast-forward overrides it while held, regardless of pause. That
last cell is the design's point: paused-plus-feathered-FF is a scrubber. At 4×, a 100 ms tap
advances 8 ticks (≈0.4 simulation seconds) — enough to watch a carrier commit to a turn, coarse
enough not to be tick-stepping.

Momentary rather than latching means fast-forward cannot be left on by accident, which matters
because it is the control that skips content.

*Note*: holding fast-forward pins the pointer to the button, so building while fast-forwarding is
not possible on a mouse. This is accepted — the intended loop is pause → plan → build → release →
watch, in which the two never overlap.

### D5 — The multiplier is a constant with two override paths

```
  app/time.ts       export const FF_SPEED = 4     the value to edit
  ?ff=10                                          matches ?seed= / ?level= precedent
  __td.time.speed                                 live, no reload
```

It does **not** go in `balance.json`: that file flows through `loadGameData` into `Sim` and is
simulation data by contract. A render-loop multiplier living there would blur the boundary D1
exists to protect.

`__td.time` is not only a convenience. The project's apply guidance is to explore with Playwright,
and driving a sustained physical hold from a test harness is awkward where setting a speed is one
line. A hold-only control would make the project's own exploratory testing harder.

### D6 — Buttons are wave-phase; keys are always live

The build phase is *already* a pause: ticks increment, but step 4 (spawns) and step 9
(interest/settlement) are gated on `runPhase === 'wave'` and the board is empty. Pausing it changes
nothing observable.

With one exception that matters: the debug spawn panel is not phase-gated, so debug-spawned enemies
walk, steal and are shot during the build phase. That is a live development scenario.

Hence: the **buttons** mount only during `'wave'` (into the slot the start-wave control vacates —
no displacement, no new UI), while the **keys** and `__td.time` stay live in every phase.

Bindings: `Space` for play/pause, `F` for fast-forward. `1`–`6` are taken by the palette, so the
digits are unavailable; `F` is distinct from the `F1`–`F8` debug keys. Both buttons carry `KEY_HINT`
glyphs matching the palette's existing desktop-only treatment.

### D7 — Pause releases on any run-phase change

One rule instead of four edge cases:

| transition | why it must release |
| --- | --- |
| build → wave (`startWave`) | the wave must not begin frozen |
| wave → build (settlement) | otherwise paused in a phase with no visible control |
| → lost (`concede`) | the loss overlay must not sit behind a frozen board |
| → won / settled-locked | same |

`startWave` and `concede` are themselves commands, so during a pause they are *committed* and
`runPhase` flips with time still stopped. The release is therefore driven by **the loop observing
`sim.state.runPhase` change**, never from inside the simulation — preserving D1.

Fast-forward needs no such rule: it is momentary, and in the build phase it does nothing anyway
(except with debug spawns, which is precisely when it is wanted).

### D8 — Paused frames render with `alpha = 1`

Pause can land mid-tick with the accumulator at, say, `alpha = 0.6`. A subsequent `commit()`
re-snapshots `prevPos = pos`, which would collapse the interpolation and pop every entity forward.

Forcing `alpha = 1` while paused renders committed positions, makes the re-snapshot a visual no-op,
and is semantically right: a stopped simulation should display what *is*, not an interpolated
guess. The cost is a sub-tick forward snap at the instant of pausing — well under one frame of
motion.

### D9 — The paused canvas desaturates, via CSS

A CSS `filter: saturate(…)` on the canvas element, with a transition.

Desaturation reads as "time stopped" where dimming reads as "modal overlay". Filtering the canvas
alone leaves the HUD fully saturated and readable. And it is the option that does not reopen a
settled decision: Three.js post-processing is explicitly out of scope (ARCHITECTURE.md §14). The
scene is static while paused, so the composite cost is paid once.

### D10 — Hold mechanics: every path must guarantee a release

A momentary control that fails to release strands the game at speed. All of these strand it:

- alt-tab mid-hold — `keyup` never arrives → release on `window` blur and `visibilitychange`
- keyboard auto-repeat — `keydown` refires continuously → ignore `e.repeat`
- pointer dragged off the button → `setPointerCapture`, plus `pointercancel` and `pointerleave`
- **the wave settles mid-hold** — the button unmounts under the finger and its `pointerup` goes
  nowhere → the release listener binds to `window`, not the button
- touch long-press raises the context menu / magnifier → `touch-action: none` and a `contextmenu`
  guard on the button (the HUD root already sets `user-select: none`)

`Space` additionally needs `preventDefault()` and a `blur()` on click: after clicking play/pause the
button holds focus, and `Space` would otherwise re-fire the click *and* run the handler — a double
toggle that presents as the key doing nothing.

## Risks / Trade-offs

- **Tactical pause changes difficulty.** Placing towers with perfect information and unlimited
  deliberation is easier than doing it under pressure. This is intended (the optimiser is the
  audience), but it is a real change to how a wave plays, and it belongs in playtest notes
  alongside ARCHITECTURE.md §15 question 1.
- **The tick split touches `sim.ts`** — the file with the strongest stability interest in the
  project. Mitigated by keeping `tick()` as the literal composition, so the replay goldens are the
  regression test: if they move, the split was not equivalent.
- **A paused-wave misclick is currently uncorrectable.** Removal is refused while a wave runs, so
  pause lets a player commit a purchase they cannot undo. This is pre-existing policy, not new, but
  pause makes it far more reachable — and it is the motivation for the `provisional-construction`
  change that stacks on this one.
- **Effects densify at speed.** Accepted per proposal; at 4× it is roughly 3.5 concurrent tracers
  against 0.9 today. Worth revisiting only if `FF_SPEED` is raised well past 10×.

## Open Questions

- The value of `FF_SPEED`. 4× is watchable and is the highest speed that keeps interpolation smooth
  at 60 fps (1.33 ticks/frame; stutter begins around 9×, and the existing 5-tick catch-up clamp
  binds at ~15×). 10× would serve skip-the-tail better at the cost of legibility. D5 exists so this
  is answered by playing, not by argument.
- Whether the paused state wants more than desaturation — a scanline or vignette in the
  aether-industrial idiom — or whether the transport button's own state carries it.
