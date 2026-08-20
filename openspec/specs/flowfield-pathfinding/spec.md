# flowfield-pathfinding

## Purpose

Grid pathfinding via flow fields — one inbound field plus one returning field per declared spawn —
that steer enemies from spawns to the treasury and back out to the spawn each entered from, with
corner-cutting made impossible by construction and every result deterministic.

## Requirements

### Requirement: Per-origin flow fields

The system SHALL maintain one **inbound** field with the treasury tiles as sources, and one
**returning** field per declared spawn, with that spawn's tile as the field's sole source. Every
enemy SHALL be permanently associated, at the moment it spawns, with the spawn it entered play
from, and this origin SHALL be hashed simulation state. A returning enemy SHALL steer by its
origin spawn's returning field.

All fields SHALL be rebuilt whenever the blocked mask changes and SHALL be available for display
at all times. Because each returning field's source set is a single declared spawn, spawn
activation SHALL NOT change any field and SHALL NOT force a waypoint re-read.

#### Scenario: Inbound field reaches the treasury

- **WHEN** the inbound field is built on a level where a spawn can reach the treasury
- **THEN** following the field's directions tile-by-tile from that spawn arrives at the treasury

#### Scenario: Carrier returns to its origin, not the nearest exit

- **WHEN** two spawns are active, and an enemy that entered from the farther spawn flips to
  returning at the treasury while the other spawn is cheaper to reach
- **THEN** it follows its origin spawn's field and exits at the spawn it entered from

#### Scenario: Each returning field costs toward its own spawn

- **WHEN** a returning field is built for one declared spawn
- **THEN** each tile's cost equals the cheapest path cost to that spawn alone, regardless of any
  other spawn

#### Scenario: Activation changes nothing about routing

- **WHEN** a second spawn activates at a wave start while a carrier is walking home
- **THEN** no existing field changes, the carrier's routing is unaffected, and no waypoint
  re-read is forced

### Requirement: Spawn tiles are endpoints, not corridors

No field SHALL route through any declared spawn tile — dormant included — as an intermediate
step: a spawn tile MAY receive a finite cost and direction, so that an enemy standing on it can
step off, but no route followed from any other tile SHALL enter a spawn tile that is not that
field's own source.

#### Scenario: Inbound routing skirts a spawn tile

- **WHEN** the geometrically cheapest route from a tile to the treasury passes over a declared
  spawn tile
- **THEN** the inbound field routes around that spawn tile instead

#### Scenario: An enemy can step off its own spawn

- **WHEN** an enemy spawns on its spawn tile
- **THEN** the inbound field gives that tile a finite cost and a direction leading off it

#### Scenario: A foreign spawn tile is never entered

- **WHEN** a returning enemy's route home passes near another declared spawn's tile
- **THEN** the route never enters that tile, so the enemy can never stand on a spawn that is not
  its own

### Requirement: 8-connected movement with integer costs

Fields SHALL be 8-connected with integer step costs of 1024 for orthogonal and 1448 for diagonal
moves. Field construction SHALL be fully deterministic: the same blocked mask always produces the
same directions and costs.

#### Scenario: Costs are monotonic toward the source

- **WHEN** a field is built
- **THEN** every walkable non-source tile's cost equals its pointed-to neighbour's cost plus the
  step cost of that move

### Requirement: Corner-cutting is impossible by construction

A diagonal edge between two tiles SHALL only exist in a field if **both** orthogonally adjacent
tiles between them are walkable. Enemies SHALL therefore be unable to express a move that clips a
blocked corner, because no field ever points that way.

#### Scenario: Diagonal between two blocked tiles is never produced

- **WHEN** two blocked tiles meet corner-to-corner
- **THEN** no tile's field direction points diagonally through that corner, and no enemy path
  crosses it

### Requirement: Unreachable tiles are marked

Tiles from which no path to the field's sources exists SHALL be explicitly marked unreachable and
distinguishable from any finite cost.

#### Scenario: Walled-off tile

- **WHEN** a walkable tile is fully enclosed by blocked tiles
- **THEN** the field marks it unreachable rather than assigning a cost

### Requirement: A field is traceable into an ordered tile sequence

Given a flow field and a start tile, the system SHALL produce the ordered sequence of tiles a
follower of that field would visit from the start tile. The trace SHALL terminate at the field's
source, SHALL terminate immediately at an unreachable tile, and SHALL terminate for any field and
any start tile without unbounded iteration.

#### Scenario: Trace from a spawn arrives at the treasury

- **WHEN** the inbound field is traced from a spawn tile that can reach the treasury
- **THEN** the sequence starts at that spawn, ends at the treasury, and each consecutive pair
  matches that tile's field direction

#### Scenario: Trace from an unreachable tile yields no route

- **WHEN** a field is traced from a walkable tile the field marks unreachable
- **THEN** the sequence contains no route onward from that tile

#### Scenario: Trace from a source is empty of steps

- **WHEN** a field is traced from one of its own source tiles
- **THEN** the sequence is that tile alone

#### Scenario: Tracing always terminates

- **WHEN** a field is traced from every tile of a board
- **THEN** every trace terminates

### Requirement: Speculative routes are obtainable without aliasing live field state

The routing that would result from a candidate placement SHALL be obtainable together with that
placement's validation verdict, as data whose validity does not depend on subsequent simulation
activity. A caller holding previously obtained speculative routing SHALL NOT observe it change
when another placement is evaluated or when a placement is confirmed.

#### Scenario: A later evaluation does not rewrite an earlier result

- **WHEN** speculative routing is obtained for one candidate tile and then obtained for a different
  candidate tile
- **THEN** the first result still describes the first tile's placement

#### Scenario: Confirming a placement does not rewrite a held result

- **WHEN** speculative routing is obtained for a candidate tile and that placement is then
  confirmed
- **THEN** the previously obtained result is unchanged by the confirmation

### Requirement: Waypoint-committed steering

An enemy SHALL steer toward one committed waypoint (a tile centre) at a time, moving at its fixed
speed in 1/1024-tile units per tick using the single permitted square-root normalisation. On
arriving within an epsilon of the waypoint it SHALL re-read the field at its current tile and
commit the next waypoint. The commitment SHALL NOT be revised between waypoints, with one
exception: when a blocked-mask change invalidates the committed move — the waypoint tile itself is
now blocked, or the committed move is diagonal and either of its flanking orthogonal tiles is now
blocked — the enemy SHALL re-read the rebuilt field at its current tile and commit a new waypoint
in the same tick as the mask change, before any movement that tick.

#### Scenario: Enemy follows the field through turns

- **WHEN** an enemy traverses a serpentine corridor
- **THEN** it visits a sequence of committed waypoints consistent with the field's directions and
  never enters a blocked tile

#### Scenario: Wall on the committed waypoint forces an immediate re-read

- **WHEN** a wall is confirmed on the tile an enemy has committed to as its waypoint
- **THEN** that enemy commits a new waypoint from the rebuilt field in the same tick and never
  enters the walled tile

#### Scenario: Blocking a diagonal's flank forces an immediate re-read

- **WHEN** an enemy is mid-way through a committed diagonal move and a wall is confirmed on one of
  the two orthogonal tiles flanking that diagonal
- **THEN** the enemy re-commits from the rebuilt field in the same tick and its path never clips
  the new wall's corner
