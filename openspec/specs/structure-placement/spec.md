# structure-placement

## Purpose

Player-built walls and towers as the maze's raw material: validated placement that can never seal
or strand, atomic rejection, and immediate between-waves removal — the mechanics that make mazing
expressive while keeping every path guarantee intact.

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

### Requirement: Removal is immediate and refunds half the total invested

A removal command SHALL take full effect in the tick it applies: the structure is dropped, its
footprint tiles are unblocked, the flow fields reflect the new mask that same tick, and 50% of the
structure's total invested cost — base cost plus all upgrade costs paid (removal refund fraction
defined in balance data) — is credited to the treasury. There SHALL be no removal countdown and no
intermediate state in which a structure is marked for removal but still standing.

Removal SHALL NOT be subject to path or enemy validation. Unblocking a tile can only lower path
costs, so no removal can seal a spawn or strand an enemy, and no structure's own tile can hold an
enemy.

A structure standing on a socket tile SHALL refund on removal without unblocking its tile — the
tile is terrain-blocked, not structure-blocked — and without changing the flow fields.

#### Scenario: Unblock and refund land in the command's tick

- **WHEN** a removal command for a 100-cost wall applies at a tick boundary
- **THEN** in that same tick the wall is gone, its tile is walkable, both flow fields reflect the
  new mask, and the treasury is credited 50 milli-gold-scaled cost units

#### Scenario: Upgrades are part of the refund base

- **WHEN** a tower that cost 50 and received a 90-cost upgrade is removed
- **THEN** the treasury is credited 50% of 140, not 50% of 50

#### Scenario: Socket removal refunds without unblocking the tile

- **WHEN** a tower on a socket tile is removed
- **THEN** the refund is credited, the structure is gone, the socket tile remains blocked, no flow
  field rebuild occurs, and the socket accepts a new tower

#### Scenario: A removal opens the route for live enemies

- **WHEN** a wall is removed while live enemies are steering around it between waves
- **THEN** the tile is walkable and back in both flow fields in that same tick, and each enemy
  routes through it from its next waypoint re-evaluation onward — its current one-tile commitment
  still stands, because unblocking a tile can never invalidate a committed waypoint

### Requirement: Removal is refused while a wave is running

A removal command SHALL be rejected while a wave is running, so a player cannot open and close the
maze during a wave. A rejected removal SHALL leave simulation state unchanged: no refund, no
blocked-mask change, no flow-field change, and an unchanged state hash relative to the same tick
without the attempt.

Removal SHALL remain available in every other live phase — the build phase between waves and the
locked state after the final wave — so liquidation is always the way back to solvency.

Placement SHALL NOT be gated by wave phase: building mid-wave remains legitimate.

#### Scenario: Mid-wave removal is rejected

- **WHEN** a removal command targeting a standing structure applies while a wave is running
- **THEN** the structure still stands, the treasury is unchanged, and the post-tick state hash
  equals the hash the same tick produces without the attempt

#### Scenario: Removal works between waves

- **WHEN** the same removal command applies during the build phase
- **THEN** the structure is removed and refunded in that tick

#### Scenario: Building mid-wave is still allowed

- **WHEN** a valid placement command applies while a wave is running
- **THEN** the placement is confirmed and charged as usual

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
