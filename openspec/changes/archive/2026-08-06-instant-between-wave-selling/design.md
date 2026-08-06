## Context

See proposal.md — Why. The constraints that shape this design come from ARCHITECTURE.md:

- The sim is bit-deterministic fixed-point integer math at 20 Hz with a **fixed 10-step tick order**.
  Commands apply in step 2, removal timers advance in step 3 (rebuilding flow fields and running the
  commitment-invalidation sweep on any mask change), enemies move in step 5, run progression is
  judged in step 9.
- `Structure` fields — `removalCompleteTick` among them — enter the canonical FNV-1a hash walk. Two
  golden hashes in `tests/replay.test.ts` pin the whole simulation, and re-minting one is explicitly
  "a deliberate act that means the simulation intentionally changed".
- Placement is validated by a pure pipeline that tentatively blocks the footprint, rebuilds both
  fields into scratch buffers, and swaps them in on accept — one rebuild per attempt. Removal has
  never used that pipeline.
- The UI issues commands only; it never mutates sim state. `canSpend()` is already shared between the
  authoritative apply and the UI's affordability rendering — the pattern this change follows for the
  wave gate.

Current removal: `apply('remove')` stamps `removalCompleteTick = tick + 80`; step 3's `tickRemovals`
completes every due structure, credits the refund, unblocks non-socket tiles, and reports whether
the mask changed.

## Goals / Non-Goals

**Goals:**

- One authoritative phase predicate for removal, shared by the sim and all three UI surfaces, so
  they cannot drift.
- Immediate removal that costs at most one field rebuild per tick regardless of how many structures
  are removed in it.
- Delete the timer rather than neutralize it: no dead field in hashed state, no dead constant, no
  dead render path.

**Non-Goals:**

- Changing the refund fraction, the refund base, or any other balance number.
- Gating placement by phase, or any other mid-wave restriction.
- A confirmation step, undo, or refund preview beyond what the inspector already shows.
- Batch/drag selling. One command per structure, as today.

## Decisions

### D1 — The gate is a sim-side allowlist of phases, not a UI concern

`apply('remove')` accepts only in the `build` and `settled-locked` phases. An explicit allowlist,
not `phase !== 'wave'`: it also refuses removal after the run ends (`won`, `lost`), where a refund
would silently rewrite a final balance the summary already reported.

The check belongs in the sim because commands are the replay surface — a replay of a mid-wave remove
must reproduce the refusal, and a UI-only guard would let a scripted or racing command through. A
refused removal emits the existing `placementRejected` render event on the structure's tile, so it
gets the same red flash a refused placement gets, and mutates nothing else.

Alternative rejected: gate in `inputcore.commitRemove` only. Cheaper, but it makes the sim's
accepted-command set depend on which client issued the command — the exact thing determinism forbids.

*Same-tick race:* a remove and a `startWave` in one tick resolve by command `seq` order, as every
other command pair does. Both orderings are legal and deterministic; no special handling.

### D2 — Removal applies inline in step 2; fields rebuild once in step 3

`apply('remove')` does the whole mutation — drop the structure, unblock a non-socket footprint,
credit the refund — and sets a private `removalUnblocked` flag instead of rebuilding fields itself.
Step 3 keeps its shape: if the flag is set, rebuild both live fields, set `maskChanged`, clear the
flag; then run the existing sweep. So N removals in one tick cost one rebuild, not N.

`tickRemovals` in `placement.ts` becomes `removeStructure(state, grid, structure, refundPer1000):
boolean` — same refund arithmetic and same socket asymmetry, applied to one structure now instead of
scanning for due ones. Step 3 loses its scan.

This preserves the ordering guarantee that matters: fields and commitments are consistent before
enemies move in step 5, and the refund lands before step 9 judges progression — so a liquidation
that clears the debt unlocks the next wave, or wins the run from `settled-locked`, in the same tick
its command applies.

Alternative rejected: rebuild inside the command apply. Simpler to read, but each rebuild is a full
two-source BFS over the grid, and between-wave re-mazing is exactly when a player removes several
structures in quick succession.

### D3 — `removalCompleteTick` is deleted, and the scripted golden is re-minted

The field leaves `Structure`, the hash walk, the leak harness's integer sweep, and `hash.test.ts`'s
mutation cases. `REMOVAL_TICKS` leaves `fixed.ts`.

Consequence: `GOLDEN_SCRIPT_HASH` must be re-minted, because dropping one mixed field changes the
canonical walk for every run that holds a structure. `GOLDEN_IDLE_HASH` is unaffected — that run
never places anything, so the walk never reaches structure fields; if it moves, something is wrong.
The re-mint is legitimate under the rule in that file's header (the simulation intentionally
changed) and gets a provenance note there alongside the phase-4 and balance-ux notes. Procedure:
make every other suite green first, then re-mint once, then confirm the idle golden still matches.

Alternative rejected: keep the field pinned at `-1` to hold the hash layout stable. It buys a green
`replay.test.ts` at the cost of a permanently dead field inside hashed state and a lie in
`ARCHITECTURE.md`'s timers list — the opposite of the trade the golden-hash rule is protecting.

### D4 — Removal is validated by argument, not by code

No validation pipeline for removal, and the specs now say why: unblocking a tile is monotone on the
flow fields — every cost can only stay equal or fall — so a removal can never seal a spawn or strand
an enemy, and no enemy can be standing on a blocked tile in the first place. The only checks are
"a structure exists here" and D1's phase gate.

The commitment-invalidation sweep still runs on a removal-driven mask change, unchanged from today's
behavior at countdown expiry — and it is a genuine no-op for removals, not merely usually one: it
re-commits an enemy only when its waypoint became *blocked*, which an unblock can never cause. Live
enemies pick up the reopened route at their next waypoint re-evaluation, through the ordinary
one-tile commitment (verified by test: the field opens in the removal's tick, the enemy steers
through the tile once it re-reads). The call stays because it is the same shared step-3 path
placements use, and a removal-only tick has already paid for the rebuild.

### D5 — One shared predicate for the three UI surfaces

`placement.ts` exports `canRemove(phase: RunPhase): boolean` — the sim's own gate, next to
`removeStructure`, mirroring how `canSpend` is shared. `apply('remove')`, `inputcore.commitRemove`,
`palette.refresh`, and `inspector.refresh` all call it; nothing hardcodes a phase name.

`palette.refresh(treasuryMg)` grows a second argument (removal allowed) rather than taking the whole
`SimState`, keeping the palette ignorant of run phases; `inspector.refresh` already receives
`SimState`. The palette deselects the remove tool when the predicate flips false, so a tool cannot
sit selected while every click is a no-op.

### D6 — The countdown render path is deleted, not hidden

`CountdownLabel`, the `labels` map, and their sprite lifecycle in `render/towers.ts` exist only for
the removal countdown and go with it. The inspector's remove button loses its `REM_COUNTDOWN` state
and gains a wave-unavailable state; the label it shows in the available state (`Dismantle · 50% of
Ng back`) is unchanged, and is now the whole story a player needs.

## Risks / Trade-offs

- **Re-minting the scripted golden could mask an unrelated regression.** → Re-mint only after every
  other suite is green, in its own step, and check that `GOLDEN_IDLE_HASH` did *not* move — an idle
  run holds no structures, so any change there means the edit reached further than intended.
- **Instant between-wave removal makes the maze freely re-editable each build phase, which could
  flatten the difficulty curve.** → The 50% refund is the economic brake and is untouched: every
  re-maze still burns half the investment. No balance number moves in this change, so the effect is
  observable in playtesting and reversible by tuning `removalRefundFraction` later.
- **Losing mid-wave selling removes an emergency lever.** → Intended, and the loss is small: a
  player whose balance goes negative mid-wave already cannot spend the proceeds, and settlement is
  usually seconds away. The recovery loop that actually matters — the wave-locked and
  `settled-locked` sell-to-solvency states — is unchanged and now instant.
- **A player mid-click when a wave starts sees the click do nothing.** → D1's reject event flashes
  the tile, and D5 deselects the palette's remove tool on the phase flip, so the disabled state is
  visible rather than inferred.
- **The unimplemented `add-energy-infrastructure` change describes panels on "the standard 80-tick
  removal path".** → Coordination note in proposal.md: whichever change lands second follows this
  rule, and a panel inherits immediate between-waves removal with no extra work — it reuses the wall
  path either way.

## Migration Plan

Nothing persists between sessions: no save files, no stored replays, no schema or balance-data
change. Sequence within the change: sim (`placement.ts`, `sim.ts`, `types.ts`, `hash.ts`,
`fixed.ts`) → tests other than the golden → render and UI → docs → re-mint `GOLDEN_SCRIPT_HASH`
last, once everything else is green. Rollback is a plain revert; the only artifact worth naming is
the re-minted golden, which must be reverted with it.
