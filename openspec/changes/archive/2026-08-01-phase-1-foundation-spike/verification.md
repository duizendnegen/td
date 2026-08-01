# Phase-1 gate verification — 2026-08-01

Live link: <https://duizendnegen.github.io/td/>. Automated walkthrough (Playwright on the
deployed site + headless vite-node); the camera-legibility judgement is pre-chewed below
but remains the owner's to confirm by playing. Camera state: single isometric view per
scope correction D-P1-7 (the dual-camera reading of goal #3 was a typo elaboration; built,
then cut and reworked in §6).

## Gate checklist (ROADMAP Phase 1)

- [x] **Same seed → identical hash after 2 000 ticks, across reloads and environments.**
  Probe checkpoint (F8, tick 2000): seed 42 → `9a995a84`, seed 777 → `3c701ea8`,
  default seed → `c9d02418` — identical across (a) two independent page loads of the
  deployed build, (b) the dev-server build, and (c) headless node (vite-node + the
  Vitest golden). The camera rework is render-only, so hashes are unaffected (re-checked
  on the final deploy). Caveat: all environments ran on one physical machine; a literal
  second-device check is a 10-second job — open the link with `?seed=42`, press F8,
  compare against `9a995a84`.
- [x] **F1 shows zero diagonals cutting between two blocked tiles.** Verified by eye at
  both corner-to-corner pairs — (15,6)/(16,7) and (19,9)/(20,10) — and enforced as a
  general invariant in `tests/flowfield.test.ts`. A 2 000-tick sweep with ~50 enemies
  found zero ticks with any enemy standing on a blocked tile.
- [x] **Movement smooth at 60 fps against the 20 Hz sim.** Sampled one enemy mesh over
  36 consecutive frames spanning 13 sim ticks: 36 distinct rendered positions with
  uniform per-frame steps (max = mean = 0.042 tiles) — interpolation delivers sub-tick
  motion with no stepping.
- [x] **Kit renders correctly.** One shared `MeshLambertMaterial`, one texture, one
  shader program in `renderer.info`; ground merges to a single draw call; console on
  the deployed link is clean (0 errors, 0 warnings).
- [~] **Isometric view legibility (judgement).** Fixed 45° yaw, true-isometric pitch
  (≈35.26°), whole board framed at any aspect via bounding-box fit. Tile spacing is
  distortion-free (orthographic); the pitch leaves height readable by silhouette.
  To confirm by playing: whether occlusion behind tall Phase-3 towers or the diamond
  framing hurts maze reading — the documented fallback is steepening the pitch.
- [x] **Sim tick headroom.** 0.0072 ms/tick mean at 59 concurrent enemies (worst single
  tick 0.85 ms, JIT/GC noise included) — ~140× under the 1 ms target. The F8 probe
  doubles as a live measurement (~0.002–0.005 ms/tick at steady state).

## Notes

- The F8 probe fast-forwards **to the next multiple of 2 000 ticks** (an absolute
  checkpoint), not by 2 000 ticks — otherwise two machines pressing it at different
  moments would log incomparable hashes. This refines the spec's "run 2 000 ticks"
  wording in favour of its own two-machine scenario.
- Golden replay hash `c9d02418` (seed `0xc0ffee`, tick 2000) minted only after the
  fixed-point, RNG reference-vector, and flow-field suites were green.
