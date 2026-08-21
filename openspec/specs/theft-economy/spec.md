# theft-economy

## Purpose

The treasury-as-health loop: enemies steal from one shared money pool, carry it back out through
the maze, and can drop, redistribute, or escape with it — making every gold piece something the
player can lose, spend, or claw back.

## Requirements

### Requirement: Treasury arrival flips an enemy to returning with a full-capacity grab

When an inbound enemy reaches the treasury it SHALL grab its full remaining carry capacity,
deduct that amount from the treasury — driving the balance negative when the treasury holds
less — and flip to the returning state unconditionally. Enemies SHALL never despawn at the
treasury.

#### Scenario: Normal grab

- **WHEN** an enemy with carry capacity 50 reaches a treasury holding 200
- **THEN** the treasury drops to 150 and the enemy is returning, carrying 50

#### Scenario: Poor treasury is overdrawn

- **WHEN** an enemy with carry capacity 50 reaches a treasury holding 20
- **THEN** the treasury drops to −30 and the enemy is returning, carrying 50

#### Scenario: A negative treasury still bleeds

- **WHEN** an enemy with carry capacity 60 reaches a treasury already at −50
- **THEN** the treasury drops to −110 and the enemy is returning, carrying 60

#### Scenario: Intercepting the carrier makes the raid recoverable

- **WHEN** a carrier whose grab drove the treasury negative is killed before escaping
- **THEN** its carried gold drops as a sack, and end-of-wave settlement returns any unclaimed
  remainder to the treasury

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

### Requirement: Interest accrues during waves on positive balance

While a wave is active and the treasury balance is positive, the treasury SHALL accrue interest
every tick at the level's authored rate, computed in integer milli-gold on the balance *after
that tick's grid bill has been deducted* (power-grid). No interest SHALL accrue during the build
phase, and none while the balance is zero or negative. Accrual is uncapped.

#### Scenario: Interest during a wave

- **WHEN** a wave is active and the balance is positive
- **THEN** each tick credits the integer interest on the current balance

#### Scenario: Interest is computed after the bill

- **WHEN** a wave tick bills grid supply and the balance is positive afterwards
- **THEN** that tick's interest is the rate applied to the post-bill balance

#### Scenario: No interest between waves

- **WHEN** the run sits in the untimed build phase with a positive balance
- **THEN** the balance does not change, however long the player waits

#### Scenario: No interest on debt

- **WHEN** a wave is active and the balance is negative
- **THEN** no interest accrues in either direction

### Requirement: Unclaimed sacks return to the treasury at settlement

When a wave's end-of-wave settlement runs, every gold sack still on the ground SHALL be
credited to the treasury in full and removed, in a deterministic order.

#### Scenario: Ground gold comes home

- **WHEN** a wave ends with sacks of 30 and 20 on the ground
- **THEN** settlement credits 50 to the treasury and removes both sacks
