## ADDED Requirements

### Requirement: Provisional structures read as uncommitted on the board

Structures that are still provisional SHALL be visually distinguishable from committed ones on the
board, so a player can see what will lock in when the wave starts without inspecting each one. The
distinction SHALL clear the moment they commit.

#### Scenario: This phase's work is distinguishable

- **WHEN** the player has built during the build phase alongside structures from earlier phases
- **THEN** the newly built structures read as uncommitted and the earlier ones do not

#### Scenario: Starting a wave clears the distinction

- **WHEN** the wave starts and time advances
- **THEN** every structure reads as committed

## MODIFIED Requirements

### Requirement: Tower inspector with upgrade action

Selecting a placed tower SHALL show an inspector with the tower's archetype, current level,
current stats, its remove control showing the refund it would return, and — below level 3 — the next
level's cost and an upgrade action that issues the upgrade command. The upgrade action SHALL
reflect the same affordability and debt-warning states as the palette and SHALL read as blocked
while the balance is below 0. At level 3 the inspector SHALL show a maxed state with no upgrade
action.

The refund shown SHALL be the amount that removal would actually credit — the full invested total
for a provisional tower, the removal refund fraction of it for a committed one — and a provisional
tower's remove control SHALL name the full refund as the revision window it is, so it reads as
undoing a decision rather than as a better price.

The remove control SHALL read as unavailable while a wave is running **only** for committed towers;
a provisional tower's remove control SHALL remain available during a wave.

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

#### Scenario: The refund shown matches what is paid

- **WHEN** a provisional tower and a committed tower of the same total invested cost are inspected
- **THEN** the provisional one shows the full invested total and the committed one shows the
  refund fraction of it, and removing each credits exactly the amount shown

#### Scenario: A provisional tower can be unwound during a wave

- **WHEN** a tower is placed during a wave while time is not advancing and is then selected
- **THEN** its remove control reads available, and activating it issues a removal command

### Requirement: Remove controls are unavailable during a wave

Every control that issues a removal — the palette's remove tool, the desktop inspector's remove
action, and the mobile inspector sheet's remove action — SHALL read as unavailable while a wave is
running **for committed structures**, and SHALL become available again for them when the wave
settles. The two inspector controls SHALL additionally name the wave as the reason; the palette tool
SHALL read as unavailable in the same visual language as any other blocked palette item, without
reason text — so the explanation lives where it fits on both form factors rather than in a
desktop-only affordance. While unavailable, activating any of them SHALL issue no command.

Because provisional structures remain removable during a wave, the palette's remove tool SHALL stay
usable while a wave runs and SHALL reject only what is committed, with the ordinary reject feedback.
A remove tool selected when a wave starts SHALL therefore no longer be deselected.

#### Scenario: Starting a wave blocks selling committed structures

- **WHEN** a wave starts and the player targets a structure that has lived through a wave tick
- **THEN** both inspector remove actions read unavailable with the wave named as the reason, and
  clicking that structure with the remove tool issues no removal command and gives the ordinary
  reject feedback

#### Scenario: The remove tool survives the start of a wave

- **WHEN** a wave starts while the remove tool is selected
- **THEN** the tool stays selected, so a player mid-revision is not interrupted

#### Scenario: Settlement re-enables selling

- **WHEN** the wave settles and the build phase resumes
- **THEN** the remove controls read available again for every structure and a click issues a
  removal command

### Requirement: Concede control that flags impossible recovery

A concede control SHALL be available throughout the run. When the balance is negative and the
total refund value of all remaining structures — each at the refund it would actually pay — cannot
reach 0, the UI SHALL state plainly that recovery is impossible, so a newcomer is never left poking
at a dead run.

#### Scenario: Dead run says so

- **WHEN** the debt exceeds the combined refund value of everything still standing
- **THEN** the concede control (or an adjacent notice) states that recovery is impossible

#### Scenario: Provisional value keeps a run alive

- **WHEN** the debt exceeds what committed structures could raise at the refund fraction, but
  provisional structures' full refunds would cover it
- **THEN** the notice is not shown
