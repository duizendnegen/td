# Proposal: phase-1-foundation-spike

## Why

The two risks that can invalidate the whole project — fixed-point determinism and the WebGL/GLB
pipeline — are cheapest to retire first and ruinously expensive to discover late (a determinism
retrofit rewrites `sim/`, a renderer swap rewrites `render/`). Phase 1 of ROADMAP.md proves both
together, with the minimum gameplay needed to make them observable: enemies walking a hand-authored
maze from spawn to treasury on a deployed, shareable link.

## What Changes

- Implement the fixed-point sim core: `fixed.ts` helpers, seeded xoshiro128** RNG, 20 Hz accumulator
  loop with catch-up clamp, command queue applied at tick boundaries.
- Implement the exhaustive FNV-1a state hash: one canonical walk over **all** sim state (tick, RNG
  state, treasury, every entity field in insertion order), with the standing rule *new sim field ⇒
  new hash line, same commit*.
- Implement dual flow fields (inbound + returning), 8-connected with integer costs, corner-cutting
  prevented at field-build time, plus waypoint-committed enemy steering for one enemy type spawning
  on a debug timer.
- Implement the render pipeline: GLB loading with the single shared `colormap.png` material, 600
  ground tiles merged to one draw call, enemy meshes with procedural hover bob and yaw spin,
  `prevPos`/`pos` interpolation against the accumulator alpha.
- Implement the isometric camera — a single fixed-yaw orthographic projection framing the whole
  board (POC goal #3's first read).
- Implement the debug overlay: `F1` flow-field arrows, `F2` enemy state and waypoints, `F4`
  tick/hash/ms-per-tick readout.
- **Scope additions over ROADMAP as written** (decided in the explore session): a fast-forward debug
  key that synchronously runs N ticks and logs tick + hash, and a `?seed=` URL override — together
  they turn the 2 000-tick two-machine gate check into a five-second comparison.
- Author `level_01.json` as an **instrumented gauntlet**: S-curve turns, corner-to-corner blocked
  pairs, a dead-end pocket — terrain chosen so every debug overlay has something to prove.
- Implement the zod schemas with load-time reachability validation; `waves` is permitted empty until
  Phase 4 introduces the wave loader.
- `balance.json` gains one real enemy entry (speed-only — nothing can deal damage yet).
- Fix ROADMAP doc drift: `base: '/peptd/'` → `'/td/'` (the repo is `duizendnegen/td`;
  `vite.config.ts` is already correct).
- Tests: `fixed.test.ts`, `flowfield.test.ts`, `replay.test.ts` (golden-hash enforcement of the
  determinism contract).

Explicitly **not** in this change: placement, towers, theft, economy behavior, waves, HUD beyond the
debug readout. Enemies reaching the treasury despawn.

## Capabilities

### New Capabilities

- `deterministic-sim`: fixed-point integer simulation — numeric model, seeded RNG, fixed 20 Hz tick
  loop with clamp, command queue, tick order, and the exhaustive canonical state hash.
- `flowfield-pathfinding`: dual multi-source Dijkstra flow fields, corner-cut prevention at build
  time, waypoint-committed enemy steering, timed spawning and treasury despawn.
- `render-pipeline`: GLB/atlas asset loading, single shared material, merged static ground,
  enemy meshes with render-only motion, sim→world interpolation.
- `isometric-camera`: a single fixed isometric orthographic view (45° yaw, ~30–35° pitch) framing
  the whole board.
- `debug-tooling`: F1/F2/F4 overlays, fast-forward N-tick key with hash log, `?seed=` URL override.
- `level-data`: zod-validated level and balance schemas, load-time spawn→treasury reachability
  check, the hand-authored instrumented-gauntlet `level_01`.

### Modified Capabilities

None — this is the first change; no specs exist yet.

## Impact

- **Code**: fills in the stub skeleton across `src/sim/`, `src/render/`, `src/app/`, `src/data/`,
  and `tests/` (Phase-1 files only; `placement.ts`, `economy.ts`, `tower.ts`, `waves.ts` and their
  render/UI counterparts stay stubs).
- **Docs**: one-line ROADMAP correction (`/peptd/` → `/td/`).
- **Deploy**: first real push through the existing GitHub Pages workflow; `npm test` already gates
  the build, so the replay test guards every deploy from day one. GLB fetches must go through
  `import.meta.env.BASE_URL` to survive the `/td/` base path.
- **Dependencies**: none added; uses the pinned three/zod/vite/vitest stack.
- **Sequencing**: walking-skeleton order — tiles + camera deployed first, sim grows underneath, so
  the deploy pipeline is proven on day one and the camera judgement (the gate's predicted failure
  point) marinates for the whole phase.
