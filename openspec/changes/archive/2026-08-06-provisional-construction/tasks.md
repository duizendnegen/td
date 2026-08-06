# Tasks — provisional-construction

Depends on `time-controls` (the commit/advance split). Section 2's commit point lives in
`advance()`; the paused-wave cases in sections 5 and 6 are unreachable without it.

## 1. Provisional state (sim)

- [x] 1.1 Add `Structure.provisional: boolean` to `src/sim/types.ts` and its line to the canonical walk in `src/sim/hash.ts` — same change, per standing rule D-P1-2 (design D2)
- [x] 1.2 Set it true on placement in `applyPlace` (`src/sim/sim.ts`)

## 2. The commit point

- [x] 2.1 At the start of `advance()`, when `runPhase === 'wave'`, clear the flag on every standing structure — before wave scheduling and combat run for that tick (design D1/D2, run-lifecycle delta)
- [x] 2.2 Verify the simulation never consults pause: the rule reads only "an advance happened while a wave was live" (design D1)
- [x] 2.3 Tests: provisional survives a whole build phase however long; a wave's first advance commits everything; committing `startWave` without advancing does not commit; a placement during a live wave commits on the next tick

## 3. Refund and the phase gate

- [x] 3.1 Select the refund rate per structure in the removal path — full for provisional, `refundPer1000` for committed (design D3, structure-placement delta)
- [x] 3.2 Extend `canRemove` to consult the structure alongside the phase, keeping the wave prohibition intact for committed structures (design D3, `src/sim/placement.ts`)
- [x] 3.3 Tests: full refund returns the balance exactly to its pre-placement value; a provisional tower's upgrades return with it; a committed structure still refunds the fraction; mid-wave removal of committed construction is still rejected atomically
- [x] 3.4 Test the window boundary directly: place during a wave, advance one tick, confirm the removal is now rejected

## 4. Liquidation

- [x] 4.1 Compute `liquidationTotalMg` per structure at the rate each would pay (`src/sim/economy.ts`, design D5)
- [x] 4.2 Test: a run whose provisional full refunds clear the debt is not reported dead, while the same structures committed would be

## 5. UI — the refund the player is about to get

- [x] 5.1 Inspector shows the actual refund and frames a provisional tower's as the revision window, not a better price (`src/ui/inspector.ts`, design D6)
- [x] 5.2 Inspector remove control reads unavailable during a wave only for committed towers (build-ui delta)
- [x] 5.3 Palette remove tool stays usable during a wave and rejects only committed structures, with the ordinary reject feedback; drop the deselect-on-wave-start behaviour (`src/ui/palette.ts`, `src/ui/inputcore.ts`, build-ui delta)
- [x] 5.4 Recovery-impossible notice consumes the per-structure total (`src/ui/wavehud.ts`)

## 6. UI — the board tell

- [x] 6.1 Give provisional structures a visual tell that clears on commit (`src/render/towers.ts`, design D6)
- [x] 6.2 Confirm the tell is render-only: the replay hash is unchanged with rendering on and off

## 7. Determinism

- [x] 7.1 Re-mint `GOLDEN_SCRIPT_HASH` once, deliberately, with a note in the `tests/replay.test.ts` header explaining the new hashed field — matching the existing convention for prior re-mints
- [x] 7.2 Confirm `GOLDEN_IDLE_HASH` does **not** move: that run places nothing, so the walk never reaches structure fields. If it moves, the edit reached further than intended (design D2)
- [x] 7.3 Test: two runs replaying the same seed and commands agree on which structures are provisional at every tick

## 8. Verification

- [x] 8.1 Playwright: build through a build phase, sell one back, confirm the balance returns exactly and the palette affordability recovers
- [x] 8.2 Playwright: pause mid-wave, place a tower, sell it, confirm the full refund and that the board returns to its prior state
- [x] 8.3 Playwright: pause mid-wave, place a tower, advance one tick, confirm it can no longer be sold until settlement
- [x] 8.4 Playwright: confirm the board tell appears on this phase's construction and clears when the wave starts
- [x] 8.5 ~~Playtest the balance shift~~ — **skipped deliberately**: the game is too early for a balance
  read to mean anything, so tuning against it would be noise. The questions stay open, recorded in
  ARCHITECTURE.md §15 question 1 (does free within-phase revision flatten the curve) and in design
  D2 (do upgrade misclicks sting enough to want a committed baseline plus a revert command). Answer
  them when the curve is worth measuring.

## 9. Documentation

- [x] 9.1 ARCHITECTURE.md: the provisional window and its commit point; note that the state hash is a history fingerprint, not a position fingerprint — place-then-sell restores the board but not the hash, because `nextStructureId` is monotonic (design D7)
- [x] 9.2 ARCHITECTURE.md §15: record that question 1 is now partially answered by fiat for within-phase revision, and what remains open
- [x] 9.3 README: the revision window as a player-facing rule
