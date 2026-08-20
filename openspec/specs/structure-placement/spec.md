# structure-placement

## Purpose

Player-built walls and towers as the maze's raw material: validated placement that can never seal
or strand, atomic rejection, and immediate between-waves removal — the mechanics that make mazing
expressive while keeping every path guarantee intact.

## Requirements

### Requirement: Structures are placed by command and charged to the treasury

The system SHALL support placing walls and towers, each on a 1×1 footprint, via placement
commands applied at tick boundaries. A confirmed placement SHALL mark the footprint tile blocked
and deduct the structure's cost (defined in balance data) from the treasury in the same tick.

#### Scenario: Confirmed wall placement

- **WHEN** a valid wall placement command applies at a tick boundary
- **THEN** the target tile is blocked, the treasury is reduced by the wall cost, and both flow
  fields reflect the new mask that same tick

#### Scenario: Towers occupy a single tile

- **WHEN** a valid tower placement command applies
- **THEN** exactly one tile is blocked and charged, and the tower slots into an existing wall
  line without displacing its neighbors

### Requirement: Placement validation rejects any structure that seals or strands

Before confirming a placement on navigable terrain the system SHALL verify, in simulation state
at the applying tick: the footprint is in bounds, every footprint tile is walkable and unoccupied
by a structure, no enemy's current tile is inside the footprint, **every spawn declared by the
level — active or dormant — retains a finite-cost path to the treasury**, every live inbound
enemy's current tile retains finite cost in the inbound field, and every live returning enemy's
current tile retains finite cost in **its origin spawn's** returning field. Failing any check
SHALL reject the placement.

#### Scenario: Sealing placement is rejected

- **WHEN** a placement would leave an active spawn with no path to the treasury
- **THEN** the placement is rejected

#### Scenario: Sealing a dormant spawn is rejected

- **WHEN** a placement would leave a not-yet-active spawn with no path to the treasury
- **THEN** the placement is rejected, so the no-sealing invariant already holds when the spawn
  activates mid-run

#### Scenario: Stranding placement is rejected

- **WHEN** a placement would leave every spawn connected but trap one live enemy in a pocket with
  no path to its current goal
- **THEN** the placement is rejected

#### Scenario: Cutting a carrier off from its own spawn is rejected

- **WHEN** a placement would leave a returning enemy with no path to its origin spawn, even
  though another active spawn remains reachable from the enemy's tile
- **THEN** the placement is rejected

#### Scenario: Enemy inside the footprint blocks placement

- **WHEN** an enemy's current tile lies inside the proposed footprint at the applying tick
- **THEN** the placement is rejected rather than displacing or entombing the enemy

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

A removal command SHALL take full effect in the tick it applies: the structure is dropped, its
footprint tiles are unblocked, the flow fields reflect the new mask that same tick, and its refund
is credited to the treasury. There SHALL be no removal countdown and no intermediate state in which
a structure is marked for removal but still standing.

The refund SHALL be 50% of the structure's total invested cost — base cost plus all upgrade costs
paid (removal refund fraction defined in balance data) — for committed structures, and 100% for
provisional structures.

Removal SHALL NOT be subject to path or enemy validation. Unblocking a tile can only lower path
costs, so no removal can seal a spawn or strand an enemy, and no structure's own tile can hold an
enemy.

A structure standing on a socket tile SHALL refund on removal without unblocking its tile — the
tile is terrain-blocked, not structure-blocked — and without changing the flow fields.

#### Scenario: Unblock and refund land in the command's tick

- **WHEN** a removal command for a committed 100-cost wall applies at a tick boundary
- **THEN** in that same tick the wall is gone, its tile is walkable, both flow fields reflect the
  new mask, and the treasury is credited 50 milli-gold-scaled cost units

#### Scenario: Upgrades are part of the refund base

- **WHEN** a committed tower that cost 50 and received a 90-cost upgrade is removed
- **THEN** the treasury is credited 50% of 140, not 50% of 50

#### Scenario: Socket removal refunds without unblocking the tile

- **WHEN** a tower on a socket tile is removed
- **THEN** the refund is credited, the structure is gone, the socket tile remains blocked, no flow
  field rebuild occurs, and the socket accepts a new tower

#### Scenario: A removal opens the route for live enemies

- **WHEN** a wall is removed while live enemies are steering around it between waves
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

Placement SHALL respect the level's terrain palette: dirt tiles accept walls and towers, socket
tiles accept towers only, and grass and rock tiles accept nothing. A placement on a socket tile
SHALL skip path and enemy validation entirely — the tile was never navigable, so the blocked
mask, the flow fields, and enemy routing are unaffected — and SHALL validate only bounds,
occupancy, and the spending gate.

#### Scenario: Tower on a socket places without path checks

- **WHEN** a tower placement command targets an unoccupied socket tile with balance ≥ 0
- **THEN** the placement succeeds, the treasury is charged, and no flow-field rebuild occurs

#### Scenario: Wall on a socket is rejected

- **WHEN** a wall placement command targets a socket tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: Scenery refuses everything

- **WHEN** any placement command targets a grass or rock tile
- **THEN** the placement is rejected as not-buildable

### Requirement: Structures move by command during the build phase, free of charge

The system SHALL support moving a placed structure — tower or wall — to a new tile via a move
command applied at a tick boundary, during the build phase only. A confirmed move SHALL take full
effect in its applying tick: the origin tile is unblocked (unless it is terrain-blocked socket
ground), the destination footprint is blocked (unless the destination is a socket), and both flow
fields reflect the new mask that same tick.

A move SHALL NOT change the treasury, and SHALL preserve the structure's identity: its kind,
archetype, level, total invested cost, and provisional flag carry over unchanged, so a later
removal refunds exactly what it would have refunded before the move, and starting a wave commits a
moved structure exactly as it commits an unmoved one.

A move command SHALL be rejected in every phase other than the build phase — during a wave, in
the settled-locked state, and after the run ends — including for provisional structures.

#### Scenario: A confirmed move reroutes in its tick

- **WHEN** a valid move command for a tower applies at a tick boundary
- **THEN** in that same tick the origin tile is walkable, the destination tile is blocked, and
  both flow fields reflect the new mask

#### Scenario: Moving is free and preserves the refund basis

- **WHEN** a committed tower that cost 50 and received a 90-cost upgrade is moved and later
  removed
- **THEN** the move changes the treasury by nothing, and the removal credits 50% of 140 — the
  same refund an unmoved tower would return

#### Scenario: A provisional tower stays provisional across a move

- **WHEN** a tower placed this build phase is moved before any wave starts
- **THEN** it is still provisional after the move, and removing it still refunds in full

#### Scenario: A wall moves like a tower

- **WHEN** a valid move command for a wall applies at a tick boundary during the build phase
- **THEN** in that same tick the wall stands on the destination, its origin tile is walkable, the
  destination is blocked, both flow fields reflect the new mask, and the treasury and the wall's
  refund basis are unchanged

#### Scenario: No moves while a wave runs

- **WHEN** a move command applies while a wave is running, even for a provisional structure
- **THEN** the command is rejected

### Requirement: Move validation evaluates the destination with the origin freed

Before confirming a move the system SHALL verify, in simulation state at the applying tick, the
same conditions placement validation verifies for the moving structure's kind — destination in
bounds, destination terrain accepts that kind (dirt takes walls and towers, socket tiles towers
only), destination unoccupied, no enemy's current tile inside the destination footprint, every
declared spawn retains a finite-cost path to the treasury, and every live enemy's current tile
retains finite cost in its matching field — with one difference: the path and enemy checks SHALL
be evaluated against the mask with the origin tile freed and the destination blocked, both applied
together. A destination equal to the structure's current tile SHALL be rejected — a same-tile
move is not a move, and the interaction layer treats such a drop as a cancel rather than issuing
it.

A move whose destination is a socket tile SHALL skip path and enemy validation for the
destination — the tile was never navigable — while the origin still frees; freeing a tile can
only lower path costs, so such a move can never seal or strand. A move off a socket tile SHALL
validate exactly as a placement at the destination would, the origin being terrain-blocked
either way.

#### Scenario: A tower slides along its own wall line

- **WHEN** a tower in a wall line moves one tile sideways into a gap that is only legal because
  its origin tile opens in the same evaluation
- **THEN** the move is confirmed

#### Scenario: The freed origin can carry the reroute

- **WHEN** a move's destination blocks the only current route, but the freed origin tile itself
  restores a finite-cost path for every spawn and enemy
- **THEN** the move is confirmed

#### Scenario: A sealing move is rejected

- **WHEN** a move's destination would leave any declared spawn — active or dormant — with no
  path to the treasury even with the origin freed
- **THEN** the move is rejected

#### Scenario: A stranding move is rejected

- **WHEN** a move would leave every spawn connected but trap one live enemy with no path to its
  current goal
- **THEN** the move is rejected

#### Scenario: Occupied and enemy-held destinations are rejected

- **WHEN** a move targets a tile holding another structure, or a tile an enemy currently stands
  on
- **THEN** the move is rejected

#### Scenario: Moving a tower onto a socket needs no path checks

- **WHEN** a tower on dirt moves to an unoccupied socket tile
- **THEN** the move is confirmed, the origin tile is walkable in both flow fields that tick, and
  no seal or strand rejection is possible

#### Scenario: A wall cannot move onto a socket

- **WHEN** a move command targets a socket tile with a wall as the moving structure
- **THEN** the move is rejected as not buildable, exactly as a wall placement on that tile would
  be

### Requirement: A rejected move leaves simulation state unchanged

A rejected move SHALL have no observable effect on simulation state: the structure stays at its
origin, no blocked-mask change, no flow-field change, no treasury change, and an unchanged state
hash relative to the same tick without the attempt.

#### Scenario: Move rejection is atomic

- **WHEN** a move command is rejected during validation
- **THEN** the post-tick state hash is identical to the hash the same tick produces when the
  command is never issued
