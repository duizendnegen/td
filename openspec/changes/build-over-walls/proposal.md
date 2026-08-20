## Why

Arming a maze today means selling a wall to make room for a tower — a red "occupied" ghost, a
remove, a re-place, and a 50% loss on any wall a wave has already run against — so the natural
build rhythm (lay the maze, then arm its chokepoints) is fought by the tools. Making towers stand
*on* walls turns that rhythm into the rule: walls are the maze, towers are the payload on top, and
each keeps its own investment and its own provisional status, so mounting a tower on an old wall
never commits the tower early and unmounting it never opens the maze.

## What Changes

- **Towers stand on foundations.** A tower may only be placed on a tile that already holds a bare
  wall (dirt) or on an empty socket — never on bare dirt. Wall and tower are two structures on the
  same tile; each carries its own `paidMg` and `provisional` flag, refunds on its own terms, and
  commits on its own terms. **BREAKING** for scripted input: a `place` of a tower on bare dirt now
  rejects (new verdict `needs-wall`), so every scripted tower — golden replay, leak harness
  layouts, wave-preview captures — gains a wall command first.
- **Only walls own the mask.** Placing, removing, or moving a tower between foundations never
  changes the blocked mask: no path check, no enemy check, no field rebuild — the socket fast path,
  generalised. Wall placement validates exactly as today. Because tower placement is not a removal,
  mounting a tower on a committed wall mid-wave is simply allowed, and unmounting a provisional
  tower mid-wave leaves the committed wall standing.
- **Removal peels top-down.** A remove on a stacked tile takes the tower; the wall becomes
  removable once bare. Each layer is judged by its own removal gate. A tower's removal never
  unblocks its tile; a bare wall's does, as today.
- **The move tool lifts the tile.** On dirt the wall lifts with whatever stands on it; on a socket
  the tower lifts. Dropping on bare dirt relocates the wall and its tower together under the
  existing wall-move rules (origin freed, destination blocked, full path validation). Dropping on
  a bare wall or an empty socket transfers only the tower onto that foundation — the origin wall
  stays and the mask never changes — so a tower still slides along a maze line without a sell.
- **Sockets are built-in foundations.** A tower goes straight onto a socket; a wall never does.
  Nothing about sockets changes.
- **A tower tool lays its own wall.** A `place` of a tower may carry `withWall`: the wall and the
  tower on it land in one command — validated as the wall placement it contains, gated on both
  purchases, atomic (both or neither), and indistinguishable in state from a wall command followed
  by a tower command. The tower tool issues it whenever the hovered dirt tile has no wall, so
  arming a tower over an empty board is one click, not two. The bare `place` of a tower on bare
  dirt still rejects with `needs-wall`.
- **Costs unchanged.** A fresh tower on bare dirt is a wall plus a tower (20 + tower cost); a
  tower on an existing wall costs the tower alone. Balance retuning, if the leak harness calls for
  it, is a follow-up.
- **UI.** The tower ghost reads valid over a bare wall (range ring shown) and, over bare dirt,
  previews the wall it will lay: the ghost splits into a wall segment and a tower segment, a
  caption beside it names both purchases ("wall 20 + rapid 50"), the tint counts both costs, and
  the ribbon projects the wall's routing. Every ghost stands on the ground — the first cut raised
  the tower ghost onto its foundation, which under the dimetric camera reads as a tile further
  back, so height says nothing. The palette's tower items and the desktop hint line say that
  towers stand on walls. Selecting a stacked tile inspects the tower; the inspector's remove takes
  the tower only. Ribbon: foundation-only tower placements and tower-only hops project no routing;
  wall placements, compound placements and stack moves project as today.
- **Render.** A mounted tower renders with the wall as its base segment — middles and head stacked
  on the wall — so a wall-mounted tower keeps today's silhouette and "height = level" still reads;
  a socket tower brings its own base. The lifted treatment dims the whole stack.

## Capabilities

### New Capabilities

None — this reshapes existing placement, removal, move, and preview capabilities.

### Modified Capabilities

- `structure-placement`: towers require a foundation (bare wall or empty socket) and never touch
  the mask; two structures per tile with independent investment and provisional status; a tower
  placement `withWall` lays the wall and the tower atomically; removal peels the tower before the
  wall and a tower's removal never unblocks; the move command lifts the tile's stack, relocating
  the wall with its payload onto bare dirt or transferring the tower alone onto a foundation;
  terrain buildability restated for the foundation rule. Modifies the tower-drag-move requirements
  this change builds on.
- `build-ui`: the tower ghost's verdict over walls and bare dirt, the two-segment ghost and
  caption for a placement that lays its wall, and the palette/hint affordance that names the
  foundation rule; the move ghost carries the stack's top and the lifted treatment covers the
  whole stack.
- `path-preview`: foundation-only tower placements never project routing (generalising the socket
  case) while a placement that lays its wall projects as a wall; a lifted stack projects routing
  only for a bare-dirt drop, a tower-only hop shows current lanes.
- `render-pipeline`: mounted towers render on their wall as the base segment; socket towers keep
  their own base; one masonry vocabulary preserved.

## Impact

- **Sim**: `src/sim/placement.ts` (foundation rule in `validatePlacement`, `needs-wall` verdict,
  per-kind tile lookups replacing `structureAt`, stack-aware `validateMove`, `removeStructure` no
  longer unblocking for towers), `src/sim/commands.ts` (`withWall` on `place`), `src/sim/sim.ts`
  (`applyPlace` mounting without mask ops and the atomic wall-plus-tower compound, `applyRemove`
  peel, `applyMove` stack relocation vs payload transfer, `previewPlacement` / `previewRoutes` /
  `previewMoveRoutes` with the compound and rebuilt-detection), `src/sim/tower.ts` (tower
  iteration by kind — unchanged semantics). No new hashed fields; the scripted golden hash is
  re-minted because its script gains walls, the idle golden stands.
- **UI**: `src/ui/inputcore.ts` (compound over bare dirt, lift = tile stack, select = tower),
  `src/ui/caption.ts` (the ghost caption), `src/ui/palette.ts` and `src/ui/input.ts` hint text,
  `src/ui/inspector.ts` (selection/removal target the tower).
- **Render**: `src/render/towers.ts` (mounted stacking, dim-by-tile), `src/render/fx.ts` (the
  two-segment ghost).
- **Tests and fixtures**: `tests/helpers.ts` gains a wall-then-tower helper; every scripted tower
  in `tests/placement.test.ts`, `tower.test.ts`, `upgrade.test.ts`, `economy.test.ts`,
  `tickseam.test.ts`, `leak.test.ts`/`leakData.ts`, `capture.test.ts`, `replay.test.ts` gets a
  foundation; new cases for mounting, peeling, stack moves and payload hops, mid-wave mount/unmount.
- **Docs**: README (towers-on-walls, socket wording), ARCHITECTURE.md D6 note ("towers stand on
  wall segments").
- **Depends on** `tower-drag-move` being archived first: this change modifies the move
  requirements that delta adds.
