# touch-input — delta for tower-drag-move

## ADDED Requirements

### Requirement: The move tool stages a pending move with confirm

On touch devices with the move tool armed during the build phase, a tap on a placed structure —
tower or wall — SHALL lift it into a pending move: the validated move ghost of that structure's
kind — tinted with the origin freed, exactly as the simulation would judge the move — anchors at
the tapped structure's tile together with the same confirm and cancel affordances placement uses.
Dragging the ghost or tapping another tile SHALL move the pending destination. Confirming SHALL
issue exactly one move command for the pending tile; cancelling or deselecting the tool SHALL
dismiss the ghost with no command and no state change. No move command SHALL ever be issued by
the initial tap alone.

The structure's own tile SHALL read as a legal pending destination — the ghost and the confirm
affordance read valid there — and confirming with the pending destination on the structure's own
tile SHALL put it down: the ghost and affordances are dismissed, no command is issued, and no
reject feedback plays.

A confirmed pending move SHALL run the same authoritative validation as any move command, and a
rejection at the applying tick SHALL produce the standard reject feedback with the structure
still standing at its origin.

The move tool SHALL count as an armed build tool for gesture routing: one-finger drags adjust
the pending ghost and two-finger gestures drive the camera, and with the move tool armed but
nothing lifted, a one-finger drag SHALL NOT pan the camera or lift a structure.

#### Scenario: Two-step move

- **WHEN** the player taps a tower with the move tool armed, drags the pending ghost to a valid
  tile, and activates the confirm affordance
- **THEN** exactly one move command is issued for that tile, applying at the next tick boundary

#### Scenario: A wall moves through the same pending flow

- **WHEN** the player taps a wall with the move tool armed, drags the pending wall ghost to a
  valid dirt tile, and activates the confirm affordance
- **THEN** exactly one move command is issued for that tile

#### Scenario: Adjustment before confirm is free

- **WHEN** the player taps a tower, drags the pending ghost across several tiles, taps another
  destination, then confirms
- **THEN** a single move command is issued for the final tile and the simulation state hash was
  unchanged until it applied

#### Scenario: Confirming on the origin puts the structure down

- **WHEN** the player taps a structure with the move tool armed and activates the confirm
  affordance while the pending ghost still sits on the structure's own tile
- **THEN** the ghost and affordances are dismissed, no command is issued, no reject feedback
  plays, and the structure reads as standing at its origin

#### Scenario: Cancel leaves no trace

- **WHEN** the player lifts a tower and then activates the cancel affordance
- **THEN** no command is issued, the tower reads as standing at its origin, and the simulation
  state hash is unchanged

#### Scenario: Camera stays reachable while moving

- **WHEN** a pending move is staged and the player drags with two fingers
- **THEN** the camera pans and the pending ghost stays anchored to its tile
