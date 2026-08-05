## ADDED Requirements

### Requirement: Remove controls are unavailable during a wave

Every control that issues a removal — the palette's remove tool, the desktop inspector's remove
action, and the mobile inspector sheet's remove action — SHALL read as unavailable while a wave is
running, and SHALL become available again when the wave settles. The two inspector controls SHALL
additionally name the wave as the reason; the palette tool SHALL read as unavailable in the same
visual language as any other blocked palette item, without reason text — so the explanation lives
where it fits on both form factors rather than in a desktop-only affordance. While unavailable,
activating any of them SHALL issue no command. A remove tool selected when a wave starts SHALL be
deselected, so no click is silently swallowed.

#### Scenario: Starting a wave disables selling

- **WHEN** a wave starts while the remove tool is selected
- **THEN** the tool is deselected, the palette tool reads blocked, both inspector remove actions
  read unavailable with the wave named as the reason, and clicking a structure issues no removal
  command

#### Scenario: Settlement re-enables selling

- **WHEN** the wave settles and the build phase resumes
- **THEN** the remove controls read available again and a click issues a removal command

## MODIFIED Requirements

### Requirement: Tower inspector with upgrade action

Selecting a placed tower SHALL show an inspector with the tower's archetype, current level,
current stats, its remove control showing the refund it would return, and — below level 3 — the next
level's cost and an upgrade action that issues the upgrade command. The upgrade action SHALL
reflect the same affordability and debt-warning states as the palette and SHALL read as blocked
while the balance is below 0. The remove control SHALL read as unavailable while a wave is running.
At level 3 the inspector SHALL show a maxed state with no upgrade action.

#### Scenario: Inspector upgrades through the command path

- **WHEN** the player clicks the inspector's upgrade action on a level-1 tower with balance ≥ 0
- **THEN** an upgrade command is queued and the inspector reflects level 2 once it applies

#### Scenario: Maxed towers offer no upgrade

- **WHEN** a level-3 tower is selected
- **THEN** the inspector shows its stats and a maxed state, with no upgrade cost or action

#### Scenario: Removing through the inspector is immediate

- **WHEN** the player clicks the inspector's remove control during the build phase
- **THEN** a removal command is queued, and once it applies the structure is gone, the refund is
  visible in the treasury readout, and the inspector closes

### Requirement: Mobile inspector is a bottom sheet that swaps with the build menu

Below the mobile breakpoint, selecting a placed tower SHALL replace the bottom build menu with
an inspector bottom sheet showing the tower's archetype, level, condensed stats, and
touch-sized upgrade and remove actions with the same affordability, debt-warning, blocked,
wave-unavailable, and maxed states as the desktop inspector. Dismissing the sheet or deselecting
the tower SHALL restore the build menu. The sheet SHALL remain a compact bottom band: stats are
condensed to keep it within roughly the bottom third of the viewport, and it SHALL NOT expand
into a full-screen view that hides the board.

#### Scenario: Selection swaps the bottom zone

- **WHEN** the player taps a placed tower on a mobile-sized viewport
- **THEN** the build menu is replaced by the inspector sheet for that tower, and dismissing it
  brings the build menu back

#### Scenario: Sheet actions match desktop semantics

- **WHEN** the balance is below 0 and the inspector sheet is open
- **THEN** the sheet's upgrade action reads as blocked, exactly as the desktop inspector would

#### Scenario: Sheet remove action follows the wave gate

- **WHEN** the inspector sheet is open while a wave is running
- **THEN** its remove action reads unavailable, exactly as the desktop inspector's would

### Requirement: Start-wave control with solvency lock

The UI SHALL provide a start-wave control that is enabled only in the build phase with balance
≥ 0. While wave-locked by debt, the control SHALL show a locked state that names the reason and
points at selling structures as the way out. During an active wave the control SHALL be
unavailable.

#### Scenario: Debt locks the button with guidance

- **WHEN** settlement leaves the balance at −40
- **THEN** the start-wave control is disabled, shows the debt, and directs the player to sell
  structures to recover

#### Scenario: A refund unlocks the button in its own tick

- **WHEN** the player is wave-locked at −40 and removes a structure refunding 50
- **THEN** the start-wave control reads enabled on the next rendered frame, with no countdown in
  between

## REMOVED Requirements

### Requirement: Removal countdown is visible

**Reason**: Removal now completes in the tick its command applies, so there is no countdown state
left to display.

**Migration**: The countdown readout above a structure and the inspector's countdown state are
replaced by the wave-unavailable state on the remove controls (see "Remove controls are unavailable
during a wave"). A completed removal is communicated by the structure disappearing and the refund
appearing in the treasury readout, both in the same tick.
