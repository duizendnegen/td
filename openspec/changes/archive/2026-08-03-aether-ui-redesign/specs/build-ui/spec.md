# build-ui — delta for aether-ui-redesign

## ADDED Requirements

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

## MODIFIED Requirements

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
