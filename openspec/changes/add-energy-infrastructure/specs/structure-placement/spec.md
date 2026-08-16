# structure-placement — delta for add-energy-infrastructure

## MODIFIED Requirements

### Requirement: Structures are placed by command and charged to the treasury

The system SHALL support placing walls, towers, and solar panels, each on a 1×1 footprint, via
placement commands applied at tick boundaries. A confirmed placement SHALL mark the footprint
tile blocked and deduct the structure's cost (defined in balance data) from the treasury in the
same tick.

#### Scenario: Confirmed wall placement

- **WHEN** a valid wall placement command applies at a tick boundary
- **THEN** the target tile is blocked, the treasury is reduced by the wall cost, and both flow
  fields reflect the new mask that same tick

#### Scenario: Towers occupy a single tile

- **WHEN** a valid tower placement command applies
- **THEN** exactly one tile is blocked and charged, and the tower slots into an existing wall
  line without displacing its neighbors

#### Scenario: Confirmed panel placement

- **WHEN** a valid panel placement command applies at a tick boundary
- **THEN** the target tile is blocked, the treasury is reduced by the panel cost, both flow
  fields reflect the new mask that same tick, and the panel is provisional until a wave tick
  runs

### Requirement: Terrain kinds govern buildability

Placement SHALL respect the level's terrain palette: dirt tiles accept walls, towers, and
panels; socket tiles accept towers only; grass and rock tiles accept nothing. A placement on a
socket tile SHALL skip path and enemy validation entirely — the tile was never navigable, so
the blocked mask, the flow fields, and enemy routing are unaffected — and SHALL validate only
bounds, occupancy, and the spending gate.

#### Scenario: Tower on a socket places without path checks

- **WHEN** a tower placement command targets an unoccupied socket tile with balance ≥ 0
- **THEN** the placement succeeds, the treasury is charged, and no flow-field rebuild occurs

#### Scenario: Wall on a socket is rejected

- **WHEN** a wall placement command targets a socket tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: Panel on a socket is rejected

- **WHEN** a panel placement command targets a socket tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: Scenery refuses everything

- **WHEN** any placement command targets a grass or rock tile
- **THEN** the placement is rejected as not-buildable
