# wave-scheduling

## Purpose

Hand-authored waves as the run's pacing spine: JSON wave groups scheduled deterministically
within a strict-sequential lifecycle, and spawn fronts that open by wave number.

## Requirements

### Requirement: Wave groups schedule deterministically

A wave SHALL be an ordered list of groups, each declaring `spawn`, `type`, `count`,
`spawnInterval`, and `delay` (both in ticks). When a wave starts, each group SHALL begin
spawning `delay` ticks after the wave-start tick, emitting one enemy of `type` at its `spawn`
every `spawnInterval` ticks until `count` enemies have spawned. Scheduling SHALL be fully
deterministic: the same wave data and start tick always produce the same spawn ticks.

#### Scenario: A group unrolls on schedule

- **WHEN** a wave starts at tick T containing a group with delay 40, count 3, spawnInterval 20
- **THEN** enemies spawn at exactly ticks T+40, T+60, and T+80, at the group's declared spawn

#### Scenario: Groups overlap within a wave

- **WHEN** a wave contains two groups whose delay/interval windows overlap
- **THEN** both schedules run concurrently, each at its own spawn and cadence

### Requirement: Waves are strictly sequential

A wave SHALL be active from the moment it is started until every enemy it spawned is dead or
has escaped — including carriers walking back out. While a wave is active, starting another
wave SHALL be impossible. Between waves the game SHALL be in an untimed build phase in which
no enemies spawn.

#### Scenario: A fleeing carrier keeps the wave active

- **WHEN** the last living enemy of a wave is a carrier walking back toward a spawn
- **THEN** the wave remains active until it escapes or dies, and no new wave can start

#### Scenario: No spawning between waves

- **WHEN** the previous wave has fully drained and no wave has been started
- **THEN** no enemy spawns, regardless of how much real time passes

### Requirement: Start-wave is a command

Starting a wave SHALL be a player command applied at a tick boundary, subject to the
run-lifecycle solvency gate. A start-wave command received while a wave is active SHALL be
rejected with no state change.

#### Scenario: Start during an active wave is rejected

- **WHEN** a start-wave command arrives while wave N is still active
- **THEN** the command is rejected and the simulation state hash is unaffected

### Requirement: Spawns activate by wave number

A spawn declaring `activeFromWave` N SHALL be dormant before wave N: it spawns nothing and is
not a source of the returning field. It SHALL become active when wave N starts, at which point
both flow fields are rebuilt and returning enemies MAY thereafter escape through it.

#### Scenario: Second front opens mid-run

- **WHEN** wave 5 starts on a level whose second spawn declares `activeFromWave: 5`
- **THEN** the second spawn emits that wave's groups assigned to it, and the returning field
  now routes carriers to the nearest of the two active spawns

#### Scenario: Dormant spawn is not an exit

- **WHEN** a carrier is returning during wave 4 and the second spawn activates only at wave 5
- **THEN** the carrier's escape routing targets only the first spawn
