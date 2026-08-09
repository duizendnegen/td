## MODIFIED Requirements

### Requirement: Upgrade is a validated command charged to the treasury

An upgrade command SHALL apply at a tick boundary and SHALL succeed only when the target tower
exists, is below level 3, and the treasury balance is ≥ 0. A successful upgrade SHALL deduct the
next level's cost and apply the new level's stats in the same tick. A failed upgrade SHALL leave
simulation state unchanged, including the state hash.

#### Scenario: Upgrade applies stats and charge together

- **WHEN** a valid upgrade command applies to a level-1 tower
- **THEN** the tower is level 2 with the level-2 stats and the treasury has dropped by the
  level-2 cost in that tick's post-state

#### Scenario: Debt blocks upgrades like any purchase

- **WHEN** the treasury balance is below 0 and an upgrade command applies
- **THEN** the upgrade is rejected and the post-tick state hash equals the hash without the
  attempt

#### Scenario: Max level is terminal

- **WHEN** an upgrade command targets a level-3 tower
- **THEN** the command is rejected with no state change

#### Scenario: A removed tower cannot be upgraded

- **WHEN** an upgrade command targets a tile whose tower was removed in an earlier tick
- **THEN** the command is rejected with no state change, because no tower exists there
