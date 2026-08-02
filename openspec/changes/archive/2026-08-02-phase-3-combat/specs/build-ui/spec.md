# build-ui

## MODIFIED Requirements

### Requirement: Build palette with affordability and debt-warning states

The palette SHALL offer the wall and all four tower archetypes with their level-1 costs. An item
whose cost would leave the balance ≥ 0 SHALL read as affordable; an item whose purchase would
drive the balance negative SHALL read as a distinct debt warning while remaining selectable;
while the balance is below 0 every item SHALL read as blocked.

#### Scenario: Debt purchase is warned, not hidden

- **WHEN** the balance is 50 and a palette item costs 100
- **THEN** the item shows a warning state and can still be selected and placed

#### Scenario: Negative balance blocks the palette

- **WHEN** the balance is below 0
- **THEN** every palette item reads as blocked and clicks place nothing

#### Scenario: All archetypes are placeable

- **WHEN** the player selects each of the four tower palette items in turn
- **THEN** each drives the ghost preview and places its archetype via the same command path

## ADDED Requirements

### Requirement: Tower inspector with upgrade action

Selecting a placed tower SHALL show an inspector with the tower's archetype, current level,
current stats, its removal control with the standard countdown, and — below level 3 — the next
level's cost and an upgrade action that issues the upgrade command. The upgrade action SHALL
reflect the same affordability and debt-warning states as the palette and SHALL read as blocked
while the balance is below 0 or the tower is under removal. At level 3 the inspector SHALL show
a maxed state with no upgrade action.

#### Scenario: Inspector upgrades through the command path

- **WHEN** the player clicks the inspector's upgrade action on a level-1 tower with balance ≥ 0
- **THEN** an upgrade command is queued and the inspector reflects level 2 once it applies

#### Scenario: Maxed towers offer no upgrade

- **WHEN** a level-3 tower is selected
- **THEN** the inspector shows its stats and a maxed state, with no upgrade cost or action

### Requirement: Upgrade preview shows the next level's range

While the inspector's upgrade action is hovered on a tower whose archetype scales range, the
selected tower's range ring SHALL additionally preview the next level's radius, so range
purchases are informed like placements.

#### Scenario: Next ring on hover

- **WHEN** the player hovers the upgrade action of a level-1 sniper
- **THEN** the level-2 range ring is shown alongside the current ring, and disappears when the
  hover ends

### Requirement: Enemy status icons

An enemy carrying gold SHALL display a carried-gold indicator, and an enemy whose slow is
unexpired SHALL display a slowed indicator, both readable from the isometric camera and both
purely render-side.

#### Scenario: Slowed state is visible

- **WHEN** a slow tower slows an enemy
- **THEN** a slowed icon appears above the enemy and disappears when the slow expires
