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

- A `move` command with placement-grade guarantees (atomic, never seals, never strands) whose
  validation frees the origin and blocks the destination in the same evaluation.
- A palette move mode whose lift/carry/drop reuses the existing ghost, validation-preview, and
  ribbon plumbing rather than growing a parallel path.
- Zero impact on replay determinism: no new hashed fields, golden hashes unchanged.

**Non-Goals:**

- Moving walls (sell + rebuild stays the way to revise wall lines; wall cost is trivial).
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
terrain-accepts-tower, occupancy (`structureAt` naturally reports the mover itself as
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
`occupied`. The ribbon's "no projection for routing-independent rejections" rule then works
unmodified, and the ghost tint logic needs no new states. Rejections emit the existing
`placementRejected` event with the destination footprint, so `flashReject` and the uniform
feedback requirement come for free.

**5. Speculative twins mirror the placement pair.**
`Sim.previewMove(from, to)` (verdict only) and an origin-freed variant of `previewRoutes`
(reusing `PlacementRoutes` — verdict, lanes, orphaned) feed `InputCore`. The ribbon's
re-evaluation key grows from `(tool, tile, tick)` to include the lifted structure id, so
lifting a different tower on the same tile re-projects.

**6. Lift state lives in `InputCore`, both drivers share it.**
`InputCore` gains `lifted: { id, tx, ty } | null`, entered only while the move tool is armed
in the build phase. Desktop (`PointerDriver`): press on a tower sets `lifted`; release past
slop attempts the drop, sub-slop release keeps carrying (click-click). Slop tracking reuses
the same pattern `MouseCameraController` uses for right-drag. Touch (`TouchDriver`): the
pending-ghost flow is reused with the anchor initialized to the tower's tile and confirm
issuing `move` instead of `place`. Tool deselection (Esc, palette click, phase change to wave)
clears `lifted` unconditionally. A failed drop keeps `lifted` set, per the build-ui delta.

**7. Phase gating mirrors removal's split.**
`canMove(phase, s)` in placement.ts (`phase === 'build' && s.kind === 'tower'`) gates the
authoritative apply; `moveOpenIn(phase)` (`phase === 'build'`) gates the palette tool's
availability, wired through the same per-frame `palette.refresh` that carries
`removalAllowed` today.

**8. Renderer learns to reposition, plus a lift treatment.**
`StructureRenderer.sync` compares each surviving mesh's last-known tile to `s.tx/s.ty` and
updates `group.position` (and the provisional `buildMark`) on change — needed for moves and
harmless otherwise. While a tower is lifted, its origin mesh renders dimmed (per-id override
set by `InputCore`); the carried preview is the ordinary `GhostPreview` with the archetype's
range ring at the candidate tile.

**Alternatives considered:** implicit drag-on-selected-tower with no mode (rejected by the
user in favor of a remove-style mode — it also collides with click-to-select on desktop and
one-finger pan on touch); a move fee or provisional-only moves (friction against the
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
  Esc and tool-switch always cancel; phase change to wave force-cancels via the same
  `palette.refresh` path that flips the tool unavailable.

## Open Questions

- Which hotkey the move tool takes (next free palette slot vs. a mnemonic) — cosmetic,
  decided at implementation.
- Exact lift treatment (dim factor vs. an outline) — visual polish, decided when seen in the
  running game.
