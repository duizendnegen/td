# flowfield-pathfinding

## Purpose

Grid pathfinding via dual multi-source flow fields that steer enemies from spawns to the treasury
(and, from Phase 2 on, back out), with corner-cutting made impossible by construction and every
result deterministic.

## Requirements

### Requirement: Dual flow fields

The system SHALL maintain two flow fields over the level grid: an **inbound** field with the
treasury tiles as sources, and a **returning** field with all currently active spawn tiles as
simultaneous sources (yielding nearest-active-spawn routing without per-enemy target selection).
Both fields SHALL be rebuilt whenever the blocked mask changes and SHALL be available for display
at all times.

#### Scenario: Inbound field reaches the treasury

- **WHEN** the inbound field is built on a level where a spawn can reach the treasury
- **THEN** following the field's directions tile-by-tile from that spawn arrives at the treasury

#### Scenario: Returning field routes to the nearest active spawn

- **WHEN** the returning field is built with multiple active spawns
- **THEN** each tile's cost equals the cheapest path cost to any active spawn

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

### Requirement: Waypoint-committed steering

An enemy SHALL steer toward one committed waypoint (a tile centre) at a time, moving at its fixed
speed in 1/1024-tile units per tick using the single permitted square-root normalisation. On
arriving within an epsilon of the waypoint it SHALL re-read the field at its current tile and
commit the next waypoint. The commitment SHALL NOT be revised between waypoints.

#### Scenario: Enemy follows the field through turns

- **WHEN** an enemy traverses a serpentine corridor
- **THEN** it visits a sequence of committed waypoints consistent with the field's directions and
  never enters a blocked tile

### Requirement: Timed spawning and treasury despawn

Enemies of the single Phase-1 type SHALL spawn at active spawn tiles on a fixed tick interval, path
inbound, and despawn upon reaching the treasury. (Theft and the returning walk are Phase-2
behavior; the returning field exists and is displayable but unused by enemies.)

#### Scenario: Spawn-to-treasury lifecycle

- **WHEN** the spawn interval elapses
- **THEN** a new enemy appears at the spawn tile, walks the maze inbound, and is removed from the
  simulation on reaching the treasury
