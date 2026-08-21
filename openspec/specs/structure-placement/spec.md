# structure-placement

## Purpose

Player-built walls and towers as the maze's raw material: validated placement that can never seal
or strand, atomic rejection, and immediate between-waves removal — the mechanics that make mazing
expressive while keeping every path guarantee intact.

## Requirements

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

### Requirement: Placement validation rejects any structure that seals or strands

Before confirming a wall placement on navigable terrain the system SHALL verify, in simulation
state at the applying tick: the footprint is in bounds, every footprint tile is walkable and
unoccupied by a structure, no enemy's current tile is inside the footprint, **every spawn declared
by the level — active or dormant — retains a finite-cost path to the treasury**, and every live
enemy's current tile retains finite cost in the field matching its state (inbound or returning).
Failing any check SHALL reject the placement. Tower placement SHALL run none of the path or enemy
checks — a tower stands on a foundation that already blocks its tile — and SHALL validate only
bounds, the foundation rule, occupancy, and the spending gate.

#### Scenario: Sealing placement is rejected

- **WHEN** a wall placement would leave an active spawn with no path to the treasury
- **THEN** the placement is rejected

#### Scenario: Sealing a dormant spawn is rejected

- **WHEN** a wall placement would leave a not-yet-active spawn with no path to the treasury
- **THEN** the placement is rejected, so the no-sealing invariant already holds when the spawn
  activates mid-run

#### Scenario: Stranding placement is rejected

- **WHEN** a wall placement would leave every spawn connected but trap one live enemy in a pocket
  with no path to its current goal
- **THEN** the placement is rejected

#### Scenario: Cutting a carrier off from its own spawn is rejected

- **WHEN** a wall placement would leave a returning enemy with no path to its origin spawn, even
  though another active spawn remains reachable from the enemy's tile
- **THEN** the placement is rejected

#### Scenario: Enemy inside the footprint blocks placement

- **WHEN** an enemy's current tile lies inside a proposed wall's footprint at the applying tick
- **THEN** the placement is rejected rather than displacing or entombing the enemy

#### Scenario: A tower cannot seal or strand

- **WHEN** a tower placement command targets a bare wall in a position where a fresh wall would
  seal a spawn
- **THEN** the placement is confirmed anyway — the tile was already blocked, so no route changes

### Requirement: Rejected placement leaves simulation state unchanged

A rejected placement SHALL have no observable effect on simulation state: no treasury charge, no
blocked-mask change, no flow-field change, and an unchanged state hash relative to the same tick
without the attempt.

#### Scenario: Rejection is atomic

- **WHEN** a placement command is rejected during validation
- **THEN** the post-tick state hash is identical to the hash the same tick produces when the
  command is never issued

### Requirement: Structures are provisional until they have lived through a wave tick

Every structure SHALL carry a provisional flag as hashed simulation state. A structure SHALL be
provisional from the tick it is placed until the simulation advances time while a wave is running;
that advance SHALL clear the flag on every standing structure before the wave's own step order runs
for that tick.

Because the flag is cleared only by time advancing under an active wave, a structure SHALL remain
provisional for the whole of a build phase however many ticks it spans, and SHALL remain provisional
for as long as the game is not advancing at all.

The flag SHALL be a pure function of the seed, the command stream, and the ticks advanced, so that
replays reproduce it.

#### Scenario: The build phase does not commit construction

- **WHEN** a structure is placed during the build phase and hundreds of ticks pass before the player
  starts a wave
- **THEN** the structure is still provisional immediately before the wave starts

#### Scenario: Starting a wave commits everything standing

- **WHEN** a wave starts and the simulation advances its first tick
- **THEN** every standing structure is no longer provisional

#### Scenario: Time not advancing does not commit

- **WHEN** a structure is placed while the game is not advancing, and commands continue to be
  committed without time advancing
- **THEN** the structure is still provisional

#### Scenario: Live play commits promptly

- **WHEN** a structure is placed while a wave is running and time is advancing
- **THEN** it is no longer provisional after the next tick

#### Scenario: Provisional state is deterministic

- **WHEN** two runs replay the same seed and commands
- **THEN** the same structures are provisional at every tick and both produce identical state hashes

### Requirement: Provisional structures refund in full

Removal of a provisional structure SHALL credit 100% of its total invested cost — base cost plus
every upgrade paid — rather than the removal refund fraction. Removal of a committed structure SHALL
be unchanged.

#### Scenario: Full refund on a provisional structure

- **WHEN** a wall costing 20 is placed during the build phase and removed before any wave starts
- **THEN** the treasury is credited 20, returning the balance to what it was before the placement

#### Scenario: Upgrades return with a provisional tower

- **WHEN** a tower is placed and upgraded during the same build phase, then removed before the wave
  starts
- **THEN** the treasury is credited the full base cost plus the full upgrade cost

#### Scenario: A committed structure still refunds half

- **WHEN** a structure that has lived through a wave tick is removed during a later build phase
- **THEN** the treasury is credited the removal refund fraction of its total invested cost, as
  before

### Requirement: Removal is immediate and refunds half the total invested

A removal command SHALL take full effect in the tick it applies: the targeted structure is
dropped, its tile is unblocked if the structure owned the mask there (a wall on dirt), the flow
fields reflect the new mask that same tick, and its refund is credited to the treasury. There
SHALL be no removal countdown and no intermediate state in which a structure is marked for removal
but still standing.

The refund SHALL be 50% of the structure's total invested cost — base cost plus all upgrade costs
paid (removal refund fraction defined in balance data) — for committed structures, and 100% for
provisional structures.

Removal SHALL NOT be subject to path or enemy validation. Unblocking a tile can only lower path
costs, so no removal can seal a spawn or strand an enemy, and no structure's own tile can hold an
enemy.

A tower's removal SHALL never unblock its tile — a wall or a socket holds it — and SHALL not
change the flow fields. A structure standing on a socket tile SHALL refund on removal without
unblocking its tile — the tile is terrain-blocked, not structure-blocked — and without changing
the flow fields.

#### Scenario: Unblock and refund land in the command's tick

- **WHEN** a removal command for a committed 100-cost bare wall applies at a tick boundary
- **THEN** in that same tick the wall is gone, its tile is walkable, both flow fields reflect the
  new mask, and the treasury is credited 50 milli-gold-scaled cost units

#### Scenario: Upgrades are part of the refund base

- **WHEN** a committed tower that cost 50 and received a 90-cost upgrade is removed
- **THEN** the treasury is credited 50% of 140, not 50% of 50, and the wall beneath it stands
  with its own refund basis intact

#### Scenario: Socket removal refunds without unblocking the tile

- **WHEN** a tower on a socket tile is removed
- **THEN** the refund is credited, the structure is gone, the socket tile remains blocked, no flow
  field rebuild occurs, and the socket accepts a new tower

#### Scenario: A removal opens the route for live enemies

- **WHEN** a bare wall is removed while live enemies are steering around it between waves
- **THEN** the tile is walkable and back in both flow fields in that same tick, and each enemy
  routes through it from its next waypoint re-evaluation onward — its current one-tile commitment
  still stands, because unblocking a tile can never invalidate a committed waypoint

### Requirement: Removal is refused while a wave is running

A removal command targeting a **committed** structure SHALL be rejected while a wave is running, so
a player cannot open and close an established maze during a wave. A rejected removal SHALL leave
simulation state unchanged: no refund, no blocked-mask change, no flow-field change, and an
unchanged state hash relative to the same tick without the attempt.

A removal command targeting a **provisional** structure SHALL be permitted in every live phase,
including while a wave is running. Such a structure has not existed for a single advanced tick of
that wave, so unwinding it cannot alter the maze the wave began against.

Removal SHALL remain available for all structures in every other live phase — the build phase
between waves and the locked state after the final wave — so liquidation is always the way back to
solvency.

Placement SHALL NOT be gated by wave phase: building mid-wave remains legitimate.

#### Scenario: Mid-wave removal of committed construction is rejected

- **WHEN** a removal command targeting a structure that has lived through a wave tick applies while
  a wave is running
- **THEN** the structure still stands, the treasury is unchanged, and the post-tick state hash
  equals the hash the same tick produces without the attempt

#### Scenario: Unwinding a provisional structure during a wave

- **WHEN** a structure is placed while a wave is running but time is not advancing, and a removal
  command for it is committed before time advances
- **THEN** the removal succeeds, the full amount is credited, its tile is unblocked, and both flow
  fields reflect the new mask

#### Scenario: The window closes when time advances

- **WHEN** a structure is placed during a wave and time then advances
- **THEN** a subsequent removal command for it is rejected while that wave is still running

#### Scenario: Removal works between waves

- **WHEN** the same removal command applies during the build phase
- **THEN** the structure is removed and refunded in that tick

#### Scenario: Building mid-wave is still allowed

- **WHEN** a valid placement command applies while a wave is running
- **THEN** the placement is confirmed and charged as usual

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

### Requirement: Move validation evaluates the destination with the origin freed

Before confirming a move the system SHALL determine what would land from the destination, then
verify, in simulation state at the applying tick:

- For a stack move onto bare dirt — the same conditions wall placement verifies: destination in
  bounds, destination is dirt, destination unoccupied, no enemy's current tile inside the
  destination footprint, every declared spawn retains a finite-cost path to the treasury, and every
  live enemy's current tile retains finite cost in its matching field — with the path and enemy
  checks evaluated against the mask with the origin tile freed and the destination blocked, both
  applied together.
- For a tower transfer onto a foundation — bounds, that the destination foundation carries no
  tower, and that the lifted stack contains a tower. No path or enemy check applies: neither tile
  changes walkability.

A destination equal to the stack's current tile SHALL be rejected — a same-tile move is not a
move, and the interaction layer treats such a drop as a cancel rather than issuing it. A move whose
lifted stack has no tower SHALL be rejected as occupied on a bare wall and as not buildable on a
socket, exactly as a wall placement there would be.

#### Scenario: A tower slides along its own wall line

- **WHEN** a wall carrying a tower moves one tile sideways into a dirt gap that is only legal
  because its origin tile opens in the same evaluation
- **THEN** the move is confirmed

#### Scenario: The freed origin can carry the reroute

- **WHEN** a stack move's destination blocks the only current route, but the freed origin tile
  itself restores a finite-cost path for every spawn and enemy
- **THEN** the move is confirmed

#### Scenario: A sealing move is rejected

- **WHEN** a stack move's destination would leave any declared spawn — active or dormant — with
  no path to the treasury even with the origin freed
- **THEN** the move is rejected

#### Scenario: A stranding move is rejected

- **WHEN** a stack move would leave every spawn connected but trap one live enemy with no path to
  its current goal
- **THEN** the move is rejected

#### Scenario: Occupied and enemy-held destinations are rejected

- **WHEN** a move targets a tile whose foundation already carries a tower, or a bare dirt tile an
  enemy currently stands on
- **THEN** the move is rejected

#### Scenario: Moving a tower onto a socket needs no path checks

- **WHEN** a wall carrying a tower moves onto an empty socket, or onto a bare wall whose position
  would seal a spawn if it were a fresh wall placement
- **THEN** the move is confirmed — only the tower transfers and no tile changes walkability

#### Scenario: A wall cannot move onto a socket

- **WHEN** a move command for a tile holding only a wall targets a socket tile
- **THEN** the move is rejected as not buildable, exactly as a wall placement on that tile would
  be

#### Scenario: A socket tower cannot land on bare dirt

- **WHEN** a move command for a tower on a socket targets a bare dirt tile
- **THEN** the move is rejected with the `needs-wall` verdict

### Requirement: A rejected move leaves simulation state unchanged

A rejected move SHALL have no observable effect on simulation state: the structure stays at its
origin, no blocked-mask change, no flow-field change, no treasury change, and an unchanged state
hash relative to the same tick without the attempt.

#### Scenario: Move rejection is atomic

- **WHEN** a move command is rejected during validation
- **THEN** the post-tick state hash is identical to the hash the same tick produces when the
  command is never issued

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

### Requirement: A tower placement may lay its own wall

A tower placement command MAY ask for its wall (`withWall`): the command SHALL then place a wall
on the target tile and the tower on that wall, in that order, as two structures with their own
identity, invested cost and provisional flag. Such a placement SHALL be validated exactly as the
wall placement it contains — terrain, occupancy (a tile already holding a wall is occupied),
enemy in footprint, spawn reachability and stranding — and SHALL be gated on both purchases: the
wall at the current balance and the tower at the balance the wall leaves. It SHALL be atomic:
on rejection neither structure is placed, the mask and fields are untouched and the balance is
unchanged; on acceptance the resulting state SHALL be identical to that of a wall placement
command followed by a tower placement command on the same tile. A tower placement without
`withWall` on bare dirt SHALL still be rejected with `needs-wall`.

#### Scenario: One command lands the wall and the tower

- **WHEN** a tower placement with `withWall` targets a bare dirt tile where a wall would be valid
- **THEN** a wall and a tower stand on that tile, the treasury is reduced by the wall's cost plus
  the tower's cost, the tile is blocked and the flow fields rebuilt once, and the state hash
  equals that of a wall command followed by a tower command on the same tile

#### Scenario: The wall's rules decide

- **WHEN** a tower placement with `withWall` targets a tile where a wall would seal a spawn, is
  occupied by a wall, or holds an enemy
- **THEN** it is rejected with the wall placement's verdict and simulation state is unchanged

#### Scenario: Both purchases are gated

- **WHEN** the balance is at or above zero but below the wall's cost, and a tower placement with
  `withWall` is issued
- **THEN** it is rejected as unaffordable, with no wall placed and the balance unchanged — even
  though a wall alone would have been permitted

### Requirement: Removal peels a stacked tile top-down

A removal command targeting a tile that holds both a wall and a tower SHALL apply to the tower;
the wall SHALL become the removal target only once the tile holds no tower. Each removal SHALL be
judged by the removal gate for the structure it actually targets. Removing a tower SHALL credit
the tower's refund, leave the wall standing, and SHALL NOT unblock the tile or rebuild the flow
fields — the wall still owns the tile. Removing a bare wall SHALL unblock its tile as before.

#### Scenario: The tower comes off first

- **WHEN** a removal command applies to a tile holding a wall and a tower during the build phase
- **THEN** the tower is gone and its refund credited, the wall stands, the tile is still blocked,
  and both flow fields are unchanged

#### Scenario: Then the wall

- **WHEN** a second removal command applies to that tile once it holds only the wall
- **THEN** the wall is gone and refunded, the tile is walkable, and both flow fields reflect the
  new mask that same tick

#### Scenario: Unmounting mid-wave leaves the maze intact

- **WHEN** a provisional tower stands on a committed wall while a wave is running, and a removal
  command targets that tile
- **THEN** the tower is removed with a full refund and the committed wall stands, so the blocked
  mask is unchanged

#### Scenario: A committed tower shields nothing

- **WHEN** a committed tower stands on a wall while a wave is running, and a removal command
  targets that tile
- **THEN** the removal is rejected — the tower is the target and a wave gates it — and the wall
  is not touched either
