# theft-economy

## REMOVED Requirements

### Requirement: Treasury arrival flips an enemy to returning with a clamped grab

**Reason**: The bankruptcy redesign (exploration 2026-08-01) requires theft to overdraw the
treasury — the zero clamp made the death spiral unreachable and contradicted README's "going
negative via theft is survivable."
**Migration**: Replaced by "Treasury arrival flips an enemy to returning with a full-capacity
grab" below; the unconditional flip and never-despawn behavior carry over unchanged.

## ADDED Requirements

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

### Requirement: Interest accrues during waves on positive balance

While a wave is active and the treasury balance is positive, the treasury SHALL accrue interest
every tick at the level's authored rate, computed in integer milli-gold. No interest SHALL
accrue during the build phase, and none while the balance is zero or negative. Accrual is
uncapped.

#### Scenario: Interest during a wave

- **WHEN** a wave is active and the balance is positive
- **THEN** each tick credits the integer interest on the current balance

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
