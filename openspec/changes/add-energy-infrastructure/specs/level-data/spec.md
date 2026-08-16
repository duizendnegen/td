# level-data — delta for add-energy-infrastructure

## ADDED Requirements

### Requirement: Power data is authored per level and in balance, and validated at load

Each level SHALL author a `power` block: an ordered, non-empty table of connection tiers (each
with a positive capacity and a non-negative upgrade cost, capacities strictly increasing, the
first tier's cost ignored as the starting connection) and a non-negative tariff. Balance data
SHALL author a rated power per tower level, one standby fraction in [0, 1], and a panel block
with cost and output. Loading SHALL reject a level or balance file missing any of these, with
a non-increasing tier table, or with negative values, naming the offending field. Tariff,
standby fraction, ratings, outputs and capacities SHALL be converted to integer simulation units
exactly once at load, like the interest rate.

#### Scenario: Missing power block rejected

- **WHEN** a level omits its `power` block or a tower level omits its rated power
- **THEN** loading fails with an error naming the missing field

#### Scenario: Tier table must ascend

- **WHEN** a level's tier table has a later tier with capacity not greater than an earlier one
- **THEN** loading fails with an error naming the tier

#### Scenario: Floats do not cross the boundary

- **WHEN** a level authors its tariff and balance its standby fraction as floats
- **THEN** the values handed to the simulation are integers
