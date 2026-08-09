# touch-input — delta for tower-drag-move

## ADDED Requirements

### Requirement: The move tool stages a pending move with confirm

On touch devices with the move tool armed during the build phase, a tap on a placed tower SHALL
lift it into a pending move: the validated move ghost — tinted with the origin freed, exactly as
the simulation would judge the move — anchors at the tapped tower's tile together with the same
confirm and cancel affordances placement uses. Dragging the ghost or tapping another tile SHALL
move the pending destination. Confirming SHALL issue exactly one move command for the pending
tile; cancelling or deselecting the tool SHALL dismiss the ghost with no command and no state
change. No move command SHALL ever be issued by the initial tap alone.

A confirmed pending move SHALL run the same authoritative validation as any move command, and a
rejection at the applying tick SHALL produce the standard reject feedback with the tower still
standing at its origin.

The move tool SHALL count as an armed build tool for gesture routing: one-finger drags adjust
the pending ghost and two-finger gestures drive the camera, and with the move tool armed but
nothing lifted, a one-finger drag SHALL NOT pan the camera or lift a tower.

#### Scenario: Two-step move

- **WHEN** the player taps a tower with the move tool armed, drags the pending ghost to a valid
  tile, and activates the confirm affordance
- **THEN** exactly one move command is issued for that tile, applying at the next tick boundary

#### Scenario: Adjustment before confirm is free

- **WHEN** the player taps a tower, drags the pending ghost across several tiles, taps another
  destination, then confirms
- **THEN** a single move command is issued for the final tile and the simulation state hash was
  unchanged until it applied

#### Scenario: Cancel leaves no trace

- **WHEN** the player lifts a tower and then activates the cancel affordance
- **THEN** no command is issued, the tower reads as standing at its origin, and the simulation
  state hash is unchanged

#### Scenario: Camera stays reachable while moving

- **WHEN** a pending move is staged and the player drags with two fingers
- **THEN** the camera pans and the pending ghost stays anchored to its tile
