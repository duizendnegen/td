## MODIFIED Requirements

### Requirement: Power data is authored per level and in balance, and validated at load

Each level SHALL author a `power` block: an ordered, non-empty table of connection tiers (each
with a positive capacity and a non-negative upgrade cost, capacities strictly increasing, the
first tier's cost ignored as the starting connection) and a non-negative tariff. Balance data
SHALL author a rated power per tower level, one standby fraction in [0, 1], a panel block with
cost and output, and a battery block with cost and a positive capacity in kWh — under the
convention that one second of wave time is one hour, so one kWh is one power unit for one
second. Loading SHALL reject a level or balance file missing any of these, with a
non-increasing tier table, or with negative values, naming the offending field. Tariff, standby
fraction, ratings, outputs, capacities and the battery capacity SHALL be converted to integer
simulation units exactly once at load, like the interest rate.

#### Scenario: Missing power block rejected

- **WHEN** a level omits its `power` block or a tower level omits its rated power
- **THEN** loading fails with an error naming the missing field

#### Scenario: Missing battery block rejected

- **WHEN** balance data omits its battery block, or authors a zero or negative capacity
- **THEN** loading fails with an error naming the field

#### Scenario: Tier table must ascend

- **WHEN** a level's tier table has a later tier with capacity not greater than an earlier one
- **THEN** loading fails with an error naming the tier

#### Scenario: Floats do not cross the boundary

- **WHEN** a level authors its tariff and balance its standby fraction and battery capacity as
  floats
- **THEN** the values handed to the simulation are integers

#### Scenario: Battery capacity converts under the kWh convention

- **WHEN** balance authors a battery capacity of 10 kWh
- **THEN** the simulation's capacity is ten power units sustained for one second of ticks, so
  that a 1 kW surplus fills it in ten seconds of wave time
