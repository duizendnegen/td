# build-ui

## Purpose

The player's hands and eyes for the maze loop: a treasury readout, a build palette, a truthful
ghost preview backed by the real validation, and honest reject feedback — so every placement
decision is informed and every refusal is legible.

## Requirements

### Requirement: HUD shows the live treasury balance

The HUD SHALL display the current treasury balance, updating as simulation state changes so that
grabs, charges, bounties, and refunds are visible when they happen.

#### Scenario: A grab is visible

- **WHEN** an enemy grabs gold at the treasury
- **THEN** the displayed balance drops by the grabbed amount on the next rendered frame

### Requirement: Build palette with affordability and debt-warning states

The palette SHALL offer the wall and the rapid-fire tower with their costs. An item whose cost
would leave the balance ≥ 0 SHALL read as affordable; an item whose purchase would drive the
balance negative SHALL read as a distinct debt warning while remaining selectable; while the
balance is below 0 every item SHALL read as blocked.

#### Scenario: Debt purchase is warned, not hidden

- **WHEN** the balance is 50 and a palette item costs 100
- **THEN** the item shows a warning state and can still be selected and placed

#### Scenario: Negative balance blocks the palette

- **WHEN** the balance is below 0
- **THEN** every palette item reads as blocked and clicks place nothing

### Requirement: Pointer input maps to tile commands

A pointer position over the board SHALL resolve via ground raycast to a tile, and confirmed build
or removal clicks SHALL enter the simulation only as commands — the UI SHALL never mutate
simulation state directly.

#### Scenario: Click becomes a command

- **WHEN** the player clicks a tile with a palette item selected
- **THEN** a placement command for that tile is queued and applies at the next tick boundary

### Requirement: Ghost preview is driven by the authoritative validation

While a palette item is selected, a footprint ghost SHALL follow the hovered tile, tinted by the
verdict of the same validation logic the simulation uses to accept placements, evaluated
speculatively. The verdict SHALL be re-evaluated when the hovered tile changes or a new tick's
state arrives. Speculative evaluation SHALL NOT change simulation state: hovering never changes
the state hash.

#### Scenario: Preview agrees with validation

- **WHEN** the ghost hovers a footprint that the simulation would reject for any validation reason
- **THEN** the ghost is tinted invalid

#### Scenario: Enemy movement flips the verdict without mouse movement

- **WHEN** an enemy walks into the hovered footprint while the pointer is stationary
- **THEN** the ghost flips to invalid on that tick without the pointer moving

#### Scenario: Hovering is free of side effects

- **WHEN** the player hovers many candidate footprints without clicking while a replay of the same
  seed and commands runs without hovering
- **THEN** both runs produce identical state hashes

### Requirement: Every invalid click gets the same reject feedback

A placement click that does not result in a confirmed placement — whether the ghost already showed
invalid, or the ghost showed valid and the authoritative validation rejected at the applying tick —
SHALL produce identical reject feedback: a brief red flash on the attempted footprint, no treasury
charge, no state change, and no queued retry.

#### Scenario: Stale green loses the race

- **WHEN** the ghost shows valid, the player clicks, and an enemy enters the footprint before the
  command's applying tick
- **THEN** the placement is rejected, the footprint flashes red, the treasury is unchanged, and no
  wall appears then or later

#### Scenario: Red click feels the same

- **WHEN** the player clicks while the ghost shows invalid
- **THEN** the same red-flash feedback plays and no command takes effect

### Requirement: Range ring on tower ghost and selection

The tower ghost and any selected placed tower SHALL display a range ring whose radius matches the
simulation's range for that tower.

#### Scenario: Ring matches simulation range

- **WHEN** an enemy stands exactly at the edge of the displayed ring
- **THEN** the tower's in-range check for that enemy agrees with what the ring shows

### Requirement: Removal countdown is visible

A structure whose removal countdown is running SHALL display its remaining time, and the display
SHALL disappear when the structure is removed.

#### Scenario: Countdown reads out

- **WHEN** the player orders removal of a wall
- **THEN** the wall shows a countdown from 4.0 s until it disappears with the wall
