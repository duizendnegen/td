# structure-placement — delta for add-energy-infrastructure

## MODIFIED Requirements

### Requirement: Structures are placed by command and charged to the treasury

The system SHALL support placing walls, towers, and solar panels, each on a 1×1 footprint, via
placement commands applied at tick boundaries. A confirmed wall or panel placement SHALL mark the
footprint tile blocked and deduct the structure's cost (defined in balance data) from the treasury
in the same tick. A confirmed tower placement SHALL stand the tower on the tile's foundation — its
wall or socket — and deduct the tower's cost in the same tick, without changing the blocked mask.

#### Scenario: Confirmed wall placement

- **WHEN** a valid wall placement command applies at a tick boundary
- **THEN** the target tile is blocked, the treasury is reduced by the wall cost, and both flow
  fields reflect the new mask that same tick

#### Scenario: Towers occupy a single tile

- **WHEN** a valid tower placement command applies to a tile holding a bare wall
- **THEN** exactly that tile carries the tower, the treasury is reduced by the tower's cost, and
  the wall line the tile belongs to is unchanged — the tower is a wall segment that shoots

#### Scenario: Confirmed panel placement

- **WHEN** a valid panel placement command applies at a tick boundary
- **THEN** the target tile is blocked, the treasury is reduced by the panel cost, both flow
  fields reflect the new mask that same tick, and the panel is provisional until a wave tick
  runs

### Requirement: Terrain kinds govern buildability

Placement SHALL respect the level's terrain palette: dirt tiles accept walls and panels, and
towers on walls; socket tiles are built-in foundations that accept towers directly and never walls
or panels; grass and rock tiles accept nothing. A tower placement on a foundation — wall or socket
— SHALL skip path and enemy validation entirely, since the tile is already blocked, and SHALL
validate only bounds, occupancy, and the spending gate.

A panel is a ground structure and only a ground structure: it goes on bare dirt, never on a wall
(the tile is occupied), and it is not a foundation — a tower placement targeting a panel SHALL be
rejected with the `needs-wall` verdict exactly as on bare dirt.

#### Scenario: Tower on a socket places without path checks

- **WHEN** a tower placement command targets an unoccupied socket tile with balance ≥ 0
- **THEN** the placement succeeds, the treasury is charged, and no flow-field rebuild occurs

#### Scenario: Wall on a socket is rejected

- **WHEN** a wall placement command targets a socket tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: Panel on a socket is rejected

- **WHEN** a panel placement command targets a socket tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: Scenery refuses everything

- **WHEN** any placement command targets a grass or rock tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: Dirt takes a tower only through a wall

- **WHEN** a tower placement command targets a bare dirt tile
- **THEN** the placement is rejected with the `needs-wall` verdict, and the same tile accepts the
  tower once a wall stands on it

#### Scenario: A panel is not a foundation

- **WHEN** a tower placement command targets a tile holding a panel
- **THEN** the placement is rejected with the `needs-wall` verdict and simulation state is
  unchanged

#### Scenario: A panel does not go on a wall, nor a wall on a panel

- **WHEN** a panel placement command targets a tile holding a wall, or a wall placement command
  targets a tile holding a panel
- **THEN** the placement is rejected as occupied

### Requirement: Structures move by command during the build phase, free of charge

The system SHALL support moving what stands on a tile to a new tile via a move command applied
at a tick boundary, during the build phase only. The unit of a move is the tile's stack: on dirt,
the ground structure — the wall together with any tower standing on it, or the panel; on a
socket, the tower. What lands depends on the destination:

- A destination that is bare dirt SHALL receive the ground structure — the wall and its tower
  together, or the panel — the origin tile is unblocked, the destination is blocked, and both
  flow fields reflect the new mask that same tick. A stack lifted from a socket has no ground
  structure and SHALL be rejected on bare dirt with the `needs-wall` verdict.
- A destination that is a *foundation* — a bare wall, or an empty socket — SHALL receive the
  tower alone: the origin wall (if any) stays where it is, and the blocked mask, both flow fields
  and every route are unchanged. A stack with no tower SHALL be rejected on such a destination.
- A destination holding a panel SHALL be rejected as occupied for every stack: a panel is not a
  foundation and nothing relocates onto it.

A move SHALL NOT change the treasury, and SHALL preserve every moved structure's identity: its
kind, archetype, level, total invested cost, and provisional flag carry over unchanged, so a later
removal refunds exactly what it would have refunded before the move, and starting a wave commits a
moved structure exactly as it commits an unmoved one.

A move command SHALL be rejected in every phase other than the build phase — during a wave, in
the settled-locked state, and after the run ends — including for provisional structures.

#### Scenario: A confirmed move reroutes in its tick

- **WHEN** a valid move command for a tile holding a wall and a tower targets bare dirt
- **THEN** in that same tick both stand on the destination, the origin tile is walkable, the
  destination tile is blocked, and both flow fields reflect the new mask

#### Scenario: A tower hops onto a neighbouring wall

- **WHEN** a valid move command for a tile holding a wall and a tower targets a tile holding a
  bare wall
- **THEN** in that same tick the tower stands on the destination wall, the origin wall still
  stands, both tiles remain blocked, and both flow fields are unchanged

#### Scenario: A socket tower hops to a wall or another socket

- **WHEN** a valid move command for a tower on a socket targets a bare wall or an empty socket
- **THEN** the tower stands on the destination, the origin socket is empty and still
  terrain-blocked, and both flow fields are unchanged

#### Scenario: Moving is free and preserves the refund basis

- **WHEN** a committed wall carrying a committed tower that cost 50 and received a 90-cost upgrade
  is moved to bare dirt, and both are later removed
- **THEN** the move changes the treasury by nothing, the tower's removal credits 50% of 140 and
  the wall's credits 50% of its cost — the same refunds an unmoved stack would return

#### Scenario: A provisional tower stays provisional across a move

- **WHEN** a provisional tower stands on a committed wall and the stack is moved to bare dirt
  before any wave starts
- **THEN** the tower is still provisional and the wall still committed after the move

#### Scenario: A wall moves like a tower

- **WHEN** a valid move command for a tile holding only a wall targets bare dirt during the build
  phase
- **THEN** in that same tick the wall stands on the destination, its origin tile is walkable, the
  destination is blocked, both flow fields reflect the new mask, and the treasury and the wall's
  refund basis are unchanged

#### Scenario: A panel moves like a wall

- **WHEN** a valid move command for a tile holding a panel targets bare dirt during the build
  phase
- **THEN** in that same tick the panel stands on the destination, its origin tile is walkable, the
  destination is blocked, both flow fields reflect the new mask, and the treasury, the panel's
  kind and its refund basis are unchanged

#### Scenario: Nothing lands on a panel

- **WHEN** a move command for a tile holding a wall and a tower, or for a tower on a socket,
  targets a tile holding a panel
- **THEN** the move is rejected as occupied

#### Scenario: No moves while a wave runs

- **WHEN** a move command applies while a wave is running, even for a provisional structure
- **THEN** the command is rejected

### Requirement: Towers stand on foundations and never own the mask

A tower SHALL be placeable only on a tile that already holds a bare wall (dirt) or on an empty
socket tile — a *foundation*. A tower placement on bare dirt or on a panel SHALL be rejected with a
distinct verdict (`needs-wall`); a tower placement on a tile whose foundation already carries a
tower SHALL be rejected as occupied. A wall and the tower standing on it SHALL be two structures on
the same tile, each with its own identity, its own total invested cost, and its own provisional
flag; the treasury SHALL be charged the tower's cost alone when mounting on an existing wall.

Because a foundation tile is already blocked — by the wall on dirt, by terrain on a socket — a
tower placement SHALL NOT change the blocked mask, SHALL run no path or enemy validation, and
SHALL cause no flow-field rebuild; it SHALL validate only bounds, the foundation rule, occupancy,
and the spending gate. Only ground structures — walls and panels, on dirt — block tiles: the
blocked mask SHALL be a function of terrain and standing ground structures alone.

Tower placement SHALL remain ungated by wave phase, so a tower may be mounted on a committed wall
while a wave is running; the tower is provisional as any placement is, and the wall's status is
untouched.

#### Scenario: Mounting on a wall charges the tower only and touches no field

- **WHEN** a valid tower placement command targets a tile holding a bare wall
- **THEN** the tower stands on that tile alongside the wall, the treasury is reduced by the
  tower's cost only, the blocked mask and both flow fields are unchanged, and no rebuild occurs

#### Scenario: Bare dirt needs a wall

- **WHEN** a tower placement command targets a dirt tile with no wall on it
- **THEN** the placement is rejected with the `needs-wall` verdict and simulation state is
  unchanged

#### Scenario: One tower per foundation

- **WHEN** a tower placement command targets a wall or socket that already carries a tower
- **THEN** the placement is rejected as occupied

#### Scenario: Wall and tower keep separate books

- **WHEN** a tower is mounted during a build phase on a wall that lived through an earlier wave
- **THEN** the tower is provisional and the wall is committed; removing the tower credits its full
  cost, and the wall's refund basis is unchanged

#### Scenario: Mounting mid-wave on a committed wall

- **WHEN** a tower placement command targets a committed wall while a wave is running
- **THEN** the placement is confirmed and charged as usual, the tower is provisional, and the wall
  remains committed

#### Scenario: A wall never accepts a second wall

- **WHEN** a wall placement command targets a tile holding a wall, with or without a tower on it
- **THEN** the placement is rejected as occupied
