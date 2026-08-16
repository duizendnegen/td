# theft-economy — delta for add-energy-infrastructure

## MODIFIED Requirements

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
