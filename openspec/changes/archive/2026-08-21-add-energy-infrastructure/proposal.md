# Proposal: add-energy-infrastructure

## Why

The economy has one investment decision: spend gold on kill power (towers and the maze that
makes it count) or hold it for interest and the wave bonus. This change adds a second, slower
axis — **power** — that turns the treasury into damage *potential* rather than damage directly:

> money → power → maze → damage

Towers are appliances with a rated power. Power comes from the grid, bought at a tariff through a
connection of limited capacity, or from solar panels the player builds in the maze. Power is the
ceiling on how much damage a defense can run at full rate; the maze is what turns that potential
into kills. Power starts as an operating cost (the grid bill, every wave, forever) and can be
converted, panel by panel, into a one-time cost. The maze is one-time cost only.

The intended arc of a run: early, gold goes to walls and the first towers and the grid bill is a
visible drain; mid-run the connection cap starts to bite at peaks and the player chooses between
paying the utility for a bigger connection or buying panels that both raise the ceiling and stop
the bleed; late, the connection tiers run out (grid congestion), enemies keep scaling, and solar
— which competes with the maze for tiles — is the only thing that scales with them. The player
should come away with an intuition for the real household problem: pay per use, buy capacity,
or generate your own — and later, store it.

The mechanic mirrors home energy infrastructure on purpose (connection tiers, tariff, rooftop
solar, and — as the designed-for next change — a home battery), because that vocabulary is
already legible and because the peak-shaving decisions it produces are the ones we find
satisfying.

## What Changes

- **Towers have a rated power** per archetype and level, defined in balance data. During a
  wave a tower **draws its rating while it has a target**, and a small **standby** fraction
  otherwise. Walls draw nothing. Nothing draws outside a wave.
- **Grid connection with tiered capacity.** Each level authors a table of connection tiers
  (capacity + one-time upgrade cost, escalating; the last tier is the last — congestion). The
  player upgrades the connection by command, anytime, one-way. The grid supplies at most the
  current tier's capacity per tick and bills what it supplies at the level's flat tariff.
- **Solar panel** — new 1×1 buildable on dirt, blocks pathing like a wall, follows the wall's
  placement path (validation, provisional/committed refund, between-wave-only removal of
  committed panels), produces a constant power while a wave runs. Enemies cannot interact with
  panels.
- **Supply merit order** each wave tick: solar first, then the grid up to capacity and up to what
  the positive treasury balance can pay. Surplus solar is discarded (no storage, no sell-back —
  storage is the next change and this order is where it slots in).
- **Soft ceiling via brownout.** Placement is never refused for lack of power. When the tick's
  draw exceeds what could be supplied, every tower runs at coverage `c = supplied / draw`
  (capped at 1): its next shot is scheduled at `interval / c`. Full cadence resumes the tick
  coverage returns to 1.
- **Broke means cut off.** At treasury ≤ 0 the grid supplies nothing (the existing rule that
  nothing is bought below zero); towers run on solar alone. Grid supply resumes the tick a
  bounty brings the balance positive. The bill itself can bring the balance to exactly zero,
  never below.
- **Billing joins step 9 before interest**, mirrors interest's wave-only rule, and charges
  nothing on the settlement tick.
- **HUD: one power meter** beside the treasury readout — live draw against connection capacity,
  solar/grid split, grid cost per second, and the connection-upgrade control (marked as
  non-refundable). Rated power on every palette card and in the inspector's stat rows. Brownout
  reads as the meter going red and towers dimming. `F4` gains the power figures.
- **Data**: balance gains per-level `ratedPower`, a `standbyFraction`, and the panel block
  (`cost`, `output`); levels gain a `power` block (connection tiers, tariff).

### Design intent for balance authoring

Numbers are placeholders until balance authoring; the *relationships* below are the design and
belong to this change:

- Tier 1 is sized so that gold, not power, binds in the opening waves; the cap first bites once
  the player has income to answer it. Because the ceiling is on actual draw, an over-rated
  defense browns out only at peaks — the player meets peaks before being walled by them.
- A panel is a deliberate investment: several multiples of a wall, each panel worth roughly a
  couple of level-1 towers of rated power, so few panels move the meter visibly and a panel
  competes head-on with the next connection tier at a similar price.
- Rated power grows sub-linearly with level (slower than damage), so upgrades are
  power-efficient and a tight ceiling nudges toward tall over wide.
- The bill of a fully grid-fed mid-run defense should be felt without dominating — of the same
  order as interest and the wave bonus, so a mid-run panel or tier upgrade pays back within a
  few waves.

### Non-goals (recorded so they are not rediscovered by accident)

- **Storage / home battery** — *not* a non-goal in spirit: it is the designed-for follow-up
  change. This change fixes the engagement-based draw and the merit order so a battery slots in
  (solar → battery → grid) without reopening anything.
- Selling surplus back to the grid; capacitor-powered burst attacks; harvesting energy from
  enemies; variable solar output (weather / day-night); enemies damaging or draining panels;
  player-set power priorities per tower ("essential" toggles); overdrive (coverage above 1) —
  the last two are recorded in the design as levers, not scope.

## Capabilities

### New Capabilities

- `power-grid`: rated tower power and engagement-based draw, solar panels, the tiered grid
  connection and its upgrade command, the per-tick supply merit order, grid billing against the
  treasury, and coverage/brownout — all wave-only, all integer, all hashed.

### Modified Capabilities

- `structure-placement`: placement covers a third structure kind (`panel`) on the wall's rules
  and terrain (dirt only; sockets stay towers-only).
- `tower-combat`: fire cadence scales with the tick's power coverage — the next-shot interval is
  stretched by `1/c`; slow towers' reapplication cadence stretches the same way.
- `tower-upgrades`: each level entry also defines rated power.
- `build-ui`: the power meter with the connection-upgrade control; a panel palette entry; rated
  power on palette cards and in the inspector; brownout indication.
- `level-data`: the level `power` block (tiers, tariff) and the balance power fields are
  validated at load; the tariff and standby fraction convert to integers once.
- `theft-economy`: interest accrues on the post-bill balance.
- `run-lifecycle`: settlement stops billing alongside interest.
- `debug-tooling`: `F4` shows draw, capacity, coverage and the tick's bill.

## Impact

- **Sim** (`src/sim/`): `types.ts` (`panel` kind, `gridTier`), `hash.ts` (same commit as the
  fields), `commands.ts` (`upgradeGrid`), `placement.ts` (panel on the wall path), `tower.ts`
  (engaged pre-count, cadence stretch), new `power.ts` (merit order, coverage, bill), `sim.ts`
  (power step in step 7/9), `economy.ts` untouched except ordering.
- **Data** (`src/data/`): `schema.ts`, `balance.json`, `levels/level_01.json`,
  `levels/level_02.json`.
- **Render/UI**: panel mesh and brownout tint in `src/render/towers.ts`; meter in `src/ui/hud.ts`
  (+ `hud.css`, mobile top bar); `src/ui/palette.ts` (panel card, kW on cards);
  `src/ui/inspector.ts` (rated power row); `src/render/debug.ts` (F4).
- **Determinism**: two new hashed things — the panel as a structure kind (already walked) and
  `gridTier`. Coverage and the bill are derived per tick, never stored. The replay golden hash
  changes; regenerate deliberately in its own commit (ARCHITECTURE.md §12).
- **Tests**: new `tests/power.test.ts`; panel cases in `tests/placement.test.ts`; schema cases in
  `tests/level.test.ts`; the leak-rate harness (`tests/leak.test.ts`) gains a power-aware run
  for tuning.
- **Docs**: README (economy, build rules, new Power section), ARCHITECTURE (§5 units, §7 tick
  order, decision log, §15 open questions), ROADMAP open questions.
- **Balance risk**: brownout compounds the death spiral (broke with no solar → towers stop) —
  accepted deliberately, gated on playtest; the existing per-wave stipend lever is the
  mitigation. Panels vs walls: priced as a deliberate investment so walls remain the maze piece.
