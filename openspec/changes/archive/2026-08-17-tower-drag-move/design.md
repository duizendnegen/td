# tower-drag-move — design

## Context

See proposal.md for motivation. The mechanics this builds on:

- Placement legality lives in `validatePlacement` (src/sim/placement.ts:82): tentative
  mask-block, rebuild both flow fields into the sim's scratch pair, check every declared spawn
  and every live enemy, restore the mask. It validates against the live structure list and has
  no notion of "this tile is about to be vacated".
- `Sim.applyPlace` (src/sim/sim.ts:445) is the authoritative twin; on accept it re-blocks and
  `swapScratchFields()` so each attempt costs one field rebuild. `previewPlacement` /
  `previewRoutes` are the speculative twins the ghost and ribbon consume.
- Commands drain in `KIND_ORDER` (src/sim/commands.ts:30) — deterministic order, not
  serialized anywhere; scripts build command objects symbolically.
- Structure `tx`/`ty` are already hashed (src/sim/hash.ts:57-67); `StructureRenderer.sync`
  (src/render/towers.ts:153) positions a mesh only at build time and never repositions a
  surviving id.
- The palette is a mode machine (`Tool = 'wall' | TowerArchetype | 'remove'`), and both input
  drivers branch on the armed tool; gesture routing on touch already gives an armed tool the
  one-finger drag.

## Goals / Non-Goals

**Goals:**

- A `move` command for towers and walls with placement-grade guarantees (atomic, never seals,
  never strands) whose validation frees the origin and blocks the destination in the same
  evaluation, under the moving kind's terrain rules.
- A palette move mode whose lift/carry/drop reuses the existing ghost, validation-preview, and
  ribbon plumbing rather than growing a parallel path.
- Zero impact on replay determinism: no new hashed fields, golden hashes unchanged.

**Non-Goals:**

- Moves outside the build phase, including mid-wave moves of provisional towers — remove +
  re-place already covers that at full refund, in two commands.
- Multi-select or drag-boxing, move undo, or a travel animation (the tower teleports on the
  applying tick like placement does).
- Any change to economy numbers.

## Decisions

**1. Move is one atomic command, not remove+place sugar.**
A composed remove+place could be rejected halfway (refund credited, placement refused) and
would round-trip the treasury, breaking "free and identity-preserving". A single `move`
command validates as one unit and mutates `s.tx/s.ty` on the existing structure, so id,
`paidMg`, `level`, and `provisional` survive by construction. Command payload follows the
existing tile-addressing convention (`upgrade`/`remove` use `tx,ty`): `{ kind: 'move', tx, ty,
toTx, toTy }`.

**2. `validateMove` beside `validatePlacement`, sharing the scratch machinery.**
Rather than threading an "ignore this structure / pretend this tile is free" flag through
`validatePlacement` (whose socket fast-path and occupancy checks would each need the flag),
add `validateMove(grid, structure, toTx, toTy, ...)` that: rejects `to === from`; runs bounds,
terrain-accepts-the-mover's-kind (dirt takes both, a socket takes towers only — a wall bound for
a socket is `not-buildable`, exactly as its placement would be), occupancy (`structureAt` naturally reports the mover itself as
`occupied` only on its own tile, which the same-tile check already rejected), and
enemy-in-footprint on the destination; then applies **both** mask edits — unblock origin if it
was mask-blocked, block destination if it is navigable terrain — rebuilds the scratch fields
once, checks spawns and enemies, and restores the mask. Destination-socket moves skip the
spawn/enemy checks (freeing a tile can only lower costs, so no seal/strand is possible) but
still rebuild fields on accept when the origin was mask-blocked — unlike placement's socket
fast-path, which touches nothing.

**3. Drain order: insert `move` between `place` and `upgrade`, renumbering the tail.**
Renumbering `upgrade`/`remove`/`concede` preserves every existing pairwise order, so replays
of existing scripts drain identically and the golden hashes stand. Within a tick, placing
before moving means a same-tick place-then-move sees the placed structure — the least
surprising reading.

**4. Verdict vocabulary is reused, not extended.**
`validateMove` returns the existing `PlacementVerdict` union; the same-tile case maps to
`occupied` — the sim has no notion of a cancel, and a move to where you already stand is not a
move. The ribbon's "no projection for routing-independent rejections" rule then works
unmodified. The interaction layer alone reinterprets the origin tile as a legal put-down (D6),
so the UI never issues a same-tile command; the sim's rejection stays as the defensive backstop
for scripted input. Rejections emit the existing
`placementRejected` event with the destination footprint, so `flashReject` and the uniform
feedback requirement come for free.

**5. Speculative twins mirror the placement pair.**
`Sim.previewMove(from, to)` (verdict only) and an origin-freed variant of `previewRoutes`
(reusing `PlacementRoutes` — verdict, lanes, orphaned) feed `InputCore`. The ribbon's
re-evaluation key grows from `(tool, tile, tick)` to include the lifted structure id, so
lifting a different tower on the same tile re-projects.

**6. Lift state lives in `InputCore`, both drivers share it.**
`InputCore` gains `lifted: { id, tx, ty } | null`, entered only while the move tool is armed
in the build phase, for any structure — the ghost takes the mover's kind, and the range ring is
drawn for towers only. Desktop (`PointerDriver`): press on a structure sets `lifted`; release
past slop attempts the drop, sub-slop release keeps carrying (click-click). Slop tracking reuses
the same pattern `MouseCameraController` uses for right-drag. Touch (`TouchDriver`): the
pending-ghost flow is reused with the anchor initialized to the tower's tile and confirm
issuing `move` instead of `place`. Tool deselection (Esc, palette click, phase change to wave)
clears `lifted` unconditionally. A failed drop keeps `lifted` set, per the build-ui delta.

The origin tile is the put-down: `commitMove(origin)` short-circuits before validation to
`cancelLift()` — no command, no flash, lift cleared — and `updateMoveGhost` reports the origin
as valid (ghost tint and the touch confirm class both read that one flag), so the highlight
agrees with what the drop will do. Both drivers get this for free since both drop through
`commitMove`; on touch the pending ghost starts on the origin, so an immediate ✓ is the
put-down. Handling this in the UI rather than the sim keeps the sim's verdict honest (D4) and
avoids special-casing a no-op "move" through `applyMove`'s field swap and the ribbon's
rebuilt-scratch check.

**7. Phase gating is one predicate.**
`moveOpenIn(phase)` in placement.ts (`phase === 'build'`) gates everything: the palette tool's
availability (wired through the same per-frame `palette.refresh` that carries
`removalAllowed`), the authoritative apply, the speculative previews, and the UI lift. Unlike
removal there is no per-structure split — every structure kind moves in the build phase and
nothing moves outside it — so a `canMove(phase, s)` twin would only ignore its second argument.

**8. Renderer learns to reposition, plus a lift treatment.**
`StructureRenderer.sync` compares each surviving mesh's last-known tile to `s.tx/s.ty` and
updates `group.position` (and the provisional `buildMark`) on change — needed for moves and
harmless otherwise. While a structure is lifted, its origin mesh renders dimmed (per-id
override set by `InputCore`); the carried preview is the ordinary `GhostPreview` of the mover's
kind, with the archetype's range ring at the candidate tile for towers.

**9. The inspector's Move action is arm-then-lift, not a third lift path.**
`InputCore.liftInspected(s)` calls `palette.select('move')` and then `liftAt` on the tower's
tile — the same two steps the player performs by hand — so the palette's phase gate, the
tool-change fan-out (inspector deselect, touch pending reset, an old lift cleared), and every
carry/drop/put-down/reject rule downstream apply by construction; a refused arming (the tool
stays unarmed outside the build phase) lifts nothing. The one thing a driver cannot infer is
that a lift began without its own press or tap: touch needs its pending ghost anchored at the
origin for the ✓/✕ pair to appear (its own tap sets `pending` itself), so the core fires an
`onLift(origin)` hook next to `onToolChange`; the pointer driver ignores it — a lift with no
press standing already is the click-click carry. The inspector stays command-only towards the
sim and never imports the core: it exposes an `onMove` hook the core wires at construction,
mirroring how the core owns `palette.onChange`. The action is gated by the same `moveOpenIn`
predicate (D7) and, like the inspector's remove control, names the wave when locked — the
palette tool stays reason-less, per the existing build-ui convention.

The arming is one-shot. The palette tool is a mode the player chose and keeps until Esc; the
inspector action is a verb on one tower, and the mode is incidental to it — so `InputCore`
remembers `toolArmedForLift` and, when that lift ends through `endLift` (the per-frame sweep
seeing the move applied, `cancelLift` from a put-down or the touch ✕), calls `palette.select(null)`.
That deselect fans out through `palette.onChange` exactly like an Esc, so both drivers wind
down identically and nothing new is wired. Ending is defined by the lift, not the drop: a failed
drop keeps carrying and keeps the tool (the action isn't over — the build-ui delta's "try another
tile without re-lifting" still holds), and a drop that issues the command keeps both until the
sweep sees the tower on its new tile, so a stale-green rejection at the applying tick lands in
the same still-lifted, still-armed state as a local one. Any tool change clears the flag with the
lift, so a palette-armed lift after an inspector move is a mode again.

**Alternatives considered:** towers-only moves (the first cut — walls were left to sell +
rebuild, but nudging a maze line is exactly the revision the feature exists for, and the sim
path is kind-agnostic once the terrain rule follows the mover); a same-tile move accepted by
the sim as a no-op 'ok' (needs three special cases — validateMove's early return, applyMove's
field swap, previewMoveRoutes' rebuilt check — where the UI needs one); implicit
drag-on-selected-tower with no mode (rejected by the
user in favor of a remove-style mode — it also collides with click-to-select on desktop and
one-finger pan on touch; the inspector's Move action is the explicit, mode-respecting form of
that wish); an inspector action that set `lifted` directly without arming the tool (leaves the
palette reading no tool while a ghost is carried, and would need its own Esc/phase-change
cancellation — arming through the palette gets all of that for free); a move fee or provisional-only moves (friction against the
feature's purpose — the dismantle penalty prices divestment, not relocation); extending
`validatePlacement` with an ignore-flag (more invasive than a sibling that shares helpers).

## Risks / Trade-offs

- [Free committed-tower moves reduce the sting of layout commitment] → Deliberate: the 50%
  penalty still prices taking money *out*; between-wave re-optimization is the feature. If it
  proves too strong, a balance-data move fee can be added later without spec surgery.
- [`validateMove`'s double mask edit is easy to get subtly wrong (restore order, socket
  origins/destinations)] → Mirror the placement test suite: seal, strand, enemy-in-footprint,
  atomic-rejection-by-hash, socket matrix (dirt→socket, socket→dirt, socket→socket), and the
  freed-origin-carries-the-reroute case, all hash-checked.
- [KIND_ORDER renumbering] → Values are runtime-only sort keys, never serialized; replay
  fixtures build commands symbolically. Verified by the untouched golden hashes in
  tests/replay.test.ts.
- [Ribbon staleness when the lift changes but the hover tile does not] → Covered by adding the
  lifted id to the re-evaluation key; the path-preview delta's "no stale routing" scenario
  pins it.
- [Desktop click-click carrying can strand a lifted state if the pointer leaves the canvas] →
  Esc, tool-switch, and clicking the structure's own tile always cancel; phase change to wave force-cancels via the same
  `palette.refresh` path that flips the tool unavailable.

## Open Questions

- Which hotkey the move tool takes (next free palette slot vs. a mnemonic) — cosmetic,
  decided at implementation.
- Exact lift treatment (dim factor vs. an outline) — visual polish, decided when seen in the
  running game.
