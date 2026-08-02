# Phase 4 — The Run — Tasks

## 1. Terrain data and schema

- [x] 1.1 Extend `data/schema.ts`: char-map `terrainMap` + legend replacing `terrain.blocked`;
      validation for row count/length, unknown characters, spawns/treasury on dirt (D5)
- [x] 1.2 Add `terrain: Uint8Array` to `grid.ts` (dirt/grass/rock/socket), blocked mask
      initialized from `kind !== dirt`; level load parses the char-map into it
- [x] 1.3 Re-author `level_01.json` terrain as a char-map with grass/rock variety and ≥1
      socket, preserving every instrumented-gauntlet feature (S-curve, corner pairs, diagonal
      stretch, dead-end pocket); assert the level-data scenario still passes
- [x] 1.4 Copy `tower-square-bottom-b.glb` from the kit into `public/models/`

## 2. Placement: terrain rules and all-spawn validation

- [x] 2.1 Terrain buildability in `placement.ts`: dirt accepts walls+towers, socket towers
      only, grass/rock nothing; new `not-buildable` verdict wired through ghost preview
- [x] 2.2 Socket placement branch: bounds/terrain/occupancy/`canSpend` only — no mask write,
      no field rebuild, no enemy-in-footprint check (D6)
- [x] 2.3 Socket removal asymmetry: countdown and refund without unblocking the tile or
      rebuilding fields (D6) — dedicated test
- [x] 2.4 Validation iterates all declared spawns (dormant included) against the inbound
      scratch field; escape and returning-field sources stay `activeSpawns` (D4); test that
      walling off a dormant spawn is rejected

## 3. Render: palette and masonry

- [x] 3.1 `buildGround` per-kind templates: dirt→`tile-dirt`, grass→`tile`, rock→`tile-rock`,
      socket→`tile` + `tower-square-bottom-b`; still one merged mesh built once (D10)
- [x] 3.2 Wall mesh becomes `tower-square-bottom-a`, placeholder retired; visual check that
      wall / tower / occupied socket read as one masonry family

## 4. Sim: run state, commands, hash

- [x] 4.1 `SimState` gains `runPhase`, `waveIndex`, group cursors, and summary counters
      (`stolenMg`, `escapedMg`, `kills`); counters accumulate in grab/escape/death code (D1)
- [x] 4.2 `startWave` command: valid only in `build` with balance ≥ 0 and waves remaining;
      applies activation atomically — `activeSpawns` update + returning-field rebuild, no
      commitment invalidation (D7)
- [x] 4.3 `concede` command: any run phase → `lost`
- [x] 4.4 Extend the canonical hash walk over all new state; commands and rejects covered by
      replay-equivalence tests

## 5. Wave scheduler

- [x] 5.1 Implement `sim/waves.ts`: group cursors emit typed spawns on delay/interval schedule
      in step 4; debug timer path removed from real runs (D2)
- [x] 5.2 Drained detection: all cursors exhausted AND no live enemies after step 8; edge test
      for a wave whose enemies die before its last group spawns
- [x] 5.3 Scheduling tests: exact spawn ticks, overlapping groups, start-during-active-wave
      rejection, dormant spawn emits nothing and is no escape target

## 6. Economy completion

- [x] 6.1 Overdraw: remove the `max(0, …)` clamp in `resolveArrivals`; grab is always full
      remaining capacity; update `theft.test.ts` scenarios (negative treasury bleeds,
      interception recovers)
- [x] 6.2 Interest: load-time float→ppm conversion; step-9 accrual
      `floor(treasuryMg * ratePpm / 1e6)` only while a wave is active and balance > 0 (D3)
- [x] 6.3 Settlement in step 9: sack return in insertion order, then progression judgment —
      `won` / `settled-locked` / `build`; `settled-locked` re-judged every tick for refund-driven
      wins (D2)
- [x] 6.4 Economy tests: interest gating (build phase, debt, wave), settlement order
      (same-tick death-drop sacks return), solvency gate lock/unlock via refunds,
      solvent-to-win and indebted-finish-liquidates paths

## 7. UI

- [x] 7.1 Wave counter + upcoming-wave preview from wave data, marking newly activating spawns
- [x] 7.2 Start-wave control: enabled build-phase-solvent only; debt state names the balance
      and points at selling; hidden during active waves
- [x] 7.3 Win / lose screens rendering the run summary (stolen, escaped, kills, final balance)
- [x] 7.4 Concede control with the impossible-recovery notice driven by the liquidation-total
      query (D8)

## 8. Level and wave authoring

- [x] 8.1 Author level_01's 10 teaching waves: runners ~3, tank check ~5, swarm check ~7;
      tune against the leak harness with overdraw in place
- [x] 8.2 Author `level_02.json`: two spawns (second `activeFromWave` mid-run), full palette,
      10 waves, brute debuting in the back half
- [x] 8.3 `level.test.ts`: both levels load, char-map validation rejections, waveless level
      rejected, group-at-dormant-spawn rejected, activation-wave consistency

## 9. Golden hashes, docs, deploy

- [x] 9.1 Regenerate golden replay hashes once, from a scripted full-run session (waves,
      overdraw, settlement, win) — after all state-shape changes land (D9)
- [x] 9.2 Docs sweep: README bankruptcy paragraph (solvency gate, no −100), ROADMAP Phase-4
      scope and gate list, ARCHITECTURE §5 economy and §7 tick order
- [x] 9.3 Verify the deployed build: a full level_01 run start-to-win, a deliberate debt
      spiral with sell-to-recover, a concede, and level_02's second front opening mid-run
