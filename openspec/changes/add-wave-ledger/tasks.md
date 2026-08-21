# Tasks — add-wave-ledger

## 1. The ledger as hashed state (sim)

- [x] 1.1 Add `WaveLedger` to `src/sim/types.ts` exactly as design D1 (waveNo, openingMg, seven gold rows, six energy rows) with doc comments naming each row's writer and direction, and `SimState.ledger` / `SimState.lastLedger`; add an `openLedger(openingMg)` constructor returning a fresh period
- [x] 1.2 Hash both slots in `src/sim/hash.ts` — one `mix()` per field, open period then closed, walked unconditionally — same commit, per standing rule D-P1-2
- [x] 1.3 Initialise `ledger = openLedger(startingTreasuryMg)` and `lastLedger = openLedger(0)` in the `SimState` initialiser in `src/sim/sim.ts`
- [x] 1.4 Test in `tests/hash.test.ts`: two states differing only in `ledger.billMg`, and two differing only in `lastLedger.waveNo`, hash differently (wave-ledger spec, "hashed state")

## 2. Gold writers

- [x] 2.1 `src/sim/economy.ts`: `bountiesMg +=` beside the bounty credit in `resolveDeaths`; `interestMg +=` the floored amount in `accrueInterest`; `stolenMg +=` beside the grab in `resolveArrivals`; `recoveredMg +=` per sack in `returnSacks` (design D3)
- [x] 2.2 `src/sim/sim.ts`: `billMg += this.power.billMg` beside the step-9 debit; `bonusMg +=` beside the settlement bonus credit; `constructionMg +=` in `pushStructure`, `applyUpgrade` and `applyUpgradeGrid`
- [x] 2.3 `src/sim/placement.ts`: `constructionMg −=` the refund in `removeStructure`
- [x] 2.4 `applyStartWave`: `s.ledger.waveNo = s.waveIndex` beside the `waveDamage` reset (design D2)
- [x] 2.5 Settlement branch of `stepProgression`, after the progression judgement: `s.lastLedger = { ...s.ledger }; s.ledger = openLedger(s.treasuryMg)` (design D2, run-lifecycle delta)
- [x] 2.6 Tests in a new `tests/ledger.test.ts`: place 100 then remove while provisional nets construction to 0; a connection upgrade adds its cost to construction and nothing else; the bill row equals the sum of debits over a wave; interest row equals the sum of credits; a theft adds to stolen and the settlement's sack return to recovered; the bonus lands in the period that is then closed
- [x] 2.7 Tests: the period opens at run start with the starting treasury and `waveNo 0`, `lastLedger.waveNo` is 0 before the first settlement; build-phase spending then `startWave` gives `ledger.waveNo` = that wave with construction carried; settlement copies to `lastLedger` (a copy — mutating `ledger` afterwards leaves it alone) and opens a fresh period whose `openingMg` equals the settled balance

## 3. Energy split and writers

- [x] 3.1 `src/sim/tower.ts`: `preTargetTowers` sums `engagedMp` alongside `drawMp` and returns both on `TargetPass`; `src/sim/sim.ts`: `PowerReadout` and `IDLE_POWER` gain `engagedMp` (derived, unhashed) (design D4)
- [x] 3.2 In step 7, immediately after `resolvePower` inside the `runPhase === 'wave'` branch: compute `solarUsed`, `wasted`, `unmet` per design D4 and add the six energy rows to `s.ledger`; the `else` branch adds nothing
- [x] 3.3 Tests in `tests/ledger.test.ts`: surplus solar splits into used/wasted with grid and unmet 0; a tier-capped tick puts the shortfall in unmet; a broke tick puts the whole deficit in unmet; build-phase ticks with towers standing change no energy row; the settlement tick's draw is in the energy rows while the bill row did not move that tick (design D4 note)
- [x] 3.4 Tests: `engagedMp + standbyMp === Σ drawMp` over a wave, and `engagedMp` is rated power × engaged ticks for a single tower with a known engagement window

## 4. The identities, every tick

- [x] 4.1 Lift the leak harness's `powerRun` driver (or its scripted-run core) into `tests/helpers.ts` so `tests/ledger.test.ts` can step the same power-aware scripts tick by tick
- [x] 4.2 Assert on every tick of both harness scripts: `openingMg + bountiesMg + bonusMg + interestMg − constructionMg − billMg − stolenMg + recoveredMg === treasuryMg`, and `engagedMp + standbyMp + solarWastedMp === solarUsedMp + gridMp + unmetMp` — on the open period; and at each settlement that the closed period satisfies the gold identity against the new period's `openingMg`
- [x] 4.3 Extend one script so the identity run also covers a removal refund, a connection upgrade and a mid-wave concede, if the existing scripts do not already

## 5. Determinism

- [x] 5.1 Re-mint **both** goldens in `tests/replay.test.ts` once, deliberately, with a dated header note in the style of the earlier notes: thirty unconditional fields joined the walk, so `GOLDEN_IDLE_HASH` moves this time and that is expected; every milestone assertion (balances, kills, phases at their ticks) must hold unchanged before the new values are accepted (wave-ledger spec, "cannot alter a trajectory")
- [x] 5.2 `npm test` and `npm run typecheck` green; `tests/scenario.test.ts` and `tests/capture.test.ts` untouched

## 6. Presentation module (pure)

- [x] 6.1 `src/ui/ledger.ts`: `shown(ledger, lastLedger)` per design D5 returning `{ period, preparing }`; `reconcile(parts, total)` largest-remainder rounding per design D6; `KWH_PER_MP_TICK = 1 / (POWER × TICK_HZ)` and `formatKwh`, `formatTariff(tariffMgPer1000)` per design D7; row-model builders for the gold blocks (label, sign, display value) and the energy columns
- [x] 6.2 Tests in `tests/ledger-ui.test.ts`: `shown` for pre-first-wave, mid-wave, build-phase, final-settlement-won, conceded-mid-wave; `reconcile` on a case where independent floors sum one short and one long, result within one unit per part and summing exactly; a block's displayed rows sum to `floor(closing) − floor(opening)` for a constructed milli-gold case; `formatKwh` on the harness magnitudes (215 100 mp·tick → `10.8`), `formatTariff(12)` → `0.24`

## 7. Disclosure controller

- [ ] 7.1 `src/ui/disclosure.ts` per design D8: register `(control, panel)` pairs; `role`, `tabindex`, `aria-expanded`, `aria-controls`; toggle on click and Enter/Space; one open at a time; Escape closes only while something is open; a capture-phase document `pointerdown` outside control+panel closes without cancelling the event; panel hidden/shown by class swap, `z-50`, `pointer-events-auto`
- [ ] 7.2 `src/ui/hud.ts` and `src/ui/powerhud.ts`: expose the slot element as the control; keep their existing rendering untouched

## 8. The two panels

- [ ] 8.1 `src/ui/ledgerhud.ts`: build the gold ledger panel under the treasury slot — block header (`WAVE n` / `PREPARING WAVE n`), `Opening`, the seven signed rows, rule, `Closing` / `Balance` — with the recessed-slot / mono-figure / caps-label vocabulary; mobile variant spans the compact bar (design D8/D9)
- [ ] 8.2 Build the energy balance panel under the power meter — header `WAVE n · 0.24 g/kWh`, two columns (`USAGE` engaged/standby/wasted, `SOURCES` solar/grid (billed)/unmet), rules, equal totals; the "No wave has run yet" line before wave 1
- [ ] 8.3 Per-frame update from `game.ts` after the sim step: compute `shown`, build a content key, write DOM only when it changes and only for the open panel; wire the disclosure pairs in `game.ts` where `TreasuryHud` and `PowerHud` are constructed
- [ ] 8.4 Playwright (desktop): open the gold ledger in the build phase before wave 1 — preparing block only; place a tower and see construction and balance move; start wave 1 — header flips to `WAVE 1`, rows move live; let it settle — figures freeze; build — `WAVE 1` block plus `PREPARING WAVE 2` whose balance equals the readout; sum the displayed rows by hand once and confirm they reconcile
- [ ] 8.5 Playwright (desktop): energy balance during and after a wave — both totals equal, grid marked billed, tariff `0.24 g/kWh`, one-decimal figures in the ~10–70 range; open it while the gold ledger is open and confirm the ledger closed; Escape closes; a click on a tile closes the panel and the tile responds (ghost/reject) on that same click; Enter on the focused readout opens it with `aria-expanded="true"`
- [ ] 8.6 Playwright (mobile viewport): both panels open as a strip under the compact bar without covering it, the wave counter and start control stay reachable, tapping the control again closes

## 9. Documentation

- [ ] 9.1 `README.md`: HUD section — the two expandable readouts and what each shows; Power section — one sentence on the kWh convention (a second of wave time is an hour; the authored tariff is the g/kWh shown)
- [ ] 9.2 `ARCHITECTURE.md` §7: where the ledger is written (the ten sites, step 7 energy, the settlement close) and the two identities; §9: the disclosure pattern and the pure presentation module; §1 decision log: one entry for the settlement-bounded period with the display flip at wave start, and why
- [ ] 9.3 `ROADMAP.md`: the home-battery entry names the rows it adds (`charging` under usage, `battery` under sources) and the two accumulator fields
