# Exploration log

## 2026-08-21 — Post-wave energy and treasury statistics ("wave ledger")

Prompted by: "After a wave, I want to see how much I spent on energy from the grid, and how
much I avoided spending from renewables (solar and later battery)."

Explored in the context of `add-energy-infrastructure` (complete, at its playtest gate). This
entry is a **handover**: Part A is a temporary console hack to land in the
`add-energy-infrastructure` workspace now so the numbers can inform balance work; Part B is
the design for the proper change that replaces it.

### The problem, and why the obvious answers fail

A post-wave list with `Energy bill −13` and `Solar savings +26` as sibling rows promises to
add up and doesn't (the 26 is not gold that moved). `−13 (+26)` is a second signed number with
no referent. `Energy bill 39` implies the utility knows about the panels. All three break the
one property that makes a stats list worth reading: **it reconciles** — start-of-wave treasury
plus the rows equals the treasury now.

### Decisions

- **Two readouts, two vocabularies.** The treasury readout (top bar) expands downward into a
  **gold ledger**; the power meter expands into an **energy balance**. The only bridge is the
  grid row: in the energy panel it is marked `(billed)`, in the treasury ledger it is the single
  row `Energy`. The treasury never explains solar; the energy panel never sums gold.
- **Rule for the gold ledger: top-level rows reconcile to the treasury delta.** Anything that
  is not a cash flow is a memo row — indented, unsigned, dimmer — or lives in the other panel.
- **The energy balance is two columns that total the same number by construction**, every
  tick and therefore every wave. "Where it went" vs "where it came from":

  ```
  USAGE              kWh   SOURCES           kWh
  engaged             31   solar              30
  standby              8   battery             —
  charging             —   grid (billed)      13
  wasted               4   unmet               0
  ─────────────────────   ─────────────────────
                      43                      43
  ```

  `wasted` is surplus solar discarded (later: what charging eats). `unmet` is the brownout —
  demand nobody covered — and carries no gold figure because it could not have been bought
  (tier cap or empty treasury). Per tick the identity is
  `engaged + standby + charging + wasted = solar + battery + grid + unmet`.
- **"Avoided spending" is a valuation, not a counterfactual.** Solar covered N kWh *worth N ×
  tariff at the tariff*; whether the grid would have supplied it is unknowable (the tier cap
  may have said no). So the panel never says "saved". It shows the flat tariff in its header
  (e.g. `1.0 g/kWh`) so kWh ↔ gold is one multiplication the player can do.
- **Battery slots in as rows, not structure**: `charging` on the usage side, `battery`
  (discharge) on the source side, each summed separately over the wave (charge state persists
  across waves, so the net need not be zero). Source rows read top-to-bottom in merit order.
- **Scope: `add-energy-infrastructure` stays closed as designed.** The expandable-readout
  pattern is one UI paradigm with two instances and the accumulators are one sim mechanism
  with two consumers — both belong to a new change. Only the temporary hack (Part A) lands in
  the energy workspace.

---

## Part A — temporary console summary (hack, lands in `add-energy-infrastructure`)

Purpose: see the per-wave energy balance and the two gold figures while playing, to inform
balance authoring for energy infrastructure. Console output is fine. Dev-only. Every line of
it carries the marker `TEMP(wave-ledger)` so the proper change (Part B) can grep and remove it.

### Seams

- `src/sim/sim.ts` — `PowerReadout` (`sim.power`): per-tick, derived, unhashed, overwritten
  every advance, `IDLE_POWER` outside a wave and on the settlement tick. Has `drawMp`,
  `solarMp`, `gridSupplyMp`, `coverage`, `billMg`.
- `src/sim/tower.ts` — `preTargetTowers` sums `drawMp` via `drawOf(t, engaged, data)`.
- `src/app/game.ts` — `tickOnce` calls `stepOnce` (exactly one `sim.tick`) then
  `releasePauseOnPhaseChange`, which already detects the phase transition out of `wave`.
- `src/data/schema.ts` — `GameData.tariffMgPer1000` (mg per 1000 mp per tick).
- `src/sim/fixed.ts` — `POWER`, `GOLD`, `TICK_HZ` for presentation scaling (see the `kw`
  helper in `src/render/debug.ts`).
- `tests/leak.test.ts` — `powerRun` already builds a per-wave table from `sim.power`
  (`POWER_LOG=1 npx vitest run tests/leak.test.ts`).

### Tasks

1. **Split the readout's draw** (not temporary — the proper change wants it too): `TargetPass`
   and `PowerReadout` gain `engagedMp` and `standbyMp` with `drawMp = engagedMp + standbyMp`;
   `preTargetTowers` sums them separately. `IDLE_POWER` gets zeros. Unhashed, derived — no
   golden change. Update `tests/power.test.ts` with one case asserting the split.
2. **App-side per-wave accumulator** in `src/app/game.ts`, guarded by `import.meta.env.DEV`:
   after `stepOnce`, if `sim.state.runPhase === 'wave'` read `p = sim.power` and add to the
   current wave's sums:
   - `engaged += p.engagedMp`, `standby += p.standbyMp`
   - `solarUsed += min(p.solarMp, p.drawMp)`, `wasted += max(0, p.solarMp − p.drawMp)`
   - `grid += p.gridSupplyMp`
   - `unmet += p.drawMp − min(p.solarMp, p.drawMp) − p.gridSupplyMp`
   - `billMg += p.billMg`
   - `ticks++`, `brownTicks += coverage < COVERAGE_SCALE ? 1 : 0`
   Assert (dev-only) the per-tick identity `engaged + standby + wasted === solar + grid + unmet`.
3. **Flush on leaving the wave phase** (hook into `releasePauseOnPhaseChange`'s transition, or
   a sibling observer): print one `console.table` with the two columns in mp·tick *and* as a
   share of the balance total, plus three gold lines:
   - `grid bill` = `billMg` (exact — what step 9 debited)
   - `solar at tariff` = `floor(solarUsed × tariffMgPer1000 / 1000)` — labelled as a valuation
   - `unmet at tariff` = same for `unmet` — what the ceiling denied
   Also print the wave index, tick count, brown-tick count and the tier at settlement. Reset
   the accumulator on the transition *into* `wave`.
4. **Optional, same buckets in the harness:** extend `WavePower` in `tests/leak.test.ts` with
   the same fields so `POWER_LOG=1` shows the identical balance for the authored scenarios.
   Keeps the live console and the harness telling one story.
5. `npm run typecheck && npm test` green; replay golden unchanged (nothing hashed moved).
   Commit on the workspace branch with a title that says it is temporary, e.g.
   `chore(temp): per-wave power balance console summary — TEMP(wave-ledger)`.

Non-goals for the hack: any HUD, any sim state, any hashing, any unit work beyond raw mp·tick
and shares. Presentation units are Part B's problem.

---

## Part B — the proper change (`add-wave-ledger`, name open)

Replaces Part A. A proposal has **not** been written; this is the input to one.

### What it builds

- **Sim:** per-wave accumulators on `SimState`, hashed (standing rule: every state field is
  hashed the commit it lands), reset at `startWave` alongside `waveDamage`
  (`src/sim/sim.ts`, the structures loop in `startWave`). Integer sums of the per-tick figures:
  - energy: `engagedMp`, `standbyMp`, `solarUsedMp`, `solarWastedMp`, `gridMp`, `unmetMp`
    (battery change adds `chargedMp`, `dischargedMp`)
  - gold: `bountiesMg` (step 8), `interestMg` (step 9), `billMg` (step 9), `constructionMg`
    net of refunds (commands: place / upgrade / remove / move / upgradeGrid), `stolenMg` and
    `recoveredMg` (arrivals and sack return), and the existing `lastWaveBonusMg` — decide
    whether it folds into the struct.
  The bill sum is exact (it is what was debited). Solar-at-tariff is presentation, computed
  from the kWh figure; it is never stored.
- **UI:** one expandable-readout affordance, two instances. Click the treasury readout → the
  gold ledger drops down; click the power meter → the energy balance drops down. Mobile: the
  top bar is compact; the expansion is a dropdown in both layouts — design against the
  mockups' language. The energy panel header shows the level's tariff.
- **Remove the `TEMP(wave-ledger)` hack** from `game.ts` (keep the readout split from Part A
  task 1; keep the harness columns if Part A task 4 was done).
- **Docs:** README (HUD section), ARCHITECTURE (§7 where the accumulators are written; decision
  log).

### Rows

Gold ledger (top-level rows sum to the treasury delta over the window):
`Bounties`, `Wave bonus`, `Interest`, `Construction` (net), `Energy` (= grid bill),
`Stolen`, `Recovered`. Theft is the row the reconciliation rule surfaces — without it the list
cannot add up.

Energy balance: as in the table above. Label: the sim and the design say `standby`; pick one
word for the UI and keep it.

### Open questions for the proposal

- **Window.** Energy is unambiguous (nothing happens outside a wave). Construction is not —
  building happens in the build phase. Options: *wave start → settlement* (a wave report card;
  build-phase construction lands in the next wave's ledger) or *settlement → settlement* (a
  true period ledger, live during build as "this period so far"). Decide once for both panels.
- **Live or post-hoc.** During a wave the panels could show "this wave so far" from the same
  accumulators; after settlement they show the last wave. Probably free; confirm it reads.
- **Unit.** The meter speaks kW; the balance wants an energy unit. Per-tick mp summed over
  ticks is `mp·tick`; `kWh`-style presentation is `Σ kW / TICK_HZ / 3600` — small numbers at
  20 Hz over a ~60 s wave. Pick a scale that reads (kWh with a multiplier, or "kWs"/"kJ") — it
  is presentation only, like the kW label.
- **`lastWaveBonusMg` and `waveDamage`** are the precedents for per-wave figures; the new
  struct should either absorb the former or sit beside it consistently.
- **Percent column** — a share-of-total beside each row is cheap and may be the most legible
  part of the energy panel; decide in UI against the mockups.

### Relationship to other changes

- `add-energy-infrastructure`: unchanged except Part A. Its design D4 merit order is the order
  of the source rows.
- Battery (designed-for follow-up): adds `charging` / `battery` rows and the accumulators
  behind them; nothing else in the ledger moves.
- `tower-damage-stats`: per-tower damage is the per-structure precedent; the ledger is per-run
  state, not per-structure.
