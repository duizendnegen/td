# Tower Damage Stats

## Why

The player can see what a tower *could* do — range, damage per shot, fire rate — but never what
it *did*. Whether the sniper covering the return lane is earning its cost, whether the level-3
rapid tower at the maze mouth is the one carrying the wave, whether an area tower is placed where
the clumps actually walk: none of this is observable today except by watching tracers and guessing.

That is a real gap in a game whose thesis is that maze layout and tower placement are the
decisions. Every tower-defense game that expects players to optimise shows per-tower damage
dealt, because it is the cheapest possible feedback loop between "I placed this here" and "was
that right". This change adds that feedback in its smallest useful form: damage figures on the
tower's own inspector panel.

## What Changes

- **Every tower records the damage it deals.** Two integer counters per structure, kept as
  ordinary hashed simulation state alongside `paidMg` and `nextFireTick`: damage dealt **in the
  current or most recent wave**, and damage dealt **in total since purchase**. Walls carry both at
  zero, like every other tower-only field they already hold.

- **Damage counts what landed, not what was swung.** A hit that exceeds the target's remaining hp
  counts the remainder, not the stat value — `min(hp, damage)`. Overkill is not effectiveness. A
  60-damage sniper finishing a 5-hp swarm records 5. This is the figure that answers "was this
  tower worth it", and it is deliberately not the "shots × damage" arithmetic a player could do
  from the static stats already shown.

- **The wave counter is one field with a phase-dependent label.** It resets to zero when a wave
  starts. While a wave runs it is the current wave's figure; in every other phase it is the
  previous wave's. The player is never shown both, and no copy-at-settlement step exists.

- **The inspector gains a Performance block.** Below the static stats: the wave figure, labelled
  *This wave* during a wave and *Last wave* otherwise, and the total since purchase. A tower that
  has never dealt damage shows a dash for its wave figure outside a wave rather than a misleading
  zero. The slow tower, which deals no damage, shows no performance block — consistent with it
  already omitting the Damage stat.

- **Upgrades and moves preserve the counters.** "Since purchase" is literal: an upgrade continues
  the totals, and a move — which mutates the same structure record in place — carries them with
  the tower.

## Capabilities

### Modified Capabilities

- `tower-combat`: towers record effective damage dealt per wave and in total as hashed
  simulation state; the wave counter resets when a wave starts; upgrades and moves preserve both.
- `build-ui`: the tower inspector shows the recorded damage as a Performance block with
  phase-dependent labelling, omitted for the slow tower.

## Non-Goals

- **Kills per tower, gold recovered per tower, a slow-tower effectiveness metric.** All three
  are the same one-to-three-line pattern at the same site in `fireTowers`, and the theft-economy
  metric (carried gold on the carriers a tower kills) is arguably the truer measure of a sniper in
  this game. They are deliberately deferred so this change lands the mechanism and the panel
  first; each can be added later without revisiting the design.
- **Any other view of the numbers** — a per-wave summary, an end-of-run "most valuable tower",
  a leaderboard overlay. The counters being sim state means every such view is a later UI-only
  change that reads what this one records.
- **A UI-side accumulator built from render events.** Rejected in the exploration: the
  area-burst event carries a centre and radius, not what it hit, so it would need per-hit
  payloads; the UI would have to watch phase transitions for the rollover; and the figures would
  not survive a replay or a late-joining lockstep peer. The sim already keeps `kills`,
  `stolenMg` and `escapedMg` as hashed run-summary counters that no rule reads — per-tower damage
  is the same category.
- **Damage-per-second, damage per gold invested, or any derived figure.** Both inputs are on the
  panel; the derivation can come later if playtesting wants it.

## Impact

Small and local. Every point of damage in the game is applied inside `fireTowers`
(`src/sim/tower.ts`) with the firing tower in scope, so the counters are incremented at three
lines: the rapid/sniper hit and the two sites of the area burst. Slow deals no damage and touches
nothing.

- `src/sim/types.ts`, `src/sim/hash.ts` — two integer fields on `Structure`, added with their hash
  lines in the same change per the standing rule.
- `src/sim/tower.ts` — increment effective damage at each hit.
- `src/sim/sim.ts` — initialise both to zero on placement; reset the wave counter in
  `applyStartWave`. Move and upgrade need no code: they mutate the record in place.
- `src/ui/inspector.ts` — the Performance block, phase-dependent label, dash rule, slow-tower
  omission; the content key gains both counters so the panel refreshes as damage lands even in
  phases with no interest ticking.
- `tests/tower.test.ts` — accumulate, effective-not-raw, reset on wave start, total persists,
  upgrade and move preserve.
- `tests/replay.test.ts` — `GOLDEN_SCRIPT_HASH` re-mints once, deliberately: the canonical walk
  gains two fields per structure, so the hash layout changes while the trajectory does not.
  `GOLDEN_IDLE_HASH` must **not** move — that run places nothing, so the walk never reaches
  structure fields. If it moves, the edit reached further than intended.
- `ARCHITECTURE.md` §7 (attack resolution) and §9 (inspector) — one sentence each.

No balance shift: the counters are read by nothing in the simulation. No new dependencies.
