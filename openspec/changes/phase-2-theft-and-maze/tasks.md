# Tasks — Phase 2: Theft & Maze

## 1. Data & sim groundwork

- [ ] 1.1 Extend `data/balance.json` with wall/tower costs, refund fraction, tower stats
      (damage, range, fire interval), enemy `hp`, `carryCapacity`, `bounty`; extend the zod schema
- [ ] 1.2 Extend enemy state in `sim/enemy.ts`: `state` (inbound/returning), `hp`, `carried`;
      add tower and sack flat arrays in `sim/types.ts`
- [ ] 1.3 Add place/remove command types to `sim/commands.ts` with deterministic ordering
- [ ] 1.4 Extend `sim/hash.ts` canonical walk over every new field (towers, sacks, countdowns,
      enemy state/hp/carried) — same change as the fields themselves

## 2. Placement

- [ ] 2.1 Implement `validatePlacement` in `sim/placement.ts` as a pure function on scratch
      buffers: bounds, unoccupied, no enemy in footprint, spawn reachability, live-enemy
      reachability (field matching each enemy's state); unconditional buffer restore (design D1)
- [ ] 2.2 Wire authoritative validation into command apply (tick step 2): charge treasury on
      confirm, mask + field commit; emit `placementRejected` render event on reject (design D8)
- [ ] 2.3 Implement the spending gate: allow at balance ≥ 0 (may go negative), block below 0
- [ ] 2.4 Implement delayed removal in tick step 3: 80-tick countdown, tile blocked throughout,
      unblock + rebuild + 50% refund at expiry (design D3)
- [ ] 2.5 Implement the commitment-invalidation sweep after any mask-change rebuild: re-commit
      enemies whose waypoint tile is blocked or whose committed diagonal has a blocked flank
      (design D2)
- [ ] 2.6 `placement.test.ts`: sealing rejected, stranding rejected, enemy-in-footprint rejected,
      rejection atomicity via hash equality, removal delay/refund timing, invalidation sweep
      (waypoint and diagonal-flank cases)

## 3. Theft economy

- [ ] 3.1 Implement the inbound/returning state machine in `sim/enemy.ts` / `sim/economy.ts`:
      clamped treasury grab, unconditional flip, returning steering by the returning field
- [ ] 3.2 Implement carrier speed: 80% via integer math when `carried > 0`
- [ ] 3.3 Implement spawn escape: despawn returning enemies at active spawns, gold gone for good
- [ ] 3.4 Implement sacks: merge-per-tile drop on carrier death, insertion-order pickup up to
      remaining capacity, inbound-flips-on-pickup (design D7)
- [ ] 3.5 `theft.test.ts`: grab clamps (normal/partial/zero/negative), flip semantics, escape
      permanence, swarm sack splitting, same-tick contention order, inbound pickup flip

## 4. Tower combat

- [ ] 4.1 Implement the rapid-fire tower in `sim/tower.ts`: fire-tick check, squared-distance
      range, minimal-inbound-cost targeting with insertion-order tie-break (design D5)
- [ ] 4.2 Hitscan damage on the firing tick + tracer render event; deaths in tick step 8: bounty
      credit, carrier sack drop, tombstone compaction
- [ ] 4.3 Tower tests: targeting priority and tie-break determinism, damage timing, bounty
      accounting, carrier-kill sack drop, events excluded from hash

## 5. Render

- [ ] 5.1 Wall and tower meshes at correct footprints in `render/towers.ts` (kit square base +
      `weapon-turret`; placeholder wall block)
- [ ] 5.2 Sack meshes and the carried-gold indicator above carriers in `render/enemies.ts`
- [ ] 5.3 Ghost preview mesh with valid/invalid/debt tinting; range ring on tower ghost and
      selection
- [ ] 5.4 Tracer and red-flash reject effects in `render/fx.ts`, both driven by the render-event
      queue
- [ ] 5.5 Removal countdown display on structures

## 6. UI

- [ ] 6.1 Pointer → ground raycast → tile in `ui/input.ts`; click issues placement/removal
      commands only
- [ ] 6.2 Build palette in `ui/palette.ts`: wall + tower, costs, affordable / debt-warning /
      blocked states
- [ ] 6.3 Treasury readout in `ui/hud.ts` updating per frame
- [ ] 6.4 Speculative ghost validation loop: re-evaluate on hovered-tile change or new tick;
      verify hovering never perturbs the hash

## 7. Determinism & replay

- [ ] 7.1 Extend `replay.test.ts` with a golden scripted Phase-2 session: build, removal, theft
      round trip, kill, sack pickup, debt purchase — hash-identical across runs
- [ ] 7.2 Manual cross-check: same seed and script on two machines / reloads produce the same
      `F4` hash

## 8. Docs & deploy

- [ ] 8.1 Update ROADMAP.md: Phase 2 scope gains the minimal rapid-fire tower, bounties, organic
      sack drops, range ring; amend Phase 2 "not in this phase" and debug-sack lines and Phase 3
      accordingly
- [ ] 8.2 Tune `balance.json` to the "kills a carrier sometimes on a good maze" bar; note chosen
      values
- [ ] 8.3 Deploy to the live link and play the gate: theft round-trip feel, mazing
      expressiveness, re-pathing legibility, money-as-health read, sealing/stranding impossible
