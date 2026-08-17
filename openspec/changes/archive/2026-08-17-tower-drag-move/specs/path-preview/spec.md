# path-preview — delta for tower-drag-move

## MODIFIED Requirements

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

## ADDED Requirements

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
