# wave-ledger

## Purpose

Per-period accounting of where the treasury's gold went and where the towers' energy came from
— accumulated deterministically as hashed simulation state, so that the HUD can show a wave's
books that reconcile to the balance on screen and survive replay unchanged.

## Requirements

### Requirement: A ledger period spans a wave and the build phase that prepared it

The simulation SHALL keep an open ledger period and the most recently closed one. A period
SHALL open at run start and at every settlement, immediately after the settlement's other
effects, and SHALL close at the next settlement — so one period is exactly one build phase
followed by the wave it led to. Closing SHALL copy the open period into the closed slot and open
a fresh period whose opening balance is the settled treasury balance. Before the first
settlement the closed slot SHALL read as empty. Each period SHALL record the number of the wave
that started in it, or that no wave has started yet.

#### Scenario: The period opens at run start

- **WHEN** a run begins with a starting treasury of 500
- **THEN** the open period has an opening balance of 500, no wave yet, and every row at zero,
  and the closed slot is empty

#### Scenario: Build-phase construction is booked to the wave it prepares

- **WHEN** the player spends 95 on construction during the build phase after wave 3 settled and
  then starts wave 4
- **THEN** the open period records wave 4 with construction 95, and the closed period — wave
  3's — is unchanged

#### Scenario: Settlement closes the period

- **WHEN** wave 4 settles with a post-bonus balance of 460
- **THEN** the closed slot holds wave 4's period including its bonus and recovered gold, and
  the open period has an opening balance of 460, no wave yet, and every row at zero

### Requirement: Gold rows are exhaustive and reconcile to the treasury every tick

The open period SHALL accumulate, in milli-gold, every movement of the treasury under one of
these rows: bounties credited, the wave speed bonus, interest accrued, construction spend net
of refunds (tower and panel placement, tower upgrades, connection-tier upgrades, less removal
refunds), the grid bill as debited, gold grabbed at the treasury, and gold recovered from
unclaimed sacks at settlement. On every tick
`opening + bounties + bonus + interest − construction − bill − stolen + recovered` SHALL equal
the treasury balance exactly.

#### Scenario: The identity holds through a whole run

- **WHEN** any scripted run is advanced tick by tick, including placements, upgrades, removals,
  connection upgrades, brownouts, thefts, sack returns and settlements
- **THEN** on every tick the open period's opening balance plus its signed rows equals the
  treasury balance

#### Scenario: Refunds net against construction

- **WHEN** the player places a tower for 100 and removes it while it is still provisional
- **THEN** the period's construction row reads 0

#### Scenario: A connection upgrade is construction

- **WHEN** the player buys the next connection tier for 150 during a wave
- **THEN** the open period's construction row increases by 150 and no other row moves

#### Scenario: The bill row is what was debited

- **WHEN** a wave tick bills the treasury 12 milli-gold for grid supply
- **THEN** the open period's bill row increases by exactly 12

### Requirement: Energy rows balance usage against sources every tick

On every wave tick the open period SHALL accumulate, in integer power units summed per tick,
the usage of the tick — engaged draw, standby draw, and solar surplus wasted — and the sources
of the tick — solar used, grid supplied, and demand left unmet. Solar used SHALL be the lesser
of solar output and draw; wasted SHALL be the surplus beyond draw; unmet SHALL be the draw not
covered by solar and grid. On every tick `engaged + standby + wasted` SHALL equal
`solar + grid + unmet`, so both sides of the period sum to the same total. Ticks outside a
wave SHALL add nothing.

#### Scenario: The identity holds through a whole run

- **WHEN** any scripted run with panels, brownouts and broke ticks is advanced tick by tick
- **THEN** on every tick the open period's usage rows sum to its source rows

#### Scenario: Surplus solar is wasted, not sourced

- **WHEN** a tick has draw 30 and solar output 40
- **THEN** the tick adds 30 to solar used, 10 to wasted, and 0 to grid and unmet

#### Scenario: A brownout is unmet

- **WHEN** a tick has draw 50, solar output 0, and the grid supplies 40 (capped by tier or
  balance)
- **THEN** the tick adds 40 to grid and 10 to unmet

#### Scenario: The build phase accumulates no energy

- **WHEN** ticks advance during the build phase with towers standing
- **THEN** no energy row of the open period changes

### Requirement: The ledger is hashed state that nothing in the simulation reads

Both the open and the closed period SHALL be part of the canonical state hash and SHALL be
reproduced exactly by a replay of the same seed and commands. No rule of the simulation SHALL
read a ledger value; the ledger observes and never feeds back.

#### Scenario: Replay reproduces the ledger

- **WHEN** the same seed and command script are run twice
- **THEN** both runs end with identical open and closed periods and identical state hashes

#### Scenario: The ledger cannot alter a trajectory

- **WHEN** the canonical replay script is run with the ledger in place
- **THEN** every recorded milestone of that script — balances, kills, phases at their known
  ticks — holds unchanged; only the hash value moves, because the walk gained fields
