# flowfield-pathfinding

## REMOVED Requirements

### Requirement: Timed spawning and treasury despawn

**Reason**: The fixed-interval debug timer this requirement described is retired — the wave
scheduler (spec: `wave-scheduling`) is now the only source of spawns in a real run.
**Migration**: Spawn emission is specified by `wave-scheduling` ("Wave groups schedule
deterministically"); the treasury handoff (never despawn, flip to returning) is fully specified
by `theft-economy` ("Treasury arrival flips an enemy to returning with a full-capacity grab").

## MODIFIED Requirements

### Requirement: Dual flow fields

The system SHALL maintain two flow fields over the level grid: an **inbound** field with the
treasury tiles as sources, and a **returning** field with all currently active spawn tiles as
simultaneous sources (yielding nearest-active-spawn routing without per-enemy target selection).
Both fields SHALL be rebuilt whenever the blocked mask changes **or the active spawn set
changes** and SHALL be available for display at all times. A spawn activation SHALL NOT force
an immediate waypoint re-read: no tile changed walkability, so enemies pick up the new field at
their next waypoint as usual.

#### Scenario: Inbound field reaches the treasury

- **WHEN** the inbound field is built on a level where a spawn can reach the treasury
- **THEN** following the field's directions tile-by-tile from that spawn arrives at the treasury

#### Scenario: Returning field routes to the nearest active spawn

- **WHEN** the returning field is built with multiple active spawns
- **THEN** each tile's cost equals the cheapest path cost to any active spawn

#### Scenario: Activation redraws the exits

- **WHEN** a second spawn activates at a wave start while a carrier is walking toward the first
- **THEN** the returning field is rebuilt with both spawns as sources that tick, and the carrier
  adopts the new routing at its next waypoint re-read
