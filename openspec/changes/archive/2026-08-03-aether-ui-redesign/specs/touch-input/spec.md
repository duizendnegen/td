# touch-input — delta for aether-ui-redesign

## Purpose

Touch-first interaction with the board: tap-preview-confirm placement that makes building safe
on small screens, tap selection, and gesture routing that keeps building and camera control
from fighting over the same fingers.

## ADDED Requirements

### Requirement: Tap places a pending ghost, confirm commits

On touch devices, with a build tool selected, a tap on a buildable tile SHALL anchor the
validated footprint ghost there as a pending placement together with confirm and cancel
affordances. Dragging the ghost or tapping another tile SHALL move the pending placement.
Confirming SHALL issue the same placement command a desktop click would; cancelling or
deselecting the tool SHALL dismiss the ghost with no state change. No placement command SHALL
ever be issued by the initial tap alone.

#### Scenario: Two-step placement

- **WHEN** the player taps a tile with the wall tool selected, then activates the confirm
  affordance
- **THEN** exactly one placement command is issued for that tile, applying at the next tick
  boundary

#### Scenario: Adjustment before confirm is free

- **WHEN** the player taps tile A, drags the pending ghost to tile B, then confirms
- **THEN** a single placement command is issued for tile B and the treasury was never charged
  for tile A

#### Scenario: Cancel leaves no trace

- **WHEN** the player taps a tile and then activates the cancel affordance
- **THEN** no command is issued and the simulation state hash is unchanged

### Requirement: Confirm is subject to the authoritative validation

A confirmed pending placement SHALL run the same authoritative validation as any placement
command, and a rejection at the applying tick SHALL produce the standard reject feedback (red
flash on the footprint, no charge, no state change, no retry). The confirm affordance SHALL
reflect the ghost's current verdict, and confirming while the verdict shows invalid SHALL
behave exactly like a desktop click on an invalid ghost.

#### Scenario: Stale-valid confirm loses the race

- **WHEN** the ghost shows valid, the player confirms, and an enemy enters the footprint before
  the command's applying tick
- **THEN** the placement is rejected with the standard red-flash feedback and no charge

### Requirement: Tap selects and deselects placed structures

On touch devices with no build tool selected, a tap on a placed structure SHALL select it and
open the inspector; a tap on empty board or the inspector's dismiss affordance SHALL deselect.
Selection SHALL be read-only: it never issues commands by itself.

#### Scenario: Tap to inspect

- **WHEN** the player taps a placed tower with no build tool active
- **THEN** the tower is selected, its range ring shows, and the inspector opens

### Requirement: Gesture routing separates building from camera control

While a build tool is selected, a one-finger drag SHALL adjust the pending ghost and two-finger
gestures SHALL drive the camera. With no build tool selected, one-finger drag SHALL pan and
pinch SHALL zoom. A gesture recognized as camera control SHALL never place, move, or confirm a
ghost, and a build gesture SHALL never move the camera.

#### Scenario: Two-finger pan while building

- **WHEN** the wall tool is selected with a pending ghost placed and the player drags with two
  fingers
- **THEN** the camera pans, and the pending ghost stays anchored to its tile

### Requirement: Portrait shows a rotate prompt

The game SHALL be designed for landscape on touch devices. In portrait orientation it SHALL
show a rotate-device prompt overlaying the game; rotating to landscape SHALL dismiss the prompt
and resume interaction with no loss of state.

#### Scenario: Rotation round-trip is lossless

- **WHEN** the player rotates to portrait mid-wave and back to landscape
- **THEN** the prompt appears and disappears, and the run continues unaffected

### Requirement: Desktop pointer interaction is unchanged

On devices with pointer hover, the existing model SHALL remain: hover drives the ghost and a
click commits immediately, with no confirm step. The touch and pointer paths SHALL share the
same validation and command emission.

#### Scenario: Desktop stays one-click

- **WHEN** a player with a mouse clicks a valid hovered footprint
- **THEN** the placement command is issued immediately with no confirm affordance shown
