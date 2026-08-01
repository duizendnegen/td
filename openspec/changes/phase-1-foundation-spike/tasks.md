# Tasks: phase-1-foundation-spike

Ordered per design D-P1-1 (walking skeleton): render half deployed first, sim half headless under
tests, merging at enemy rendering.

## 1. Walking skeleton — board on a live link

- [x] 1.1 Fix ROADMAP doc drift: `base: '/peptd/'` → `'/td/'` (ROADMAP.md line 42)
- [x] 1.2 `render/assets.ts` — GLTFLoader wrapper, load the used model set, build the single shared
      `MeshLambertMaterial` from `colormap.png`, all fetches through `import.meta.env.BASE_URL`;
      model registry keyed by name
- [x] 1.3 `render/renderer.ts` — scene, single directional light + ambient, resize handling,
      sim→world coordinate conversion (the one place the y-down→z-forward flip lives)
- [x] 1.4 `render/ground.ts` — 30×20 ground from tile GLBs merged into one geometry via
      `mergeGeometries` (verify: one draw call in the renderer info)
- [x] 1.5 `render/cameras.ts` — architect ortho (whole board, ~55–60° pitch, fixed yaw) and
      commander perspective (~45° FOV, ~25–35° pitch, treasury-framed, orbitable yaw); Tab toggle
      with ~400 ms eased transition, safe under mid-transition re-toggle
- [x] 1.6 `main.ts` + `app/game.ts` — boot enough to render the static board with camera toggle
- [ ] 1.7 Push to `main`; verify Pages workflow deploys and all GLB/texture requests succeed under
      `/td/` (no 404s, no missing-texture warnings)

## 2. Sim core — headless, tests first

- [ ] 2.1 `sim/fixed.ts` — `TILE`/`HALF`/`DIAG` constants, tile↔unit helpers, the single
      `normalize` with `Math.trunc(Math.sqrt(...))`; `tests/fixed.test.ts` (normalisation
      exactness, truncation at negatives, no float leaks)
- [ ] 2.2 `sim/rng.ts` — xoshiro128** with `Math.imul` throughout, seedable; known-answer tests
      against published reference vectors (design D-P1-6), plus same-seed-same-sequence test
- [ ] 2.3 `sim/types.ts` — sim state and enemy entity types (integer fields only, `prevPos`
      alongside `pos`, absolute-tick timers)
- [ ] 2.4 `sim/hash.ts` — FNV-1a canonical walk over ALL sim state (tick, RNG state, treasury,
      every entity field in insertion order), colocated with types; test: single-field change
      changes hash
- [ ] 2.5 `sim/commands.ts` — command types, queue, drain sorted by type then issue sequence
- [ ] 2.6 `sim/sim.ts` — `Sim` class with the documented tick order (snapshot prevPos → commands →
      … → compact → increment); `app/loop.ts` — 20 Hz accumulator, `MAX_FRAME_MS` clamp at 5
      ticks/frame, alpha out to render

## 3. Grid, flow fields, level data

- [ ] 3.1 `sim/grid.ts` — tile storage and blocked mask for 30×20
- [ ] 3.2 `sim/flowfield.ts` — dual multi-source Dijkstra (inbound from treasury, returning from
      all active spawns), 8-connected 1024/1448 costs, bucket queue, corner-cut prevention at
      build time, `dir: Int8Array` + `cost: Int32Array`, −1 for unreachable
- [ ] 3.3 `tests/flowfield.test.ts` — reachability; costs monotonic toward source; no diagonal
      between corner-to-corner blocked pairs; enclosed tile marked unreachable; same mask → same
      field
- [ ] 3.4 `data/schema.ts` — zod schemas per ARCHITECTURE §10 with `waves` allowed empty (spec:
      level-data); float rates converted to integers once at load; load-time spawn→treasury
      reachability check
- [ ] 3.5 `tests/level.test.ts` — schema rejects bad spawn refs, unknown enemy types,
      out-of-bounds/blocked treasury or spawns, sealed levels; accepts `waves: []`
- [ ] 3.6 Author `level_01.json` instrumented gauntlet (design D-P1-4: S-curve, ≥2
      corner-to-corner pairs, diagonal stretch, dead-end pocket); add the Phase-1 enemy
      speed-only stat block to `balance.json`

## 4. Enemies end-to-end — the halves merge

- [ ] 4.1 `sim/enemy.ts` — waypoint-committed steering (commit tile centre, fixed-speed step via
      `normalize`, epsilon arrival, re-read field), timed spawning at active spawns, despawn at
      treasury
- [ ] 4.2 `tests/replay.test.ts` — fixed seed, N ticks, golden hash; plus display-rate
      independence (1-tick steps vs 5-tick steps reach identical hash). Mint the golden only
      after 2.1–2.2 and 3.3 are green
- [ ] 4.3 `render/enemies.ts` — enemy meshes (`enemy-ufo-b`), prev/pos interpolation against
      accumulator alpha, frame-time hover bob + yaw spin (render-only)
- [ ] 4.4 Wire the full loop in `app/game.ts`: load+validate data → build sim from seed → loop →
      render; verify smooth 60 fps motion against the 20 Hz sim on the deployed link

## 5. Debug tooling

- [ ] 5.1 `render/debug.ts` — `F1` flow-field arrows (both fields colour-coded, blocked tiles,
      unreachable marked), `F2` enemy waypoint lines + state, `F4` tick/hash/entity-count/ms-per-
      tick readout
- [ ] 5.2 Fast-forward probe key — synchronously run 2 000 ticks through the normal tick path, log
      tick + hash to console (design D-P1-3)
- [ ] 5.3 `?seed=` URL override with hardcoded default; seed flows only through `Sim` construction

## 6. Gate verification

- [ ] 6.1 Deploy final state; run the two-machine check: same `?seed=` on two devices, probe key,
      identical tick + hash
- [ ] 6.2 Walk the ROADMAP Phase-1 gate checklist on the live link: F1 corner rule by eye, motion
      smoothness, one-material rendering, camera legibility judgement, ms-per-tick headroom with
      ~50 enemies
- [ ] 6.3 Record gate outcome (and the camera verdict specifically) — if the commander view adds
      nothing, note the single-camera fallback decision per ROADMAP
