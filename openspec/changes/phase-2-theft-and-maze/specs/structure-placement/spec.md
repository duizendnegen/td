# structure-placement

## Purpose

Player-built walls and towers as the maze's raw material: validated placement that can never seal
or strand, atomic rejection, and delayed removal — the mechanics that make mazing expressive while
keeping every path guarantee intact.

## ADDED Requirements

### Requirement: Structures are placed by command and charged to the treasury

The system SHALL support placing a wall on a 1×1 footprint and a rapid-fire tower on a 2×2
footprint via placement commands applied at tick boundaries. A confirmed placement SHALL mark every
footprint tile blocked and deduct the structure's cost (defined in balance data) from the treasury
in the same tick.

#### Scenario: Confirmed wall placement

- **WHEN** a valid wall placement command applies at a tick boundary
- **THEN** the target tile is blocked, the treasury is reduced by the wall cost, and both flow
  fields reflect the new mask that same tick

### Requirement: Placement validation rejects any structure that seals or strands

Before confirming a placement the system SHALL verify, in simulation state at the applying tick:
the footprint is in bounds, every footprint tile is walkable and unoccupied by a structure, no
enemy's current tile is inside the footprint, every active spawn retains a finite-cost path to the
treasury, and every live enemy's current tile retains finite cost in the field matching its state
(inbound or returning). Failing any check SHALL reject the placement.

#### Scenario: Sealing placement is rejected

- **WHEN** a placement would leave an active spawn with no path to the treasury
- **THEN** the placement is rejected

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
countdown the footprint SHALL remain blocked and behave as any other structure. When the countdown
expires the structure SHALL be removed, its tiles unblocked, the fields rebuilt, and 50% of the
structure's paid cost (removal refund fraction defined in balance data) credited to the treasury.

#### Scenario: Tile stays blocked during the countdown

- **WHEN** a wall's removal countdown is running
- **THEN** enemies continue to path around the wall's tile until the countdown expires

#### Scenario: Refund arrives on completion

- **WHEN** the removal countdown of a 100-cost structure expires
- **THEN** the structure's tiles become walkable and the treasury is credited 50 milli-gold-scaled
  cost units in that tick, not before
