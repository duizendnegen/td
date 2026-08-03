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

### Requirement: Pointer input maps to tile commands

A pointer position over the board SHALL resolve via ground raycast to a tile, and confirmed build
or removal clicks SHALL enter the simulation only as commands — the UI SHALL never mutate
simulation state directly.

#### Scenario: Click becomes a command

- **WHEN** the player clicks a tile with a palette item selected
- **THEN** a placement command for that tile is queued and applies at the next tick boundary

### Requirement: Ghost preview is driven by the authoritative validation

While a palette item is selected, a footprint ghost SHALL be shown — following the hovered tile
on pointer-hover devices, or anchored to the last tapped tile as a pending placement on touch —
tinted by the verdict of the same validation logic the simulation uses to accept placements,
evaluated speculatively. The verdict SHALL be re-evaluated when the ghost's tile changes or a
new tick's state arrives, regardless of how the ghost is positioned. Speculative evaluation
SHALL NOT change simulation state: hovering or holding a pending ghost never changes the state
hash.

#### Scenario: Preview agrees with validation

- **WHEN** the ghost occupies a footprint that the simulation would reject for any validation reason
- **THEN** the ghost is tinted invalid

#### Scenario: Enemy movement flips the verdict without input

- **WHEN** an enemy walks into the ghost's footprint while the pointer or pending ghost is stationary
- **THEN** the ghost flips to invalid on that tick without any input event

#### Scenario: Hovering is free of side effects

- **WHEN** the player hovers many candidate footprints without clicking while a replay of the same
  seed and commands runs without hovering
- **THEN** both runs produce identical state hashes

#### Scenario: A pending touch ghost is free of side effects

- **WHEN** a pending ghost sits on a tile across many ticks without being confirmed
- **THEN** the simulation state hash is identical to a run without the pending ghost

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

### Requirement: HUD layout adapts to form factor

The HUD SHALL present two layouts. On desktop-sized viewports: a top app bar containing the
treasury readout, the build palette as a left rail, and the tower inspector as a right panel.
Below the mobile breakpoint: a compact top bar with the treasury readout, the build palette as
a bottom menu, and the start-wave control prominently accessible. Both layouts SHALL expose the
same controls and states — no capability is desktop-only or mobile-only.

#### Scenario: Desktop layout

- **WHEN** the game runs in a desktop-sized viewport
- **THEN** the treasury readout is in a top bar, the build palette is a left rail, and selecting
  a tower opens the inspector as a right-side panel

#### Scenario: Mobile layout

- **WHEN** the game runs in a viewport below the mobile breakpoint
- **THEN** the treasury readout is in a compact top bar and the build palette is a bottom menu
  offering the same items and states as the desktop rail

### Requirement: Mobile inspector is a bottom sheet that swaps with the build menu

Below the mobile breakpoint, selecting a placed tower SHALL replace the bottom build menu with
an inspector bottom sheet showing the tower's archetype, level, condensed stats, and
touch-sized upgrade and remove actions with the same affordability, debt-warning, blocked,
countdown, and maxed states as the desktop inspector. Dismissing the sheet or deselecting the
tower SHALL restore the build menu. The sheet SHALL remain a compact bottom band: stats are
condensed to keep it within roughly the bottom third of the viewport, and it SHALL NOT expand
into a full-screen view that hides the board.

#### Scenario: Selection swaps the bottom zone

- **WHEN** the player taps a placed tower on a mobile-sized viewport
- **THEN** the build menu is replaced by the inspector sheet for that tower, and dismissing it
  brings the build menu back

#### Scenario: Sheet actions match desktop semantics

- **WHEN** the balance is below 0 and the inspector sheet is open
- **THEN** the sheet's upgrade action reads as blocked, exactly as the desktop inspector would

### Requirement: Wave progress bar

During an active wave the HUD SHALL display a segmented progress bar that fills as the wave
drains: progress SHALL be the fraction of the wave's total spawned-or-pending enemies that are
resolved (dead or escaped). The bar SHALL be empty at wave start, full at wave end, and hidden
outside active waves.

#### Scenario: Kills advance the bar

- **WHEN** a wave of 10 enemies has 4 dead and 1 escaped
- **THEN** the progress bar reads half full

#### Scenario: Hidden between waves

- **WHEN** the game is in the build phase
- **THEN** no wave progress bar is shown
