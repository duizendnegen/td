# debug-tooling

## Purpose

Makes the invisible verifiable: enemy steering, targeting, fixed-point state, and determinism
cannot be checked by watching the game, so first-class overlays and a fast determinism probe exist
from Phase 1. Routing itself is no longer among them — it became a player surface, `path-preview`.

## Requirements

### Requirement: Enemy state overlay (F2)

Pressing `F2` SHALL toggle an overlay showing each enemy's committed waypoint (as a line from the
enemy to it) and its state.

#### Scenario: Waypoint commitment is visible

- **WHEN** `F2` is active while an enemy walks the maze
- **THEN** a line connects the enemy to exactly one committed waypoint, advancing tile-by-tile as
  it moves

### Requirement: Combat overlay (F3)

Pressing `F3` SHALL toggle an overlay showing each tower's range boundary and a line from each
tower to its current target while it has one.

#### Scenario: Targeting is visually verifiable

- **WHEN** `F3` is active while a sniper and a carrier are on the board
- **THEN** the sniper's range is drawn and a line connects it to the carrier it is targeting,
  matching the simulation's actual target selection

### Requirement: Simulation readout (F4)

Pressing `F4` SHALL toggle a readout showing the current tick, the canonical state hash, the live
entity count, and the most recent ms-per-tick cost.

The readout SHALL additionally distinguish a state that has been committed but not yet advanced, so
that a hash changing while the tick counter stands still is legible as a pending commit rather than
as a determinism fault.

#### Scenario: Hash is continuously visible

- **WHEN** `F4` is active
- **THEN** the displayed hash updates as the simulation advances

#### Scenario: Hash is stable while time is stopped

- **WHEN** `F4` is active and the game is paused with no player input
- **THEN** the tick and hash both hold for the duration of the pause

#### Scenario: A commit during a pause is marked

- **WHEN** `F4` is active and the player places a structure while paused
- **THEN** the hash changes, the tick counter does not, and the readout marks the state as having a
  pending commit until time advances

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

### Requirement: Debug spawn panel with typed burst presets

A debug spawn panel SHALL offer per-type single spawns and authored burst presets — including at
least one burst per enemy type and one mixed-pressure preset — defined as groups of
`{type, count, spawnInterval}`. Triggering a preset SHALL schedule ordinary typed spawn commands
at the corresponding tick boundaries; the panel SHALL have no effect on simulation state beyond
the commands it issues.

#### Scenario: A swarm check on demand

- **WHEN** the swarm burst preset is triggered
- **THEN** the configured count of swarm enemies spawns at the configured tick interval through
  the ordinary command queue

#### Scenario: Presets leave no trace beyond commands

- **WHEN** a session's command stream is recorded while presets fire and replayed without the
  panel
- **THEN** both runs produce identical state hashes at every tick
