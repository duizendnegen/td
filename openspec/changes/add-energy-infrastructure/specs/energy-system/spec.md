# Spec delta: energy-system (add-energy-infrastructure)

## Purpose

Gives towers an ongoing energy cost that must be met either by automatic grid purchases against the treasury or by solar panels built in the maze, so that defense carries an operating cost and long-term infrastructure investment competes with interest and tower spending.

## ADDED Requirements

### Requirement: Towers consume energy during waves

Each tower SHALL have an energy demand while a wave is active, composed of a constant idle load per tick plus a fixed cost per shot fired. Both values are defined per tower type and per upgrade level in the balance data, and demand SHALL NOT accrue outside an active wave.

#### Scenario: Idle tower draws its base load
- **WHEN** a wave is active and a tower has no target and does not fire
- **THEN** the tick's total energy demand includes that tower's idle load for its current upgrade level

#### Scenario: Firing adds per-shot cost
- **WHEN** a tower fires during a tick of an active wave
- **THEN** the tick's total energy demand includes the tower's per-shot cost in addition to its idle load

#### Scenario: No demand during the build phase
- **WHEN** no wave is active
- **THEN** total energy demand is zero and no energy is billed

### Requirement: Solar panel structure

The game SHALL offer a solar panel as a buildable structure with a 1×1 footprint that blocks enemy pathing, purchased with gold from the treasury. Panels SHALL be subject to the same placement validation as walls (in bounds, unoccupied, no enemy on the tile, no spawn or live enemy cut off from its goal) and the same removal delay, during which the tile stays blocked. Enemies SHALL NOT be able to damage, drain, or steal from panels.

#### Scenario: Panel placement is validated like a wall
- **WHEN** the player places a panel whose placement would seal every path from an active spawn to the treasury
- **THEN** the placement is rejected and the treasury is not charged

#### Scenario: Panel blocks pathing
- **WHEN** a panel is placed on a walkable tile
- **THEN** enemies path around that tile exactly as they would around a wall

#### Scenario: Enemies ignore panels
- **WHEN** an enemy walks adjacent to or past a panel during a wave
- **THEN** the panel's output and integrity are unchanged

### Requirement: Solar production during waves

Each panel SHALL produce energy at a constant rate per tick while a wave is active and nothing outside an active wave. Solar production SHALL offset tower demand in the same tick. Production exceeding demand SHALL be discarded — it is not stored, not sold, and not carried into later ticks.

#### Scenario: Solar offsets the bill
- **WHEN** a wave is active, total demand this tick is D, and total panel output this tick is S with S < D
- **THEN** only the uncovered demand D − S is bought from the grid

#### Scenario: Excess solar is wasted
- **WHEN** total panel output this tick exceeds total demand
- **THEN** the treasury is billed nothing for energy and the surplus has no effect

### Requirement: Automatic grid billing

Demand not covered by solar SHALL be bought automatically from the grid at a flat tariff (gold per energy unit) defined in the level data, deducted from the treasury each tick of an active wave. The grid has unlimited capacity. Grid purchase SHALL spend at most the current positive treasury balance: billing may drive the balance exactly to zero but SHALL NOT itself push it negative.

#### Scenario: Uncovered demand drains the treasury
- **WHEN** a wave is active with a positive treasury balance and uncovered demand E at tariff t
- **THEN** the treasury decreases by E × t that tick

#### Scenario: Billing stops at zero
- **WHEN** the energy bill for a tick exceeds the current positive balance
- **THEN** the treasury is reduced exactly to zero, the affordable fraction of demand is powered, and the remainder is unpowered that tick

### Requirement: Brownout when the treasury cannot pay

When the treasury balance is zero or negative, grid purchase SHALL stop (extending the existing rule that nothing may be bought below zero) and towers SHALL run only on solar. Towers SHALL degrade proportionally: with coverage c = (available energy) / (total demand), capped at 1, every tower's effective fire rate that tick is its base rate multiplied by c. Towers SHALL never shut off entirely while any energy is available, and full effectiveness SHALL resume as soon as coverage returns to 1.

#### Scenario: Broke with partial solar
- **WHEN** the treasury balance is at or below zero and solar covers half of total demand
- **THEN** towers fire at half their normal rate

#### Scenario: Broke with no solar
- **WHEN** the treasury balance is at or below zero and there are no panels
- **THEN** towers do not fire while the balance remains at or below zero

#### Scenario: Recovery restores full power
- **WHEN** a brownout is in effect and the treasury returns to a positive balance (e.g. via a kill bounty)
- **THEN** grid purchase resumes and towers return to full fire rate from that tick onward

### Requirement: Energy is visible to the player

The HUD SHALL display, during a wave, the current total demand, current solar supply, and the resulting net energy cost per second, and SHALL indicate when towers are browned out. The build palette SHALL show the panel with its gold cost, greyed out when unaffordable or when the balance is negative.

#### Scenario: Player can read the energy balance
- **WHEN** a wave is active
- **THEN** the HUD shows demand, solar supply, and net gold cost per second of the current energy draw

#### Scenario: Brownout is signalled
- **WHEN** coverage drops below 1
- **THEN** the player receives a visible brownout indication distinct from normal operation

### Requirement: Energy quantities are deterministic integers

All energy values (demand, output, per-shot cost, tariff conversion) SHALL be represented and accumulated as integers in the simulation, with any fractional authoring values converted once at load, so that replay determinism and the state hash are preserved.

#### Scenario: Replay determinism holds
- **WHEN** the same seed and command list are replayed with energy mechanics active
- **THEN** the state hash after N ticks is identical across runs and machines
