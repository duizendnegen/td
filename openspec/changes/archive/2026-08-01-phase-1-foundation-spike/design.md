# Design: phase-1-foundation-spike

## Context

ARCHITECTURE.md has already made the load-bearing technical decisions (fixed-point numeric model,
dual Dijkstra flow fields, layering rules, tick order, camera parameters); this design does not
restate them — it records what the explore session added on top, and the implementation-order
choices this change makes. The codebase is a complete stub skeleton (~10-line files with
responsibility comments), the deploy workflow exists and runs `npm test` before building, and the
remote is `duizendnegen/td` with `vite.config.ts` already set to `base: '/td/'`. See proposal.md
for motivation.

## Goals / Non-Goals

**Goals:**

- Retire the determinism and WebGL-pipeline risks with observable, gate-checkable evidence.
- Prove the deploy pipeline on day one and keep the link live throughout the phase.
- Give the camera judgement (the gate's predicted failure point) maximum exposure time.

**Non-Goals:**

- Any gameplay beyond walk-and-despawn: no placement, towers, theft, economy behavior, waves, HUD.
- Filling in Phase-2+ stubs (`placement.ts`, `economy.ts`, `tower.ts`, `waves.ts` stay stubs).
- Render or UI tests — render correctness is verified by playing; tests cover `sim/` only.

## Decisions

### D-P1-1 — Walking-skeleton sequencing

Render half first (assets → ground → cameras → **deploy**), then the sim half headless under tests
(fixed → rng → hash → grid → flowfield), merging at enemy rendering + interpolation + debug
overlay. Chosen over sim-first because the roadmap's ethos is "every phase ends deployed" — this
proves Pages on day ~3 instead of day ~20 — and because the camera criterion is a judgement call
that benefits from weeks of incidental exposure rather than a final-days assembly. Chosen over two
parallel tracks to avoid constant context-switching for a solo developer. The two halves are
genuinely independent until enemies need meshes, so nothing is serialized that could not be.

### D-P1-2 — Exhaustive hash contract

The FNV-1a hash walks **all** sim state in one canonical function that lives next to the state type
definitions: tick, full RNG state, treasury, then every entity field in insertion order. Standing
rule: *a new sim state field and its hash line land in the same commit* — colocating the walk with
the types makes an omission visible in review. Rejected alternative (hash positions + RNG only):
cheaper to maintain, but divergence in unhashed state stays invisible until it leaks into a
position ticks later, which detects the failure late and attributes it to the wrong tick. Cost is a
non-issue at POC scale (a few hundred integers through FNV-1a). The hash is computed on demand (F4
display, probe key, tests), not eagerly every tick.

### D-P1-3 — Gate tooling: fast-forward probe + seed override

Two scope additions over ROADMAP as written. The probe key synchronously runs 2 000 ticks through
the exact same tick path as real-time running and logs tick + hash; `?seed=` overrides the
hardcoded default seed. Together they turn the gate's hardest criterion (identical hash across
reloads and two machines) from ~5 minutes of wall-clock watching per pass into a five-second
comparison, and let any seed be tested on the deployed link without a redeploy. ~20 lines, all in
`app/` and `render/debug.ts`; `sim/` is untouched because stepping N ticks is already what the
replay test does headlessly.

### D-P1-4 — Terrain as instrumentation

`level_01`'s maze is authored to make every gate criterion observable, not to be fun: S-curve turns
(exercises steering smoothness and interpolation), ≥2 corner-to-corner blocked pairs (the only way
F1 can visually prove the corner rule), a diagonal-favouring stretch (shows the 1024/1448 cost
distinction), and a reachable dead-end pocket (shows the cost gradient). Gameplay-quality terrain
is Phase 2+ concern.

### D-P1-5 — Schema relaxations for the phase boundary

`waves` is allowed empty until Phase 4 introduces the wave loader (a dummy wave the sim ignores
would be a lie in the data file). `balance.json` carries one real enemy entry with a speed field
only — nothing can deal damage yet, and shipping the file's real shape early proves the
data-loading path.

### D-P1-6 — Known implementation tripwires (recorded so they are not rediscovered)

- **xoshiro128\*\* needs `Math.imul`** — plain `*` silently loses low bits above 2³². The replay
  golden would be generated from the buggy implementation and pass anyway, so `rng.ts` gets
  known-answer tests against published reference vectors, not just self-consistency.
- **Asset fetches go through `import.meta.env.BASE_URL`** — hardcoded `/models/…` works in dev and
  404s under `/td/` on Pages; this is the classic first-deploy failure.
- **ROADMAP line 42 says `base: '/peptd/'`** — stale; corrected to `'/td/'` in this change.

### D-P1-7 — Scope correction: goal #3 reads "isometric", not "asymmetric"

POC goal #3 was written as "asymmetric camera views" — a typo for "isometric camera view". The
dual-camera design (ortho architect + perspective commander, Tab toggle, orbit, and the
informational-asymmetry / co-op-seam rationale) was an elaboration of the mistyped word and is
cut. The capability is renamed `dual-cameras` → `isometric-camera`: one fixed `OrthographicCamera`
at 45° yaw and ~30–35° pitch (true isometric ≈ 35.26°), whole board framed. Tasks 1.5/1.6 were
completed against the old reading; §6 reworks them. The upgrade-as-height read (formerly the
commander view's job) now rides on the isometric pitch, and the Phase 3 "does the perspective
camera earn its keep" gate is retired.

## Risks / Trade-offs

- [Camera criterion fails at the gate — occlusion behind tall objects or the diamond framing hurts
  maze legibility] → This is the roadmap's own predicted failure; the walking-skeleton order
  maximizes exposure time before judgement, and the documented fallback (steepen the pitch toward
  top-down) is cheap because the camera is isolated in `render/cameras.ts`.
- [Golden replay hash minted from a subtly wrong sim, blessing the bug] → RNG reference-vector
  tests plus fixed-point unit tests land *before* the golden is first generated; regenerating the
  golden is documented as a deliberate act.
- [Deploy proven early against a near-empty page gives false confidence about asset paths] → The
  first deploy already includes GLB ground tiles and the atlas, so the BASE_URL path is exercised
  by real fetches, not just an HTML shell.
- [Synchronous 2 000-tick probe jank] → It blocks the main thread ~a second at worst (50 enemies ×
  well-under-1 ms ticks); acceptable for a debug key, and it doubles as a live measurement of the
  gate's ms-per-tick headroom criterion.

## Migration Plan

Greenfield; no data or users to migrate. First push to `main` exercises the existing Pages
workflow end-to-end; if the deploy fails, nothing is live to break. Rollback at any point is
`git revert` — the sim/render halves land in separately revertable commits per the walking-skeleton
order.

## Open Questions

- Exact default seed constant and probe tick count (2 000 matches the gate; both are one-line
  constants and can change freely without affecting specs or tasks).
- Precise gauntlet tile layout within the constraints of D-P1-4 — authored during implementation,
  validated by the reachability check and by eye in F1.
