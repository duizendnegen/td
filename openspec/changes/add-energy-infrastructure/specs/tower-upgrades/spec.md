# tower-upgrades — delta for add-energy-infrastructure

## MODIFIED Requirements

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
