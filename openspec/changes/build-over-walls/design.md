# build-over-walls — design

## Context

See proposal.md for motivation. What this builds on, as it stands on main after tower-drag-move:

- Every structure is 1×1 and one tile holds at most one structure; `structureAt(structures, tx,
  ty)` (src/sim/placement.ts) is the single "what is here" lookup used by placement occupancy,
  removal, upgrade, move, inspector selection, and the lift.
- `validatePlacement` tentatively blocks the footprint, rebuilds both fields into the sim's
  scratch pair, checks every declared spawn and live enemy, and restores the mask; `applyPlace`
  re-blocks and swaps the scratch fields in on accept. A socket placement short-circuits before
  any mask work (phase-4 D6) — the pattern this change generalises to every tower placement.
- `validateMove(grid, mover, toTx, toTy, …)` frees the origin and blocks the destination in one
  evaluation; `applyMove` mutates `tx/ty` on the one moved structure. `moveOpenIn(phase)` gates
  it. `InputCore.lifted = { id, tx, ty }` names the carried structure; `StructureRenderer.setLifted(id)`
  dims its mesh; `updateMoveGhost` shows a ghost of the mover's kind.
- `removeStructure` unblocks unless the tile is a socket; `canRemove(phase, s)` is the shared gate.
- The renderer composes a tower as base + one middle per level above 1 + head, stacked from
  ground; the wall model is the very same base piece (`tower-square-bottom-a`). Meshes are keyed
  by structure id.
- Structure `tx/ty/kind/level/paidMg/provisional` are hashed; the structures array is walked in
  order. Two golden hashes pin the sim; the idle one places nothing.
- Every scripted tower in tests, presets and the wave-preview capture is placed straight on dirt.

## Goals / Non-Goals

**Goals:**

- One conceptual invariant that every rule follows from: **only walls (and terrain) block; towers
  are payload on a foundation.** Placement, removal, move, preview and render all read from it.
- No new hashed fields; only the scripted golden re-mints, because its script changes.
- Reuse the existing scratch/preview/ghost/ribbon/lift plumbing; add branches, not parallel paths.

**Non-Goals:**

- Any stat bonus for mounted towers — purely additive later.
- Cascade removal (one click clears wall and tower), archetype swap in place, moving a tower off
  its wall onto bare dirt.
- Balance retuning. Costs stay; the leak harness is re-verified, not re-solved.

## Decisions

### D1 — Per-kind tile lookups replace `structureAt`

`structureAt` — "the structure on this tile" — stops being a well-defined question. It is
replaced by three helpers in placement.ts: `wallAt`, `towerAt`, and `topAt = towerAt ?? wallAt`.
Call sites pick the one that names their intent: upgrade, inspector selection, and the range
ring read `towerAt`; removal and the lift read `topAt`; validation reads both. `structureAt` is
deleted rather than kept as an alias so no call site silently keeps first-match semantics.

*Alternative rejected:* nest the tower inside the wall record (`wall.mounted`). Every tower
iteration (firing, upgrades, liquidation, hashing, rendering) would have to look inside walls,
and the hash walk would change shape. Two flat entries keep every existing loop intact.

### D2 — Tower placement is the socket fast path, generalised

`validatePlacement` gains a foundation branch for `kind === 'tower'`: grass/rock → `not-buildable`;
socket → `occupied` if `towerAt`, else `ok`; dirt → `needs-wall` if no `wallAt`, `occupied` if
`towerAt`, else `ok`. All three return **before** the tentative-mask section, so a tower placement
never touches the mask or the scratch fields, exactly as a socket placement does today. Wall
placement runs the existing pipeline unchanged; its occupancy check is `wallAt` (a tower cannot
stand on dirt without one). `PlacementVerdict` grows `'needs-wall'`.

`applyPlace` for a tower pushes the structure and charges the cost — no mask edit, no field swap,
no `maskChanged`. `previewRoutes` computes `rebuilt` as `kind === 'wall' && verdict ∈ {ok,
seals-spawn, strands-enemy}`; the socket special case disappears into the kind check.

Cost is the tower's own; the wall keeps its `paidMg`. `canSpend` reads the current balance as for
every purchase.

### D3 — Removal peels through `topAt`; towers never unblock

`applyRemove` and `InputCore.commitRemove` resolve the target with `topAt`, then apply the
existing `canRemove(phase, target)`. `removeStructure` unblocks only when `s.kind === 'wall' &&
terrain !== socket` — the general statement of "the structure owned the mask there". Removing a
tower therefore never sets `removalUnblocked` and never triggers a rebuild. The mid-wave gate needs
no new logic: a provisional tower on a committed wall is removable because *the tower* is the
target and it is provisional; the wall is never the target while a tower stands on it.

*Alternative rejected:* cascade (one remove clears the tile). It needs a combined gate for mixed
provisional states mid-wave and a combined refund, and it takes away the peel that keeps the
mid-wave case trivially safe.

### D4 — Move lifts the tile; the destination decides what lands

`applyMove(tx, ty, toTx, toTy)` and its preview twins collect the origin **stack** — `{ wall:
wallAt, tower: towerAt }` — and hand it to `validateMove(grid, stack, toTx, toTy, …)`, which
classifies the destination first:

| destination | what lands | validation | mask |
|---|---|---|---|
| bare dirt (no wall) | wall + tower (relocate) | today's wall-move rules: origin freed, destination blocked, spawns and enemies checked, `enemy-in-footprint` on the destination | changes; scratch rebuilt, swapped on accept |
| bare wall / empty socket (foundation) | tower only (transfer) | stack must hold a tower; else `occupied` (wall) / `not-buildable` (socket) | unchanged; no rebuild |
| foundation with a tower | — | `occupied` | — |
| own tile | — | `occupied` (UI treats as put-down, as today) | — |
| grass/rock, out of bounds | — | as today | — |

A relocate with no wall in the stack (a socket-origin tower onto bare dirt) is `needs-wall`. A
relocate updates both structures' `tx/ty` and swaps fields; a transfer updates the tower's only.
The command payload is unchanged (`{tx, ty, toTx, toTy}`): it already addresses the tile, and
"what stands there" is now a stack. `previewMoveRoutes` reports `rebuilt` only for the relocate
branch, so the ribbon projects routing exactly when a tile changes walkability.

*Alternative rejected:* lift the top structure only (peel-style, mirroring removal). Relocating a
wall with its tower would then take three moves and a spare wall to park the tower on; the point
of the feature is that the maze line moves with what is on it. The transfer branch is what keeps
"slide a tower along the wall line" — the drag-move proposal's own motivating example — possible
now that a tower cannot land on bare dirt.

### D5 — The lift names the tile's top; the renderer dims the stack

`InputCore.lifted` keeps its `{ id, tx, ty }` shape with `id` = the top structure's id, so the
existing lift lifecycle (`liftedStructure()` ends the lift when that id's tile changes) works for
both branches — a transfer moves the tower, a relocate moves the tower and the wall, and the top
moved either way. `commitMove` issues the same command as before. `StructureRenderer.setLifted`
takes the origin tile's structure ids (one or two) and dims each; the per-frame ghost is the top's
kind with the tower's range ring, and the ghost draws a wall beneath the tower when the drop would
land the wall (bare-dirt destination) — see D6.

### D6 — A tower tool over bare dirt lays the wall too, and the ghost says so as two

A bare `place` of a tower on dirt stays `needs-wall` (D2) — but the tower *tool* never issues it.
Over a dirt tile with no wall it issues `place` with `withWall: true`: one command that the sim
validates as the wall placement it contains (terrain, occupancy, enemies, paths — through the
same `placementVerdict` the plain paths use), gates on both purchases (`canSpend` at the current
balance for the wall, and at the balance the wall leaves for the tower), and applies atomically:
block, swap, push the wall, push the tower, charge both. The resulting state — ids, `paidMg`,
`provisional`, treasury, hash — is exactly what a wall command followed by a tower command
leaves, so the test helper `mount` and the compound are interchangeable. Over a standing wall,
a socket, grass or rock the tool issues the plain tower placement as before.

*Alternative rejected:* the UI issuing two commands. Same drain order, same state on success —
but a funds or routing race at the applying tick could land the wall and refuse the tower,
leaving a purchase the player did not mean. One command cannot half-apply.

The ghost must make the two structures visible — a click that buys two things should preview as
two. It does this on the ground: the full tower ghost always, and over bare dirt the wall ghost
drawn inside its base as well — the two boxes intersect, and the overlap simply reads denser
(both ghost materials skip depth writes, the wall box renders first). Every box the build ghost
draws carries a small price badge at its mid-height — the tower's mid-way up the part above the
wall box, the wall's low on the wall box — so a tower over a foundation shows one price, a wall
one, and the compound two, each on the thing it buys. The tint counts both costs and the ribbon
projects the wall's routing, since the compound changes the mask.

*Alternative rejected:* a seam — drawing the tower ghost only above the wall ghost — with one
caption beside the tile ("wall 20 + rapid 50"). It read as two things but looked fussier than
the plain overlap, and the caption sat off the ghost rather than on it.

*Alternative rejected (the first cut):* raising the tower ghost onto its foundation by the wall's
height, and drawing a wall ghost beneath a raised tower ghost for the compound and for a stack
move onto bare dirt. Under the fixed 2:1 dimetric camera a box raised by *h* is indistinguishable
from a box on the ground roughly *h*/tan 30° ≈ 1.7 *h* tiles further back along the view axis, so the
raised ghost read as standing on the wrong tile. What it communicated — "on top of, not instead
of" — the tint, the ring and the palette caption already cover. No ghost uses height to say
anything.

Discoverability: the palette's tower items carry a short "on wall" caption and the desktop hint
line says "towers go on walls". Nothing else changes in reject feedback — the red flash stays the
uniform answer.

### D7 — A mounted tower renders with the wall as its base

`StructureRenderer.build(tower)` starts the stack at the wall's height and omits the tower's own
base segment when the tile is dirt (a wall is guaranteed beneath), and keeps today's
base + middles + head on a socket. Both silhouettes are identical to today's tower, so
"height = level" holds and no two meshes overlap. The renderer learns the terrain kind of a tile
through a small predicate passed at construction (`isSocket(tx, ty)`), not by scanning structures.
When a wall's tower is removed, the wall mesh (its own id) simply stays. Provisional marks stay
keyed by id; a wall's mark is suppressed while a provisional tower on the same tile shows one, so
one tell per tile.

*Alternative rejected:* render the full tower stack on top of the wall (one segment taller than
today). It makes a wall-mounted tower taller than a socket tower of the same level and muddies the
level tell.

### D8 — Fixtures gain foundations through one helper; the scripted golden re-mints

`tests/helpers.ts` gains `mount(tx, ty, archetype)` returning `[place('wall'), place('tower')]`;
because both are `place` commands, ascending `seq` guarantees the wall applies first in the same
tick. Every scripted tower — placement, tower, upgrade, economy, tick-seam, leak, capture and
replay tests — goes through it or gets an explicit wall. `leak.test.ts` builds each tower layout
item as wall + tower; the spend-parity padding is recomputed from actual spend as it is today.
`GOLDEN_SCRIPT_HASH` is re-minted once (the script changed); `GOLDEN_IDLE_HASH` must not change.
The wave-preview capture fixture and any preset that scripts towers gain walls the same way.

## Risks / Trade-offs

- [`structureAt` retirement touches ~10 call sites across sim and UI] → typed helpers with
  intent-naming (`towerAt`/`wallAt`/`topAt`); the compiler finds every site; each site's choice is
  a one-line decision.
- [Leak-harness pressure assertions shift because every tower now costs +20] → geometry of every
  layout is unchanged (the tower tile was already blocked), so only spend changes; re-run and read
  the directional asserts; if one flips, that is balance signal for the follow-up, not a reason to
  hide it.
- [Two provisional marks or two lifted dims on one tile look wrong] → D7's suppression and D5's
  id-list.
- [The transfer branch is a second move semantics players must infer] → the ribbon projects
  nothing for a hop and the origin wall visibly stays; the build-ui delta pins it with scenarios.
- [The palette badge shows the tower's own cost while a click on bare dirt spends wall + tower]
  → the badges on the ghost price both boxes the moment it applies, and the tint counts both.
- [Slow (round) tower's middle on a square wall base] → accepted for now; polish decided when seen.
- [Players arm a tower tool over an empty board and see only red] → there is no red: the tool
  lays the wall (D6); the palette caption and hint line name the rule.

## Migration Plan

No persisted state. Ordering: this change's spec deltas modify requirements that
`tower-drag-move` adds, so archive `tower-drag-move` before archiving this change; implementation
does not depend on that order (the move code is already on main). Rollback is a branch revert.

## Open Questions

- Exact wording of the palette caption and hint line — decided at implementation.
- Whether the round tower gets a round wall variant beneath it — visual polish, decided when seen.
- Whether the palette badge should read the compound cost while the ghost is over bare dirt — the
  ghost badges cover it for now.
