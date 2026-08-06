## ADDED Requirements

### Requirement: Time rate is a render-loop property

The rate at which simulation ticks are driven SHALL be a property of the application's render loop
and SHALL NOT be represented in simulation state. No field expressing pause, speed, or wall-clock
time SHALL be added to hashed state, and the simulation SHALL have no means of observing whether
the game is paused or fast-forwarded.

Pause SHALL be implemented as the absence of time advancement — the simulation is simply not
advanced — and never by skipping simulation steps, gating the wave scheduler, or scaling entity
speeds.

#### Scenario: Reaching a tick at any rate produces one state

- **WHEN** the same seed and command stream reach tick N once at normal rate, once fast-forwarded,
  and once through repeated pauses
- **THEN** all three report the same state hash at tick N

#### Scenario: Speed is absent from the hash

- **WHEN** the state hash walk is compared before and after this change
- **THEN** no field relating to pause or speed appears in it, and the stored replay goldens are
  unchanged

### Requirement: Play/pause toggles the resting rate

The UI SHALL provide a play/pause control that toggles whether time advances. While paused the
simulation SHALL NOT advance: no spawns, no movement, no firing, no settlement, and the tick
counter SHALL NOT increase.

#### Scenario: Pausing stops the world

- **WHEN** the player pauses during an active wave
- **THEN** the tick counter holds, enemies stop moving, towers stop firing, and no wave progress
  accrues for as long as the pause lasts

#### Scenario: Resuming continues from the same tick

- **WHEN** the player resumes after a pause of any duration
- **THEN** the simulation continues from the tick it stopped at, with no catch-up burst of
  accumulated ticks

### Requirement: Fast-forward is a momentary override

The UI SHALL provide a fast-forward control that runs time at a configured multiplier **only while
it is held**, and returns to the play/pause control's resting rate the moment it is released. It
SHALL NOT latch.

Fast-forward SHALL override pause: holding it while paused SHALL advance time at the multiplier,
and releasing it SHALL return the game to paused — so a paused game can be scrubbed forward in
controlled increments.

#### Scenario: Release returns to the resting rate

- **WHEN** the player holds fast-forward while playing and then releases it
- **THEN** time runs at the multiplier while held and at normal rate afterwards

#### Scenario: Scrubbing a paused game

- **WHEN** the player pauses, then briefly holds and releases fast-forward
- **THEN** the simulation advances by the ticks covered by that hold and is paused again on
  release

#### Scenario: Fast-forward cannot be left on

- **WHEN** the player's hold ends for any reason — release, pointer leaving the control, the
  window losing focus, or the control being removed from the layout
- **THEN** time returns to the resting rate

### Requirement: The fast-forward multiplier is configuration

The fast-forward multiplier SHALL be defined as a single named application-layer constant, and
SHALL be overridable at runtime without a rebuild — via a URL parameter and via the debug handle —
so it can be retuned during a playtest. It SHALL NOT be stored in balance or level data, which are
simulation inputs.

#### Scenario: Override without a rebuild

- **WHEN** the page is opened with the multiplier's URL override set to a different value
- **THEN** fast-forward runs at that multiplier, and the run is otherwise identical to one at the
  default

#### Scenario: The multiplier is not simulation data

- **WHEN** the multiplier is changed by any means
- **THEN** the state hash at any given tick is unaffected

### Requirement: A paused game commits player actions immediately

While paused, commands issued by the player SHALL take effect immediately rather than waiting for
time to resume. A structure placed while paused SHALL be charged to the treasury, block its tile,
update both flow fields, and re-target affected enemy waypoints at once, on a still board.

Such a commit SHALL NOT advance time: no spawn, movement, firing, death, settlement, or tick
increment SHALL occur as a result of it.

#### Scenario: Building while paused is immediate

- **WHEN** the player places a tower while paused
- **THEN** the treasury readout drops by its cost in that frame, the tower stands on the board, and
  the tick counter has not moved

#### Scenario: Committed walls re-route enemies on a still board

- **WHEN** the player places a wall while paused, with live enemies steering around the maze
- **THEN** affected enemies visibly re-target their committed waypoints without moving

#### Scenario: Affordability stays truthful during a pause

- **WHEN** the player places structures while paused until the treasury cannot afford the next one
- **THEN** each placement is charged as it is made, and the palette reads unaffordable at exactly
  the point the balance can no longer cover the next placement

#### Scenario: Committing is not advancing

- **WHEN** the player issues several commands during one pause
- **THEN** no enemy moves, no tower fires, and the tick counter is identical before and after

### Requirement: Pause releases on any run-phase change

Pause SHALL be released whenever the run phase changes, so time can never be left stopped in a
phase whose controls cannot restart it. This SHALL include the transitions driven by commands
committed during a pause — starting a wave and conceding.

The release SHALL be driven by the application observing the run phase, never by the simulation.

#### Scenario: Starting a wave from a paused build phase

- **WHEN** the player pauses during the build phase and then starts a wave
- **THEN** the wave begins with time running

#### Scenario: Conceding while paused

- **WHEN** the player concedes while paused
- **THEN** the run ends and the lose screen is presented with time running

#### Scenario: Settlement releases the pause

- **WHEN** a wave settles while the game is paused
- **THEN** the build phase is entered with time running

### Requirement: A paused board is visibly paused

While paused, the rendered board SHALL carry a persistent visual treatment that distinguishes a
stopped game from a hung one. The HUD SHALL remain fully legible.

#### Scenario: Pause is not mistaken for a hang

- **WHEN** the game is paused
- **THEN** the board carries the paused treatment for the whole pause, the HUD is unaffected, and
  the treatment clears when time resumes

### Requirement: Paused frames render committed positions

While paused, the renderer SHALL draw entities at their current simulation positions rather than at
an interpolated fraction between the previous and current tick, so that committing a command during
a pause does not visibly displace anything.

#### Scenario: Committing does not jolt the board

- **WHEN** the player pauses mid-tick and then places a structure
- **THEN** no entity's rendered position changes as a result of the commit
