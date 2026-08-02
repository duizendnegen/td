# structure-placement

## MODIFIED Requirements

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

## ADDED Requirements

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
