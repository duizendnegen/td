# Tasks — Phase 3: Combat

## 1. Footprint migration (1×1)

- [x] 1.1 Make `footprintFor` return a single tile for towers; delete NW-anchor handling and
      multi-tile paths in `sim/placement.ts` / `sim/grid.ts`; update `sim/types.ts` comments
- [x] 1.2 Drop the 2× tower model scale in `render/towers.ts`; verify ghost, range-ring center,
      and raycast picking against the 1×1 footprint
- [x] 1.3 Update `placement.test.ts` for 1×1 towers (single-tile occupancy, enemy-in-footprint,
      tower-into-wall-line placement)

## 2. Balance schema and data

- [x] 2.1 Extend `data/schema.ts`: per-archetype `levels` arrays (cost, damage, fire interval,
      range, duration as applicable), archetype-level fixed stats (burst radius, global slow %),
      full enemy stat blocks with `type` keys, zod-validated
- [x] 2.2 Author initial `balance.json` rows: four archetypes × three levels (dual axes per
      D2, placeholder tuning), real swarm/tank/runner blocks, reserved slow-immune block

## 3. Sim: enemy variety and slow state

- [x] 3.1 Add `type` to enemy state; spawn path reads the typed stat block; spawn command gains
      the type parameter; debug/timer spawns name a type
- [x] 3.2 Add `slowUntil` to enemy state; movement applies carrier factor then slow percentage
      in the pinned integer order; `slowImmune` short-circuits application
- [x] 3.3 Extend the canonical hash walk over `type`, `slowUntil`, tower `archetype` and
      `level`; extend `F2`/`F4` readouts where they show enemy state

## 4. Sim: archetypes and targeting

- [x] 4.1 Generalize `sim/tower.ts` to archetype stat lookup; towers fire in insertion order
      within the tick; target selection skips `hp <= 0`
- [x] 4.2 Sniper cascade: `carried > 0` by minimal returning-field cost, else max stat-block hp
      by minimal inbound-field cost, ties by insertion order
- [x] 4.3 Area burst: flat damage within `radiusSq` of the target position; `aoeBurst` render
      event; verify multi-kill bounty and same-tile sack merge
- [x] 4.4 Slow shot: first-along-path target, `slowUntil = max(...)`, no damage, no bounty path
- [x] 4.5 Targeting tests: cascade precedence (laden carrier over tank), zero-carry returner
      excluded, escape-imminence ordering, equal-tank focus fire, skip-the-dead, build-order
      pinning, slow non-stacking and expiry, slowed-carrier speed composition

## 5. Sim: upgrades

- [x] 5.1 Upgrade command in `sim/commands.ts`: validate (exists, level < 3, no removal
      countdown, balance ≥ 0), charge, apply level stats same tick; atomic rejection
- [x] 5.2 Removal refund reads total invested (base + upgrades) × refund fraction
- [x] 5.3 Upgrade tests: stat/charge atomicity, debt block, max-level terminal, refund base
      includes upgrades, upgrade-timing hash divergence

## 6. App: debug burst presets

- [x] 6.1 Preset expander in `app/`: `{type, count, spawnInterval}` groups → typed spawn
      commands injected at future tick boundaries; no sim-side schedule state
- [x] 6.2 Author presets: one burst per enemy type plus one mixed-pressure preset
- [x] 6.3 Replay-equivalence test: recorded command stream reproduces burst hashes without the
      panel

## 7. Render

- [x] 7.1 Modular tower composition: kit segment per level per archetype (square bases +
      weapon heads, round + crystals for slow) at 1×1 spire proportions
- [x] 7.2 Weapon head yaws toward current target (cosmetic, render-side)
- [x] 7.3 FX: muzzle flash, impact effect, AoE burst from the `aoeBurst` event
- [x] 7.4 Status icons above enemies: carried-gold (existing) plus slowed, driven from sim
      state read-only

## 8. UI

- [x] 8.1 Palette: all four archetypes with level-1 costs, existing affordability/debt/blocked
      states
- [x] 8.2 Inspector: archetype, level, stats, next-level cost, upgrade action (palette-
      consistent states), removal control, maxed state at level 3
- [x] 8.3 Next-level range ring preview on upgrade-action hover for range-scaling archetypes
- [x] 8.4 `F3` overlay: tower range boundaries and target lines from sim state
- [x] 8.5 Debug spawn panel wired to single spawns and the presets from task 6.2

## 9. Balance tuning and the leak harness

- [x] 9.1 Leak-rate harness: headless scripted runs (authored layout at fixed spend vs authored
      burst) measuring escaped gold; layouts, bursts, thresholds as versioned test data
- [x] 9.2 Directional assertions: each mono-archetype defense leaks against its punisher; each
      countered mix holds (per the enemy-variety spec scenarios)
- [x] 9.3 Tune `balance.json` rows against the harness and by play: range-first rebalance of
      rapid, then author the ladder (~1.3× stats, cost matched to compounded power)

## 10. Golden hashes, docs, deploy

- [x] 10.1 Regenerate golden replay hashes once, from a scripted session exercising typed
      spawns, all four archetypes, an upgrade, a multi-kill, a slow, and a removal refund with
      upgrades (per D10 — after all state-shape and balance changes land)
- [x] 10.2 Docs sweep: README / ROADMAP / ARCHITECTURE for 1×1 footprints; ROADMAP Phase-3
      gate rewording ("swarm burst", mazing-vocabulary criterion); record the footprint change
      as a Phase-3 scope note
- [ ] 10.3 Verify the deployed build: all four towers placeable and upgradeable, bursts
      produce the counter reads, F3 legible — then deploy to the live link
