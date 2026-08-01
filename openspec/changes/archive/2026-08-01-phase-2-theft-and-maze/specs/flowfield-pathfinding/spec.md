# flowfield-pathfinding

## MODIFIED Requirements

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

### Requirement: Timed spawning and treasury despawn

Enemies SHALL spawn at active spawn tiles on a fixed tick interval and path inbound toward the
treasury. On reaching the treasury an enemy SHALL NOT despawn: it SHALL be handed to the theft
state machine (grab and flip to returning, per `theft-economy`), after which it steers by the
returning field. Despawning at the treasury was Phase-1 placeholder behavior and is removed.

#### Scenario: Spawn-to-treasury handoff

- **WHEN** the spawn interval elapses and the spawned enemy walks the maze to the treasury
- **THEN** the enemy is still alive at the treasury, flips to the returning state, and begins
  steering by the returning field
