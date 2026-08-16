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
the initial tap alone. The inspector sheet's move action SHALL stage this same pending move for
the inspected tower — the tool armed, the ghost anchored at the tower's tile — as if the tower
had been tapped with the tool armed; and because that action arms the tool for the one move only,
confirming (once the move applies, or as a put-down on the origin) or cancelling SHALL leave no
tool armed, where a tap-lifted move leaves the tool armed as before.

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

#### Scenario: The inspector sheet's move action stages the same pending move

- **WHEN** the player taps a tower with no tool armed and activates the inspector sheet's move
  action during the build phase
- **THEN** the sheet gives way to the build menu with the move tool armed, and the pending move
  ghost with its confirm and cancel affordances anchors at the tower's tile — exactly as a tap on
  the tower with the tool already armed would stage it — with no command issued

#### Scenario: The sheet's move disarms when it is done

- **WHEN** a pending move staged by the inspector sheet's move action is confirmed on a valid tile
  and applies, or is confirmed on the origin, or is cancelled
- **THEN** the ghost and affordances are dismissed and no tool reads armed, so the next tap on a
  structure inspects it

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
