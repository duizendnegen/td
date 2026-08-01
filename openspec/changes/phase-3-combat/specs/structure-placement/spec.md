# structure-placement

## MODIFIED Requirements

### Requirement: Structures are placed by command and charged to the treasury

The system SHALL support placing walls and towers, each on a 1×1 footprint, via placement
commands applied at tick boundaries. A confirmed placement SHALL mark the footprint tile blocked
and deduct the structure's cost (defined in balance data) from the treasury in the same tick.

#### Scenario: Confirmed wall placement

- **WHEN** a valid wall placement command applies at a tick boundary
- **THEN** the target tile is blocked, the treasury is reduced by the wall cost, and both flow
  fields reflect the new mask that same tick

#### Scenario: Towers occupy a single tile

- **WHEN** a valid tower placement command applies
- **THEN** exactly one tile is blocked and charged, and the tower slots into an existing wall
  line without displacing its neighbors

### Requirement: Removal is delayed, keeps the tile blocked, and refunds half

A removal command SHALL start an 80-tick (4.0 s) countdown on the structure. Throughout the
countdown the footprint SHALL remain blocked and behave as any other structure. When the
countdown expires the structure SHALL be removed, its tiles unblocked, the fields rebuilt, and
50% of the structure's total invested cost — base cost plus all upgrade costs paid (removal
refund fraction defined in balance data) — credited to the treasury.

#### Scenario: Tile stays blocked during the countdown

- **WHEN** a wall's removal countdown is running
- **THEN** enemies continue to path around the wall's tile until the countdown expires

#### Scenario: Refund arrives on completion

- **WHEN** the removal countdown of a 100-cost structure expires
- **THEN** the structure's tiles become walkable and the treasury is credited 50 milli-gold-scaled
  cost units in that tick, not before

#### Scenario: Upgrades are part of the refund base

- **WHEN** a tower that cost 50 and received a 90-cost upgrade completes removal
- **THEN** the treasury is credited 50% of 140, not 50% of 50
