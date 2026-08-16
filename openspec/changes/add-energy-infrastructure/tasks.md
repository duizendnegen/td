# Tasks: add-energy-infrastructure

> Groups 1–2 are data and structure plumbing; 3–4 are the power step and its tests; 5–6 are
> render/UI and docs. The replay golden regenerates once, in its own commit (4.5), after the sim
> work is complete. Numbers in balance and level data are placeholders shaped by the design
> intent in proposal.md; tuning is balance authoring, not this change.

## 1. Data & Schema

- [x] 1.1 `src/data/schema.ts`: per-level tower `ratedPower`; balance `power.standbyFraction`
      (0–1) and `panel { cost, output }`; level `power { tiers: [{ capacity, cost }], tariff }`
      with a non-empty, strictly ascending tier table; convert once at load into `GameData`
      (`ratedPowerMp` per level, `standbyPer1000`, `panelCostMg`, `panelOutputMp`,
      `tiers[].capacityMp/costMg`, `tariffMgPer1000`) mirroring the `interestRatePpm` pattern
- [x] 1.2 Placeholder values in `src/data/balance.json`, `src/data/levels/level_01.json`,
      `src/data/levels/level_02.json` following the design intent (tier 1 sized so gold binds
      early; panel a deliberate investment; sub-linear rated power per level; every archetype
      rated, slow included)
- [x] 1.3 `tests/level.test.ts`: missing block / missing rating / non-ascending tiers / negative
      values rejected with the field named; converted values are integers

## 2. Sim — Panel Structure & Grid Tier State

- [x] 2.1 `src/sim/types.ts`: `StructureKind` gains `panel` (`STRUCTURE_KIND_ID.panel = 2`);
      `SimState.gridTier` (initial 0). `src/sim/hash.ts`: mix `gridTier` — same commit
      (standing rule)
- [x] 2.2 `src/sim/placement.ts` + `src/sim/sim.ts` (`applyPlace`): panel takes the wall branch
      (dirt only, blocking, path/enemy validation, cost from `panelCostMg`); `move` and
      `remove` need no new branch beyond the kind check; confirm `refundMg` /
      `liquidationTotalMg` treat panels as any structure
- [x] 2.3 `src/sim/commands.ts`: `{ kind: 'upgradeGrid' }` in `KIND_ORDER` after `upgrade`,
      before `remove` (renumber the tail; existing pairwise order preserved); `sim.ts`
      `applyUpgradeGrid`: spending gate (≥ 0, may go into debt), reject at last tier, charge
      next tier cost, `gridTier++`, no provisional state
- [x] 2.4 `tests/placement.test.ts`: panel seal attempt rejected; panel on socket rejected;
      panel provisional refund in full, committed at the fraction, refused during a wave;
      `tests/movetool.test.ts`: a panel moves like a wall. `tests/upgrade.test.ts` (or new):
      `upgradeGrid` gate, last-tier refusal, charge, hash changes on tier

## 3. Sim — Power Step

- [x] 3.1 New `src/sim/power.ts`: pure `resolvePower(draw, solar, tierCapacity, treasuryMg,
      tariffMgPer1000)` → `{ gridSupply, coverage, billMg }` per design D4 (solar → [storage
      slot] → grid; `affordable` bound; coverage in SCALE 1024; floor once); `drawOf(structure,
      engaged, data)`; `solarOf(structures, data)`
- [x] 3.2 `src/sim/tower.ts`: split `fireTowers` into a target pre-pass (every tower,
      `selectTarget` once, engaged flag + cached target, sum draw) and the firing pass; the
      firing pass re-checks the cached target's `hp > 0` (re-selects if dead, per tower-combat)
      and schedules `nextFireTick = tick + ceil(interval × 1024 / coverage)`; at coverage 0 a due
      tower holds (no advance). Slow towers included
- [x] 3.3 `src/sim/sim.ts`: step 7 computes draw → `resolvePower` → coverage → fires; the tick's
      `billMg` and coverage are carried on the sim (derived, unhashed) to step 9 and the
      snapshot; step 9 debits the bill before `accrueInterest`, none on the settlement tick;
      no power step outside `runPhase === 'wave'`
- [x] 3.4 Snapshot / render-facing read of coverage, draw, solar, grid supply, tier, capacity,
      bill (for the meter, tower tint, F4) — read-only, never mutated by render
- [x] 3.5 ARCHITECTURE.md: §5 add the power unit and tariff conversion; §7 tick order step 7
      ("target pre-pass, power resolution, firing") and step 9 ("grid bill, then interest…");
      decision log entries for engagement-based draw, per-tick ceiling, merit order with the
      storage slot, uniform interval stretch, one-way tier

## 4. Sim Tests

- [ ] 4.1 New `tests/power.test.ts`: engaged vs standby draw; walls draw nothing; nothing
      outside a wave; solar first, surplus wasted; grid bounded by capacity; grid bounded by
      the positive balance (balance lands exactly at zero); cut off at ≤ 0 and resumes on a
      bounty; bill precedes interest (interest on post-bill balance); no bill on the settlement
      tick
- [ ] 4.2 Coverage/brownout in `tests/tower.test.ts` or `power.test.ts`: full coverage = today's
      cadence; half coverage doubles the interval; coverage 0 holds fire without advancing;
      slow tower stretches reapplication not duration; recovery restores full cadence the tick
      coverage returns to 1; peak-then-recover across a spawn burst
- [ ] 4.3 `tests/hash.test.ts`: `gridTier` changes the hash; panel kind hashes distinctly
- [ ] 4.4 `tests/leak.test.ts`: a power-aware run (draw/coverage/bill logged per tick via the
      headless capture) so balance authoring can see peaks and bill share
- [ ] 4.5 Regenerate the replay golden in `tests/replay.test.ts` deliberately, in its own
      commit (ARCHITECTURE.md §12), after 3.x lands

## 5. Render & UI

- [ ] 5.1 `src/render/towers.ts` (`StructureRenderer`): panel mesh (kit asset or placeholder)
      at 1×1; brownout tint on every tower while coverage < 1, distinct from the provisional
      marking
- [ ] 5.2 `src/ui/palette.ts`: panel card (cost, output, wall-style tinting; remove tool covers
      it, not inspectable); rated power on every tower card; `toolStructure` / `costOf` learn
      the panel; touch and pointer drivers need no new branch beyond the tool
- [ ] 5.3 `src/ui/hud.ts` + `hud.css`: the power meter beside the treasury readout — live draw
      vs capacity, solar/grid split, gold/s, tier, warning state while coverage < 1; build-phase
      mode shows rated total vs capacity; the connection-upgrade control (next tier capacity +
      cost, affordability/debt/blocked/maxed states, "final — no refund" wording); mobile:
      compact into the top bar per the form-factor requirement
- [ ] 5.4 `src/ui/inspector.ts`: rated power in the stat rows and next-level rated power beside
      the upgrade cost
- [ ] 5.5 `src/render/debug.ts`: `F4` shows draw, solar, grid, tier/capacity, coverage, bill
      during a wave
- [ ] 5.6 UI tests: palette panel card and remove flow; meter states (warning, maxed control,
      blocked below 0); inspector rated-power rows

## 6. Docs

- [ ] 6.1 README.md: new "Power" section (rated draw while engaged, connection tiers, tariff,
      solar, brownout, broke = cut off, one meter); economy and build-rules sections mention
      panels and the one-way connection upgrade
- [ ] 6.2 ARCHITECTURE.md §15 / ROADMAP.md open questions: recoverability of a broke wave with
      no solar; whether panels-as-investment keeps walls relevant; whether the ceiling alone
      rewards infrastructure enough (overdrive lever L1); whether uniform brownout frustrates
      (priority lever L2)
- [ ] 6.3 Note the battery follow-up change as the next item after this one lands (proposal
      non-goals section already frames it)
