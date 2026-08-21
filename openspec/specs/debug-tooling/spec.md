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
entity count, the most recent ms-per-tick cost, and — during a wave — the tick's power draw,
solar output, the store's discharge and charge, grid supply, connection tier and capacity,
coverage, and grid bill. Whenever a battery stands the readout SHALL also show the stored
energy against the store's capacity, in any phase.

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

#### Scenario: Power figures are visible during a wave

- **WHEN** `F4` is active during a wave
- **THEN** the readout shows the tick's draw, supply split including the store, coverage and
  bill, updating every tick

#### Scenario: The store is visible in the build phase

- **WHEN** `F4` is active during the build phase with a battery standing
- **THEN** the readout shows the stored energy against capacity while the other power figures
  read idle

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

### Requirement: Headless capture mode

Opening the game with `?capture=1` SHALL construct the full game — data, renderer, HUD, input —
without starting the real-time loop, and SHALL expose an automation seam that lets an external
driver advance the simulation by a requested number of ticks and render exactly one frame on
demand. The driver SHALL supply the clock value used for that frame, so time-based presentation
(enemy hover, effect fades, transitions) derives from the caller's value rather than from elapsed
wall-clock time. Capture mode SHALL be a mode flag only: it SHALL NOT select a scenario, level, or
enemy composition, and no capture content SHALL live in the application.

#### Scenario: Nothing advances unbidden

- **WHEN** the game is opened with `?capture=1` and left untouched
- **THEN** the simulation tick does not advance and no frame is rendered until the driver requests
  it

#### Scenario: Frames depend on tick, not on elapsed time

- **WHEN** the same command stream is played to tick N twice, once quickly and once with long
  arbitrary pauses between driver calls, and a frame is rendered at tick N with the same supplied
  clock value both times
- **THEN** both renders produce the same scene — presentation state is a function of the tick and
  the supplied clock value alone

#### Scenario: Capture mode uses the same tick path

- **WHEN** capture mode is stepped to tick N with a given command stream and seed
- **THEN** the state hash matches a normal real-time run to tick N with the same command stream
  and seed

#### Scenario: Capture mode adds no visual chrome

- **WHEN** a frame is rendered in capture mode with no debug overlay toggled
- **THEN** the scene is what a player sees at that tick — no capture-specific markers, readouts, or
  overlays are drawn

#### Scenario: Normal boot is unaffected

- **WHEN** the game is opened without `?capture=1`
- **THEN** the real-time loop runs exactly as before, at the fixed timestep with catch-up clamping
  and interpolation alpha
