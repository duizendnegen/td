# Phase 4 — The Run

## Why

Phase 4 is the ROADMAP's composition phase: waves, interest, win/lose states, and a second level
turn the existing systems into a complete session someone can sit down and play. Two exploration
passes (recorded in `openspec/explorations/20260801_phase-4.md`) reshaped the original scope:
the "lose at −100" bankruptcy threshold is replaced by a solvency gate on starting the next wave
— selling your own defense to pay debts *is* the death spiral — and a four-kind terrain palette
(dirt / grass / rock / socket) gives levels an authored visual and strategic language before
level_02 is built.

## What Changes

- **Wave system** (`sim/waves.ts`, currently an empty stub): JSON wave groups (`spawn`, `type`,
  `count`, `spawnInterval`, `delay`), a start-wave command, and a **strict-sequential wave
  lifecycle** — a wave is active from start until every enemy it spawned is dead or escaped
  (carriers walking out included); no overlap, no early call. Build phase has no timer.
- **Spawn activation by wave**, with the no-sealing invariant preserved across activation:
  placement reachability validates against **all spawns from tick 0**, dormant included, while
  carrier escape pathing keeps targeting active spawns only.
- **Theft overdraws the treasury** (**BREAKING** for the phase-2 theft-economy spec): the
  `max(0, …)` clamp on the treasury grab is removed — an inbound enemy always takes full
  carryCapacity, so raids drive the balance negative. Killing the carrier drops the sack;
  end-of-wave return restores the gold.
- **End-of-wave settlement**: unclaimed sacks return to the treasury, interest stops, and run
  progression is judged — one deterministic sequence at the moment the field drains.
- **Bankruptcy redesigned — no −100 threshold** (**BREAKING** vs README/ROADMAP text): starting
  the next wave requires balance ≥ 0. While wave-locked the only income is selling structures
  (0.5 refund), so recovery weakens the defense. There is **no automatic loss**: the player
  concedes manually, and the UI must state when liquidation cannot cover the debt.
- **Solvent to win**: after wave 10's settlement, victory fires only at balance ≥ 0; a negative
  finish enters the same sell-to-recover state, and the win fires on reaching solvency.
- **Interest accrual**: per-tick, during waves only, on positive balance only, in fixed point.
- **Terrain palette** (**BREAKING** for the level schema): terrain becomes four authored kinds —
  `dirt` (navigable, player-buildable), `grass` and `rock` (scenery, neither), `socket`
  (non-navigable, towers only, rendered as grass plus a `tower-square-bottom-b` base). Levels
  author terrain as a char-map instead of a coordinate list. Navigable ground renders as
  `tile-dirt`; dirt stays dirt under player structures; walls get the `tower-square-bottom-a`
  model, retiring the phase-2 placeholder.
- **Socket placement**: a tower on a socket tile skips reachability validation entirely (the
  tile was never navigable); walls are rejected there. Socket count and position become a
  level-authoring balance knob.
- **Levels and waves**: level_01 re-authored with the palette and 10 hand-authored teaching
  waves; level_02 with two spawns (second activating mid-run), 10 waves, and the slow-immune
  brute debuting in its back half.
- **Run summary counters** in sim state: gold stolen, gold escaped, kills, final balance.
- **UI**: wave counter and next-wave preview, start-wave control with solvency lock, sell-to-
  recover affordance, win / lose screens with the run summary, concede control.
- **Docs**: README bankruptcy paragraph and ROADMAP Phase-4 section rewritten to the solvency-
  gate design; ARCHITECTURE tick order gains interest and settlement steps.

## Capabilities

### New Capabilities

- `wave-scheduling`: wave data model and loader, group scheduling within a wave, the
  strict-sequential wave lifecycle and its active/complete definitions, and spawn activation
  by wave number.
- `run-lifecycle`: the session state machine — build phase, settlement sequence, the solvency
  gate on wave start, sell-to-recover, manual concession, solvent-to-win, and run summary
  accounting.

### Modified Capabilities

- `theft-economy`: the clamped-grab requirement becomes full-capacity overdraw (treasury may
  go negative from theft); new requirements for interest accrual and end-of-wave sack return.
- `structure-placement`: reachability validation covers all spawns including dormant ones;
  terrain-kind buildability rules (dirt: walls+towers, socket: towers only and validation-free,
  grass/rock: nothing).
- `level-data`: char-map terrain authoring with the four-kind palette, wave definitions become
  required and validated, level_02 joins level_01, activation waves for spawns.
- `build-ui`: start-wave control with solvency lock state, wave counter and preview, win/lose
  screens with run summary, concede control that flags impossible recovery.
- `render-pipeline`: terrain kinds map to distinct tile visuals inside the single static ground
  draw call (dirt / grass / rock / socket base); wall model is kit masonry, not a placeholder.
- `flowfield-pathfinding`: the returning field's goal set updates when a spawn activates
  mid-run (fields rebuild on activation, enemies re-read on their next waypoint).

## Impact

- **Depends on phase-3-combat landing first** — it assumes four archetypes, upgrades/refunds,
  enemy variety (including the reserved brute stat block), and the 1×1 footprint.
- `sim/`: `waves.ts` (new logic), `economy.ts` (overdraw, interest, sack return), `sim.ts`
  (tick order gains wave/interest/settlement steps), `placement.ts` (all-spawn validation,
  terrain buildability), `types.ts`/`hash.ts` (wave + run + counter state → **golden replay
  hashes regenerate**), `commands.ts` (start-wave, concede).
- `render/`: `ground.ts` (terrain-kind tile mapping, socket bases merged in), wall mesh swap.
- `ui/`: wave HUD, start-wave, end screens, concede.
- `data/`: `schema.ts` (terrain char-map, waves), `level_01.json` re-authored, `level_02.json`
  new, `balance.json` interest knob relocation if needed.
- Docs: README, ROADMAP, ARCHITECTURE. Archived phase-2 theft spec superseded via the
  `theft-economy` delta here.
- Tests: `waves.test.ts`, `economy.test.ts` (overdraw/interest/settlement), placement terrain
  cases, `level.test.ts` (both levels), replay hash regeneration.
