# render-pipeline — delta for build-over-walls

## ADDED Requirements

### Requirement: A mounted tower renders on its wall as one silhouette

A tower standing on a wall SHALL render with the wall as its base segment: the tower's level
segments and weapon head stack on top of the wall's masonry, so a wall-mounted tower has the same
silhouette and height a tower of that archetype and level has today, and "height reads as level"
is preserved. A tower on a socket SHALL bring its own base segment, so a socket tower and a
wall-mounted tower of the same archetype and level read the same. Two structures on one tile SHALL
never draw overlapping base geometry.

The provisional tell on a stacked tile SHALL be drawn once, for the topmost provisional structure.
While a stack is lifted by the move tool, every structure in it SHALL read as lifted at the origin.
When a tower is removed from a wall, the wall SHALL remain drawn in place; when a wall is
placed under nothing, it draws as before.

#### Scenario: Wall-mounted and socket towers match

- **WHEN** a level-2 rapid tower on a wall and a level-2 rapid tower on a socket are on screen
- **THEN** both show the same silhouette — base, one middle segment, head — at the same height,
  and neither shows doubled base masonry

#### Scenario: Removing the tower leaves the wall drawn

- **WHEN** a mounted tower is removed
- **THEN** the wall's masonry remains at that tile on the next rendered frame

#### Scenario: A lifted stack dims together

- **WHEN** the move tool lifts a tile holding a wall and a tower
- **THEN** both the wall and the tower read as lifted at the origin until the lift ends
