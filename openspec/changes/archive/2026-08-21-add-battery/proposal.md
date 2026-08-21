# Proposal: add-battery

## Why

Energy infrastructure left one slot deliberately empty. Its merit order is
`solar → [storage] → grid`, its draw model was chosen so that a wave produces a load curve
(quiet while the first group walks in, a peak, a tail) *so that storage would have something to
do*, and its README, roadmap and the wave ledger all name the home battery as the designed-for
next change. Today the quiet ticks of every wave throw solar away — the ledger's `wasted` row is
the measure of it — while the engaged ticks of the same wave buy grid power at the tariff.

The battery closes that loop: surplus solar that would be wasted is stored, and stored energy
covers the deficit before the grid does. For the player it completes the household vocabulary
the mechanic is built on — pay per use, buy capacity, generate your own, *store it* — and turns
a panel's wasted output into a smaller grid bill and into towers that keep firing through an
over-capacity peak or a broke tick. Because storage only fills from surplus and only during
waves, it rewards a defense that already generates more than its quiet-tick draw, and the
capacity cap is reachable only by that kind of surplus — so the way to store more is to buy
more batteries, not a bigger one.

## What Changes

- **Battery** — a fourth structure kind, `battery`, built exactly like a solar panel: 1×1 on
  dirt, blocks pathing like a wall, same placement validation, same provisional/committed
  refund, same between-wave-only removal of committed structures, moves like a wall, never on a
  socket, never on a wall, not a foundation, not inspectable. It differs from a panel only in
  what the power step reads off it: a panel has an output, a battery has a **capacity**.
- **One pooled store.** Stored energy is a single hashed quantity on the simulation state, not
  per-battery charge. The pool's capacity is the number of standing batteries times the
  battery capacity; selling a battery shrinks the capacity and clamps the store to it (stored
  energy is sunk, like an upgrade). The store persists across waves and through the build phase;
  it starts empty.
- **The storage slot is filled.** On every wave tick, after solar: if solar exceeds draw, the
  surplus charges the store up to its capacity and only the remainder is wasted; if draw exceeds
  solar, the store supplies the deficit, all it holds, before the grid is asked for anything.
  A tick either charges or discharges, never both. Nothing else in the merit order moves — the
  grid's two bounds (tier capacity, positive balance at the tariff) apply to what is left after
  the battery exactly as they applied after solar.
- **No losses, no rate limit, no grid charging.** Stored energy comes out as it went in; the
  store takes or gives any amount in one tick; only surplus solar charges it. Each of these is a
  recorded lever (design), not scope.
- **Settlement tick.** The store moves on every wave tick on which supply resolves, the
  settlement tick included — it is energy, not gold, and changes where it is resolved (step 7);
  the step-9 bill exemption on that tick is unchanged.
- **Wave ledger rows.** The energy balance gains `charging` on the usage side and `battery` on
  the source side, between solar and grid, as the ledger's design reserved. The per-tick
  identity becomes `engaged + standby + charging + wasted = solar + battery + grid + unmet`;
  the stock itself sits outside the identity (the net of a period need not be zero, since the
  store persists).
- **HUD.** A battery card in the palette (cost and capacity in kWh). The power meter shows the
  stored energy against the pool's capacity — live during a wave, and as the planning read
  between waves — and the battery's share of supply while it discharges. On the board each
  battery carries a fill gauge driven by the pool's level. `F4` gains the tick's battery figures.
- **Data.** Balance gains `power.battery { cost, capacity }`, capacity authored in kWh under the
  ledger's one-second-is-one-hour convention and converted once at load to integer
  energy units (mp·tick).

### Design intent for balance authoring

Numbers are placeholders; the relationships are the design:

- **Capacity ≈ what one spare panel wastes in a wave.** Against the leak harness's authored
  defense, one panel's surplus never fills a battery (the quiet ticks are too few), two panels'
  surplus fills it within a wave — so a one-panel player sees the store climb and drain, and a
  two-panel player sees it full and wants a second battery once they build more towers.
- **Priced below a panel, above a wall.** A battery without a panel stores nothing; it is the
  second purchase of a solar line, never the first, and should read as the cheaper complement
  that makes the panel worth more.
- **Bill reduction is felt, not dominant.** A full store discharged in a wave should cut a
  mid-run grid-fed bill by a visible fraction, not erase it — the erasing belongs to more
  panels. A higher tariff (the per-level tariff lever, not shipped) is what would make storage
  dominant.

### Non-goals (recorded so they are not rediscovered by accident)

- **Charge and discharge rate limit** ("shaving peaks is a capacity increase") — a per-battery
  power figure that adds that many kW to the ceiling while the store has charge, the way a real
  battery is sold as kW and kWh. Recorded as the first lever; it is the second reason to buy
  more batteries, and the one that turns bill-shaving into ceiling-raising. Not now.
- **Grid charging** — filling the store from spare grid capacity on quiet ticks. Saves no gold
  at a flat tariff but would let a battery shave a capacity peak without solar. Recorded;
  contradicts "stores what would be wasted".
- Round-trip losses; per-battery charge state; a battery inspector; selling stored energy back;
  per-level tariffs; reserve policies (holding charge back for the over-capacity peak).

## Capabilities

### New Capabilities

None. Storage is a requirement of the power grid, and the battery structure and its HUD are
deltas on the capabilities that already own panels and the meter.

### Modified Capabilities

- `power-grid`: the merit order's storage slot is occupied — a battery structure with a pooled,
  hashed store that charges from surplus solar and discharges against the deficit before the
  grid; surplus beyond the store's capacity is what is wasted; the store persists across waves
  and clamps when capacity shrinks.
- `structure-placement`: placement, terrain, move and removal rules cover a fourth structure
  kind (`battery`) as a ground structure on the panel's rules.
- `wave-ledger`: the energy identity gains `charging` (usage) and `battery` (source).
- `build-ui`: a battery palette card; the meter shows stored energy against capacity and the
  battery's share of supply; the energy balance shows the two new rows; a fill gauge on the
  board.
- `level-data`: balance authors a battery block (cost, capacity in kWh), validated and
  converted once at load.
- `debug-tooling`: `F4` shows battery supply, charge taken and the stored level.

## Impact

- **Sim** (`src/sim/`): `types.ts` (`battery` kind, `SimState.storedMpTick`, two `WaveLedger`
  fields), `hash.ts` (same commit as the fields — standing rule), `power.ts` (`resolvePower`
  gains the storage slot, stays pure; `storageCapacityOf`), `placement.ts` (the two
  `wall || panel` checks become one ground predicate; clamp on removal), `sim.ts` (`applyPlace`
  price branch; step 7 applies the store's delta and the ledger's two rows).
- **Data** (`src/data/`): `schema.ts`, `balance.json`.
- **Render/UI**: placeholder battery mesh with a fill gauge in `src/render/towers.ts`;
  `src/ui/palette.ts` (card, hotkey shift: battery 7, remove 8, move 9); `src/ui/powermeter.ts`
  / `powerhud.ts` (stored level, battery share); `src/ui/ledger.ts` / `ledgerhud.ts` (two
  rows); `src/render/debug.ts` (F4).
- **Determinism**: new hashed state — the store and two ledger fields — so both replay goldens
  change; regenerate deliberately in one commit (ARCHITECTURE.md §12), as the ledger did.
  Capacity is derived from standing structures, never stored.
- **Tests**: `tests/power.test.ts` (the slot), `tests/placement.test.ts` / `movetool.test.ts`
  (the kind on the ground path; clamp on sale), `tests/ledger.test.ts` (identity with the two
  rows), `tests/level.test.ts` (schema), `tests/panelui.test.ts` / `powermeter.test.ts` /
  `ledger-ui.test.ts` (HUD), `tests/hash.test.ts` (the store is hashed), and a battery run in
  the leak harness's power-aware block (bill and wasted both fall with a battery beside a
  panel; the store never exceeds capacity).
- **Docs**: README (Power section, build rules), ARCHITECTURE (§7 step 7, decision log, the
  units note), ROADMAP (the battery moves out of "Next up"; the two levers recorded).
- **Dependency**: builds on `agent/energy-infrastructure` (energy infrastructure and the wave
  ledger, both archived there, neither on `main` yet).
