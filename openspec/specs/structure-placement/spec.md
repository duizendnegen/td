# structure-placement

## Purpose

Player-built walls and towers as the maze's raw material: validated placement that can never seal
or strand, atomic rejection, and delayed removal — the mechanics that make mazing expressive while
keeping every path guarantee intact.

## Requirements

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

### Requirement: Placement validation rejects any structure that seals or strands

Before confirming a placement on navigable terrain the system SHALL verify, in simulation state
at the applying tick: the footprint is in bounds, every footprint tile is walkable and unoccupied
by a structure, no enemy's current tile is inside the footprint, **every spawn declared by the
level — active or dormant — retains a finite-cost path to the treasury**, and every live enemy's
current tile retains finite cost in the field matching its state (inbound or returning). Failing
any check SHALL reject the placement.

#### Scenario: Sealing placement is rejected

- **WHEN** a placement would leave an active spawn with no path to the treasury
- **THEN** the placement is rejected

#### Scenario: Sealing a dormant spawn is rejected

- **WHEN** a placement would leave a not-yet-active spawn with no path to the treasury
- **THEN** the placement is rejected, so the no-sealing invariant already holds when the spawn
  activates mid-run

#### Scenario: Stranding placement is rejected

- **WHEN** a placement would leave every spawn connected but trap one live enemy in a pocket with
  no path to its current goal
- **THEN** the placement is rejected

#### Scenario: Enemy inside the footprint blocks placement

- **WHEN** an enemy's current tile lies inside the proposed footprint at the applying tick
- **THEN** the placement is rejected rather than displacing or entombing the enemy

### Requirement: Rejected placement leaves simulation state unchanged

A rejected placement SHALL have no observable effect on simulation state: no treasury charge, no
blocked-mask change, no flow-field change, and an unchanged state hash relative to the same tick
without the attempt.

#### Scenario: Rejection is atomic

- **WHEN** a placement command is rejected during validation
- **THEN** the post-tick state hash is identical to the hash the same tick produces when the
  command is never issued

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
### Requirement: Terrain kinds govern buildability

Placement SHALL respect the level's terrain palette: dirt tiles accept walls and towers, socket
tiles accept towers only, and grass and rock tiles accept nothing. A placement on a socket tile
SHALL skip path and enemy validation entirely — the tile was never navigable, so the blocked
mask, the flow fields, and enemy routing are unaffected — and SHALL validate only bounds,
occupancy, and the spending gate.

#### Scenario: Tower on a socket places without path checks

- **WHEN** a tower placement command targets an unoccupied socket tile with balance ≥ 0
- **THEN** the placement succeeds, the treasury is charged, and no flow-field rebuild occurs

#### Scenario: Wall on a socket is rejected

- **WHEN** a wall placement command targets a socket tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: Scenery refuses everything

- **WHEN** any placement command targets a grass or rock tile
- **THEN** the placement is rejected as not-buildable
