# debug-tooling

## ADDED Requirements

### Requirement: Combat overlay (F3)

Pressing `F3` SHALL toggle an overlay showing each tower's range boundary and a line from each
tower to its current target while it has one.

#### Scenario: Targeting is visually verifiable

- **WHEN** `F3` is active while a sniper and a carrier are on the board
- **THEN** the sniper's range is drawn and a line connects it to the carrier it is targeting,
  matching the simulation's actual target selection

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
