# Design — provisional-construction

## Context

See proposal.md for motivation. Relevant current state:

- `Structure` (`src/sim/types.ts`) carries `paidMg` — base cost plus every upgrade paid — as the
  refund basis. Removal credits `floor(paidMg × refundPer1000 / 1000)` with
  `removalRefundFraction: 0.5` in `balance.json`.
- Removal is immediate (this branch): `applyRemove` refunds and drops the structure in the tick the
  command applies, setting `removalUnblocked` so step 3 rebuilds the fields.
- `canRemove(phase)` (`src/sim/placement.ts`) is the single predicate the simulation and the UI both
  read — `false` during `'wave'` and after the run ends. It takes only the phase.
- `s.nextStructureId++` on placement is never decremented, and it is hashed. Place-then-remove
  therefore never restores the prior hash even where it restores the board.
- `liquidationTotalMg(structures, refundPer1000)` (`src/sim/economy.ts`) applies one flat rate
  across all structures; `WaveHud` uses it for the recovery-impossible notice.
- Step 9 (`stepProgression`) gates interest and settlement on `runPhase === 'wave'`; step 4 gates
  spawning the same way. The build phase is inert apart from debug spawns, which are **not**
  phase-gated.
- `time-controls` splits the tick into `commit()` (steps 1–3) and `advance()` (steps 4–10). This
  design's commit point lives in `advance()`.

## Goals / Non-Goals

**Goals:**

- One predicate covering both the build phase and a pause, without either concept entering the
  simulation.
- Protect revision of *this phase's* construction without unlocking free rearrangement of an
  established maze.
- Keep the simulation ignorant of pause, exactly as `time-controls` establishes.

**Non-Goals:**

- Reversible upgrades, a general undo command, snapshot machinery (see proposal Non-Goals).
- Any change to the 50% rate for committed structures.

## Decisions

### D1 — The window is "has not lived through a live tick"

A structure is **provisional** until an `advance()` runs while `runPhase === 'wave'`. That advance
commits every standing structure.

```
   build phase, unpaused   →  advances run, but runPhase ≠ 'wave'
                              stays provisional for the whole phase
   press START WAVE        →  first live tick lands → EVERYTHING COMMITS
   paused wave, place      →  advance() is not called at all → provisional
   unpause / hold FF       →  live ticks resume → commits
   unpaused wave, place    →  committed within 50 ms — live play has no free undo
   earlier phase's work    →  long committed — the 50% brake is untouched
```

The elegance is in what the simulation has to know: **nothing about pause.** Pause manifests as
`advance()` not being called, so the rule reads purely as "an advance happened while a wave was
live". `time-controls` D1 is preserved unchanged.

*Alternative rejected*: "provisional until the next tick." The build phase advances ticks
continuously while the player plans, so this expires in 50 ms and delivers none of the build-phase
protection.

*Alternative rejected*: two separate mechanics — a free-sell rule scoped to the build phase and an
undo scoped to a pause. They have genuinely different windows (a whole phase versus since the last
advance), so unifying them under one flag requires the "live tick" refinement above; without it they
cannot share an implementation, and with it they need only one.

*Alternative rejected*: true rollback to a pre-pause snapshot. It must unwind treasury, the
structure array, `nextStructureId`, the blocked mask and both flow fields — and snapshot history is
out of scope (ARCHITECTURE.md §14, and §8 records the ring buffer already being rejected).

### D2 — One hashed boolean

`Structure.provisional: boolean`, added to `types.ts` and `hash.ts` in the same change per standing
rule D-P1-2. It is a pure function of the command and tick stream, so replays reproduce it.

Placement sets it true. The commit point in `advance()` clears it across all structures when
`runPhase === 'wave'`.

The commit sweep runs at the **start** of advance, before spawning, so the ordering is unambiguous:
a wave's first advance commits what the player built, and the wave then proceeds against committed
construction.

*Alternative rejected*: storing a committed baseline (`committedLevel`, `committedPaidMg`) instead
of a flag. That generalises to reversible upgrades, which are a Non-Goal for this change. If
playtesting demands upgrade reversal, the flag becomes those two integers and a revert command; the
flag is the strict subset, so nothing is wasted.

### D3 — The refund rate is per structure; the phase gate consults the structure

Removal of a provisional structure refunds `paidMg` in full and is permitted in any live phase.
Removal of a committed structure is unchanged in every respect.

`canRemove` gains the structure alongside the phase. The wave-phase prohibition stays exactly as
specified for committed structures — a player still cannot open and close an established maze during
a wave. What is permitted is unwinding a purchase that has not yet existed for a moment of live
time, which cannot alter the maze the wave began against.

The refund is `paidMg` in full, so upgrades applied to a provisional tower return with it.

### D4 — Selling is the undo

No command history, no undo stack. The player selects the provisional structure and removes it
through the existing path, at 100%.

This avoids defining what undo means for an upgrade (no downgrade command exists), for `startWave`,
or for a removal. It reuses the whole existing chain — command, validation, refund, field rebuild —
and adds no state.

A `Ctrl+Z` that issues a removal for the last placed tile remains available later as a pure
app-layer convenience, with no simulation involvement.

### D5 — Liquidation value is computed per structure

`liquidationTotalMg` takes the per-structure rate rather than one flat fraction. Without this the
recovery-impossible notice understates what a player can raise and can declare a recoverable run
dead.

There is no exploit to guard against: selling a provisional structure returns exactly what was paid,
so the round trip is net zero and cannot raise money. Only the estimate needs fixing.

### D6 — The UI must make the two states distinguishable

Three surfaces, because a rule the player cannot see is a rule they will not trust:

- **The inspector** names the refund it will actually pay, and marks the full-refund case as the
  revision window rather than as a better deal.
- **The board** gives provisional structures a visual tell, so what will lock in when the wave
  starts is legible without clicking each one.
- **The remove controls** distinguish three states rather than two: available (build phase),
  blocked by the wave (committed), and available-because-provisional (during a wave). The existing
  requirement deselects a remove tool when a wave starts; with provisional structures sellable
  mid-wave that deselection must not strand the player who is mid-revision.

### D7 — Path-dependency, stated plainly

Place-then-sell restores the board — mask, fields, structure list, and (while paused, since nothing
moves) enemy waypoint commitments. It does **not** restore the hash, because `nextStructureId` is
monotonic and hashed.

That is correct and worth writing down: the state hash is a *history* fingerprint, not a *position*
fingerprint. Two identical-looking boards reached by different build histories hash differently.
This is already true today; provisional construction simply makes the round trip easy enough that
someone will notice and file it as a bug.

## Risks / Trade-offs

- **This is a balance change.** Revision within a phase becomes free. The brake survives for
  established construction, but the build phase is meaningfully cheaper to iterate in, and
  ARCHITECTURE.md §15 question 1 is partially answered by fiat rather than by playtest. Recorded in
  the proposal's Impact section so it is reviewed as a balance decision.
- **The asymmetry with upgrades will be felt.** A player can undo a 145g tower but not an 85g
  upgrade on a committed tower. Scoped out deliberately (D2 keeps the upgrade path open), but it is
  the most likely first complaint.
- **A new hashed field means a golden re-mint.** `GOLDEN_SCRIPT_HASH` moves once, deliberately.
  `GOLDEN_IDLE_HASH` must not: that run places nothing, so the canonical walk never reaches
  structure fields. The pair is the check that the edit landed where intended.
- **Free re-routing preview during a paused wave** (proposal Impact). Information, not leverage.
  Accepted.

## Open Questions

- Whether free revision within the build phase flattens the difficulty curve — the live half of
  ARCHITECTURE.md §15 question 1, now with a second variable. Answerable only by playing.
- Whether upgrade misclicks sting enough to justify D2's alternative (committed baseline plus a
  revert command).
- Whether the board tell should be strong enough to read at a glance across a full maze, or subtle
  enough not to make a planned layout look broken. A question for the first playtest, not for
  argument.
