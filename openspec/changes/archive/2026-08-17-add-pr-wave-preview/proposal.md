# PR Wave Preview

## Why

Pull requests on this repo currently get no automated checks at all — `deploy.yml` only fires on
push to `main` — and nothing shows a reviewer what the game actually looks like after a diff. For
a project whose recent work is almost entirely visual (HUD redesign, mobile layout, enemy shadows,
balance passes), judging a PR means either trusting the description or checking out the branch and
playing it. A short, automatically generated clip of a representative board — real level, real HUD,
every enemy type and every tower archetype on screen — turns that into a glance.

## What Changes

- **First PR checks**: a new `ci.yml` runs typecheck and vitest on every pull request as a required
  check. The repo has none today; the anti-drift guarantee below depends on this existing.
- **Headless frame-stepping seam**: `startGame` splits into `buildGame(canvas)`, which wires
  everything up and returns `{ step, render, … }`, and the real-time loop start, which moves to
  `main.ts`. `?capture=1` suppresses the real-time loop so an external driver can advance the
  simulation and render individual frames on demand, passing an injected `nowMs` so animation
  derives from the tick count rather than the wall clock. This is the render-side twin of the
  existing F8 fast-forward probe.
- **Capture harness (CI-side)**: `.github/capture/` gains a scenario file and a Playwright driver.
  The driver plays the scenario through the existing `SpawnScheduler`, fast-forwards off-camera
  until the board is built up, then captures ~120 full-page screenshots and encodes them to an
  animated WebP.
- **Preview delivery**: an advisory `preview` job pushes the clip to a dedicated `ci-media` branch
  under `pr-<n>/<sha>.webp` and posts (or updates) a single sticky PR comment embedding it. On
  failure the same comment reports the reason instead of going silent. The job skips entirely on
  fork PRs, where the token is read-only.
- **Anti-drift coverage test**: a vitest test asserts the capture scenario exercises every enemy
  type in `balance.json` and every tower archetype. Adding a fifth enemy type fails `npm test`
  locally, before the demo can silently fall behind the game.
- **Approval gate**: the work is sequenced so that a headless-WebGL feasibility spike lands and is
  reviewed *before* any application code changes. If SwiftShader cannot render the scene on a
  GitHub runner, the change is abandoned having touched nothing.

Non-goals, deliberately fenced:

- No committed demo asset in the repo or README — the clip exists only per-PR.
- No before/after comparison against the merge base, and no golden state-hash gate.
- No mobile-layout capture, no debug overlays in the clip, no render-path changes (no
  `preserveDrawingBuffer`).
- The application learns nothing about the demo: no scenario data, no level, no capture content
  under `src/`. `?capture=1` is a mode flag, not a scenario selector.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `debug-tooling`: gains a headless capture-mode requirement — a documented seam that suppresses
  the real-time loop and lets an external driver advance the simulation and render individual
  frames with an injected clock, so a driven frame at a given tick is identical run to run.

The CI workflow, the scenario data, the Playwright driver, the encoding step and the comment
delivery are review tooling, not application behaviour, and get no spec.

## Impact

- `src/app/game.ts` — `startGame` becomes `buildGame` returning the tick/render closures; the
  `render` closure takes `nowMs` as a parameter instead of reading `performance.now()`; `?capture=1`
  skips the loop start.
- `src/main.ts` — starts the real-time loop on the normal path.
- `.github/workflows/ci.yml` — new: required `test` job, advisory `preview` job.
- `.github/capture/` — new: `scenario.json` (the demo command stream) and `capture.mjs` (the
  Playwright driver).
- `tests/` — new coverage test binding the scenario to `balance.json`.
- `package.json` — Playwright as a dev dependency.
- New long-lived `ci-media` branch holding per-PR clips, pruned when PRs close.
- No change to `src/render/`, `src/sim/`, `src/ui/`, level data, or balance data.
