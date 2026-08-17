# PR Wave Preview — Design

## Context

See `proposal.md` — Why. The relevant current state:

- `startGame` (`src/app/game.ts`) builds `tick` and `render` closures at the bottom of the boot and
  hands them straight to `startLoop`, which paces off `performance.now()` with a 5-tick catch-up
  clamp. Nothing outside can render a frame.
- The render layer never reads the clock: `grep performance.now src/` hits only `game.ts`,
  `loop.ts` and `inputcore.ts`. `now` is threaded in from one call site (`game.ts:218`), so a
  virtual clock is an injection, not a refactor.
- Commands are the only input path into the sim, and `SpawnScheduler.flushDue` (`presets.ts:102`)
  already plays *any* `CommandBody` at a scheduled tick — placements and `startWave` included — and
  is already wired into the tick path (`game.ts:163`). Scenario playback therefore needs no new
  machinery.
- `window.__td` (`game.ts:203`) already exposes `sim`, `commands` and `scheduler` for automation.
  `debug` is deliberately absent, so overlays are reachable only via the `window` keydown handler.
- `LEVEL_SEQUENCE` (`levels.ts:20`) is a static table of build-time imports; `?level=` selects only
  from it. A synthetic capture level is not reachable without changing `src/`.
- `startWave` (`sim.ts:362`) advances one wave and only from the build phase; a wave ends only when
  its cursors are exhausted *and* no enemies remain (`sim.ts:191`). Reaching wave N means genuinely
  clearing N−1 waves.
- Economy arithmetic: starting treasury is 200 and one of each archetype is 50 + 70 + 80 + 60 =
  260, before any wall at 20. Everything scales uniformly by `GOLD` (`schema.ts:288`), so the raw
  ratio holds. **The board cannot be built at tick 0.**
- `index.html:10-17` loads Public Sans, Inter, JetBrains Mono and Material Symbols Outlined from
  the Google Fonts CDN, with system fallbacks in `hud.css:59`.
- `.github/workflows/deploy.yml` is the only workflow and fires only on push to `main`.

## Goals / Non-Goals

**Goals:**

- A reviewer opening a PR sees a readable clip of a representative board without leaving the page.
- The clip cannot silently fall behind the game's roster of enemies and towers.
- The application gains the smallest possible seam, and learns nothing about the demo.
- A frame rendered at a given tick is a function of the tick, not of runner load or frame pacing.
- The feasibility risk is retired before any application code is touched.

**Non-Goals:**

- Pixel-identical output across machines or browser versions (see D4).
- Any capture-related change to the render path — no `preserveDrawingBuffer`, no shader or
  material changes.
- Capturing the mobile/touch layout, debug overlays, or a complete wave from first spawn to last
  kill.

## Decisions

### D1 — Per-PR and ephemeral; nothing is committed

The clip is generated on `pull_request` and delivered to that PR. No `docs/demo.gif` in the repo,
no README hero.

*Alternative considered:* regenerating a committed showcase on push to `main`. Rejected because it
lands after the merge — it cannot inform the decision it was meant to inform — and it puts a
multi-megabyte binary into git history on every visual change. "Kept up to date" is satisfied
structurally instead: the clip is rebuilt every run, and coverage is enforced by D6.

### D2 — One clip of the PR head; no baseline comparison

*Alternatives considered:* (a) a merge-base/head pair side by side, which is the strongest review
signal but doubles runtime and forces an unpleasant choice about *which* checkout's scenario runs
on the baseline side — either both panels move when a PR edits the scenario, or the baseline runs
a scenario naming entities its code may not have; (b) pairing the clip with a committed golden
state-hash asserted in vitest. Both are additive later; neither is needed to make a PR legible.

### D3 — The application stays demo-agnostic

`?capture=1` is a *mode flag*, not a scenario selector. The scenario (`.github/capture/scenario.json`)
and the driver (`.github/capture/capture.mjs`) live entirely on the CI side. The driver plays the
scenario through `__td.scheduler.add(...)`, reusing the existing scheduler.

*Consequence accepted:* there is no convenient way to watch the demo locally, and the coverage test
(D6) has to reach across the boundary into `.github/`.

*Alternatives considered:* an in-app `src/app/scenarios.ts` beside `presets.ts` selected by
`?capture=demo` (nicer for authoring, but puts review-tooling content in the shipped bundle); a
separate `capture.html` Vite entry (clean separation, but a second build target that would also
ship to Pages).

### D4 — Frame-determinism, not pixel-determinism

The driver advances the sim and renders each frame itself; `startLoop` is bypassed. `render` takes
`nowMs` as a parameter, and the driver passes `tick × TICK_MS`, so hover bobs and effect fades are
functions of the tick.

Three rungs were available. Rung 1 (scenario determinism only) already holds for free but is
insufficient: under a loaded runner the real-time loop's catch-up clamp changes *which* ticks get
photographed, so two runs of unchanged code would produce visibly different clips. Rung 3 (byte-
identical output) would additionally require a pinned browser build and would break on every
Chromium bump — and it only pays off for GIF diffing, which D2 rules out. Rung 2 is the sweet spot.

This mirrors the existing F8 probe requirement — "the same tick path as normal running, just driven
synchronously" — which is why the seam is specified as an amendment to `debug-tooling` rather than
a new capability.

### D5 — Full-page screenshots, not canvas readback

`page.screenshot()` per frame captures the canvas *and* the DOM HUD — treasury, wave bar, tower
rail, inspector. Those are precisely what this project's recent PRs change, so a board-only clip
would miss the review.

*Alternative considered:* in-page `canvas.toDataURL()`, which is ~15× faster and needs no
compositor cooperation, but shows no HUD and would require `preserveDrawingBuffer: true` on the
production `WebGLRenderer` — an app change made solely for the demo, against D3's spirit.

*Alternative rejected outright:* CDP `Page.startScreencast`, which emits frames on the compositor's
schedule and lands back on rung 1.

### D6 — Coverage asserted in `npm test`, not in the capture job

A vitest test reads `src/data/balance.json` and `.github/capture/scenario.json` and asserts the
scenario places every tower archetype and spawns every enemy type. It fails locally, the moment
`balance.json` is edited, and blocks merge via the required `test` job.

*Alternative considered:* asserting inside the capture driver. Cleaner against D3's boundary, but
it would only have teeth if the capture job were required — which collides directly with D10. The
chosen split means making capture advisory costs previews, never correctness.

*Consequence accepted:* `brute` (`balance.json:61`, flagged "reserved: slow-immune, Phase 4")
appears in no wave in `level_01`, so the rule forces it into the demo. This is intentional: it is a
declared, renderable enemy type, and the alternative is a hand-maintained exemption list that is
itself a drift vector.

### D7 — `ci-media` branch plus a sticky comment

Actions artifacts are authenticated ZIPs and can never be embedded as an image. The clip is pushed
to a long-lived `ci-media` branch as `pr-<n>/<sha>.webp` and embedded from
`raw.githubusercontent.com` (the repo is public). One marked comment is created and thereafter
updated in place, so a ten-push PR has one preview comment, not ten.

The filename carries the commit SHA deliberately: GitHub proxies images through Camo, which caches
by URL, so a stable path like `pr-42/demo.webp` would serve reviewers the previous push's clip.

*Alternatives considered:* artifact upload plus a link (zero repo weight, but a download-and-unzip
step that in practice means nobody looks); a gist via a PAT (clean repo, but a long-lived
credential to scope and rotate). Reusing the existing Pages site was rejected — one site per repo,
deployed from `main` via `actions/deploy-pages`, so PR media would mean restructuring the deploy
pipeline and risking the live game.

### D8 — Clean clip: no overlays, no readout

Exactly what a player sees. No F3 range circles, no F4 tick/hash readout burned into the frame.

*Alternatives considered:* an F4 readout, which would make the clip self-certifying about which sim
state it depicts; and a second F3-instrumented pass for judging targeting behaviour. Both were
rejected in favour of one artifact showing the shipped experience — debug chrome in a review clip
risks being read as real rendering.

### D9 — Animated WebP at 1280×720, 10 fps, ~12 s

GIF's 256-colour palette is close to worst-case for an isometric 3D scene with shadows and
gradients; the only way to keep a GIF under a sane size is to shrink it until the HUD text — the
thing D5 exists to capture — becomes illegible. WebP is true-colour, roughly 5–10× smaller for this
content, renders inline on GitHub, and keeps the full viewport.

The sim runs at 20 Hz, so capturing every 2nd tick yields 10 fps at true speed: ~120 frames over
~240 ticks.

*Fallback if Camo mishandles animated WebP:* GIF at 960×540, a one-flag change to the encode step,
accepting soft HUD numerals.

### D10 — Advisory, but loud; skipped on forks

The capture job is not a required check, so an environmental failure (headless GL, compositor,
CDN) never blocks an unrelated merge. It is not silent either: on failure the same sticky comment
reports the reason and links the run, so a missing preview is always explained.

Fork PRs get a read-only `GITHUB_TOKEN`, making both the branch push and the comment *guaranteed*
failures. The job is guarded on
`github.event.pull_request.head.repo.full_name == github.repository` so those skip cleanly.

### D11 — Moderate warm-up, driven by simulation state

Because the board cannot be afforded at tick 0 (see Context), the driver fast-forwards off-camera.
Stepping without screenshotting is essentially free — the F8 probe's own budget is a fraction of a
millisecond per tick — so the cost of warm-up is negligible and the only real constraint is
fragility: every off-camera wave is a wave the scripted build must actually survive.

```
t=0      place rapid + sniper (120)              200 → 80
         startWave ×3, off camera                +~190 (bounties + 40/wave bonus)
t=T      place area + slow (140) + ~6 walls      ~270 → ~10
t=T+20   startWave → wave 4/10      ◄── CAMERA ON
         wave 4's own 10 swarms + 3 runners
         + injected tank and brute                  ◄── satisfies D6
t=T+260  CAMERA OFF                              ~120 frames ≈ 12 s
```

Warm-up termination SHALL be state-driven — step until `runPhase === 'build' && waveIndex === 3` —
never a hardcoded tick count, which would silently start the camera mid-wave the first time enemy
speeds or wave timings move.

*Alternatives considered:* a shallower warm-up capturing wave 3, which affords all four archetypes
but leaves ~2 walls and so barely demonstrates mazing — the game's identity; and a deep warm-up
capturing wave 8, which funds upgrades and a full maze and would need only `brute` injected since
wave 8 natively carries tanks, swarms and runners, but requires seven waves of scripted survival to
re-tune after every balance pass.

The clip is an honest board in a staged moment: the wave counter reads 4 while an injected brute
walks in. That is the accepted price of D6.

### D12 — Approval gate after the spike

The headless-WebGL question is a binary go/no-go for the entire change and is answerable in
minutes. Phase 1 produces a throwaway probe and a written verdict, and **stops for explicit
approval**. No file under `src/` is touched before that approval. If SwiftShader cannot render the
scene on a GitHub runner, the change is abandoned having modified nothing.

## Risks / Trade-offs

- **Headless WebGL unavailable or broken on `ubuntu-latest`** → Retired first, behind the D12 gate,
  by a throwaway probe that boots the built app and takes one screenshot. Nothing else is built
  until it passes.
- **A manually-driven frame is not composited before the screenshot** → `page.screenshot()` captures
  what was last painted, and a driven loop does not paint on a schedule. Mitigation: drive each
  frame inside a `requestAnimationFrame` and await it before shooting. Verified in the spike, not
  assumed.
- **Camo strips or refuses animated WebP** → Fall back to GIF at 960×540 (D9), a one-flag change to
  the encode step. Confirmed in the spike by posting a probe comment.
- **Icon font not loaded when frames are captured** → Material Symbols ligatures render as literal
  words (`settings`, `close`) in the HUD. Mitigation: `await document.fonts.ready` before the
  capture window opens, with a timeout so a slow CDN degrades to system fallbacks rather than
  hanging the job.
- **A balance change makes the scripted build leak during warm-up** → Treasury falls short, later
  `place` commands silently fail for want of funds, and the clip shows a thinner board than
  intended. Mitigation: after warm-up the driver asserts the expected structure count and
  `runPhase !== 'lost'`, and fails loudly (D10 shows the reason in the comment). D11's moderate
  depth bounds the blast radius to three waves.
- **`ci-media` grows unbounded** → ~1–2 MB per push accumulates. Mitigation: a `pull_request:
  closed` step deletes `pr-<n>/` from the branch; the branch can be force-reset if it ever gets
  away.
- **The new required `test` job changes merge behaviour for the repo** → PRs that previously merged
  with no checks now need a green typecheck and test suite. This is intended, and D6 depends on it.
- **Advisory previews can rot unnoticed** → A permanently broken capture job could go unfixed while
  PRs merge past it. Accepted: D10's failure comment makes it visible in the PR body, and D6
  guarantees correctness is never what rots.

### Spike verdict (task 1.6 — runs 31216985235 / 31217097176 on `ubuntu-latest`, 2026-08-07)

Every gate question passed; no GIF fallback needed. Evidence per risk:

- **Headless WebGL**: PASS. Stock headless Chromium (Playwright `channel: 'chromium'`, no GL
  flags) renders the scene via `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`.
  Boot screenshot has 6209 distinct colours — board, towers, HUD all present.
- **Per-frame compositing**: PASS. With the RAF loop paused, a frame driven inside a
  `requestAnimationFrame` composites before `page.screenshot()` returns: two states rendered
  back to back produced differing screenshots. Bonus: re-rendering the *same* state produced
  byte-identical PNGs, on both the local D3D11 GPU and runner SwiftShader — rung 2 of D4 holds
  with margin.
- **Fonts**: PASS. `document.fonts.ready` resolves on the runner; Material Symbols ligature
  `screen_rotation` measures 24 px (one glyph), not ~200 px of fallback text.
- **Camo / animated WebP**: PASS, with a finding that moots the risk: GitHub does **not** proxy
  `raw.githubusercontent.com` images through Camo — the rendered PR page embeds the raw URL
  directly (verified in PR #8's HTML), served `Content-Type: image/webp` with the `VP8X`/`ANIM`
  chunks intact. D7's SHA-named files stay (raw's CDN caches too), but the fallback trigger
  "Camo strips animated WebP" cannot occur.
- **Runner facts for `ci.yml`**: ubuntu-24.04 images no longer preinstall ffmpeg — one
  `apt-get install -y ffmpeg` step (~15 s) is required. Playwright needs
  `npx playwright install --with-deps chromium`. Probe wall-clock on the runner: ~40 s total.
- **Size datum for D9**: 40 frames at 1280×720, `libwebp -q:v 80` → 1.5 MB (~38 KB/frame).
  A ~120-frame clip extrapolates to ~4.6 MB; the encode step's size ceiling should assume q
  tuning may be needed.

## Migration Plan

Phased, with a hard stop:

1. **Spike (throwaway).** Prove headless WebGL, per-frame compositing, and Camo's handling of
   animated WebP on a real runner. **Stop for explicit approval.**
2. **Seam.** Split `buildGame` out of `startGame`, inject the clock, add `?capture=1`. Behaviour on
   the normal path is unchanged and covered by the existing suite.
3. **Scenario and coverage.** Author `.github/capture/scenario.json`; add the vitest coverage test.
4. **Driver and encode.** Playwright driver, warm-up assertions, ffmpeg step.
5. **Workflow and delivery.** `ci.yml` with the required `test` job and the advisory `preview` job;
   `ci-media` push, sticky comment, fork guard, close-time pruning.

Rollback: delete `.github/workflows/ci.yml` and `.github/capture/`, and delete the `ci-media`
branch. The `src/` seam is behaviour-preserving on the normal path and can be left in place or
reverted independently.

## Open Questions

- Exact tower and wall tiles for the scenario, and the seed value. Deferred deliberately: these are
  authoring choices tuned by watching the first green captures, and changing them affects neither
  the specs, the approach, nor the task breakdown.
- Whether the ~12 s window opens immediately on `startWave` or a few ticks later reads better once
  there is a real clip to judge.
