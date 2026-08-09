## 1. Field construction: no-transit tiles

- [x] 1.1 Add a no-transit tile set parameter to `buildField`/`buildFieldInto` (relax-in, never
  expand; a field's own sources still expand) per design D2
- [x] 1.2 Extend `tests/flowfield.test.ts`: inbound routing skirts a spawn tile on the cheapest
  geometric route; a spawn tile still receives finite cost and a direction off it; no trace from
  any tile enters a non-source spawn tile

## 2. Enemy origin as hashed state

- [x] 2.1 Add `Enemy.originSpawn` (declared-spawn index) to `types.ts` and its line to `hash.ts`
  in the same commit (standing rule D-P1-2)
- [x] 2.2 Thread the origin through `spawnEnemy`; resolve each wave group's spawn id to its
  declared index in `resolveWaves`; re-key the debug `spawn` command to declared indices, still
  refusing dormant or out-of-range spawns
- [x] 2.3 Update replay/tickseam test expectations for the hash change (outcome: neither golden
  moved — single-spawn level_01's trajectory is bit-identical and both checkpoints hold zero
  enemies; documented in replay.test.ts, hash visibility pinned in hash.test.ts)

## 3. Per-origin returning fields in the sim

- [x] 3.1 Change `Fields` to `{ inbound, returning: FlowField[] }` keyed by declared spawn;
  update `stepEnemies` and `invalidateCommitments` to read `returning[e.originSpawn]`
- [x] 3.2 Rework `Sim`: build 1 + N fields at construction (dormant spawns included), loop the
  rebuild sites (removal rebuild in `commit`), reshape scratch and `swapScratchFields`, and strip
  the field rebuild out of `applyStartWave` (design D1/D4)
- [x] 3.3 Sim-level test: a carrier from the farther of two active spawns exits at its origin,
  not the nearer spawn; spawn activation mid-run changes no field content and forces no re-read

## 4. Rules: escape, validation, sniper

- [x] 4.1 `resolveArrivals`: origin-only escape — compare against the enemy's own spawn tile,
  drop the active-spawns loop (design D5); update `tests/economy.test.ts`
- [x] 4.2 `validatePlacement`: rebuild all scratch fields, check returning enemies against their
  origin field; test that cutting a carrier off from its origin is rejected even with another
  spawn reachable (`tests/placement.test.ts`)
- [x] 4.3 `selectTarget`: sniper carrier cost reads the carrier's origin field; test two carriers
  from different spawns rank by their own fields

## 5. Preview and rendering

- [x] 5.1 `traceLanes`/`currentLanes`/`previewRoutes`: one return lane per active spawn, inbound
  lanes first (design D6); update the `PlacementRoutes` doc comment
- [x] 5.2 Ribbon renderer: style split by index threshold at `activeSpawns.length`; verify
  ghost-trail classification still works per lane (outcome: the renderer already classifies by
  shared/current/projected and pairs lanes by index, so the inbound-first ordering needed no code
  — the pairing contract is now documented in ribbon.ts; verified live via Playwright)
- [x] 5.3 F3 debug overlay: draw every active spawn's returning field

## 6. Docs, baselines, verification

- [x] 6.1 Update ARCHITECTURE.md §7 (field inventory, tick-order notes, spawn-tile transit rule)
- [x] 6.2 Regenerate the capture scenario expectations and ci-media wave-preview baselines
  (outcome: scenario/coverage/capture tests pass unchanged and the golden replay hash proves the
  scenario trajectory is bit-identical; ci-media clips are per-PR CI artifacts — nothing tracked
  in-repo — and the advisory preview job re-renders the clip when this lands as a PR; capture
  mode verified live against the new sim via the __td seam)
- [x] 6.3 Run the full test suite and do exploratory Playwright testing of a two-spawn level:
  carrier return paths, refused placements, ribbon lanes, F3 overlay (212/212 tests + typecheck
  green; level_02 explored in capture mode: dormant/out-of-range spawn commands refused, west
  round trip escapes west, wave-6 activation swaps no field object and changes no content, a full
  two-front wave ran with zero foreign-spawn-tile stands and 8+12 per-origin escapes, 4 lanes with
  correct endpoints, sealing hover refused with red ghost, F3 draws both fields in two shades,
  console clean)
