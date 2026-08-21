# Wave Ledger

## Why

The player can see the treasury move and the power meter flicker, but never *why* a wave ended
where it did. After a wave the questions that decide the next build — how much did the grid
bill me, how much of the load did my panels carry, how much did the thieves walk off with, did
the interest outrun the bill — are answerable only by watching numbers tick and guessing. The
energy model that `add-energy-infrastructure` introduced makes this gap acute: the whole point
of rooftop solar (and the battery that follows it) is to spend less on the grid, and right now
there is no place where "less" is a figure.

The obvious answer — a post-wave list with `Energy bill −13` and `Solar savings +26` as sibling
rows — is wrong in a way that matters: it promises to add up and doesn't (the 26 is not gold
that moved). A stats list is only worth reading when it **reconciles**: the balance it opens
with, plus its rows, equals the balance the player is looking at. This change builds two panels
that each hold that promise by construction.

## What Changes

- **The simulation keeps a per-period ledger as hashed state.** A period opens at run start and
  at each settlement, and closes at the next settlement — so a period is *a wave and the build
  phase that prepared it*. The open period (`ledger`) and the most recently closed one
  (`lastLedger`) are both kept. Each records, as integer sums of the tick-level figures:
  - **gold**: the opening balance, bounties, wave bonus, interest, construction (net of
    refunds; connection-tier upgrades count as construction, like a panel), the grid bill,
    gold stolen at the treasury, gold recovered from sacks at settlement. These are the only
    mutations the treasury has, so `opening + Σ rows = balance` holds on every tick.
  - **energy**: engaged draw, standby draw, solar used, solar wasted, grid supply, unmet
    demand. Per tick `engaged + standby + wasted = solar + grid + unmet`, so the usage and
    source sides sum to the same number on every tick and therefore over every period.
  - the number of the wave that started in the period, or none yet.

- **The treasury readout expands into a gold ledger.** Clicking the treasury readout drops down
  a list whose top-level rows reconcile to the balance shown above it. Once a wave has started
  in the open period, the panel shows that period ("Wave 4", live during the wave, frozen
  after). Until then — the build phase — it shows the closed period in full ("Wave 3": opening,
  rows, closing) and, beneath it, the open period's only live row as a second block
  ("Preparing wave 4": construction so far, then the balance). The two blocks chain:
  `closing of wave 3 + preparation = balance`. Build-phase spending is booked to the wave it
  prepares, and the display flips to that wave the moment it starts.

- **The power meter expands into an energy balance.** Clicking the meter drops down two
  columns — *usage* (engaged, standby, wasted) and *sources* (solar, grid, unmet) in merit
  order — that total the same figure. Energy is shown in **kWh to one decimal** under the
  presentation fiction that one real second is one game hour, which makes the level's authored
  tariff (`gold per kW per second`) read unchanged as **gold per kWh** in the panel's header.
  The energy panel never sums gold, and never says "saved": the grid row is marked *billed*,
  and the tariff in the header lets the player value solar with one multiplication. Which
  period is shown follows the same rule as the gold ledger.

- **The tick's draw readout splits engaged from standby.** `PowerReadout` (derived, unhashed)
  gains the split the energy panel needs; nothing about how draw is computed changes.

- **Settlement gains one step.** After the speed bonus is credited, the open period closes:
  it becomes `lastLedger` and a fresh period opens with the settled balance as its opening.

- **One disclosure pattern, two instances.** The expandable readout is a new HUD affordance:
  click (or Enter/Space on focus) toggles a dropdown anchored below the slot, opening one closes
  the other, Escape or a click elsewhere closes it. It never pauses the game and never blocks
  board input. On mobile the dropdown spans the compact top bar's width.

## Capabilities

### New Capabilities

- `wave-ledger`: the per-period gold and energy accumulators — their rows, the period
  boundaries, the two identities they satisfy, and their place in hashed state.

### Modified Capabilities

- `run-lifecycle`: the end-of-wave settlement sequence gains a final step — the ledger period
  closes after the bonus is credited.
- `build-ui`: the treasury readout and the power meter become expandable; the gold ledger and
  energy balance panels, their period-selection rule, the "preparing" block, the kWh/tariff
  presentation, and the disclosure behaviour on both form factors.

## Non-Goals

- **Battery rows.** `charging` (usage) and `battery` (source) slot in as rows when the battery
  change lands; the accumulators gain two fields and nothing else in either panel moves. This
  change adds no placeholder row for the slot.
- **A "saved by solar" gold figure.** Whether the grid would have supplied what solar did is
  unknowable (the tier cap may have said no); the panel shows kWh and the tariff, not a
  counterfactual.
- **Cross-wave history** — a table of past waves, totals over the run, charts. The closed
  period is the only history kept; a run-level view is a later change that reads what this one
  records.
- **Percent-of-total columns, per-structure attribution, an end-of-run ledger screen.** All
  cheap later additions on top of the same state; deferred so the mechanism and the two panels
  land first.
- **Any change to how power, billing, interest or theft are computed.** The ledger observes;
  it never feeds back into a rule.

## Impact

- `src/sim/types.ts`, `src/sim/hash.ts` — the `WaveLedger` struct, two instances on `SimState`,
  their hash lines in the same change per the standing rule.
- `src/sim/sim.ts` — initialise at run start; the energy accumulation after `resolvePower` in
  step 7; the bill in step 9; bonus and the period close at settlement; construction in
  `pushStructure`, `applyUpgrade`, `applyUpgradeGrid`; the wave number in `applyStartWave`.
- `src/sim/economy.ts`, `src/sim/placement.ts` — bounties, interest, the treasury grab, sack
  return, the removal refund each add one line beside the treasury mutation they already make.
- `src/sim/tower.ts`, `src/sim/power.ts` — the engaged/standby split on `TargetPass` and
  `PowerReadout`.
- `src/ui/` — a pure ledger-presentation module (period selection, row models, the
  reconciling rounding, kWh and tariff formatting) with its tests, a disclosure controller,
  and the two panels; `hud.ts` and `powerhud.ts` become the anchors.
- `tests/replay.test.ts` — **both** goldens re-mint once, deliberately: the ledger is top-level
  state walked unconditionally, so even the idle run's hash layout changes. The milestone
  assertions must all still hold, which is the evidence the trajectory did not move.
- `tests/` — a ledger test file asserting every row's accumulation, both identities on every
  tick of a harness run, the close-at-settlement semantics and the opening carry.
- `README.md` (HUD and Power sections), `ARCHITECTURE.md` (§7 where the accumulators are
  written, §9 the disclosure pattern, §1 the decision), `ROADMAP.md` (the battery entry names
  its rows).

No balance shift: nothing in the simulation reads the ledger. No new dependencies.
