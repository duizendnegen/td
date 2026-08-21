## ADDED Requirements

### Requirement: Battery structure

The game SHALL offer a battery as a buildable structure with a 1×1 footprint on dirt terrain
only, purchased with gold, that blocks enemy pathing like a wall. A battery SHALL follow every
rule that applies to a solar panel: the wall's placement validation, the provisional/committed
refund rule, the refusal to sell committed structures during a wave, the build-phase move rule,
never on a socket, never on a wall, and not a foundation — no tower stands on a battery.
Enemies SHALL NOT be able to damage, drain, or steal from batteries. A battery SHALL produce
nothing and draw nothing; its only contribution is its capacity, defined in balance data, to
the pooled store.

#### Scenario: Battery placement is validated like a wall

- **WHEN** the player places a battery whose placement would seal every path from an active
  spawn to the treasury
- **THEN** the placement is rejected and the treasury is not charged

#### Scenario: Battery blocks pathing

- **WHEN** a battery is placed on a walkable tile
- **THEN** enemies path around that tile exactly as they would around a wall

#### Scenario: A battery is not a foundation

- **WHEN** a tower placement command targets a tile holding a battery
- **THEN** the placement is rejected with the `needs-wall` verdict, as on bare dirt

#### Scenario: A battery neither draws nor produces

- **WHEN** a wave tick resolves supply with batteries standing
- **THEN** the batteries add nothing to the tick's draw and nothing to its solar output

#### Scenario: Batteries refund like any structure

- **WHEN** a provisional battery and a committed battery are removed between waves
- **THEN** the provisional one refunds its full cost and the committed one the configured
  fraction, and neither can be removed while a wave runs once committed

### Requirement: Stored energy is one pooled, hashed quantity

The simulation SHALL keep a single stored-energy quantity, in integer energy units, as hashed
state. Its capacity SHALL be the number of standing batteries times the battery capacity from
balance data, derived on demand and never stored. The store SHALL start empty, SHALL persist
across waves and through the build phase, and SHALL change only where supply resolves on a
wave tick — charging from surplus solar, discharging against the deficit — and when capacity
shrinks: removing a battery SHALL clamp the store to the new capacity in the same tick, the
excess being lost. Moving a battery SHALL NOT change the store. Placing a battery during a wave
SHALL add its capacity from that tick.

#### Scenario: The store survives settlement

- **WHEN** a wave settles with 6 kWh stored
- **THEN** the next wave starts with 6 kWh stored, and nothing moves in between

#### Scenario: Selling a battery clamps the store

- **WHEN** two batteries of 10 kWh each stand with 16 kWh stored and one is removed between
  waves
- **THEN** the store reads 10 kWh and the removed 6 kWh are gone — not refunded, not moved to
  any row

#### Scenario: Selling an unneeded battery loses nothing

- **WHEN** two batteries of 10 kWh each stand with 8 kWh stored and one is removed
- **THEN** the store still reads 8 kWh

#### Scenario: A moved battery keeps the pool intact

- **WHEN** a battery is moved to another dirt tile during the build phase with 6 kWh stored
- **THEN** the store reads 6 kWh after the move

#### Scenario: A battery bought mid-wave fills from the next surplus

- **WHEN** a battery is placed during a wave and the following tick has surplus solar
- **THEN** that surplus charges the store up to the enlarged capacity

## MODIFIED Requirements

### Requirement: Supply resolves in a fixed merit order each wave tick

On every tick of an active wave the system SHALL resolve supply in this order: solar output
first; then the store; then grid supply, bounded by the current tier's capacity and by the
positive treasury balance at the tariff. When solar output exceeds draw, the surplus SHALL
charge the store up to its capacity, and only the surplus beyond that SHALL be discarded — not
sold, not carried over. When draw exceeds solar output, the store SHALL supply the deficit up to
everything it holds, and the grid SHALL be asked only for what remains. A tick SHALL either
charge or discharge the store, never both. With no batteries standing the order SHALL behave
exactly as it did before storage existed.

#### Scenario: Solar covers first

- **WHEN** a wave is active with draw D and solar output S, S < D
- **THEN** the store and then the grid are asked for D − S, no more

#### Scenario: Surplus charges before it is wasted

- **WHEN** a tick has draw 30, solar output 40, and the store holds 4 of a capacity of 10
- **THEN** the store rises to 10, 4 units are wasted, and nothing is billed

#### Scenario: Surplus beyond capacity is wasted

- **WHEN** a tick has draw 30, solar output 40, and the store is full
- **THEN** the store is unchanged and the 10 surplus units are wasted

#### Scenario: The store covers the deficit before the grid

- **WHEN** a tick has draw 50, solar output 20, and the store holds 40
- **THEN** the store supplies 30 and falls to 10, the grid supplies nothing, and nothing is
  billed

#### Scenario: An emptying store hands the rest to the grid

- **WHEN** a tick has draw 50, solar output 20, and the store holds 12
- **THEN** the store supplies 12 and reads empty, and the grid is asked for 18 under its usual
  bounds

#### Scenario: Grid is bounded by capacity

- **WHEN** the deficit after solar and the store exceeds the current tier's capacity
- **THEN** the grid supplies exactly the capacity and the remainder is unsupplied that tick

#### Scenario: Surplus solar is wasted

- **WHEN** no battery stands and solar output exceeds draw on a tick
- **THEN** nothing is billed and the surplus has no effect on any later tick

### Requirement: Grid supply is billed at a flat tariff and stops when broke

Grid supply SHALL be billed each wave tick at the level's flat tariff, deducted from the
treasury in the run-progression step before interest accrues, and never on the settlement
tick. Grid supply SHALL be bounded by what the positive balance can pay, so that the bill can
bring the balance to exactly zero and never below it. While the balance is zero or negative
the grid SHALL supply nothing; supply resumes on the first tick the balance is positive again.
The store SHALL be unaffected by the balance: it charges and discharges on a broke tick exactly
as on any other.

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
- **THEN** the grid supplies nothing and towers run on solar and the store alone

#### Scenario: The store carries a broke tick

- **WHEN** the balance is at or below zero, draw is 50, solar output is 20, and the store holds
  100
- **THEN** the store supplies 30, coverage is full, and nothing is billed

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

- **WHEN** engaged draw exceeds capacity plus solar during a burst of enemies, the store is
  empty, and the draw then falls back below it as they die
- **THEN** towers slow while the peak lasts and are back at full cadence the tick coverage
  returns to 1

#### Scenario: A charged store holds off the brownout

- **WHEN** engaged draw exceeds capacity plus solar and the store holds more than the tick's
  deficit
- **THEN** coverage is full on that tick and the store falls by the deficit

#### Scenario: Overbuilding is allowed

- **WHEN** the player places a tower whose rating would push peak draw past capacity
- **THEN** the placement succeeds and only the brownout rule applies when the peak comes

#### Scenario: No solar, no money, no shots

- **WHEN** the balance is at or below zero, there are no panels, and the store is empty
- **THEN** coverage is zero and towers hold fire until a bounty or refund makes the balance
  positive

### Requirement: Power quantities are deterministic integers

All power values (ratings, standby, panel output, battery capacity, tier capacity, the tariff
conversion, coverage, the bill, the store and what it takes or gives each tick) SHALL be
represented and computed as integers in the simulation, with any fractional authoring values
converted once at load. The connection tier and the stored energy SHALL be simulation state and
part of the canonical hash; coverage, the bill and the store's capacity SHALL be derived per
tick, never stored.

#### Scenario: Replay determinism holds

- **WHEN** the same seed and command list are replayed with power mechanics active
- **THEN** the state hash after N ticks is identical across runs and machines

#### Scenario: The tier is hashed

- **WHEN** two states differ only in the connection tier
- **THEN** their hashes differ

#### Scenario: The store is hashed

- **WHEN** two states differ only in the stored energy
- **THEN** their hashes differ
