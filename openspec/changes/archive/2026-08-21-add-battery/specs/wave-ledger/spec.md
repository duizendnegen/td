## MODIFIED Requirements

### Requirement: Energy rows balance usage against sources every tick

On every wave tick the open period SHALL accumulate, in integer power units summed per tick,
the usage of the tick — engaged draw, standby draw, solar surplus that charged the store, and
solar surplus wasted — and the sources of the tick — solar used, the store's discharge, grid
supplied, and demand left unmet. Solar used SHALL be the lesser of solar output and draw;
charging SHALL be the surplus beyond draw that the store took; wasted SHALL be the surplus
beyond that; the store's discharge SHALL be what it supplied toward the deficit; unmet SHALL
be the draw not covered by solar, the store and grid. On every tick
`engaged + standby + charging + wasted` SHALL equal `solar + battery + grid + unmet`, so both
sides of the period sum to the same total. The stored quantity itself SHALL NOT be a row: a
period's charging and discharge need not net to zero, since the store persists across periods
and energy lost to a clamp on removal is no tick's usage. Ticks outside a wave SHALL add
nothing.

#### Scenario: The identity holds through a whole run

- **WHEN** any scripted run with panels, batteries, brownouts and broke ticks is advanced tick
  by tick
- **THEN** on every tick the open period's usage rows sum to its source rows

#### Scenario: Surplus that is stored is charging, not wasted

- **WHEN** a tick has draw 30, solar output 40, and the store has room for 6
- **THEN** the tick adds 30 to solar used, 6 to charging, 4 to wasted, and 0 to battery, grid
  and unmet

#### Scenario: Surplus solar is wasted, not sourced

- **WHEN** a tick has draw 30 and solar output 40 and the store is full or absent
- **THEN** the tick adds 30 to solar used, 10 to wasted, and 0 to charging, battery, grid and
  unmet

#### Scenario: Discharge is a source

- **WHEN** a tick has draw 50, solar output 20, the store supplies 20 and the grid 10
- **THEN** the tick adds 20 to solar used, 20 to battery, 10 to grid and 0 to unmet

#### Scenario: A brownout is unmet

- **WHEN** a tick has draw 50, solar output 0, the store is empty, and the grid supplies 40
  (capped by tier or balance)
- **THEN** the tick adds 40 to grid and 10 to unmet

#### Scenario: A clamp on removal is not a row

- **WHEN** a battery is removed between waves and the store is clamped from 16 to 10
- **THEN** no energy row of the open period changes

#### Scenario: The build phase accumulates no energy

- **WHEN** ticks advance during the build phase with towers and batteries standing
- **THEN** no energy row of the open period changes
