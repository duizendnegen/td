## ADDED Requirements

### Requirement: Top-bar readouts expand into dropdown panels

The treasury readout and the power meter SHALL each act as a disclosure control for a panel
that drops down below it: a click, a tap, or Enter/Space while focused toggles the panel;
opening one closes the other; Escape, a pointer-down outside the panel and its control, or
toggling the control again closes it. The control SHALL expose its expanded state to assistive
technology. An open panel SHALL keep refreshing from live state and SHALL NOT pause the
simulation, capture keyboard shortcuts beyond Escape, or intercept input to the board outside
its own bounds. On desktop the panel is anchored under its control in the top bar; below the
mobile breakpoint it spans the width of the compact top bar. Both form factors SHALL offer the
same panels with the same content.

#### Scenario: Opening one closes the other

- **WHEN** the gold ledger is open and the player clicks the power meter
- **THEN** the energy balance opens and the gold ledger closes

#### Scenario: Escape closes without side effects

- **WHEN** a panel is open during a wave and the player presses Escape
- **THEN** the panel closes, the wave keeps running, and no tool or selection changes

#### Scenario: A click on the board closes the panel and still reaches the board

- **WHEN** a panel is open and the player clicks a tile outside it
- **THEN** the panel closes and the click is handled by the board as if no panel had been open

#### Scenario: Keyboard toggle

- **WHEN** the treasury readout has focus and the player presses Enter
- **THEN** the gold ledger opens and the readout reports itself as expanded

### Requirement: Both panels show the period that belongs to the latest wave start

The gold ledger and the energy balance SHALL show the same ledger period under one rule: once a
wave has started in the open period, the open period — live while the wave runs, frozen once
it settles into the closed slot — labelled with that wave's number; until then (the build phase
before a wave, and the run's start) the closed period, labelled with its wave number. Before
any wave has run there is no closed period and the panels SHALL say so rather than show zeros.
After the run ends the panels SHALL remain available and follow the same rule.

#### Scenario: During a wave the panels are live

- **WHEN** wave 4 is running and the player opens either panel
- **THEN** it is labelled wave 4 and its figures change as the wave proceeds

#### Scenario: During the build phase the panels show the last wave

- **WHEN** wave 4 has settled and the player opens either panel during the build phase
- **THEN** it is labelled wave 4 and shows wave 4's final figures

#### Scenario: Starting the next wave flips both panels

- **WHEN** the player starts wave 5 with the gold ledger open
- **THEN** on the next rendered frame the ledger is labelled wave 5 and the energy balance,
  when opened, is labelled wave 5 as well

#### Scenario: Before the first wave

- **WHEN** the player opens the energy balance before wave 1 has started
- **THEN** the panel states that no wave has run yet and shows no figures

### Requirement: The gold ledger reconciles to the treasury readout

The gold ledger SHALL list, for the shown period, its opening balance, then one row per cash
flow — bounties, wave bonus, interest, construction (net), energy (the grid bill), stolen,
recovered — with a sign per row, then a closing line. During the build phase the closed period
SHALL be followed by a second block for the open period, labelled as preparing the next wave,
holding its construction so far and a balance line. The figures SHALL be shown in whole gold,
and rounding SHALL be applied so that every block's displayed rows sum exactly to the
difference between its displayed opening and closing lines, and the final balance line SHALL
equal the treasury readout above the panel. The ledger SHALL never show an energy figure other
than the bill, and SHALL never show a "saved" or "avoided" amount.

#### Scenario: The rows add up

- **WHEN** wave 3 opened at 412, earned 180 in bounties, 25 bonus and 6 interest, spent 140 on
  construction and 13 on energy, lost 40 to theft and recovered 30
- **THEN** the ledger shows those rows signed, a closing line of 460, and a reader summing the
  displayed rows from the displayed opening reaches exactly the displayed closing

#### Scenario: The preparing block chains to the readout

- **WHEN** wave 3 closed at 460 and the player has since spent 95 on construction in the build
  phase
- **THEN** the ledger shows wave 3's block closing at 460, then a block preparing wave 4 with
  construction −95 and a balance of 365, and the treasury readout reads 365

#### Scenario: Rounding never breaks the chain

- **WHEN** the period's milli-gold rows do not individually floor to figures that sum to the
  whole-gold delta
- **THEN** the displayed rows are adjusted by at most one gold each so that they do, and the
  opening, closing and balance lines are unchanged by the adjustment

#### Scenario: A connection upgrade shows as construction

- **WHEN** the player bought a connection tier during the shown period
- **THEN** its cost is inside the construction row; no separate row appears

### Requirement: The energy balance shows usage against sources in kWh

The energy balance SHALL show two columns for the shown period that total the same figure:
usage — engaged, standby, wasted — and sources in merit order — solar, grid marked as billed,
unmet. Energy SHALL be presented in kWh to one decimal under the convention that one real
second of wave time is one game hour, and rounding SHALL be applied so that each column's
displayed rows sum exactly to the displayed total. The panel header SHALL show the level's
tariff in gold per kWh, which under the same convention is the authored tariff figure. The
panel SHALL show no gold amount and no savings figure.

#### Scenario: Both columns total the same

- **WHEN** wave 4 ran with 31.2 kWh engaged, 8.1 standby and 3.7 wasted, supplied by 30.5 solar
  and 12.5 grid with 0 unmet
- **THEN** both columns show a total of 43.0 and the grid row is marked as billed

#### Scenario: The tariff reads as authored

- **WHEN** the level's power tariff is authored as 0.24
- **THEN** the panel header reads 0.24 gold per kWh

#### Scenario: Unmet carries no gold

- **WHEN** the shown period had brownout ticks
- **THEN** the unmet row shows its kWh and the panel shows no gold figure for it or for any
  other row

#### Scenario: Short waves still read

- **WHEN** an opening wave lasts twelve seconds at a mean draw of 0.9 kW
- **THEN** the totals read about 10.8 kWh — one decimal, not 0.0 — because a second of wave
  time is presented as an hour
