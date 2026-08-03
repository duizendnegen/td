# Balance & UX Tweaks

## Why

Playtesting surfaced a cluster of small but compounding issues: enemies are hard to locate on the
board (no grounding shadows, oversized tanks), the area tower trivialises swarms, the interest
rate rewards stretching waves out indefinitely, mobile players cannot reliably zoom or pan, the
30×20 boards feel empty and unfocused, and a finished level dead-ends at a "reload to play again"
message. This change bundles those fixes into one balance-and-polish pass.

## What Changes

- **Tank visual size**: shrink the tank's render scale so it no longer dwarfs the tile grid
  (render-side mapping only; sim stats unchanged).
- **Enemy shadows**: every enemy renders a grounding shadow blob on the terrain beneath its
  hover-bob, making board position legible at a glance.
- **Area tower nerf**: reduce the area archetype's power in balance data so one AoE tower no
  longer erases entire swarm groups on its own (swarms should still be its clear specialty).
- **Mobile camera**: camera zoom and pan on touch devices becomes a hard requirement (SHALL, was
  MAY) — pinch-zoom and drag-pan must demonstrably work on phones; fix whatever currently
  prevents it.
- **Smaller, denser levels**: level_01 and level_02 shrink from 30×20 to 20×10 and are re-authored
  to be more structurally interesting within the smaller footprint. level_01 keeps every
  instrumented-gauntlet feature its spec requires (S-curve, corner-to-corner pairs, diagonal
  stretch, dead-end pocket).
- **Level progression**: winning level_01 offers a "Next level" action on the win screen that
  starts level_02, replacing the reload-only dead end.
- **Wave speed bonus**: end-of-wave settlement credits a bonus that shrinks the longer the wave
  ran, so finishing quickly beats farming a stretched-out wave.
- **Lower interest**: reduce the per-tick interest rate in both levels' economy data (interest was
  the incentive to stretch waves; the wave bonus replaces it as the tempo reward).
- **Cost increases**: slow tower level-1 cost rises to 60 (upper levels rescaled to match), wall
  cost rises to 20, in balance data.

## Capabilities

### New Capabilities

- `level-progression`: the ordered level sequence and the ability to advance to the next level
  after winning the current one.

### Modified Capabilities

- `run-lifecycle`: end-of-wave settlement gains a wave speed bonus credited before the
  solvency/win judgement.
- `isometric-camera`: touch zoom/pan strengthens from MAY to SHALL; default-framing scenarios
  become board-size-generic (boards are no longer fixed at 30×20).
- `render-pipeline`: enemies gain a required grounding shadow.

No spec deltas for the pure data retunes (area nerf, interest, slow/wall costs, tank scale,
level terrain re-authoring) — those live in balance/level data and render mappings whose specs
already defer numbers to data.

## Impact

- `src/data/balance.json` — area tower rows, slow tower costs, wall cost, wave-bonus tuning block.
- `src/data/levels/level_01.json`, `level_02.json` — 20×10 grids, re-authored terrain, lower
  interest rate; wave schedules reviewed against the shorter approach paths.
- `src/render/enemies.ts` — tank scale, shadow blobs.
- `src/render/cameras.ts`, `src/ui/touch.ts`, `src/ui/gestures.ts`, `index.html` — mobile
  zoom/pan fixes.
- `src/sim/` (economy/sim/waves/types/hash) — wave duration tracking and settlement bonus
  (hashed state; determinism-affecting).
- `src/app/game.ts`, `src/ui/screens.ts` — level sequence and the next-level action.
- `tests/` — leak-rate harness re-run against the new balance numbers; settlement/bonus tests;
  level validation tests against the new boards.
