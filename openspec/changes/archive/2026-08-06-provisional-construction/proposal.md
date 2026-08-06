# Provisional Construction

## Why

Building in this game is irreversible in a way that punishes exactly the players it should reward.

Every structure costs its full price on placement and returns 50% on removal. That spread is a
deliberate brake on free re-mazing between waves (ARCHITECTURE.md §15, question 1), and as a brake
on *rearranging an established maze* it works. But it applies with equal force to a player who
places a wall on the wrong tile and notices one second later. A misclick costs half a wall.

The `time-controls` change makes this materially worse. Tactical pause invites deliberation —
that is its purpose — and deliberation means trying a layout, looking at it, and changing your
mind. Under pause the invitation is unlimited and the tax is unchanged, so the feature that exists
to reward optimisation actively penalises the act of optimising.

Worse, pause opens a case with no exit at all. Removal is refused while a wave runs, so a
structure placed during a paused wave cannot be undone until the wave settles. Pause hands the
player unlimited time to make a purchase they cannot take back.

Both problems have the same root: **the game charges committed prices for decisions the player has
not yet committed to.** A structure placed during the build phase has not yet faced an enemy. A
structure placed during a paused wave has not existed for a single moment of live time. Neither has
earned its irreversibility.

## What Changes

- **Structures are provisional until they have lived through a wave tick.** A structure that has
  not yet experienced an advance under an active wave refunds **100%** and may be sold **regardless
  of run phase**. Once a live tick passes over it, it commits: the normal 50% refund applies and
  removal returns to being a between-waves action.

  The clearing event is deliberately not "the next tick". The build phase advances ticks the whole
  time a player is planning, so a tick-based window would expire in 50 ms. What the build phase and
  a pause actually share is that **no consequential tick has elapsed** — the build phase because
  spawns and settlement are gated off and the board is empty, a pause because time is not running
  at all. One predicate covers both.

- **Starting a wave becomes a commit point.** Everything built since the last wave settles into
  place the moment the first live tick lands. That is a better reading of a state machine the game
  already has: the build phase becomes a planning board, and the start-wave control becomes the
  decision.

- **Selling is the undo.** No command history, no undo stack, no snapshot. The player selects the
  provisional structure and sells it at full price, through the existing removal path.

- **The liquidation estimate accounts for it.** The recovery-impossible notice compares debt
  against the total refund value of everything standing; with provisional structures worth more
  than half, a flat rate makes that notice pessimistic and it can fire on a run that is still
  recoverable.

## Capabilities

### Modified Capabilities

- `structure-placement`: provisional state as hashed simulation state, the full-refund rule, and
  the relaxation of the wave-phase removal gate for provisional structures only.
- `run-lifecycle`: the first live tick of a wave commits standing construction; liquidation value
  is computed per structure.
- `build-ui`: the inspector names which refund applies, provisional structures read as
  uncommitted on the board, and the remove controls distinguish "blocked by the wave" from
  "sellable because provisional".

## Non-Goals

- **Reversible upgrades.** `applyUpgrade` mutates `paidMg` and `level` in place and there is no
  downgrade command. Upgrading a *provisional* tower is covered — selling it returns everything at
  100% — but upgrading a **committed** tower during the build phase stays irreversible. Closing that
  gap means tracking a committed baseline per structure rather than a flag, plus a new revert
  command; it is deliberately deferred until playtesting says upgrade misclicks actually sting.
- **A general undo command.** See "selling is the undo" above. A `Ctrl+Z` convenience that issues a
  removal for the last placed tile could be added later without touching the simulation.
- **Snapshot or rollback machinery** — out of scope per ARCHITECTURE.md §14, and this design needs
  none.
- **Changing the 50% refund itself.** Established construction is untouched; the dial stays where
  it is.

## Impact

This change **shifts balance**, and should be playtested as such rather than treated as a quality
fix. It partially answers ARCHITECTURE.md §15 question 1: revision of the current phase's
construction becomes free, while rearranging an established maze stays at 50%. The brake survives
where it does work and is lifted where it only punished hesitation — but the build phase is
meaningfully cheaper to iterate in than it was.

One capability falls out that nobody designed: a wall placed and sold during a **paused** wave is a
free re-routing preview, since the commitment sweep runs on both the placement and its removal. It
cannot be exploited for value — the round trip is net zero, and any fast-forward commits
immediately — so it is information, not leverage. For the optimiser this reads as a feature; it is
recorded here so it is not rediscovered as a leak.

- `src/sim/types.ts`, `src/sim/hash.ts` — the provisional flag as hashed state, added in the same
  change as its hash line per the standing rule.
- `src/sim/sim.ts` — commit provisional structures on the first advance under an active wave;
  refund rate selection on removal.
- `src/sim/placement.ts` — the removal phase gate consults the structure, not only the phase.
- `src/sim/economy.ts` — liquidation total computed per structure.
- `src/ui/inspector.ts`, `src/ui/palette.ts`, `src/ui/wavehud.ts`, `src/render/towers.ts` — the
  refund the player is about to get, the board tell, the remove-control states.
- `tests/replay.test.ts` — `GOLDEN_SCRIPT_HASH` re-mints once, deliberately. `GOLDEN_IDLE_HASH`
  must **not** move: that run places nothing, so the canonical walk never reaches structure fields.
  If it moves, the edit reached further than intended.
- `tests/placement.test.ts`, `tests/economy.test.ts` — the window, its boundary, and the refund
  arithmetic.

## Dependencies

Stacks on `time-controls`. The paused-wave cases in this change require its commit/advance split —
"a structure that has not lived through a live tick" is only a reachable state when time can be
stopped. The build-phase behaviour stands alone and is useful without it.
