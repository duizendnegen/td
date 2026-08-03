# Design — balance-ux-tweaks

## Context

See proposal.md for motivation. Relevant current state:

- `src/render/enemies.ts` maps enemy types to kit models with per-type scales (tank at 1.0);
  enemies hover-bob procedurally and have no ground contact cue.
- `src/render/cameras.ts` already implements pinch-zoom and pan generically over the level grid;
  `src/ui/touch.ts` + `src/ui/gestures.ts` route gestures, but only when `game.ts` picks the
  `TouchDriver` — the split is `(hover: hover) and (pointer: fine)` → `PointerDriver` (no camera
  control at all). The isometric-camera spec already SHALLs touch zoom/pan, yet the user reports
  it not working on a phone — root cause must be found, not assumed.
- Settlement lives in `src/sim/sim.ts` + `src/sim/economy.ts` (`returnSacks`, interest in ppm);
  `state.waveStartTick` already exists, so wave duration is `tick − waveStartTick`.
  `resolveWaves` (`src/sim/waves.ts`) yields each group's schedule, so a wave's last scheduled
  spawn tick is computable deterministically.
- `startGame` boots once from `?level=` (`src/app/game.ts`); the win/lose overlay
  (`src/ui/screens.ts`) is render-only and says "Reload to play again".
- The leak-rate harness (`tests/leak.test.ts` + `tests/leakData.ts`) asserts the counter matrix
  directionally and budgets fixtures in gold (e.g. "2 area + 10 padding walls = 200g") — cost
  and stat changes will invalidate fixture arithmetic, not just thresholds.

## Goals / Non-Goals

**Goals:**

- Ship all nine tweaks as one coherent pass, keeping determinism (hash) intact.
- Keep every retuned number in balance/level data; no constants buried in code.
- Re-author the two levels at 20×10 without losing level_01's specced gauntlet features.

**Non-Goals:**

- Desktop (mouse) camera zoom/pan — the fixed framing on fine-pointer devices stays.
- Save/persistence of level progress; progression is per-session via navigation.
- New enemy or tower content; the brute and upgrade system are untouched.

## Decisions

### D1 — Enemy shadows: flat circle meshes, one per enemy

A `CircleGeometry` disc per enemy (shared geometry + shared translucent black material,
`opacity ≈ 0.35`), rotated flat, positioned at the enemy's interpolated x/z at
`GROUND_TOP_Y + ε` (small ε avoids z-fighting; `depthWrite: false`). Radius scales with the
type's model scale so tanks cast bigger blobs than swarms. Lifecycle rides the existing
`meshes` map add/remove in `EnemyRenderer.sync`.

*Alternative rejected*: real shadow-mapped lighting — cost and visual noise far beyond what a
readability cue needs.

### D2 — Tank scale 1.0 → 0.8

Render-side only in `TYPE_MODELS`. Shadow radius follows automatically via D1. 0.8 keeps the
tank the largest silhouette (runner 0.7, swarm 0.6) while fitting the tile better.

### D3 — Area nerf: damage down one step, radius unchanged

Damage per level 26/34/44 → 20/26/34; radius (1.5) and fire interval (15) unchanged. Against
50 hp swarms this moves level 1 from a 2-shot to a 3-shot clear — the archetype stays the swarm
answer but one tower no longer deletes a whole clump alone. *Alternative rejected*: shrinking
the burst radius — that changes placement geometry and reads as a different tower, more than a
"slightly less powerful" tune.

### D4 — Wave speed bonus: linear decay anchored to the last scheduled spawn

New balance block `waveBonus: { baseGold, graceTicks, decayTicks }`. At settlement:

```
lastSpawn = max over groups of (delay + (count−1) × spawnInterval)   // ticks after wave start
duration  = settlementTick − waveStartTick
over      = max(0, duration − (lastSpawn + graceTicks))
bonusMg   = floor(baseGold·GOLD × max(0, 1 − over / decayTicks))
```

Anchoring to the wave's own last scheduled spawn makes par fair per wave (a long wave isn't
punished for its own schedule) with zero new authored data per wave. Integer mg arithmetic,
credited in the settlement sequence after sack return and before the judgement; stored as
`state.lastWaveBonusMg` (hashed) so the HUD can toast it. Starting tune:
`baseGold: 40, graceTicks: 150, decayTicks: 600` — validated against the harness during apply.

*Alternative rejected*: per-wave authored bonus amounts — more authoring surface for no
Phase-relevant gain.

### D5 — Interest halved in level data

`interestRatePerTick` 0.0004 → 0.0002 in both levels. The wave bonus (D4) replaces interest as
the tempo incentive; interest remains a mild reward for a healthy treasury, not a farming
engine.

### D6 — Costs: slow row rescaled from 60, wall 20

Slow tower 40/70/120 → 60/100/170 (preserves the ~1.7× per-level cost ramp so gold-per-output
stays flat per the Phase-3 tuning note). Wall 4 → 20; the 0.5 refund fraction stays (refund 10).
Leak-harness fixtures that budget in walls are re-derived, not fudged: padding-wall counts drop
to keep fixture budgets meaningful.

### D7 — Mobile camera: diagnose first, then fix the routing, not the camera

The camera math already supports zoom/pan; the failure is in reaching it. Reproduce under
Playwright touch emulation, then fix the actual cause. Prime suspects, in order:

1. Driver selection — hybrid/desktop-mode phones can match `(hover: hover) and (pointer: fine)`
   and get the camera-less `PointerDriver`. Fix: prefer touch when `(pointer: coarse)` or
   `maxTouchPoints > 0` indicates a touch screen, keeping fine-pointer-only devices on the
   pointer model.
2. Gesture routing — one-finger pan is suppressed while a build tool is selected (by design),
   which players read as "pan doesn't work"; two-finger pan must therefore be rock-solid, and
   deselecting a tool must reliably restore one-finger pan.
3. Browser gesture interference — confirm `touch-action: none` is effective on the canvas in
   real mobile Safari/Chrome (no page pinch-zoom stealing the gesture).

Regression coverage goes into `tests/gestures.test.ts` / `tests/camera.test.ts` for whichever
cause is confirmed.

**As built:** emulation confirmed true-mobile landscape already worked (portrait is the
by-design rotate prompt); the real gap was suspect 1's device class — hybrids — where
`PointerDriver` gave touch no camera control and let touch taps insta-place. Rather than
swapping hybrids wholly onto the `TouchDriver` (which would have degraded the mouse's one-click
model), `PointerDriver` now ignores `touch`-type pointers and hybrids additionally get a
touch-only `TouchCameraController` (pinch/pan, taps deliberately inert). `gestures.ts` and
`index.html` needed no changes.

### D8 — 20×10 levels re-authored by hand

Both grids become 20 wide × 10 tall (a third of the 600-tile area). level_01 keeps its specced
gauntlet inventory compressed: two gapped rock walls forcing the S-curve, two corner-to-corner
pairs, a diagonal-favoured run into the treasury, one dead-end pocket, and both sockets.
level_02 keeps the two-front shape: west lane through a ridge choke, north spawn opening at
wave 6, sockets covering both approaches. Spawn-to-treasury paths shorten, so interception time
drops; wave schedules get a review pass (spawn intervals stretched where the harness shows the
authored defenses can no longer keep leak rates in band). Load-time reachability validation is
the safety net for re-authoring mistakes.

### D9 — Level progression by navigation, not in-place teardown

The win overlay gains a "Next level" button when the finished level has a successor. Clicking it
navigates to the successor's URL (`?level=2`, preserving an explicit `?seed=` if present), which
reboots the app cleanly — trivially satisfying "fresh run, nothing carried over" with zero
teardown/rebuild machinery in `game.ts`. The sequence is a small static table next to the level
imports (`level_01 → level_02`). `RunScreens` receives the successor's URL (or null) at
construction.

*Alternative rejected*: in-place sim/renderer teardown and rebuild — a new lifecycle surface and
leak risk for no visible benefit at two levels.

## Risks / Trade-offs

- [Balance changes invalidate leak-harness fixtures (wall-count budgets, area kill maths)] →
  Re-derive fixture builds from the new costs as part of the change; treat harness failures as
  tuning feedback, not noise to silence.
- [20×10 paths may be too short for slow/sniper archetypes to matter, warping the counter
  matrix] → Run the harness against the new boards; retune wave schedules (intervals/counts)
  before touching tower stats.
- [Mobile fix is speculative until reproduced] → D7 mandates reproduction under touch emulation
  before any fix lands; if the cause is device-specific beyond emulation, ship the driver-
  selection hardening (suspect 1) as the best available fix and note it.
- [Wave bonus adds hashed state] → Replay/hash tests updated deliberately; any golden hashes in
  tests are regenerated once, in one commit.
- [Navigation-based progression drops the seed unless propagated] → Explicitly carry `?seed=`
  through the next-level URL when present.

## Open Questions

- Exact wave-bonus tuning values (`baseGold`/`graceTicks`/`decayTicks`) and the final wave
  schedules for the 20×10 boards — settled during apply against the harness; the formula and
  data shape are fixed above.
