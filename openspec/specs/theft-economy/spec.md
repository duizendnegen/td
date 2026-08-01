# theft-economy

## Purpose

The treasury-as-health loop: enemies steal from one shared money pool, carry it back out through
the maze, and can drop, redistribute, or escape with it — making every gold piece something the
player can lose, spend, or claw back.

## Requirements

### Requirement: Treasury arrival flips an enemy to returning with a clamped grab

When an inbound enemy reaches the treasury it SHALL grab `min(carryCapacity, max(0, balance))`,
deduct that amount from the treasury, and flip to the returning state — unconditionally, including
when the grabbed amount is zero. Enemies SHALL never despawn at the treasury.

#### Scenario: Normal grab

- **WHEN** an enemy with carry capacity 50 reaches a treasury holding 200
- **THEN** the treasury drops to 150 and the enemy is returning, carrying 50

#### Scenario: Poor treasury grab is partial

- **WHEN** an enemy with carry capacity 50 reaches a treasury holding 20
- **THEN** the treasury drops to 0 and the enemy is returning, carrying 20

#### Scenario: Empty or negative treasury still flips

- **WHEN** an enemy reaches a treasury whose balance is 0 or negative
- **THEN** the balance is unchanged and the enemy flips to returning carrying nothing

### Requirement: Carriers are slower and visibly marked

An enemy carrying any gold SHALL move at 80% of its base speed and SHALL display a clearly
readable carried-gold indicator. An enemy carrying nothing SHALL move at full speed even
when returning.

#### Scenario: Loaded carrier slows down

- **WHEN** an enemy grabs gold at the treasury
- **THEN** its per-tick movement drops to 80% of its base speed and a gold indicator appears above
  it

#### Scenario: Empty-handed returner keeps full speed

- **WHEN** an enemy flips to returning with a zero grab
- **THEN** it moves at 100% of its base speed and shows no gold indicator

### Requirement: Escape through a spawn removes the enemy and its gold permanently

A returning enemy SHALL path toward the nearest active spawn, and on reaching one SHALL be removed
from the simulation together with any carried gold. Escaped gold SHALL NOT return by any later
mechanism.

#### Scenario: Gold escapes

- **WHEN** a carrier holding 50 reaches an active spawn tile
- **THEN** the enemy despawns and the 50 is gone from play — the treasury is not credited then or
  later

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
- **THEN** it flips to returning that tick and paths toward the nearest active spawn

### Requirement: Spending is gated at zero, not at cost

Spending (placements in this phase) SHALL be permitted whenever the balance is ≥ 0, even when the
cost exceeds the balance — a purchase MAY drive the balance negative. While the balance is below
0, all spending SHALL be blocked.

#### Scenario: Emergency build into debt

- **WHEN** the balance is 50 and the player places a 100-cost tower
- **THEN** the placement succeeds and the balance becomes −50

#### Scenario: No spending while negative

- **WHEN** the balance is −50 and the player attempts any placement
- **THEN** the placement is rejected with no state change
