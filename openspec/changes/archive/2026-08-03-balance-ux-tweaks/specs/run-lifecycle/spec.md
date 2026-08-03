## ADDED Requirements

### Requirement: Wave speed bonus rewards finishing quickly

The system SHALL credit a wave speed bonus to the treasury during end-of-wave settlement. The
bonus amount SHALL be a deterministic function of the wave's duration (ticks from wave start to
the settlement tick) and of tuning parameters defined in balance data, SHALL be non-increasing
as the duration grows, and SHALL reach zero for sufficiently long waves — so stretching a wave
out is never more profitable than ending it. The credited bonus SHALL be part of hashed
simulation state and reflected in the treasury before the settlement judgement runs.

#### Scenario: Faster clear pays more

- **WHEN** the same wave is cleared once in 400 ticks and once in 900 ticks
- **THEN** the 400-tick clear's settlement credits a bonus greater than or equal to the
  900-tick clear's, and both amounts are fully determined by wave duration and balance data

#### Scenario: A stretched wave earns nothing

- **WHEN** a wave's duration exceeds the balance-data bonus window
- **THEN** settlement credits a bonus of zero

#### Scenario: Bonus is deterministic

- **WHEN** two runs replay the same seed and commands
- **THEN** both credit identical wave bonuses and produce identical state hashes

## MODIFIED Requirements

### Requirement: End-of-wave settlement is a single deterministic sequence

When a wave's last enemy dies or escapes, the system SHALL run settlement in one deterministic
order within that tick: unclaimed gold sacks return to the treasury, the wave speed bonus is
credited, interest accrual stops, and run progression is then judged on the post-return,
post-bonus balance (win check after the final wave, solvency gate otherwise).

#### Scenario: Sack return precedes the solvency judgement

- **WHEN** a wave ends with the treasury at −30 and 50 gold lying in unclaimed sacks
- **THEN** settlement returns the 50 first and the run continues unlocked at +20

#### Scenario: The bonus can rescue solvency

- **WHEN** a wave ends with the treasury at −10 after sack return and the wave's speed bonus is
  15
- **THEN** the bonus is credited before the judgement and the run continues unlocked at +5
