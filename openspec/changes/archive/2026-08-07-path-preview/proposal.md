# Path Preview

## Why

The player cannot see where enemies walk, and cannot see what a wall will do to that before
paying for it. Both flow fields exist and the post-placement fields are already computed on every
ghost hover — `validatePlacement` builds them into `scratch` and discards them — so the
information is there and simply never reaches the screen. Today the only surface is the `F1`
debug overlay: 200 arrows, no notion of "the route", and unreadable as a play aid. This leaves
ROADMAP's Phase 2 gate question *"Is re-pathing legible — can you see enemies react to a wall you
just placed?"* unanswered, and makes the two rejections a player cannot diagnose by looking
(`seals-spawn`, `strands-enemy`) feel arbitrary.

Two facts from tracing the shipped levels make this more than a convenience:

- **The round trip is a loop, not an out-and-back.** On level_01 the inbound route climbs column
  7 and the return descends columns 5–6 — identical cost (26344), almost no shared tiles. A tower
  on one lane bills half the traffic of a tower on the other, and nothing in the game shows this.
- **Path *length* delta is a misleading metric.** A wall at (7,3) changes path length by exactly
  0.00 tiles while shifting the entire inbound leg one column onto the return leg's column. The
  reroute must be shown as geometry; a scalar readout would score that placement as worthless.

## What Changes

- **New player-facing lane ribbon**, visible only while a build tool is armed: one traced route
  per active spawn through the inbound field, plus one from the treasury through the returning
  field. Fixed count of `(#activeSpawns) + 1` — 2 on level_01, 3 on level_02 from wave 6.
- **Ghost trail for the projected change.** While a build ghost sits on a tile whose validation
  produced a usable projected field, the ribbon additionally shows where the routes *will* run.
  Tiles are classified per-tile into shared / current-only / projected-only, so only the diverged
  span is drawn twice — the shared prefix and suffix draw once.
- **Marching dashes** carry direction along each lane, scrolling toward the lane's destination.
  No travelling dot and no asserted timing: enemy speed varies by type, by carrying state, and by
  slow, so any single pacer speed would be wrong for most of the board.
- **Sealed-region shading on `seals-spawn`.** When the hovered placement would orphan part of the
  board, the tiles the projected inbound field marks unreachable are shaded. The rejection becomes
  something the player sees rather than infers.
- **No numeric readout.** The geometry is the whole message.
- **BREAKING (debug workflow): the `F1` flow-field overlay is removed.** The ribbon replaces it as
  the answer to "where do they go", and the sealed-region shade is a better surface for
  walkable-but-unreachable tiles than F1's magenta diamonds. F1's corner-rule verification duty is
  already carried by `flowfield.test.ts`. `F2`, `F3`, and `F4` are untouched.
- **Route tracing becomes a simulation capability.** A pure `tracePath` walk over a field is added
  to `sim/`, and the simulation exposes projected routes as **copied tile sequences**, never as
  references into the scratch buffers.

## Capabilities

### New Capabilities

- `path-preview`: the armed-state lane ribbon — which routes are drawn, how the projected change
  is displayed, direction legibility, and the behaviour of every placement verdict including the
  sealed-region shade.

### Modified Capabilities

- `flowfield-pathfinding`: gains a requirement that a field can be traced into an ordered tile
  sequence from a start tile, and that speculative (post-placement) routes are obtainable without
  exposing or aliasing the simulation's internal field buffers.
- `debug-tooling`: the `F1` flow-field overlay requirement is removed.

No `build-ui` delta. The ribbon is driven by the armed-tool state and the ghost verdict that
`build-ui` already specifies; no palette, ghost, ring, or reject behaviour changes.

## Impact

- `src/sim/flowfield.ts` — `tracePath(field, grid, from)`, a capped `nextTile` walk returning an
  ordered tile array.
- `src/sim/sim.ts` — a read-only accessor returning current lanes, and a preview entry point that
  returns the verdict together with copied projected routes and (on `seals-spawn`) the orphaned
  tile set. Must not leak `scratch`, which is **swapped into live state** on an accepted placement
  (`sim.ts:361-365`).
- `src/render/` — a new lane-ribbon layer (dashed line sets, three classifications, region shade).
- `src/render/debug.ts` — F1 layer, its builders, and its toggle removed.
- `src/ui/inputcore.ts` — arm/disarm and hover changes drive the ribbon; the verdict is already
  re-evaluated on tile-or-tick change, so no new evaluation cadence is introduced.
- `src/app/game.ts` — F1 key binding removed; ribbon wiring.
- `tests/flowfield.test.ts` — `tracePath` termination, correctness against field directions, and
  behaviour at sources and unreachable tiles.
- `ARCHITECTURE.md` §11 (F1 row, and the note that F1 is how the corner rule gets verified),
  `ROADMAP.md` (the F1 references and the Phase 2 legibility gate).
