# build-ui

## ADDED Requirements

### Requirement: Wave counter and preview

The HUD SHALL show the current wave number and total wave count, and — during the build phase —
a preview of the upcoming wave's composition: enemy types, counts, and which spawns they come
from, including a clear signal when a new spawn activates with that wave.

#### Scenario: Preview warns of the second front

- **WHEN** the player is in the build phase before a wave that activates a second spawn
- **THEN** the preview shows that wave's groups and marks the newly activating spawn

### Requirement: Start-wave control with solvency lock

The UI SHALL provide a start-wave control that is enabled only in the build phase with balance
≥ 0. While wave-locked by debt, the control SHALL show a locked state that names the reason and
points at selling structures as the way out. During an active wave the control SHALL be
unavailable.

#### Scenario: Debt locks the button with guidance

- **WHEN** settlement leaves the balance at −40
- **THEN** the start-wave control is disabled, shows the debt, and directs the player to sell
  structures to recover

### Requirement: Win and lose screens with the run summary

On run end the UI SHALL present a win or lose screen showing the run summary: gold stolen, gold
escaped, kills, and final balance.

#### Scenario: Victory shows the ledger

- **WHEN** the run ends as won
- **THEN** the win screen displays stolen, escaped, kills, and final balance from the summary

### Requirement: Concede control that flags impossible recovery

A concede control SHALL be available throughout the run. When the balance is negative and the
total refund value of all remaining structures cannot reach 0, the UI SHALL state plainly that
recovery is impossible, so a newcomer is never left poking at a dead run.

#### Scenario: Dead run says so

- **WHEN** the debt exceeds the combined refund value of everything still standing
- **THEN** the concede control (or an adjacent notice) states that recovery is impossible
