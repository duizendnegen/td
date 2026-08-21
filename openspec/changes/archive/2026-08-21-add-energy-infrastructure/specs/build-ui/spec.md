# build-ui — delta for add-energy-infrastructure

## ADDED Requirements

### Requirement: Power meter beside the treasury readout

The HUD SHALL show one power meter next to the treasury readout: during a wave, the live draw
against the current connection capacity, the split between solar and grid supply, and the grid
cost per second; between waves, the rated total of standing towers against capacity, so the
player can see how close a peak would come to the ceiling before starting the wave. The meter
SHALL read as a warning while coverage is below 1 and SHALL show the connection tier. On mobile
the meter compacts into the top bar with the treasury.

#### Scenario: A brownout is signalled at the moment it happens

- **WHEN** engaged draw exceeds what can be supplied on a tick
- **THEN** on the next rendered frame the meter reads as a warning and shows the coverage

#### Scenario: Planning read between waves

- **WHEN** the run sits in the build phase
- **THEN** the meter shows the towers' rated total against capacity and the current tier, and
  the grid cost reads zero

### Requirement: Connection upgrade control

The meter SHALL offer a control that issues the connection-upgrade command, showing the next
tier's capacity and cost, reflecting the same affordability and debt-warning states as the
palette, reading as blocked while the balance is below 0, and reading as maxed with no action at
the last tier. The control SHALL state that the upgrade is final — there is no refund.

#### Scenario: Upgrade through the control

- **WHEN** the player activates the control with balance ≥ 0 and a next tier available
- **THEN** a connection-upgrade command is queued and the meter reflects the new tier and
  capacity once it applies

#### Scenario: Maxed connection

- **WHEN** the connection is at the level's last tier
- **THEN** the control shows a maxed state with no action

### Requirement: Brownout is visible on the board

While coverage is below 1, every tower SHALL read as dimmed on the board, in a state distinct
from normal operation and from the provisional marking, driven by the simulation's coverage,
and SHALL return to normal the frame coverage is back at 1.

#### Scenario: Towers dim together

- **WHEN** coverage drops below 1
- **THEN** every standing tower reads dimmed on the next rendered frame, and none is dimmed
  once coverage returns to 1

## MODIFIED Requirements

### Requirement: Build palette with affordability and debt-warning states

The palette SHALL offer the wall, the solar panel, and all four tower archetypes with their
level-1 costs, and SHALL show the rated power of every tower item and the output of the panel.
An item whose cost would leave the balance ≥ 0 SHALL read as affordable; an item whose purchase
would drive the balance negative SHALL read as a distinct debt warning while remaining
selectable; while the balance is below 0 every item SHALL read as blocked. Lack of power SHALL
NOT block or warn on any item — the meter carries that information.

#### Scenario: Debt purchase is warned, not hidden

- **WHEN** the balance is 50 and a palette item costs 100
- **THEN** the item shows a warning state and can still be selected and placed

#### Scenario: Negative balance blocks the palette

- **WHEN** the balance is below 0
- **THEN** every palette item reads as blocked and clicks place nothing

#### Scenario: All archetypes are placeable

- **WHEN** the player selects each of the four tower palette items in turn
- **THEN** each drives the ghost preview and places its archetype via the same command path

#### Scenario: The panel is placeable and removable like a wall

- **WHEN** the player selects the panel item
- **THEN** it drives the ghost preview with wall-style validation tinting and places a panel via
  the same command path, the card shows the panel's cost and output, and a placed panel is
  removed with the remove tool under the wall's rules (it is not inspectable)

### Requirement: Tower inspector with upgrade action

Selecting a placed tower SHALL show an inspector with the tower's archetype, current level,
current stats including its rated power, its remove control showing the refund it would return,
and — below level 3 — the next level's cost, its rated power, and an upgrade action that issues
the upgrade command. The upgrade action SHALL reflect the same affordability and debt-warning
states as the palette and SHALL read as blocked while the balance is below 0. At level 3 the
inspector SHALL show a maxed state with no upgrade action.

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

#### Scenario: Rated power is shown now and next

- **WHEN** a level-1 tower is selected
- **THEN** the inspector shows its current rated power among its stats and the level-2 rated
  power beside the upgrade cost
