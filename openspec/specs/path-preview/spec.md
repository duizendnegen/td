# path-preview

## Purpose

Shows the player where enemies actually travel — from every active spawn to the treasury and from
the treasury back out — and, while a build tool is armed, how the candidate placement under the
cursor will reshape those routes, so a maze purchase is an informed decision rather than a guess.

## Requirements

### Requirement: Lane ribbon is shown only while a build tool is armed

A lane ribbon SHALL be displayed whenever a build tool or the move tool is selected and SHALL
disappear when the tool is deselected or a placed structure is selected instead. It SHALL be
present during the build phase with no enemies on the board, and during an active wave. With the
move tool armed and no structure lifted, the ribbon SHALL show the current lanes with no projected
trail.

#### Scenario: Arming shows the lanes

- **WHEN** the player selects a wall or tower from the palette
- **THEN** the lane ribbon appears, whether or not any enemies are on the board

#### Scenario: Disarming hides the lanes

- **WHEN** the player deselects the build tool or selects a placed tower for inspection
- **THEN** the lane ribbon is no longer displayed

#### Scenario: Arming the move tool shows the current lanes

- **WHEN** the player selects the move tool during the build phase with no structure lifted
- **THEN** the lane ribbon shows the current lanes only, and deselecting the tool hides it

### Requirement: Lanes are the routes from each active spawn and from the treasury

The ribbon SHALL draw one inbound lane per **currently active** spawn, following the inbound
routing to the treasury, plus one return lane per **currently active** spawn, following that
spawn's returning routing from the treasury back to that spawn. Each lane SHALL be the tile
sequence a follower of that routing would actually visit, so a lane never crosses a blocked tile
and never clips a blocked corner.

#### Scenario: One lane pair per active spawn

- **WHEN** the ribbon is shown on a level with two active spawns
- **THEN** four lanes are drawn: one from each spawn to the treasury, and one from the treasury
  back to each spawn

#### Scenario: Dormant spawns get no lane

- **WHEN** the ribbon is shown while a declared spawn has not yet reached its activation wave
- **THEN** no lane is drawn from or to that spawn, and its pair appears once it activates

#### Scenario: Every return lane ends at its own spawn

- **WHEN** two spawns are active and one is much cheaper to reach from the treasury
- **THEN** the farther spawn's return lane still runs to the farther spawn — no return lane
  drains to a nearer exit

#### Scenario: Lanes are legal routes

- **WHEN** any lane is drawn on terrain containing corner-to-corner blocked pairs
- **THEN** no segment of that lane passes through a blocked tile or diagonally between two blocked
  tiles

### Requirement: Direction is carried structurally, not by colour alone

Each lane SHALL indicate its direction of travel by animated motion along the line toward that
lane's destination, in addition to any colour distinction between inbound and return.

#### Scenario: Adjacent opposing lanes are distinguishable

- **WHEN** an inbound lane and the return lane run parallel one tile apart
- **THEN** their animated motion runs in opposing directions, so which way traffic flows on each
  is readable without relying on colour

#### Scenario: No timing is asserted

- **WHEN** the ribbon is shown while enemies of differing speeds are on the board
- **THEN** the ribbon displays no travelling marker or countdown that claims how long a route takes

### Requirement: A candidate placement shows its projected routes as a ghost trail

While a build ghost occupies a tile and that placement's validation produced post-placement
routing, the ribbon SHALL additionally show where the lanes would run after the placement. Every
tile SHALL be classified as belonging to the current routes only, the projected routes only, or
both, and each classification SHALL be visually distinct. Tiles shared by both SHALL be drawn once.

#### Scenario: Only the diverged span is doubled

- **WHEN** the current and projected routes share a common prefix and suffix and differ over five
  tiles in the middle
- **THEN** the shared tiles are drawn once in the shared style, and only the five current-only and
  five projected-only tiles are drawn in their respective distinct styles

#### Scenario: An equal-length reroute is still visible

- **WHEN** a candidate wall reroutes a lane onto a different set of tiles of exactly the same total
  path cost
- **THEN** the displaced tiles and the newly used tiles are both shown and visibly differ from the
  shared tiles

#### Scenario: An inert placement reads as inert

- **WHEN** a candidate wall is on a tile that changes neither lane
- **THEN** no tile is classified as current-only or projected-only, and the ribbon is
  indistinguishable from its unarmed-hover state

#### Scenario: Routes that re-diverge are handled

- **WHEN** the current and projected routes diverge, rejoin, and diverge again
- **THEN** every diverged span is classified and drawn, not only the first

### Requirement: Placements without projected routing show current lanes only

A candidate placement whose rejection does not depend on routing — out of bounds, unbuildable
terrain, an already occupied tile, an enemy standing in the footprint, or an unaffordable
purchase — SHALL show the current lanes with no projected trail. A tower placed on a socket, which
never alters navigability, SHALL likewise show no projected trail. In all these cases the ribbon
SHALL NOT display routing left over from a previously hovered tile.

#### Scenario: Hovering scenery shows no projection

- **WHEN** the player sweeps the ghost from a valid dirt tile onto a rock tile
- **THEN** the projected trail disappears and only the current lanes remain

#### Scenario: A socket tower changes nothing

- **WHEN** the ghost occupies an empty socket tile with a tower tool armed
- **THEN** the placement reads as valid and no projected trail is shown

#### Scenario: No stale routing is shown

- **WHEN** the ghost moves from a tile that produced a projected trail directly onto a tile whose
  rejection does not depend on routing
- **THEN** the previously shown projected trail is not still displayed

### Requirement: A sealing placement shades the region it would orphan

When the candidate placement would leave any declared spawn with no route to the treasury, the
tiles that the projected inbound routing marks unreachable SHALL be shaded as a distinct region.
Any lane that would no longer have a route SHALL show no projected trail; lanes that still route
SHALL show theirs as normal.

#### Scenario: Sealing the last breach shades the orphaned quarter

- **WHEN** the ghost occupies the last remaining gap in a wall line that separates a spawn from the
  treasury
- **THEN** every walkable tile cut off by that placement, including the spawn tile, is shaded as
  the orphaned region

#### Scenario: One sealed spawn does not blank the others

- **WHEN** a candidate placement seals one of two active spawns
- **THEN** the orphaned region is shaded, the sealed spawn's lane shows no projected trail, and the
  other spawn's projected trail is still drawn

#### Scenario: The shade clears with the ghost

- **WHEN** the ghost moves off the sealing tile or the build tool is deselected
- **THEN** the region shading is removed

### Requirement: A placement that only strands an enemy gets no special treatment

A candidate placement rejected because a live enemy would be left with no route SHALL show its
projected trail like any other routing-valid placement, with no additional marking of the affected
enemy.

#### Scenario: Stranding shows an ordinary trail

- **WHEN** the ghost occupies a tile that would strand a live enemy while every spawn still reaches
  the treasury
- **THEN** the projected trail is drawn normally and no enemy is singled out

### Requirement: No numeric readout accompanies the ribbon

The ribbon SHALL NOT display a path-length delta, exposure figure, or any other numeric summary of
the candidate placement's effect.

#### Scenario: Geometry is the whole message

- **WHEN** a candidate placement changes the lanes
- **THEN** the change is communicated by the drawn routes alone, with no accompanying number

### Requirement: The ribbon never changes simulation state

Displaying the ribbon, including evaluating projected routes for every hovered tile, SHALL NOT
alter simulation state.

#### Scenario: Hovering with the ribbon is free of side effects

- **WHEN** the player arms a tool and sweeps the ghost across many tiles without committing, while
  a replay of the same seed and commands runs without arming anything
- **THEN** both runs produce identical state hashes

### Requirement: A lifted structure projects routes with its origin freed

While a lifted structure's move ghost occupies a candidate tile and that move's validation produced
post-move routing, the ribbon SHALL show where the lanes would run after the move — evaluated
with the origin tile freed and the candidate destination blocked, both applied together — using
the same current/projected/shared tile classification, the same orphan shading for a sealing
candidate, and the same no-numeric-readout rule as candidate placements. The vacated origin tile
SHALL be eligible for projected lanes, so a reroute through the space the structure opens up is
visible before committing.

A candidate that projects no routing — out of bounds, an occupied or unbuildable tile, an enemy
standing in the destination, or the structure's own tile (a legal put-down, not a move) — SHALL
show the current lanes with no projected trail and no stale routing from a previously hovered
tile. Evaluating move
candidates SHALL NOT alter simulation state.

#### Scenario: The reroute through the vacated tile is visible

- **WHEN** a lifted structure's candidate tile blocks the current lane while the freed origin
  carries the projected one
- **THEN** the displaced tiles and the newly used tiles — including the origin tile — are drawn
  in their respective distinct styles

#### Scenario: A sealing candidate shades the orphaned region

- **WHEN** the move ghost occupies a tile that would cut a spawn off from the treasury even with
  the origin freed
- **THEN** the tiles the projected routing marks unreachable are shaded as the orphaned region,
  and the shade clears when the ghost moves off the tile

#### Scenario: Hovering the structure's own tile shows no projection

- **WHEN** the move ghost sits on the lifted structure's own tile
- **THEN** only the current lanes are shown, with no projected trail left over from a previous
  candidate, even though the ghost there reads valid

#### Scenario: Carrying with the ribbon is free of side effects

- **WHEN** the player carries a lifted structure across many candidate tiles without dropping, while
  a replay of the same seed and commands runs without lifting anything
- **THEN** both runs produce identical state hashes
