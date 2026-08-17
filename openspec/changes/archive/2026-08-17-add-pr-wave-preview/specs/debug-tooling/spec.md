## ADDED Requirements

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
