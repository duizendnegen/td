## ADDED Requirements

### Requirement: Per-origin flow fields

The system SHALL maintain one **inbound** field with the treasury tiles as sources, and one
**returning** field per declared spawn, with that spawn's tile as the field's sole source. Every
enemy SHALL be permanently associated, at the moment it spawns, with the spawn it entered play
from, and this origin SHALL be hashed simulation state. A returning enemy SHALL steer by its
origin spawn's returning field.

All fields SHALL be rebuilt whenever the blocked mask changes and SHALL be available for display
at all times. Because each returning field's source set is a single declared spawn, spawn
activation SHALL NOT change any field and SHALL NOT force a waypoint re-read.

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

## REMOVED Requirements

### Requirement: Dual flow fields

**Reason**: Nearest-active-spawn returning routing is replaced by per-origin routing — one
returning field per declared spawn instead of a single multi-source aggregate.
**Migration**: Covered by the ADDED requirement "Per-origin flow fields", which retains the
inbound field, the rebuild-on-mask-change rule, and the no-re-read-on-activation rule.
