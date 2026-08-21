# level-data

## Purpose

Hand-editable JSON level and balance data with schema validation strong enough to catch an
unwinnable or malformed level at load time, before it ever renders â€” plus the Phase-1 level itself,
authored as instrumentation for the debug overlays.

## Requirements

### Requirement: Schema validation at load

Level and balance files SHALL be validated at load against a schema that rejects: malformed shape,
spawn references to undeclared spawn ids, enemy types absent from the balance data, and treasury or
spawn tiles that are out of bounds or on blocked terrain. A file that fails validation SHALL
produce a clear error and prevent the game from starting.

#### Scenario: Bad reference rejected

- **WHEN** a level references an enemy type that the balance data does not define
- **THEN** loading fails with an error naming the offending reference

### Requirement: Load-time reachability check

Validation SHALL verify that every declared spawn can reach the treasury on the level's starting
terrain, rejecting the level otherwise.

#### Scenario: Sealed level rejected

- **WHEN** a level's starting terrain fully walls a spawn off from the treasury
- **THEN** loading fails with a reachability error before anything renders

### Requirement: Authoring floats become integers at load

Rates authored as floats (e.g. `interestRatePerTick`) SHALL be converted to integer representations
exactly once at load; the simulation SHALL only ever observe integers.

#### Scenario: No float crosses the boundary

- **WHEN** a level with a float rate is loaded
- **THEN** the value handed to the simulation is an integer

### Requirement: level_01 is an instrumented gauntlet

`level_01`'s hand-authored terrain SHALL contain, on the spawnâ†’treasury path: an S-curve forcing
multiple full turns, at least two spots where blocked tiles meet corner-to-corner, a stretch where
diagonal movement is cheapest, and one reachable dead-end pocket off the main path â€” so that turn
smoothness, the corner-cut rule, diagonal costs, and cost gradients are all observable in the
overlays.

#### Scenario: Every overlay has something to show

- **WHEN** `level_01` is loaded with the F1 overlay active
- **THEN** the display includes corner-to-corner blocked pairs with no diagonal arrow between them,
  and a dead-end pocket whose costs increase away from the main path

### Requirement: Phase-1 enemy stat block

The balance data SHALL define the single Phase-1 enemy type with a movement speed expressed in
integer 1/1024-tile units per tick. No combat stats are required yet.

#### Scenario: Speed drives movement

- **WHEN** the enemy's speed is changed in the balance file
- **THEN** the enemy's traversal time changes correspondingly, with no code change

### Requirement: Terrain is authored as a char-map over the four-kind palette

Level terrain SHALL be authored as a character map — one string row per grid row, one character
per tile — with a legend mapping characters to the terrain kinds `dirt`, `grass`, `rock`, and
`socket`. Validation SHALL reject a map whose row count or row lengths disagree with the
declared grid size, any character absent from the legend, and any spawn or treasury coordinate
that does not lie on dirt. The coordinate-list `terrain.blocked` format is retired.

#### Scenario: Malformed map rejected

- **WHEN** a level's char-map contains a row shorter than the grid width or an unmapped character
- **THEN** loading fails with an error naming the offending row or character

#### Scenario: Spawn off the dirt rejected

- **WHEN** a level places a spawn on a grass, rock, or socket tile
- **THEN** loading fails with a validation error

### Requirement: Wave definitions are required and validated

A level SHALL declare at least one wave, each wave at least one group, and each group a `spawn`
reference, an enemy `type`, a `count` ≥ 1, and integer `spawnInterval` and `delay` ticks.
Validation SHALL reject a group whose spawn is not declared, whose enemy type is absent from
balance data, or whose spawn's `activeFromWave` is later than the wave the group belongs to.

#### Scenario: Group at a still-dormant spawn rejected

- **WHEN** a wave-3 group references a spawn with `activeFromWave: 5`
- **THEN** loading fails with a validation error

#### Scenario: Waveless level rejected

- **WHEN** a level with an empty `waves` array is loaded
- **THEN** loading fails — the debug timer no longer substitutes for waves

### Requirement: Two levels compose the POC's run ladder

The game SHALL ship `level_01` — one spawn, 10 hand-authored waves curve-designed to teach the
counters (runners introduced around wave 3, a tank check around wave 5, a swarm check around
wave 7) — and `level_02` — two spawns with the second activating mid-run, 10 waves, and the
slow-immune brute debuting in the back half. Both levels SHALL use the terrain palette,
including at least one socket tile.

#### Scenario: level_02 opens a second front

- **WHEN** level_02 is played past its second spawn's activation wave
- **THEN** groups spawn from both fronts and the brute appears in a later wave

#### Scenario: level_01 teaches in order

- **WHEN** level_01's waves are inspected
- **THEN** runners first appear near wave 3, a tank-heavy wave near wave 5, and a swarm-heavy
  wave near wave 7

### Requirement: Power data is authored per level and in balance, and validated at load

Each level SHALL author a `power` block: an ordered, non-empty table of connection tiers (each
with a positive capacity and a non-negative upgrade cost, capacities strictly increasing, the
first tier's cost ignored as the starting connection) and a non-negative tariff. Balance data
SHALL author a rated power per tower level, one standby fraction in [0, 1], a panel block with
cost and output, and a battery block with cost and a positive capacity in kWh — under the
convention that one second of wave time is one hour, so one kWh is one power unit for one
second. Loading SHALL reject a level or balance file missing any of these, with a
non-increasing tier table, or with negative values, naming the offending field. Tariff, standby
fraction, ratings, outputs, capacities and the battery capacity SHALL be converted to integer
simulation units exactly once at load, like the interest rate.

#### Scenario: Missing power block rejected

- **WHEN** a level omits its `power` block or a tower level omits its rated power
- **THEN** loading fails with an error naming the missing field

#### Scenario: Missing battery block rejected

- **WHEN** balance data omits its battery block, or authors a zero or negative capacity
- **THEN** loading fails with an error naming the field

#### Scenario: Tier table must ascend

- **WHEN** a level's tier table has a later tier with capacity not greater than an earlier one
- **THEN** loading fails with an error naming the tier

#### Scenario: Floats do not cross the boundary

- **WHEN** a level authors its tariff and balance its standby fraction and battery capacity as
  floats
- **THEN** the values handed to the simulation are integers

#### Scenario: Battery capacity converts under the kWh convention

- **WHEN** balance authors a battery capacity of 10 kWh
- **THEN** the simulation's capacity is ten power units sustained for one second of ticks, so
  that a 1 kW surplus fills it in ten seconds of wave time
