# Phase 3 — Combat

## Why

Phase 3 is the ROADMAP's tactical layer: the rock-paper-scissors of four tower archetypes versus
three enemy types that makes placement position meaningful. Two Phase-2 playtest verdicts fold
into it (recorded in `openspec/phase-3-exploration.md`): the 2×2 tower footprint fails the mazing
vocabulary — towers must be 1×1 wall segments that shoot — and the current balance lets one
rapid-fire tower beat every enemy, which would make the phase gate ("does each enemy type punish
the missing archetype?") unjudgeable.

## What Changes

- **All structures become 1×1** (**BREAKING** for the placement spec and saved replay hashes):
  the tower footprint shrinks from 2×2 to 1×1, towers slot directly into wall lines, the render
  drops its 2× model scale, and the enemy-in-footprint check covers one tile.
- **Three new tower archetypes** — sniper (carriers-first-then-strongest cascade over the two
  flow fields), area damage (instant burst around the target's position), slow (timed status,
  `slowUntil = max`, single global slow %) — joining the Phase-2 rapid-fire baseline.
- **Three upgrade levels per tower**, dual-axis per archetype (rapid: rate+damage; sniper:
  range+damage; area: range+damage; slow: range+duration), hand-authored integer level tables,
  cost curve matched to compounded power (~1.7×/level), refund = 50% of total invested. Towers
  gain `archetype` and `level` state (hash walk extended, golden replay hashes regenerated).
- **Enemy variety**: real swarm / tank / runner stat blocks (`hp, speed, carryCapacity, bounty,
  slowImmune`), a typed spawn command, and the slow-immune block defined but unused until
  Phase 4.
- **Rebalance as a counter-matrix contract**: baseline numbers re-authored (range first) so that
  at equal spend every mono-archetype defense leaks against its punisher type while the correct
  mix holds — verified by a headless leak-rate harness, not by feel alone.
- **Gate instrumentation**: a debug spawn panel with authored burst presets (per-type bursts +
  mixed pressure), shaped like Phase-4 wave groups but scheduled app-side by injecting ordinary
  spawn commands — `sim/waves.ts` stays empty.
- **Render**: modular tower height per level (re-judged at 1×1 spire proportions), weapon-head
  yaw, muzzle flash / impact / AoE burst events, slowed status icon joining the carried-gold
  indicator.
- **UI**: full four-tower palette; tower inspector with level, stats, upgrade cost and
  next-level range ring; `F3` tower ranges and target lines.
- **Docs**: README / ROADMAP / ARCHITECTURE sweep for the 1×1 footprint; the Phase-3 gate
  reworded — "swarm wave" → "swarm burst", and the mazing criterion becomes the composition
  question (walls and towers as a single mazing vocabulary).

## Capabilities

### New Capabilities

- `tower-upgrades`: the three-level upgrade system — level tables, dual-axis scaling, cost
  curve, the upgrade command and its validation, refund of total invested, and the
  height-per-level render contract.
- `enemy-variety`: the three real enemy stat blocks plus the reserved slow-immune block, the
  typed spawn command, debug burst presets, and the counter-matrix balance contract with its
  headless leak-rate harness.

### Modified Capabilities

- `tower-combat`: single-archetype requirements generalize to four archetypes; new targeting
  cascades (sniper: carriers by returning-field cost, else max-hp by inbound-field cost; area:
  burst radius; slow: status application); within-tick skip-the-dead target selection; slow
  non-stacking; new render events.
- `structure-placement`: the 2×2 tower footprint requirement becomes all-structures-1×1.
- `build-ui`: palette grows to four towers; inspector gains upgrade action, per-level stats and
  next-level range preview; slowed status icon requirement.
- `debug-tooling`: `F3` range/target-line overlay; debug spawn panel with typed burst presets.

## Impact

- **Code**: `sim/tower.ts` (archetypes, cascades, upgrades), `sim/enemy.ts` (`slowUntil`,
  typed stats), `sim/placement.ts` + `sim/grid.ts` (1×1), `sim/commands.ts` (upgrade command,
  typed spawn), `sim/hash.ts` (new fields), `app/` (burst preset expander), `render/towers.ts`
  (1× scale, modular height, head yaw), `render/fx.ts` (burst/muzzle/impact, status icons),
  `render/debug.ts` (F3), `ui/palette.ts`, `ui/inspector.ts`, `data/balance.json` (level
  tables, enemy blocks), `data/schema.ts`.
- **Tests**: targeting cascade suites, slow non-stacking, upgrade cost/refund, 1×1 placement,
  multi-kill tick, the leak-rate harness; Phase-2 golden replay hashes regenerated (tower
  struct migration + footprint change).
- **Docs**: README, ROADMAP (Phase-3 scope + gate rewording), ARCHITECTURE (footprint, tower
  state shape).
- **Depends on** the archived `phase-2-theft-and-maze` implementation; no open changes
  conflict.
