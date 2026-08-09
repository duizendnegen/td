# build-ui — delta for tower-drag-move

## ADDED Requirements

### Requirement: The palette offers a move tool gated to the build phase

The palette SHALL offer a move tool as an armed mode alongside the remove tool, with the same
selection, deselection, and keyboard-shortcut treatment as other palette items. The move tool
SHALL read as unavailable outside the build phase — while a wave is running and in the
settled-locked state — in the same visual language as any other blocked palette item, without
reason text. While unavailable, activating it or pressing on towers with it armed SHALL issue no
command. A move tool armed when a wave starts SHALL read unavailable for the duration and
usable again when the build phase resumes.

Arming the move tool SHALL NOT by itself change simulation state or issue any command.

#### Scenario: The move tool arms like any other mode

- **WHEN** the player selects the move tool during the build phase
- **THEN** it reads as the armed tool, and any previously armed tool or selection is released

#### Scenario: A wave blocks the move tool

- **WHEN** a wave is running
- **THEN** the move tool reads as unavailable, and activating it or pressing on a tower with it
  armed issues no command

### Requirement: The armed move tool lifts, carries, and drops towers

With the move tool armed during the build phase, on pointer-hover devices, pressing on a placed
tower SHALL lift it: a move ghost for that tower SHALL follow the hovered tile, tinted by the
verdict of the same validation the simulation uses to accept moves — evaluated speculatively
with the tower's origin freed — and showing the tower's range ring at the candidate tile. The
lifted tower SHALL read as lifted at its origin for the duration.

Dropping SHALL work both ways: releasing after a drag past a small slop attempts the move at the
release tile, and a sub-slop press-and-release (a click) keeps the tower lifted following the
hover until a second click attempts the move at that tile. A confirmed drop SHALL issue exactly
one move command. Deselecting the tool or pressing Esc SHALL cancel the lift with no command,
leaving the tower where it was. Pressing on a wall or empty tile with the move tool armed and
nothing lifted SHALL do nothing.

Speculative evaluation while carrying SHALL NOT change simulation state.

#### Scenario: Drag and drop moves the tower

- **WHEN** the player presses on a tower with the move tool armed, drags past the slop, and
  releases over a tile whose ghost shows valid
- **THEN** exactly one move command for that tile is queued and applies at the next tick
  boundary

#### Scenario: Click to lift, click to drop

- **WHEN** the player clicks a tower with the move tool armed, moves the pointer, and clicks a
  tile whose ghost shows valid
- **THEN** exactly one move command for that tile is queued, and the ghost followed the hover
  between the two clicks

#### Scenario: Cancelling leaves no trace

- **WHEN** the player lifts a tower and then presses Esc or deselects the move tool
- **THEN** no command is issued, the tower reads as standing at its origin, and the simulation
  state hash is unchanged

#### Scenario: Carrying is free of side effects

- **WHEN** the player carries a lifted tower across many candidate tiles without dropping,
  while a replay of the same seed and commands runs without lifting anything
- **THEN** both runs produce identical state hashes

### Requirement: Every failed drop gets the same reject feedback

A drop that does not result in a confirmed move — whether the ghost already showed invalid, or
the ghost showed valid and the authoritative validation rejected at the applying tick — SHALL
produce the same reject feedback placements use: a brief red flash on the attempted tile, no
state change, no queued retry, and the tower still standing at its origin. After a failed drop
the tower SHALL remain lifted, so the player can try another tile without re-lifting.

#### Scenario: Dropping on an invalid tile flashes and keeps carrying

- **WHEN** the player drops a lifted tower on a tile whose ghost shows invalid
- **THEN** the red-flash feedback plays on that tile, no command takes effect, and the ghost
  still follows the pointer

#### Scenario: Stale green loses the race

- **WHEN** the ghost shows valid at the drop, and an enemy enters the destination before the
  command's applying tick
- **THEN** the move is rejected, the destination flashes red, and the tower still stands at its
  origin
