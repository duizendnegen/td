## ADDED Requirements

### Requirement: Tower inspector shows recorded damage

For every damage-dealing tower, the inspector SHALL show a performance block, visually distinct
from the static stat rows, containing the tower's recorded wave damage and total damage since
placement. The wave figure SHALL be labelled as the current wave's while a wave is running and as
the last wave's in every other phase. Outside a wave, a tower whose total damage is zero SHALL show
a dash in place of its wave figure rather than a zero, so a tower placed this build phase does not
read as having fought and dealt nothing. The block SHALL refresh as damage lands, in every phase.
The slow tower SHALL show no performance block.

#### Scenario: During a wave the figure is the current wave's

- **WHEN** a rapid tower is selected while a wave runs and it has dealt 120 damage this wave and
  900 in total
- **THEN** the inspector labels the wave figure as this wave's and shows 120, and shows a total of
  900

#### Scenario: Between waves the figure is the last wave's

- **WHEN** the wave settles and the same tower is selected during the build phase
- **THEN** the inspector labels the wave figure as the last wave's, still showing 120, and the
  total of 900

#### Scenario: A tower that has never fought shows a dash

- **WHEN** a tower placed during the build phase is selected before any wave has run against it
- **THEN** the wave figure reads as a dash and the total reads 0

#### Scenario: The block updates as damage lands

- **WHEN** a selected tower fires and lands a hit
- **THEN** both figures on the inspector reflect the new counters on the next frame, without
  re-selecting the tower

#### Scenario: The slow tower has no performance block

- **WHEN** a slow tower is selected
- **THEN** the inspector shows its static stats and actions with no performance block

#### Scenario: The block does not crowd the mobile sheet

- **WHEN** the inspector is shown as the mobile bottom sheet
- **THEN** the performance block lays out on its own row rather than widening the side-by-side
  stat columns
