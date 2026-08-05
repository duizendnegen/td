## Why

Selling a structure today costs 4.0 s of real time (the 80-tick removal delay) and can be ordered
at any moment, including mid-wave. The delay exists for one reason only — the anti-juggling rule
(README, "Removing a wall/tower takes 3–5 seconds"): without it, a player could open and close a
gate during a wave to farm a treadmill of enemies. Banning removal during a wave kills that exploit
outright, which makes the delay pure friction: between waves there are no enemies on the board, so
waiting 4 s to re-maze buys nothing and taxes exactly the deliberate, low-stakes editing the build
phase is for. It also makes the wave-locked recovery loop — sell to climb back to solvency — feel
like watching a progress bar instead of making a decision.

Trading the delay for a phase gate keeps the exploit closed, cuts the friction, and simplifies the
mechanic: one rule ("sell between waves") instead of two ("sell any time, but slowly").

## What Changes

- **BREAKING** Removal is refused while a wave is running. A `remove` command applied during the
  `wave` phase is rejected with the same no-op-plus-reject-feedback contract a rejected placement
  has. Removal stays available in every other live phase — `build` and the post-final-wave
  `settled-locked` state, where liquidating is the only path back to solvency and to a win.
- **BREAKING** Removal is immediate. The commanded structure is dropped, its footprint unblocked,
  the flow fields rebuilt, and the 50%-of-total-invested refund credited — all in the tick the
  command applies. The 80-tick countdown, the `removalCompleteTick` timer on `Structure`, and the
  `REMOVAL_TICKS` constant all go away.
- Placement during a wave is **unchanged**: building mid-wave stays legitimate and is not gated.
- The removal-countdown readout above a structure and the inspector's `Removing… 2.3s` state are
  removed — there is no longer a state to display. The remove control and the palette's remove tool
  instead read unavailable during a wave.
- The upgrade gate drops its "not under a removal countdown" clause: a structure under removal no
  longer exists as a state.
- Removal never needs path validation, and this change makes that explicit: unblocking a tile can
  only lower path costs, so an immediate removal can neither seal a spawn nor strand an enemy.
- The scripted replay golden hash is re-minted: dropping `removalCompleteTick` from hashed
  structure state changes the canonical hash layout. This is a deliberate simulation change, per
  the rule in `tests/replay.test.ts`.

## Capabilities

### New Capabilities

None — this change re-specifies existing behavior.

### Modified Capabilities

- `structure-placement`: the delayed-removal requirement is replaced by immediate removal gated to
  non-wave phases, with the no-validation-needed rationale stated.
- `run-lifecycle`: the wave-locked and settled-locked recovery requirements drop "with its normal
  delay" — refunds land in the tick the removal command applies, so the unlock and the win fire in
  that same tick.
- `build-ui`: the removal-countdown requirement is removed; the remove control (palette tool,
  desktop inspector, mobile inspector sheet) gains an unavailable-during-wave state in place of its
  countdown state.
- `tower-upgrades`: the upgrade validity conditions drop the removal-countdown clause.

## Impact

- **Sim** (`src/sim/`): `sim.ts` (the `remove` command applies the removal inline; step 3 loses the
  removal-timer pass), `placement.ts` (`tickRemovals` becomes an immediate `removeStructure`),
  `types.ts` (`Structure.removalCompleteTick` dropped), `hash.ts` (one fewer mixed field),
  `fixed.ts` (`REMOVAL_TICKS` dropped).
- **Render** (`src/render/towers.ts`): the countdown label and its sprite lifecycle go away.
- **UI** (`src/ui/`): `inspector.ts` (remove-button states), `palette.ts` (remove tool disabled
  during a wave), `inputcore.ts` (guard the removal commit on phase, not on an in-flight countdown).
- **Tests**: `placement.test.ts` (both removal tests rewritten; add a during-wave rejection),
  `economy.test.ts` and `upgrade.test.ts` (drop the `REMOVAL_TICKS` waits), `hash.test.ts` (drop the
  `removalCompleteTick` mutation case), `replay.test.ts` (re-mint `GOLDEN_SCRIPT_HASH`; the idle
  golden is unaffected — that run holds no structures).
- **Docs**: `ARCHITECTURE.md` (§7 tick order, timers list, the removal-delay note, the UI
  descriptions, the test table, the open questions), `README.md` (the anti-juggling bullet),
  `ROADMAP.md` (the phase-2/3 delay bullets and open questions).
- **Coordination**: the unimplemented `add-energy-infrastructure` change describes panels as
  inheriting "the standard 80-tick removal path". Whichever change lands second inherits this
  change's rule — a panel reuses immediate, between-waves removal.
