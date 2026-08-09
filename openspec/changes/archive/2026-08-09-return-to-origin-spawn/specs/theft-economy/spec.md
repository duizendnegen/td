## MODIFIED Requirements

### Requirement: Escape through a spawn removes the enemy and its gold permanently

A returning enemy SHALL path toward its origin spawn — the spawn it entered play from — and on
reaching it SHALL be removed from the simulation together with any carried gold. Escaped gold
SHALL NOT return by any later mechanism. Because no route ever passes through a spawn tile that
is not its own, an enemy can only ever escape at its origin.

#### Scenario: Gold escapes

- **WHEN** a carrier holding 50 reaches its origin spawn tile
- **THEN** the enemy despawns and the 50 is gone from play — the treasury is not credited then or
  later

#### Scenario: A nearer foreign exit is ignored

- **WHEN** two spawns are active and a carrier's origin spawn is the farther of the two
- **THEN** the carrier walks the longer route and escapes at its origin, never at the nearer
  spawn

### Requirement: Gold sacks drop, persist, and are picked up in deterministic order

When a carrier dies, its carried gold SHALL become a sack on its current tile. Any enemy —
inbound or returning — whose current tile holds a sack SHALL pick up gold up to its remaining
carry capacity, depleting the sack; a sack reaching zero is removed. When multiple enemies are
eligible in the same tick, pickups SHALL resolve in enemy insertion order. An inbound enemy that
picks up any gold SHALL immediately flip to returning without visiting the treasury.

#### Scenario: A swarm splits a large sack

- **WHEN** a sack of 100 lies on a tile crossed by three enemies with remaining capacities
  40, 40, and 40 across successive ticks
- **THEN** the first two pick up 40 each, the third picks up 20, and the sack is removed

#### Scenario: Same-tick contention resolves by insertion order

- **WHEN** two enemies stand on a 30-gold sack's tile in the same tick with capacities 25 and 25
- **THEN** the earlier-inserted enemy picks up 25 and the later one picks up 5

#### Scenario: Pickup converts an inbound enemy

- **WHEN** an inbound enemy walks over a sack and picks up any amount
- **THEN** it flips to returning that tick and paths toward its origin spawn
