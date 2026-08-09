## 1. Feasibility spike (throwaway — nothing under `src/` is touched)

- [x] 1.1 Add Playwright as a dev dependency and a throwaway probe script that boots the built app
      on a runner, waits for `__td` to exist, and takes one screenshot
- [x] 1.2 Run the probe on `ubuntu-latest` via a temporary `workflow_dispatch` workflow; confirm
      headless Chromium renders the three.js scene (SwiftShader) and the screenshot is not blank
- [x] 1.3 In the same probe, confirm a frame driven manually inside a `requestAnimationFrame`
      composites before `page.screenshot()` returns — render two visibly different states back to
      back and verify the screenshots differ
- [x] 1.4 Confirm `await document.fonts.ready` resolves on the runner and that Material Symbols
      glyphs render as icons, not as literal ligature text
- [x] 1.5 Encode a handful of probe frames to animated WebP with ffmpeg, post it in a throwaway PR
      comment from `ci-media`, and confirm GitHub serves it animated (finding: raw
      `raw.githubusercontent.com` embeds are not Camo-proxied at all)
- [x] 1.6 Write the verdict into design.md (Risks section): what passed, what needs the GIF
      fallback, and any runner flags required

## 2. APPROVAL GATE

- [x] 2.1 **STOP. Present the spike verdict and wait for explicit approval before continuing.** If
      headless WebGL or per-frame compositing fails and has no workaround, abandon the change — no
      application code has been touched. If Camo rejects animated WebP, get agreement on the GIF
      960×540 fallback (design D9) before proceeding — approved 2026-08-07: animated WebP works,
      no fallback
- [x] 2.2 On approval, delete the throwaway probe script and the temporary `workflow_dispatch`
      workflow

## 3. Capture seam in the application

- [x] 3.1 Split `startGame` into `buildGame(canvas)` that wires data, renderer, UI and input and
      returns the tick/render handles; move the real-time loop start to `src/main.ts`
- [x] 3.2 Change the render closure to take `nowMs` as a parameter instead of reading
      `performance.now()`; the normal path passes `performance.now()`, preserving current behaviour
- [x] 3.3 Add `?capture=1`: build the game fully but do not start the loop, and expose the
      frame-stepping seam on `__td` alongside the existing handles
- [x] 3.4 Verify the normal boot path is unchanged — `npm test` and `npm run typecheck` green, and
      the game plays identically without the parameter
- [x] 3.5 Add a test asserting capture-mode stepping reaches the same state hash as a normal run to
      the same tick with the same seed and command stream (spec: "Capture mode uses the same tick
      path")

## 4. Scenario and anti-drift coverage

- [x] 4.1 Author `.github/capture/scenario.json` as a scheduled command stream: two archetypes at
      tick 0, three `startWave` commands, the remaining two archetypes plus wall placements after
      warm-up, then the capture-window `startWave` with injected tank and brute spawns (5 walls,
      not ~6 — measured economy: 256.2g after wave 3 funds a 240g build, leaving the wave-4
      startWave solvency gate 16.2g of headroom)
- [x] 4.2 Add a vitest test reading `src/data/balance.json` and the scenario, asserting the scenario
      places every tower archetype and spawns every enemy type — including `brute` (design D6)
- [x] 4.3 Confirm the test fails as intended by temporarily adding a fifth enemy type to
      `balance.json`, then revert
- [x] 4.4 Sanity-check the scenario's economy against `balance.json`: two towers at tick 0 fit
      inside 200 gold, and three waves of bounties plus wave bonuses fund the remaining two towers
      and the walls

## 5. Capture driver and encoding

- [x] 5.1 Write `.github/capture/capture.mjs`: launch Chromium at 1280×720 with
      `deviceScaleFactor: 1`, open the built app with `?capture=1` and an explicit `?seed=`, await
      `document.fonts.ready`
- [x] 5.2 Load the scenario and feed it through `__td.scheduler.add(...)`
- [x] 5.3 Implement state-driven warm-up: step until `runPhase === 'build' && waveIndex === 3`, with
      a tick ceiling that fails loudly rather than looping forever (design D11)
- [x] 5.4 Assert after warm-up that the expected structures are placed and `runPhase !== 'lost'`;
      fail with a message naming what was missing
- [x] 5.5 Capture ~120 frames: step 2 ticks, render with `nowMs = tick × TICK_MS` inside a
      `requestAnimationFrame`, screenshot to a numbered PNG
- [x] 5.6 Encode the frames to animated WebP at 10 fps with ffmpeg (or the GIF fallback if the spike
      required it), and assert the output is under a size ceiling (8 MB; measured 3.34 MB)
- [x] 5.7 Run the driver locally against the built app and iterate until the clip reads well —
      window opens at wave-start+30 so spawns arrive ~0.5 s in; the debug spawn panel is collapsed
      via its own header click; warm-up's undrained render events are dropped before the first
      frame (they would open the clip on a phantom fireworks burst)

## 6. Workflow and delivery

- [x] 6.1 Add `.github/workflows/ci.yml` with a required `test` job running `npm ci`, typecheck and
      vitest on `pull_request`
- [x] 6.2 Add the advisory `preview` job: `needs: test`, not a required check, guarded on
      `github.event.pull_request.head.repo.full_name == github.repository` so fork PRs skip cleanly
- [x] 6.3 Build, run the capture driver, and push the clip to the `ci-media` branch as
      `pr-<n>/<sha>.webp`
- [x] 6.4 Create or update a single marked sticky comment embedding the
      `raw.githubusercontent.com` URL; confirm a second push updates the same comment rather than
      adding one (verified on PR #9: the success comment became the failure comment in place)
- [x] 6.5 On capture failure, update the same sticky comment with the reason and a link to the run
      instead of leaving it stale or silent (design D10)
- [x] 6.6 Add a `pull_request: closed` step that deletes `pr-<n>/` from `ci-media`
      (ci-media-prune.yml; verified pr-9/ was deleted on close)
- [x] 6.7 Mark `test` as a required status check on `main` in repository settings; leave `preview`
      unrequired

## 7. Verification and documentation

- [x] 7.1 Confirm the preview appears inline, renders animated, and shows the four archetypes and
      four enemy types (verified on PR #8 — the change's own PR serves as the no-visual-delta
      baseline; animated bytes confirmed via ANIM chunk and frame inspection)
- [x] 7.2 Open a throwaway PR that changes something visual; confirm the difference is visible in
      the clip (PR #9: scene-background tint, clearly visible)
- [x] 7.3 Force a capture failure and confirm the sticky comment reports it and the PR remains
      mergeable (PR #9 push 2: rock-tile placement → "3/4 towers, 8/9 structures" in the comment,
      PR still MERGEABLE)
- [x] 7.4 Document the capture mode and the demo-agnostic boundary in ARCHITECTURE.md, and note the
      `ci-media` branch's purpose and pruning in README.md
