# tower-upgrades

## Purpose

Three upgrade levels per tower archetype that grow each tower along its identity axis, with
hand-authored per-level stat tables, treasury-charged upgrade commands, and a height-per-level
render contract that makes power legible at a glance.

## Requirements

### Requirement: Per-archetype three-level stat tables in balance data

Each tower archetype SHALL have exactly three levels whose stats are defined as explicit integer
entries in balance data — no level stat is computed from another. Each level entry SHALL define
its cost, its rated power, and the archetype's scaling axes: rapid fire scales fire rate and
damage; sniper scales range and damage; area scales range and damage; slow scales range and
slow duration. Stats outside an archetype's scaling axes — rapid fire's range, area's burst
radius, the global slow percentage — SHALL be identical across its levels. Rated power is
authored per level like any other stat; by design intent it grows more slowly than the level's
damage, so upgrading is power-efficient.

#### Scenario: Level stats come from balance data

- **WHEN** any level entry's cost, damage, range, fire interval, duration, or rated power changes
  in balance data
- **THEN** simulation behavior follows the new values with no code change

#### Scenario: Non-scaling stats stay fixed

- **WHEN** a rapid-fire tower is upgraded from level 1 to level 3
- **THEN** its range is identical at every level while its damage and fire rate follow the level
  table

#### Scenario: Upgrading changes the tower's draw

- **WHEN** an engaged tower is upgraded from level 1 to level 2 during a wave
- **THEN** from the tick the upgrade applies its draw is level 2's rated power

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

### Requirement: Tower archetype and level are simulation state

Every tower SHALL carry its archetype and current level as simulation state entering the
canonical hash walk, so replays reproduce upgrade timing exactly.

#### Scenario: Upgrade timing affects the hash

- **WHEN** two runs with the same seed differ only in the tick an upgrade command applies
- **THEN** their state hashes diverge from the earlier upgrade tick onward

### Requirement: Towers visibly grow one segment per level

The renderer SHALL compose each tower from modular segments such that each upgrade level adds a
visible segment: a higher-level tower SHALL be visibly taller than a lower-level tower of the
same archetype from the isometric camera.

#### Scenario: Level reads as height

- **WHEN** a level-1 and a level-3 tower of the same archetype are on screen
- **THEN** the level-3 tower is visibly taller, with distinct silhouettes per level
