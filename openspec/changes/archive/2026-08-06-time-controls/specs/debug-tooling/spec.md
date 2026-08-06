## MODIFIED Requirements

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
