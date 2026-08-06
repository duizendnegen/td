## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Removal is delayed, keeps the tile blocked, and refunds half

**Reason**: The 80-tick delay existed solely as the anti-juggling rule — it made mid-wave
open/close treadmill exploits too slow to be worth running. Refusing removal during a wave closes
that exploit outright, leaving the delay as pure friction on deliberate between-wave editing, where
no enemies are on the board.

**Migration**: Removal now takes effect in the tick its command applies (see "Removal is immediate
and refunds half the total invested") and is refused while a wave is running (see "Removal is
refused while a wave is running"). The refund amount and its total-invested base are unchanged.
