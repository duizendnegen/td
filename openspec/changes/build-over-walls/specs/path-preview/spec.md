# path-preview — delta for build-over-walls

## MODIFIED Requirements

### Requirement: Placements without projected routing show current lanes only

A candidate placement whose rejection does not depend on routing — out of bounds, unbuildable
terrain, an already occupied tile, bare dirt under a tower tool, an enemy standing in the
footprint, or an unaffordable purchase — SHALL show the current lanes with no projected trail. A
tower placement of any kind — on a wall or on a socket — never alters navigability and SHALL
likewise show no projected trail, whatever its verdict. In all these cases the ribbon SHALL NOT
display routing left over from a previously hovered tile.

#### Scenario: Hovering scenery shows no projection

- **WHEN** the player sweeps the ghost from a valid dirt tile onto a rock tile
- **THEN** the projected trail disappears and only the current lanes remain

#### Scenario: A tower on a wall changes nothing

- **WHEN** the ghost occupies a bare wall with a tower tool armed
- **THEN** the placement reads as valid and no projected trail is shown

#### Scenario: A socket tower changes nothing

- **WHEN** the ghost occupies an empty socket tile with a tower tool armed
- **THEN** the placement reads as valid and no projected trail is shown

#### Scenario: No stale routing is shown

- **WHEN** the ghost moves from a tile that produced a projected trail directly onto a tile whose
  rejection does not depend on routing
- **THEN** the previously shown projected trail is not still displayed

### Requirement: A lifted structure projects routes with its origin freed

While a lifted stack's move ghost occupies a candidate tile and that move's validation produced
post-move routing — a bare-dirt destination, where the wall relocates — the ribbon SHALL show
where the lanes would run after the move — evaluated with the origin tile freed and the candidate
destination blocked, both applied together — using the same current/projected/shared tile
classification, the same orphan shading for a sealing candidate, and the same no-numeric-readout
rule as candidate placements. The vacated origin tile SHALL be eligible for projected lanes, so a
reroute through the space the stack opens up is visible before committing.

A candidate that projects no routing — out of bounds, an occupied or unbuildable tile, an enemy
standing in the destination, a foundation destination (where only the tower transfers and no tile
changes walkability), or the stack's own tile (a legal put-down, not a move) — SHALL show the
current lanes with no projected trail and no stale routing from a previously hovered tile.
Evaluating move candidates SHALL NOT alter simulation state.

#### Scenario: The reroute through the vacated tile is visible

- **WHEN** a lifted stack's bare-dirt candidate tile blocks the current lane while the freed
  origin carries the projected one
- **THEN** the displaced tiles and the newly used tiles — including the origin tile — are drawn
  in their respective distinct styles

#### Scenario: A sealing candidate shades the orphaned region

- **WHEN** the move ghost occupies a bare dirt tile that would cut a spawn off from the treasury
  even with the origin freed
- **THEN** the tiles the projected routing marks unreachable are shaded as the orphaned region,
  and the shade clears when the ghost moves off the tile

#### Scenario: A tower hop shows no projection

- **WHEN** the move ghost of a lifted wall-and-tower stack sits on a bare wall
- **THEN** only the current lanes are shown, with no projected trail, even though the ghost there
  reads valid

#### Scenario: Hovering the stack's own tile shows no projection

- **WHEN** the move ghost sits on the lifted stack's own tile
- **THEN** only the current lanes are shown, with no projected trail left over from a previous
  candidate, even though the ghost there reads valid

#### Scenario: Carrying with the ribbon is free of side effects

- **WHEN** the player carries a lifted stack across many candidate tiles without dropping, while
  a replay of the same seed and commands runs without lifting anything
- **THEN** both runs produce identical state hashes
