## MODIFIED Requirements

### Requirement: Play/pause toggles the resting rate

The UI SHALL provide a play/pause control that toggles whether time advances, operable only while
a wave is running. While paused the simulation SHALL NOT advance: no spawns, no movement, no
firing, no settlement, and the tick counter SHALL NOT increase.

Outside an active wave no player-facing control or key binding SHALL engage pause — so, together
with pause releasing on run-phase changes, the build phase can never be entered or left paused.
The debug console handle remains the only way to stop time outside a wave.

#### Scenario: Pausing stops the world

- **WHEN** the player pauses during an active wave
- **THEN** the tick counter holds, enemies stop moving, towers stop firing, and no wave progress
  accrues for as long as the pause lasts

#### Scenario: Resuming continues from the same tick

- **WHEN** the player resumes after a pause of any duration
- **THEN** the simulation continues from the tick it stopped at, with no catch-up burst of
  accumulated ticks

#### Scenario: The build phase cannot be paused

- **WHEN** the player presses the pause key during the build phase
- **THEN** time keeps running: the board never freezes, and no paused treatment appears

### Requirement: Pause releases on any run-phase change

Pause SHALL be released whenever the run phase changes, so time can never be left stopped in a
phase whose controls cannot restart it. This SHALL include settlement ending a paused wave and
the transitions driven by commands committed during a pause — conceding.

The release SHALL be driven by the application observing the run phase, never by the simulation.

#### Scenario: Starting a wave from a paused build phase

- **WHEN** the player starts a wave from the build phase — which no player-facing control can
  leave paused
- **THEN** the wave begins with time running

#### Scenario: Conceding while paused

- **WHEN** the player concedes while paused
- **THEN** the run ends and the lose screen is presented with time running

#### Scenario: Settlement releases the pause

- **WHEN** a wave settles while the game is paused
- **THEN** the build phase is entered with time running
