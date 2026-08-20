# build-ui — delta for build-over-walls

## ADDED Requirements

### Requirement: The tower ghost reads the foundation rule and lays the wall

With a tower tool armed, the ghost over a tile holding a bare wall SHALL read as a legal
placement — tinted valid or debt by the same authoritative validation as any placement, with the
archetype's range ring — and a click there SHALL issue one tower placement. The ghost over a wall
that already carries a tower SHALL read invalid.

Every build ghost SHALL carry the price of each structure it previews as a badge on that
structure's box: a tower ghost its tower's cost at the box's mid-height, a wall ghost its wall's
cost low on the box.

Over a dirt tile with no wall, the tool SHALL place the wall and the tower together: a click
SHALL issue exactly one tower placement that lays its wall, and the ghost SHALL preview it as two
structures — the full tower ghost with the wall ghost drawn inside its base, each with its own
price badge, tinted by the verdict of the wall placement it contains and by the sum of both costs
against the balance. Every ghost SHALL stand on the ground plane; no ghost is raised to indicate
what lies beneath it.

The palette's tower items and the desktop hint line SHALL state that towers stand on walls.

Selecting a stacked tile with no tool armed SHALL inspect the tower; the inspector's remove
control on a mounted tower SHALL remove the tower alone, leaving the wall standing.

#### Scenario: A wall invites the tower

- **WHEN** the player hovers a bare wall with a tower tool armed and balance ≥ the tower's cost
- **THEN** the ghost reads valid, shows the level-1 range ring centred on that tile and one price
  badge — the tower's — and a click issues one tower placement without a wall

#### Scenario: Bare dirt previews and places two

- **WHEN** the player hovers a dirt tile with no wall on it with a tower tool armed, where a wall
  would be a legal placement, and clicks
- **THEN** the ghost showed the tower ghost with the wall ghost inside it and two price badges —
  the tower's on the tower box, the wall's on the wall box — exactly one placement command is
  issued, and once it applies the tile holds a wall and the tower on it

#### Scenario: Bare dirt the wall rules refuse

- **WHEN** the player hovers a dirt tile with no wall where a wall would seal a spawn, with a
  tower tool armed
- **THEN** the ghost with its wall reads invalid, the ribbon shows the orphaned region as for a wall,
  and clicking there gives the ordinary reject feedback with no command issued

#### Scenario: Both costs tint the ghost

- **WHEN** the player hovers bare dirt with a tower tool armed and the balance covers the tower's
  cost but not the wall's and the tower's together
- **THEN** the ghost reads as the debt tint

#### Scenario: The rule is named in the interface

- **WHEN** the player views the palette or the desktop hint line
- **THEN** the tower items and the hint line state that towers are built on walls

#### Scenario: Inspecting and removing a mounted tower

- **WHEN** the player selects a tile holding a wall and a tower, then activates the inspector's
  remove control during the build phase
- **THEN** the inspector showed the tower, one removal command is issued, and once it applies the
  tower is gone while the wall stands

## MODIFIED Requirements

### Requirement: The armed move tool lifts, carries, and drops structures

With the move tool armed during the build phase, on pointer-hover devices, pressing on a tile that
holds structures SHALL lift that tile's stack — on dirt the wall together with any tower on it, on
a socket the tower. A move ghost SHALL follow the hovered tile: the tower's ghost with its range
ring when the stack holds a tower, otherwise the wall's ghost; tinted by the verdict of the same
validation the simulation uses to accept moves — evaluated speculatively with the origin freed for
a bare-dirt destination, and as a tower transfer for a foundation destination. Every structure in
the lifted stack SHALL read as lifted at its origin for the duration.

Dropping SHALL work both ways: releasing after a drag past a small slop attempts the move at the
release tile, and a sub-slop press-and-release (a click) keeps the stack lifted following the
hover until a second click attempts the move at that tile. A confirmed drop SHALL issue exactly
one move command. Deselecting the tool or pressing Esc SHALL cancel the lift with no command,
leaving every structure where it was. Pressing on an empty tile with the move tool armed and
nothing lifted SHALL do nothing.

The lifted stack's own tile SHALL read as a legal drop: the move ghost is tinted valid there, and
dropping on it — by drag release or by the second click — SHALL put the stack down where it
stands: the lift ends, no command is issued, no reject feedback plays, and the structures read as
standing at their origin. Putting a stack down this way is a cancel, not a move.

Speculative evaluation while carrying SHALL NOT change simulation state.

#### Scenario: Drag and drop moves the tower

- **WHEN** the player presses on a tile holding a wall and a tower with the move tool armed,
  drags past the slop, and releases over a bare dirt tile whose ghost shows valid
- **THEN** exactly one move command for that tile is queued, and once it applies both the wall
  and the tower stand there

#### Scenario: Dropping on a bare wall moves only the tower

- **WHEN** the player lifts a wall-and-tower stack and drops it on a bare wall whose ghost shows
  valid
- **THEN** exactly one move command is queued, and once it applies the tower stands on the
  destination wall while the origin wall still stands

#### Scenario: A wall lifts and drops like a tower

- **WHEN** the player presses on a bare wall with the move tool armed, drags past the slop, and
  releases over a dirt tile whose ghost shows valid
- **THEN** exactly one move command for that tile is queued, and the ghost that followed the drag
  was a wall ghost with no range ring

#### Scenario: Click to lift, click to drop

- **WHEN** the player clicks a mounted tower's tile with the move tool armed, moves the pointer,
  and clicks a tile whose ghost shows valid
- **THEN** exactly one move command for that tile is queued, and the tower ghost followed the
  hover between the two clicks

#### Scenario: Dropping back on the origin puts the structure down

- **WHEN** the player lifts a stack and drops it on its own tile — by releasing a drag over it or
  by a second click on it — while the ghost there reads valid
- **THEN** no command is issued, no reject feedback plays, the lift ends, and the structures read
  as standing at their origin with an unchanged simulation state hash

#### Scenario: Cancelling leaves no trace

- **WHEN** the player lifts a stack and then presses Esc or deselects the move tool
- **THEN** no command is issued, every structure reads as standing at its origin, and the
  simulation state hash is unchanged

#### Scenario: Carrying is free of side effects

- **WHEN** the player carries a lifted stack across many candidate tiles without dropping, while
  a replay of the same seed and commands runs without lifting anything
- **THEN** both runs produce identical state hashes
