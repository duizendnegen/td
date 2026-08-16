# Design: add-energy-infrastructure

## Context

See proposal.md for motivation. What this builds on, as of main today:

- The sim is bit-deterministic integer math at 20 Hz with a documented tick order
  (ARCHITECTURE.md §7): commands → fields → spawns → movement → arrivals → **firing (7)** →
  deaths (8) → **run progression (9: interest, settlement, win checks)** → compaction. Every
  new state field lands in `hash.ts` in the same commit (types.ts standing rule).
- Money is integer milli-gold; interest is integer ppm, floor-truncated, wave-only, positive
  balance only, and does not accrue on the settlement tick (`stepProgression`).
- Structures are `wall | tower`, 1×1, on a blocked mask; placement validation rejects sealing and
  stranding; sockets take towers only and skip path checks; **provisional construction** refunds
  in full until a wave tick has run, committed construction refunds the configured fraction, and
  committed construction cannot be sold while a wave runs (`refundMg`, `liquidationTotalMg`).
  There is no removal delay any more.
- Towers hold `nextFireTick` as an absolute tick and *hold* it while nothing is in range, so
  they fire the moment a target appears; targeting is pure (`selectTarget`).
- Towers have three hand-authored levels; damage grows ~1.7× per level with cost matched.
- Building is allowed during waves; tactical pause is the loop declining to advance — the sim
  has no clock and nothing here may depend on wall time.
- The HUD is the Aether-Industrial console: treasury readout in the top bar, palette rail,
  inspector panel, START WAVE / transport slot; mobile compacts the top bar and swaps the
  inspector with the build menu. Level 1 is a compressed 20×10 board — tiles are scarce.

## Goals / Non-Goals

**Goals:**

- Power as a **ceiling on damage** the player builds toward, never a stock or a currency.
- A model with a **time-varying load curve**, so that storage (the next change) has work to do.
- Every rule integer, hashed or derived, inside the existing tick order; no floats, no clock.
- Zero new UI paradigms: one meter, one extra palette card, one extra inspector row, one
  button.

**Non-Goals:**

- Storage itself, sell-back, variable output, enemy–panel interaction, per-tower priorities,
  overdrive (see proposal). Balancing the actual numbers.

## How the model was chosen

This section is the reasoning behind the decisions below; the decisions are the contract.

**The first draft was a tax.** Towers consumed energy (idle load + per-shot cost) bought from an
unlimited grid; panels reduced the bill; brownout only when broke. Reviewing it against the
game as it now exists exposed the problem: with cost proportional to firing, energy is a
*tax on damage* and a panel is a *tax rebate*. Its incentives are a payback calculation the
player never feels (and in a ten-wave run a late panel never pays back at all) plus insurance
against being broke — real, but only rewarding a player who plans for failure. Nothing made the
player *want* power. Worse, the per-shot term made the bill spiky and reactive, needing a
rolling-window HUD — a drift toward "managing your energy" and away from the maze.

**Reframe: power is the ceiling, not the tax.** The chain the game wants is
money → power → maze → damage: power is the damage *potential*, the maze realises it. That
maps onto RTS supply (you build power because it lets you run more damage) and, one for one,
onto home electricity: a connection with a rated capacity, a tariff on what you draw, solar as
capex that raises the ceiling with no opex, and later a battery. The incentive becomes direct
and legible — a meter — instead of a spreadsheet. Pricing-only variants (progressive tariff, no
cap) were rejected because a slope is not a wall to plan against; a hard cap (refuse placement)
was rejected because the project's language is inform-don't-block (provisional construction,
solvency gate rather than threshold), and because a soft cap unifies "over capacity" and "broke"
under one brownout mechanism.

**Batteries forced the draw model.** A first cut had every tower draw its rating constantly and
every panel produce constantly. Under that model both curves are flat for the whole wave and a
battery has nothing to store or shave — the most satisfying piece of the home-energy metaphor
(grid only when the peak exceeds generation *and* the store is empty) would be dead on arrival.
Variance had to come from somewhere. Supply-side variance (day/night, weather) is artificial at
wave timescales and was already a non-goal. Demand-side variance is free: **a tower draws its
rating while it has a target**, standby otherwise, so the wave itself produces a load curve —
quiet while the first group walks in, a peak when both maze ends are engaged and carriers are
coming back through, a tail. The ceiling then applies to *actual* per-tick draw, exactly like a
real connection: more rated appliances than capacity is fine until they all run at once. This
is not the old per-shot model — engagement is a *state*, so the bill is smooth-ish and no
rolling window is needed — and it is what makes a battery, next change, shave peaks, cut the
bill, and keep towers firing when the treasury is at zero.

**Then a set of concrete calls, each with the reasoning we settled on:**

- *Standby draw, small but non-zero* — a wave is never free, overbuilding carries a mild ongoing
  cost, and there is a baseline for a battery to charge against; the ceiling still bites only
  at peaks.
- *Battery designed for now, shipped next* — this change already asks the playtest whether the
  ceiling reads at all; adding charge state and its HUD would blur that answer. The merit order
  is specified with the storage slot in it.
- *Purchasable, finite connection tiers* over a level-authored capacity or an unlimited grid —
  the explicit "pay the utility more, or go solar" decision *is* the design goal, and a last
  tier gives late-game scaling to solar without an artificial build cap: tiles are the physical
  limit.
- *Flat tariff per level* — escalation lives in the tier costs; per-tier tariffs and standing
  charges are recorded as later knobs, not shipped, to keep the tier decision reasonable.
- *Connection upgrade one-way, anytime* — the one purchase with no undo; a mid-wave "we need
  more power" is a legitimate rescue, and the button says it is final.
- *Cut off at ≤ 0* rather than accrue debt — the bill is a purchase and nothing is bought below
  zero; one rule, no exception to explain; reserve capacity (solar, later battery) becomes real
  insurance and a brownout is dramatic and legible. The cost is that broke-with-no-solar stops
  the towers for that wave; the between-wave sell-to-recover path is unchanged, the stipend
  lever exists, and it is an explicit playtest gate. Debt accrual and a grid credit line are
  recorded as the softer alternatives.
- *Panels on dirt only, blocking, on the wall path* — sockets are scarce free tower platforms,
  not free power; keeping panels on the maze's tiles is what makes the maze the late-game
  limit.
- *Panels priced as deliberate investments (several multiples of a wall)* — walls stay the maze
  piece; the few panels bought each move the meter visibly and compete with a tier upgrade at a
  similar price.
- *One meter plus rated power on every card and row* — enough to plan and to read a brownout at
  a glance; a load graph belongs in debug tooling.
- *Uniform brownout* — one ratio, everything dims; priorities are a natural later change and
  the "player-set budget" idea's proper home.
- *Rated power scales sub-linearly with level* — upgrades are power-efficient, so a tight
  ceiling favours tall over wide, which suits a 20×10 board and keeps the maze from filling with
  level-1 spam.
- *Overdrive not shipped* — a global multiplier is a blunt lever, it contradicts "surplus is
  wasted", and the battery is the better home for surplus; lifting the coverage cap is a
  one-line lever if the ceiling alone under-rewards infrastructure.
- *Capability named `power-grid`* — the HUD speaks in power (kW) and energy (kWh); the name
  follows the theme.

## Decisions

### D1: Rated power per level; draw = rated while engaged, standby otherwise

Every tower level row in balance data carries `ratedPower` (integer milli-power units, mirroring
milli-gold). A tower's draw on a wave tick is its rating if `selectTarget` returned a target
for it this tick, else `floor(rated × standbyFraction)`; the standby fraction is one balance
knob converted to an integer per-1000 at load. Walls draw nothing. Outside a wave nothing
draws (the build phase has no ticks). Slow towers are appliances too: they have a rating like
every archetype.

*Rejected:* constant draw (kills storage — see above); idle + per-shot hybrid (tax feel, spiky,
needs a lag and a rolling HUD); per-shot only (idle towers free, cannot express a ceiling).

### D2: Coverage is computed once per tick from an engaged pre-count; no lag

Step 7 becomes two passes over structures. Pass one runs `selectTarget` for every tower (the
sim already does this per firing tower; it is now done for all, once) and sums the tick's draw.
The power step then resolves supply (D4), yielding `coverage(T)`. Pass two fires the towers
that are due exactly as today, except that a tower that fires schedules
`nextFireTick = tick + ceil(fireIntervalTicks × SCALE / coverage)`; at coverage 0 a firing tower
does not fire and re-checks next tick. Coverage affects only the *next* shot, so there is no
circularity and no one-tick lag: the shot due at T lands at T. Targets found in pass one are
reused in pass two (an enemy killed by an earlier tower in the same tick still makes the later
tower skip, per tower-combat — pass two re-checks `hp > 0` on its cached target and falls back
to re-selecting, preserving that spec).

Coverage and the tick's bill are **derived**, not stored: they are pure functions of hashed state
(structures, `gridTier`, treasury) at one point in the tick. Only `gridTier` is new hashed state.
`SCALE` is 1024, matching the position fixed-point.

*Rejected:* apply `coverage(T−1)` (the earlier design) — unnecessary once demand no longer
depends on shots; fixed-point iteration within a tick — no observable benefit at 50 ms.

### D3: Brownout stretches intervals uniformly; never randomness, never per-tower priority

`c` applies to every tower alike, including slow towers' reapplication cadence (slow *duration*
is untouched). Probabilistic shot-skipping was rejected as replay-visible noise that reads as
flaky rather than weak. Load-shedding by priority is a later change (design lever L2).

### D4: Supply merit order — solar, (storage), grid — with two bounds on the grid

Per wave tick: `solar = Σ panel output`; `deficit = max(0, draw − solar)`;
`gridSupply = min(deficit, tierCapacity, affordable)` where
`affordable = treasury > 0 ? floor(treasury × 1000 / tariffMgPer1000) : 0` in power units
(`tariffMgPer1000` is milli-gold per 1000 power units per tick, converted once at load);
`supplied = solar + gridSupply`;
`coverage = draw === 0 ? SCALE : min(SCALE, floor(supplied × SCALE / draw))`;
`bill = floor(gridSupply × tariffMgPer1000 / 1000)`. Surplus solar (`solar > draw`) is
discarded.

The storage slot sits between solar and grid: the next change inserts
`batterySupply = min(deficit after solar, dischargeRate, charge)` and charges the battery from
surplus solar before discarding it. Nothing else in this order moves.

The `affordable` bound is what makes "the bill can bring the balance to exactly zero, never
below" true, and `treasury > 0` is the cut-off. *Edge, settled in implementation:* a zero
tariff (permitted by the schema) leaves the formula undefined; it is read as a **free grid** —
nothing is bought, so the treasury bound does not apply and the connection never cuts off,
while the capacity bound still holds. No shipped level uses it; the test fixtures that are not
about power rely on it (`INERT_POWER`). This is deliberately stricter than the
placement gate (which permits a purchase at balance ≥ 0 even into debt): a placement is a
discrete player decision; the bill is automatic, and letting it run into debt would be the
debt-accrual variant we rejected.

### D5: Billing joins step 9 before interest; none on the settlement tick

Step 9 becomes: *bill the tick's grid supply → interest on the post-bill balance → settlement
when drained*. Bill before interest is the conservative reading and makes the opportunity-cost
comparison honest (gold spent on power earns no interest that tick). Like interest, billing
does not run on the settlement tick: the tick that drains the field is the last on which a
tower could have been engaged, and step 9 already treats it as "the wave is over" for interest
— forgoing one tick's bill keeps that boundary simple rather than adding a rule for it. The
computation happens in step 7 (D2) because coverage is needed there; the treasury debit is
applied in step 9 so the treasury changes in the step the docs say it does. Between the two,
step 8 bounties can only *raise* the balance, so the step-7 `affordable` bound is never violated
by the step-9 debit.

### D6: Grid connection is a hashed integer tier with a one-way command

`SimState.gridTier` (0-based index into the level's tier table, initial 0) is hashed.
`{ kind: 'upgradeGrid' }` drains after `upgrade` and before `remove` (a same-tick
place/upgrade/upgradeGrid/remove sequence keeps the intuitive order); it is validated by the
spending gate (balance ≥ 0, may go into debt like any purchase) and by "not already at the last
tier"; it is one-way — no `provisional` flag, no refund, and it counts for nothing in
`liquidationTotalMg`. Allowed in any live phase, including during a wave.

*Rejected:* provisional-then-committed tier (chosen against for simplicity — the UI states the
finality instead); build-phase-only (blocks a legitimate mid-wave rescue and would be the only
building action with a phase restriction); a placeable "meter cupboard" structure (should not
compete for tiles — grid is the non-spatial option by design).

### D7: The panel is a third structure kind on the wall's code path

`StructureKind` becomes `wall | tower | panel` (`STRUCTURE_KIND_ID.panel = 2`). Placement,
validation, terrain rules (dirt only), provisional/committed refund, between-wave-only removal
of committed structures, `move` — all reuse the wall path unchanged; the panel's only new
behaviour is contributing `output` in D4. Enemies need no changes: a blocked tile is a blocked
tile. Panels never appear on sockets.

### D8: Units and conversion

Power is an integer unit (name in code: `mp`, "milli-power", so that per-tick quantities and
standby fractions never truncate to zero — the same argument as milli-gold). The tariff is
authored as gold per power unit per second and converted once at load to
`tariffMgPer1000` (milli-gold per 1000 mp per tick, rounded), mirroring `interestRatePpm`;
the bill takes one explicit floor. Panel `output`, tower `ratedPower` and tier `capacity` are
authored as readable units and scaled to mp at load. The HUD renders power as kW and
the bill as gold/s; the unit label is presentation only.

### D9: Brownout is sim-derived state read by the renderer, not an event

Coverage is derived (D2) but exposed on the snapshot for the frame; the renderer tints towers
and the meter from it like any other field. Render events stay for instantaneous things.

## Levers (recorded, not shipped)

- **L1 Overdrive** — lift the coverage cap above `SCALE` so surplus supply speeds towers. One
  constant. Competes with the battery for surplus; consider only if the ceiling under-rewards
  infrastructure after playtest.
- **L2 Priority brownout** — a placement-order or player-set shedding order instead of uniform
  `c`. Needs a visible order and turns brownouts into a per-tower puzzle; also the natural home
  of "player-set budgets".
- **L3 Debt accrual / credit line** — grid keeps supplying below zero (bill deepens the debt),
  optionally down to a per-level floor. Softer spiral, solar becomes savings rather than
  insurance. Fall back to this if broke-with-no-solar proves unrecoverable in play.
- **L4 Per-tier tariff / standing charge** — congestion pricing and vastrecht. Data-only
  additions if the tier decision needs a second reason to prefer solar late.
- **L5 Per-wave stipend** — the pre-existing death-spiral mitigation; now also rescues
  brownouts.

## Risks / Trade-offs

- [Broke with no solar stops the towers] → deliberate; playtest gate on recoverability via the
  between-wave sell path and bounties from solar-fed towers; L3/L5 are the fallbacks.
- [Peaks brown out mid-wave and read as flaky] → the meter turns red at the same moment and
  towers dim; deterministic interval stretch, no randomness; the meter's rated-total mark lets a
  player see the peak coming.
- [Panels obsolete walls] → priced as deliberate investments; walls remain the cheap maze piece
  by intent (proposal, design intent).
- [A second global multiplier on fire rate complicates the leak harness] → the harness gains a
  power-aware run; coverage is logged per tick in headless capture.
- [Golden replay hash changes] → regenerate once, in its own commit, per ARCHITECTURE.md §12.
- [Two-pass step 7 costs one extra `selectTarget` per tower per tick] → towers are few and
  ranges small; if it shows in the ms-per-tick readout, cache the target from pass one (already
  planned in D2).

## Open Questions

- Should the connection-upgrade control live in the meter (recommended) or in the palette rail?
  Decide in UI implementation against the mockups; both are one button.
- Whether standby draw should be one global fraction or per archetype — start global.
- Exact numbers — deferred to balance authoring against `tests/leak.test.ts`, guided by the
  design intent in proposal.md.
