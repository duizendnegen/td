# level-data

## Purpose

Hand-editable JSON level and balance data with schema validation strong enough to catch an
unwinnable or malformed level at load time, before it ever renders — plus the Phase-1 level itself,
authored as instrumentation for the debug overlays.

## ADDED Requirements

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

### Requirement: Waves may be empty until the wave system exists

The level schema SHALL accept an empty `waves` array. (Phase 4 introduces the wave loader and
tightens this to at-least-one.)

#### Scenario: Phase-1 level loads waveless

- **WHEN** a level with `waves: []` is loaded
- **THEN** validation passes and enemies spawn on the debug timer instead

### Requirement: Authoring floats become integers at load

Rates authored as floats (e.g. `interestRatePerTick`) SHALL be converted to integer representations
exactly once at load; the simulation SHALL only ever observe integers.

#### Scenario: No float crosses the boundary

- **WHEN** a level with a float rate is loaded
- **THEN** the value handed to the simulation is an integer

### Requirement: level_01 is an instrumented gauntlet

`level_01`'s hand-authored terrain SHALL contain, on the spawn→treasury path: an S-curve forcing
multiple full turns, at least two spots where blocked tiles meet corner-to-corner, a stretch where
diagonal movement is cheapest, and one reachable dead-end pocket off the main path — so that turn
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
