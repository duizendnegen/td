## MODIFIED Requirements

### Requirement: Start-wave control with solvency lock

The UI SHALL provide a start-wave control that is enabled only in the build phase with balance
≥ 0. While wave-locked by debt, the control SHALL show a locked state that names the reason and
points at selling structures as the way out. During an active wave the control SHALL be
unavailable, and its slot SHALL host the transport controls instead.

On desktop the start-wave control SHALL additionally be activated by the same key that toggles
pause during a wave, with the key's meaning selected by run phase. The key SHALL respect the same
solvency lock as the button, SHALL start exactly one wave per press regardless of keyboard
auto-repeat, and the control SHALL carry its key hint in the same treatment the transport
controls use.

#### Scenario: Debt locks the button with guidance

- **WHEN** settlement leaves the balance at −40
- **THEN** the start-wave control is disabled, shows the debt, and directs the player to sell
  structures to recover

#### Scenario: A refund unlocks the button in its own tick

- **WHEN** the player is wave-locked at −40 and removes a structure refunding 50
- **THEN** the start-wave control reads enabled on the next rendered frame, with no countdown in
  between

#### Scenario: Starting a wave from a paused build phase

- **WHEN** the player attempts to pause during the build phase and then activates the start-wave
  control
- **THEN** pause never engaged, and the wave begins with time running with the transport controls
  taking the slot

#### Scenario: The key starts the wave

- **WHEN** the player presses the start-wave key during a solvent build phase with waves remaining
- **THEN** the wave begins with time running, and the transport controls take the slot

#### Scenario: The key respects the solvency lock

- **WHEN** the player presses the start-wave key while wave-locked by debt
- **THEN** no wave starts and the locked control with its guidance remains

#### Scenario: A held key starts exactly one wave

- **WHEN** the player holds the start-wave key long enough for keyboard auto-repeat to engage
- **THEN** exactly one wave starts, and the game is not paused when the auto-repeat continues into
  the running wave

### Requirement: Time controls are keyboard-operable on desktop

The UI SHALL bind play/pause and fast-forward to keys, with fast-forward held for as long as the
key is down, matching the palette's existing desktop keyboard-shortcut treatment including its key
hints. The fast-forward binding SHALL remain active in every run phase, including phases in which
the transport buttons are not mounted. The play/pause binding SHALL operate only while a wave is
running; in the build phase its key activates the start-wave control instead, and in the remaining
phases it does nothing.

Key handling SHALL prevent the browser's default activation of a focused control in every phase,
so that a bound key pressed after clicking a button does not both re-activate the button and run
the binding.

#### Scenario: Keys work where the buttons are not shown

- **WHEN** the player holds the fast-forward key during the build phase with debug-spawned enemies
  on the board
- **THEN** time fast-forwards as it does during a wave, without transport buttons being present —
  while the pause key engages no pause there

#### Scenario: Key hints match the palette

- **WHEN** the transport controls are shown on a desktop layout
- **THEN** each carries its key hint in the same treatment the palette items use, and the hints are
  absent on the mobile layout

#### Scenario: Pressing the key after clicking the button toggles once

- **WHEN** the player clicks play/pause and then presses the play/pause key
- **THEN** the state toggles exactly once

#### Scenario: Held keys do not repeat

- **WHEN** the player holds the fast-forward key long enough for keyboard auto-repeat to engage
- **THEN** fast-forward engages once and stays engaged until the key is released
