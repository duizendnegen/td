# power-grid

## Purpose

Gives towers a rated power that must be supplied each wave tick — from solar panels the player
builds in the maze, or from a grid connection of tiered capacity that bills the treasury at a
tariff — so that power is the ceiling on how much damage a defense can run at full rate, and
long-term infrastructure investment (connection tiers, panels, later storage) competes with
towers, walls, tiles, and interest for the same treasury.

## Requirements

### Requirement: Towers have a rated power and draw it while engaged

Each tower level SHALL define a rated power in balance data. On every tick of an active wave a
tower SHALL draw its rated power if it has a target in range that tick (whether or not it fires
that tick), and a standby draw — its rating scaled by a single balance-data standby fraction —
otherwise. Walls SHALL draw nothing. Every archetype, including slow, SHALL have a rating.
Nothing SHALL draw outside an active wave.

#### Scenario: Engaged tower draws its rating

- **WHEN** a wave is active and a rapid tower has an enemy in range on a tick between its shots
- **THEN** that tick's total draw includes the tower's full rated power for its current level

#### Scenario: Idle tower draws standby

- **WHEN** a wave is active and a tower has no enemy in range
- **THEN** that tick's total draw includes only the tower's standby share of its rating

#### Scenario: Walls and the build phase draw nothing

- **WHEN** no wave is active, or a structure is a wall
- **THEN** it contributes nothing to draw and nothing is billed

### Requirement: Solar panel structure

The game SHALL offer a solar panel as a buildable structure with a 1×1 footprint on dirt
terrain only, purchased with gold, that blocks enemy pathing like a wall. Panels SHALL follow
the wall's placement validation, provisional/committed refund rule, and the refusal to sell
committed structures during a wave. A panel is a ground structure only: it SHALL NOT be placed
on a wall, and it SHALL NOT be a foundation — no tower stands on a panel. Enemies SHALL NOT be
able to damage, drain, or steal from panels. Each panel SHALL contribute a constant output, defined in balance data, to every tick of
an active wave and nothing outside one.

#### Scenario: Panel placement is validated like a wall

- **WHEN** the player places a panel whose placement would seal every path from an active spawn
  to the treasury
- **THEN** the placement is rejected and the treasury is not charged

#### Scenario: Panel blocks pathing

- **WHEN** a panel is placed on a walkable tile
- **THEN** enemies path around that tile exactly as they would around a wall

#### Scenario: A panel is not a foundation

- **WHEN** a tower placement command targets a tile holding a panel
- **THEN** the placement is rejected with the `needs-wall` verdict, as on bare dirt

#### Scenario: Panels are not for sockets

- **WHEN** a panel placement command targets a socket tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: Enemies ignore panels

- **WHEN** an enemy walks past a panel during a wave
- **THEN** the panel's output is unchanged

#### Scenario: Panels refund like any structure

- **WHEN** a provisional panel and a committed panel are removed between waves
- **THEN** the provisional one refunds its full cost and the committed one the configured
  fraction, and neither can be removed while a wave runs once committed

### Requirement: The grid connection has tiered capacity and a one-way upgrade

Each level SHALL author an ordered table of connection tiers, each with a capacity and a
one-time upgrade cost, the first tier being the starting connection. The grid SHALL supply at
most the current tier's capacity per tick. The player SHALL be able to upgrade the connection to
the next tier by command in any live phase, including during a wave; the upgrade SHALL be
charged to the treasury under the spending gate (permitted at balance ≥ 0, blocked below), SHALL
be rejected at the last tier, and SHALL be one-way — no refund, no provisional state, and no
contribution to the liquidation value.

#### Scenario: Upgrade raises capacity the tick it applies

- **WHEN** a connection-upgrade command applies with the balance ≥ 0 and a next tier available
- **THEN** the treasury is charged the next tier's cost and the grid may supply up to the new
  capacity from that tick

#### Scenario: Last tier refuses

- **WHEN** a connection-upgrade command applies at the level's last tier
- **THEN** the command is rejected with no state change

#### Scenario: Upgrades are final

- **WHEN** the player upgrades the connection during the build phase and then reconsiders
- **THEN** there is no command that refunds it, and the liquidation total does not include it

### Requirement: Supply resolves in a fixed merit order each wave tick

On every tick of an active wave the system SHALL resolve supply in this order: solar output
first; then grid supply, bounded by the current tier's capacity and by the positive treasury
balance at the tariff. Solar exceeding draw SHALL be discarded — not stored, not sold, not
carried over. The order SHALL leave a fixed slot for storage between solar and grid; nothing
in this change occupies it.

#### Scenario: Solar covers first

- **WHEN** a wave is active with draw D and solar output S, S < D
- **THEN** the grid is asked for D − S, no more

#### Scenario: Grid is bounded by capacity

- **WHEN** the deficit after solar exceeds the current tier's capacity
- **THEN** the grid supplies exactly the capacity and the remainder is unsupplied that tick

#### Scenario: Surplus solar is wasted

- **WHEN** solar output exceeds draw on a tick
- **THEN** nothing is billed and the surplus has no effect on any later tick

### Requirement: Grid supply is billed at a flat tariff and stops when broke

Grid supply SHALL be billed each wave tick at the level's flat tariff, deducted from the
treasury in the run-progression step before interest accrues, and never on the settlement
tick. Grid supply SHALL be bounded by what the positive balance can pay, so that the bill can
bring the balance to exactly zero and never below it. While the balance is zero or negative
the grid SHALL supply nothing; supply resumes on the first tick the balance is positive again.

#### Scenario: The bill drains the treasury

- **WHEN** a wave is active with a positive balance and the grid supplies G power that tick
- **THEN** the treasury decreases by G × tariff before that tick's interest is computed

#### Scenario: Billing floors at zero

- **WHEN** the tick's grid share at the tariff would cost more than the current positive
  balance
- **THEN** the grid supplies only the affordable share, the balance becomes exactly zero, and
  the rest is unsupplied that tick

#### Scenario: Broke means cut off

- **WHEN** the balance is at or below zero on a wave tick
- **THEN** the grid supplies nothing and towers run on solar alone

#### Scenario: A bounty restores supply

- **WHEN** a kill bounty brings a zero or negative balance positive
- **THEN** from that tick the grid supplies again, up to capacity and the balance

### Requirement: Coverage degrades every tower uniformly (brownout)

Coverage on a wave tick SHALL be supplied ÷ draw, capped at 1 (and 1 when draw is zero),
computed once per tick from the tick's engaged draw. Every tower SHALL be affected alike:
a tower that fires on a tick with coverage c SHALL schedule its next shot at its fire interval
divided by c, and at coverage zero SHALL not fire and SHALL re-check each tick. Slow towers'
reapplication cadence stretches the same way; slow duration is unaffected. Full cadence SHALL
resume on the first tick coverage returns to 1. Placement and upgrades SHALL never be refused
for lack of power.

#### Scenario: Half coverage, half cadence

- **WHEN** draw is twice what can be supplied on a tick and a tower fires
- **THEN** its next shot is due after twice its normal interval

#### Scenario: Peak brownout, then recovery

- **WHEN** engaged draw exceeds capacity plus solar during a burst of enemies and then falls
  back below it as they die
- **THEN** towers slow while the peak lasts and are back at full cadence the tick coverage
  returns to 1

#### Scenario: Overbuilding is allowed

- **WHEN** the player places a tower whose rating would push peak draw past capacity
- **THEN** the placement succeeds and only the brownout rule applies when the peak comes

#### Scenario: No solar, no money, no shots

- **WHEN** the balance is at or below zero and there are no panels
- **THEN** coverage is zero and towers hold fire until a bounty or refund makes the balance
  positive

### Requirement: Power quantities are deterministic integers

All power values (ratings, standby, panel output, tier capacity, the tariff conversion,
coverage, the bill) SHALL be represented and computed as integers in the simulation, with any
fractional authoring values converted once at load. The connection tier SHALL be simulation
state and part of the canonical hash; coverage and the bill SHALL be derived per tick, never
stored.

#### Scenario: Replay determinism holds

- **WHEN** the same seed and command list are replayed with power mechanics active
- **THEN** the state hash after N ticks is identical across runs and machines

#### Scenario: The tier is hashed

- **WHEN** two states differ only in the connection tier
- **THEN** their hashes differ
