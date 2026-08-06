## ADDED Requirements

### Requirement: Transport controls occupy the start-wave slot during a wave

The UI SHALL present play/pause and fast-forward as transport controls in the same bottom-slot
footprint the start-wave control occupies, shown while a wave is running — the phase in which the
start-wave control is already hidden. They SHALL use the conventional transport iconography (play,
pause, fast-forward) and SHALL NOT display or offer a choice of speed multiplier.

Switching between the start-wave control and the transport controls SHALL NOT shift the surrounding
layout.

#### Scenario: The slot swaps with the phase

- **WHEN** a wave starts
- **THEN** the start-wave control is replaced in place by the transport controls, and when the wave
  settles the start-wave control returns

#### Scenario: Play/pause reflects the current state

- **WHEN** the game is paused
- **THEN** the control reads as a play action, and while running it reads as a pause action

#### Scenario: No speed choice is exposed

- **WHEN** the transport controls are visible
- **THEN** no multiplier value or speed selector is presented to the player

### Requirement: Time controls are keyboard-operable on desktop

The UI SHALL bind play/pause and fast-forward to keys, with fast-forward held for as long as the key
is down, matching the palette's existing desktop keyboard-shortcut treatment including its key
hints. The key bindings SHALL remain active in every run phase, including phases in which the
transport buttons are not mounted.

Key handling SHALL prevent the browser's default activation of a focused control, so that a
transport key pressed after clicking a button does not both re-activate the button and run the
binding.

#### Scenario: Keys work where the buttons are not shown

- **WHEN** the player uses the time-control keys during the build phase with debug-spawned enemies
  on the board
- **THEN** time pauses and fast-forwards as it does during a wave, without transport buttons being
  present

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

## MODIFIED Requirements

### Requirement: Start-wave control with solvency lock

The UI SHALL provide a start-wave control that is enabled only in the build phase with balance
≥ 0. While wave-locked by debt, the control SHALL show a locked state that names the reason and
points at selling structures as the way out. During an active wave the control SHALL be
unavailable, and its slot SHALL host the transport controls instead.

#### Scenario: Debt locks the button with guidance

- **WHEN** settlement leaves the balance at −40
- **THEN** the start-wave control is disabled, shows the debt, and directs the player to sell
  structures to recover

#### Scenario: A refund unlocks the button in its own tick

- **WHEN** the player is wave-locked at −40 and removes a structure refunding 50
- **THEN** the start-wave control reads enabled on the next rendered frame, with no countdown in
  between

#### Scenario: Starting a wave from a paused build phase

- **WHEN** the player has paused during the build phase and activates the start-wave control
- **THEN** the wave begins with time running, and the transport controls take the slot
