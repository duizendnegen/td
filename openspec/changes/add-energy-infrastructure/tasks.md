# Tasks: add-energy-infrastructure

> **Sequencing note:** the codebase is currently a Phase-0 scaffold. These tasks assume the
> roadmap's Phase 2 (placement/economy) and Phase 3 (towers firing) exist — this change is
> blocked until then. Groups 1–2 could land earlier since they only touch data and structure
> plumbing.

## 1. Data & Schema

- [ ] 1.1 Extend `src/data/schema.ts`: per-level tower fields `idleLoad`/`shotCost`, new `panel` block (`cost`, `output`), level `economy.energyTariff`; floats convert to integer milli-units once at load (mirror the interest-rate conversion)
- [ ] 1.2 Add placeholder energy values to `src/data/balance.json` and `energyTariff` to `src/data/levels/level_01.json`
- [ ] 1.3 Extend `tests/level.test.ts`: schema rejects missing/negative energy fields; conversion produces integers

## 2. Sim — Panel Structure

- [ ] 2.1 Add `panel` as a structure kind in `src/sim/grid.ts` and `src/sim/types.ts` (1×1, blocks pathing)
- [ ] 2.2 Add a build-panel command in `src/sim/commands.ts`; route through the existing wall placement/validation/removal path in `src/sim/placement.ts` unchanged
- [ ] 2.3 Extend `tests/placement.test.ts`: panel seal-attempt rejected; panel removal keeps tile blocked for 80 ticks

## 3. Sim — Energy Flow

- [ ] 3.1 Add sim state: per-tick demand accumulator, solar supply sum, `coverage` (fixed-point, scale 1024, initialised to full); include in the FNV-1a canonical hash
- [ ] 3.2 Tower step: accumulate idle load per active-wave tick and per-shot cost on fire; apply `coverage(T−1)` by stretching `nextFireTick` per design D-E3 (`c = 0` → hold fire, re-check each tick)
- [ ] 3.3 Economy step (before interest): subtract solar from demand, buy remainder at tariff up to `max(0, balance)`, store new coverage; no accrual outside active waves
- [ ] 3.4 Update the documented tick order in ARCHITECTURE.md §7 and add the decision log entries (units, coverage lag, interval stretching)

## 4. Sim Tests

- [ ] 4.1 New `tests/energy.test.ts`: idle + shot demand accounting; solar offset; excess solar wasted; bill drains treasury; billing floors at zero balance; no accrual during build phase
- [ ] 4.2 Brownout scenarios: half solar coverage at ≤0 balance → half fire rate; no solar → no fire; bounty recovery restores full rate next tick
- [ ] 4.3 Interest interaction: interest accrues on the post-bill balance
- [ ] 4.4 Regenerate the replay golden hash deliberately, in its own commit, per ARCHITECTURE.md §12

## 5. Render & UI

- [ ] 5.1 Panel mesh in `src/render/` (kit asset or placeholder decal) at 1×1 footprint
- [ ] 5.2 Palette entry in `src/ui/palette.ts` with cost, greyed when unaffordable or balance < 0
- [ ] 5.3 HUD energy readout in `src/ui/hud.ts`: demand, solar supply, net gold/sec (20-tick rolling window)
- [ ] 5.4 Brownout indication: HUD warning + tower visual state driven by `coverage` from the snapshot
- [ ] 5.5 Debug overlay: add coverage and current bill to the F4 readout

## 6. Docs

- [ ] 6.1 Update README.md economy and build-rules sections with energy, panels, and brownout
- [ ] 6.2 Record the wall-vs-panel pricing question and brownout-recoverability question in the open-questions lists (ARCHITECTURE.md §15 / ROADMAP.md)
