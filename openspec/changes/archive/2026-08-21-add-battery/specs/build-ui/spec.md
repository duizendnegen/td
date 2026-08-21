## ADDED Requirements

### Requirement: Batteries show the store's level on the board

Every standing battery SHALL carry a fill gauge that reads the pooled store's level as a
fraction of its capacity — the same level on every battery, since the store is one pool —
updated from simulation state each rendered frame, visibly empty at zero and visibly full at
capacity. The gauge SHALL be distinct from the provisional marking and SHALL NOT be affected by
the brownout dimming, which applies to towers only.

#### Scenario: Batteries fill together

- **WHEN** two batteries stand and the store is at half capacity
- **THEN** both show a half-full gauge on the next rendered frame

#### Scenario: The gauge follows the wave

- **WHEN** the store charges through a quiet opening and drains through the peak
- **THEN** the gauges rise and then fall frame by frame with the store, without any event

## MODIFIED Requirements

### Requirement: Build palette with affordability and debt-warning states

The palette SHALL offer the wall, the solar panel, the battery, and all four tower archetypes
with their level-1 costs, and SHALL show the rated power of every tower item, the output of the
panel, and the capacity of the battery in kWh. An item whose cost would leave the balance ≥ 0
SHALL read as affordable; an item whose purchase would drive the balance negative SHALL read as
a distinct debt warning while remaining selectable; while the balance is below 0 every item
SHALL read as blocked. Lack of power SHALL NOT block or warn on any item — the meter carries
that information.

#### Scenario: Debt purchase is warned, not hidden

- **WHEN** the balance is 50 and a palette item costs 100
- **THEN** the item shows a warning state and can still be selected and placed

#### Scenario: Negative balance blocks the palette

- **WHEN** the balance is below 0
- **THEN** every palette item reads as blocked and clicks place nothing

#### Scenario: All archetypes are placeable

- **WHEN** the player selects each of the four tower palette items in turn
- **THEN** each drives the ghost preview and places its archetype via the same command path

#### Scenario: The panel is placeable and removable like a wall

- **WHEN** the player selects the panel item
- **THEN** it drives the ghost preview with wall-style validation tinting and places a panel via
  the same command path, the card shows the panel's cost and output, and a placed panel is
  removed with the remove tool under the wall's rules (it is not inspectable)

#### Scenario: The battery is placeable and removable like a panel

- **WHEN** the player selects the battery item
- **THEN** it drives the ghost preview with wall-style validation tinting and places a battery
  via the same command path, the card shows the battery's cost and capacity, and a placed
  battery is removed with the remove tool under the wall's rules (it is not inspectable)

### Requirement: Power meter beside the treasury readout

The HUD SHALL show one power meter next to the treasury readout: during a wave, the live draw
against the current connection capacity, the split between solar, the store and grid supply,
and the grid cost per second; between waves, the rated total of standing towers against
capacity, so the player can see how close a peak would come to the ceiling before starting the
wave. Whenever at least one battery stands, the meter SHALL show the stored energy against the
store's capacity in kWh, in both phases, so the reserve a wave starts with is visible before
START WAVE. The meter SHALL read as a warning while coverage is below 1 and SHALL show the
connection tier. On mobile the meter compacts into the top bar with the treasury.

#### Scenario: A brownout is signalled at the moment it happens

- **WHEN** engaged draw exceeds what can be supplied on a tick
- **THEN** on the next rendered frame the meter reads as a warning and shows the coverage

#### Scenario: Planning read between waves

- **WHEN** the run sits in the build phase
- **THEN** the meter shows the towers' rated total against capacity and the current tier, and
  the grid cost reads zero

#### Scenario: The reserve is visible between waves

- **WHEN** the run sits in the build phase with a battery standing and 6 of 10 kWh stored
- **THEN** the meter shows 6 of 10 kWh stored

#### Scenario: Discharge shows in the split

- **WHEN** the store supplies part of a wave tick's draw
- **THEN** on the next rendered frame the meter's supply split includes the store's share and
  the stored figure has fallen

#### Scenario: No batteries, no store readout

- **WHEN** no battery stands
- **THEN** the meter shows no stored-energy figure

### Requirement: The energy balance shows usage against sources in kWh

The energy balance SHALL show two columns for the shown period that total the same figure:
usage — engaged, standby, charging, wasted — and sources in merit order — solar, battery, grid
marked as billed, unmet. Energy SHALL be presented in kWh to one decimal under the convention
that one real second of wave time is one game hour, and rounding SHALL be applied so that each
column's displayed rows sum exactly to the displayed total. The panel header SHALL show the
level's tariff in gold per kWh, which under the same convention is the authored tariff figure.
The panel SHALL show no gold amount and no savings figure.

#### Scenario: Both columns total the same

- **WHEN** wave 4 ran with 31.2 kWh engaged, 8.1 standby, 2.0 charging and 1.7 wasted,
  supplied by 30.5 solar, 1.5 battery and 11.0 grid with 0 unmet
- **THEN** both columns show a total of 43.0 and the grid row is marked as billed

#### Scenario: The tariff reads as authored

- **WHEN** the level's power tariff is authored as 0.24
- **THEN** the panel header reads 0.24 gold per kWh

#### Scenario: Unmet carries no gold

- **WHEN** the shown period had brownout ticks
- **THEN** the unmet row shows its kWh and the panel shows no gold figure for it or for any
  other row

#### Scenario: Charging and battery are plain rows

- **WHEN** the shown period charged and discharged the store
- **THEN** the charging row appears under usage and the battery row under sources between
  solar and grid, neither marked as billed and neither carrying a gold figure

#### Scenario: Short waves still read

- **WHEN** an opening wave lasts twelve seconds at a mean draw of 0.9 kW
- **THEN** the totals read about 10.8 kWh — one decimal, not 0.0 — because a second of wave
  time is presented as an hour
