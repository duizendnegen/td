# level-data

## REMOVED Requirements

### Requirement: Waves may be empty until the wave system exists

**Reason**: Phase 4 introduces the wave system this placeholder was reserved against; the
roadmap's promised tightening lands here.
**Migration**: Replaced by "Wave definitions are required and validated" below. Levels with
`waves: []` no longer load.

## ADDED Requirements

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
