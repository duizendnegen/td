# debug-tooling

## Purpose

Makes the invisible verifiable: flow fields, fixed-point state, and determinism cannot be checked
by watching the game, so first-class overlays and a fast determinism probe exist from Phase 1.

## ADDED Requirements

### Requirement: Flow-field overlay (F1)

Pressing `F1` SHALL toggle an overlay showing, per tile: the field's direction as an arrow,
colour-coded inbound versus returning, blocked tiles, and unreachable tiles distinguished from
finite-cost tiles.

#### Scenario: Corner rule is visually verifiable

- **WHEN** `F1` is active on terrain containing corner-to-corner blocked pairs
- **THEN** no displayed arrow points diagonally between two blocked tiles

### Requirement: Enemy state overlay (F2)

Pressing `F2` SHALL toggle an overlay showing each enemy's committed waypoint (as a line from the
enemy to it) and its state.

#### Scenario: Waypoint commitment is visible

- **WHEN** `F2` is active while an enemy walks the maze
- **THEN** a line connects the enemy to exactly one committed waypoint, advancing tile-by-tile as
  it moves

### Requirement: Simulation readout (F4)

Pressing `F4` SHALL toggle a readout showing the current tick, the canonical state hash, the live
entity count, and the most recent ms-per-tick cost.

#### Scenario: Hash is continuously visible

- **WHEN** `F4` is active
- **THEN** the displayed hash updates as the simulation advances and is stable when paused at a
  tick

### Requirement: Fast-forward determinism probe

A debug key SHALL synchronously run the simulation forward a fixed number of ticks (2 000) and log
the resulting tick number and state hash to the console. The probe SHALL use the same tick path as
normal running, so its result matches a real-time run to the same tick.

#### Scenario: Two-machine gate check in seconds

- **WHEN** two machines open the deployed link with the same seed and press the fast-forward key
- **THEN** both consoles log the same tick number and the same hash within seconds

#### Scenario: Probe equals real-time running

- **WHEN** one session fast-forwards to tick 2 000 and another reaches tick 2 000 in real time with
  the same seed
- **THEN** both report the same hash

### Requirement: Seed override via URL

The simulation seed SHALL default to a fixed constant and SHALL be overridable with a `?seed=`
URL parameter, so any seed can be tested on the deployed site without a redeploy.

#### Scenario: Explicit seed

- **WHEN** the page is opened with `?seed=42`
- **THEN** the simulation is seeded with 42 and two machines opening that URL produce identical
  hashes

#### Scenario: Default seed

- **WHEN** the page is opened without a seed parameter
- **THEN** the fixed default seed is used, and reloads reproduce identical runs
