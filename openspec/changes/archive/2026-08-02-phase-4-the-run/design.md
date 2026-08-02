# Phase 4 — The Run — Design

## Context

See `proposal.md` for motivation and `openspec/explorations/20260801_phase-4.md` for the
decision trail. Current state that shapes the approach:

- `sim.ts` runs a fixed 10-step tick; **step 4 is a debug spawn timer explicitly standing in
  for the wave scheduler, and step 9 is an empty slot reserved for Phase-4 economy** — the two
  insertion points this phase was pre-wired for.
- Placement validation (`placement.ts`) already rebuilds both fields into scratch; spawn
  reachability is read as "inbound-field cost at the spawn tile is finite."
- `grid.ts` holds a single blocked mask with no terrain distinction; `ground.ts` builds one
  merged mesh once from a blocked/spawn lookup.
- `SimState` has no run/wave state and no counters; the hash walk covers what exists today.
- Phase-3-combat must land first: archetypes, upgrades, refund-of-total-invested, the brute
  stat block, and the 1×1 footprint are all assumed below.

## Goals / Non-Goals

**Goals:**

- Every run-progression fact lives in hashed sim state and changes only via commands or ticks —
  a replay reproduces the whole run including its win/lose moment.
- Slot waves, interest, and settlement into the existing tick order without renumbering it.
- Keep the ground mesh build-once; terrain is static for the life of a level.

**Non-Goals:**

- No early-call/overlapping waves, no auto-lose, no per-wave stipend (ROADMAP open question 4
  stays open), no timer on the build phase.
- No new pathfinding: activation only changes field *sources*, never the algorithm.
- No save/load mid-run; a run is one uninterrupted session.

## Decisions

### D1 — The run state machine lives in `SimState` and is command-driven

`SimState` gains `runPhase: 'build' | 'wave' | 'settled-locked' | 'won' | 'lost'`, `waveIndex`,
per-group spawn cursors, and the summary counters (`stolenMg`, `escapedMg`, `kills`). All of it
is hashed. `startWave` and `concede` become commands validated at apply time (startWave rejected
unless `runPhase === 'build' || 'settled-locked'`… gated on balance ≥ 0 and remaining waves).
Alternative — orchestrating waves app-side like the phase-3 debug bursts — was rejected: bursts
are throwaway input, but wave progression is game state, and replays must reproduce it.

### D2 — Waves occupy step 4, run progression owns step 9

Step 4's debug timer is replaced by the wave scheduler: while `runPhase === 'wave'`, each
group's cursor emits spawns on its delay/interval schedule. Step 9 becomes the single
progression point, evaluated every tick:

1. `runPhase === 'wave'`, not drained → accrue interest (D3).
2. `runPhase === 'wave'`, drained (all cursors exhausted **and** no live enemies after step 8)
   → settlement: return sacks in insertion order, then judge — final wave and balance ≥ 0 →
   `won`; final wave and balance < 0 → `settled-locked`; otherwise `build` (locked-ness is just
   the startWave validation reading the balance).
3. `runPhase === 'settled-locked'` (post-final-wave debt) → if balance ≥ 0 (a step-3 refund
   landed) → `won`.

No interest accrues on the settlement tick; the wave is already over when step 9 sees it
drained. One place, one order — the determinism argument writes itself.

### D3 — Interest is integer parts-per-million, floor-truncated

`interestRatePerTick` (authored float, e.g. `0.0004`) converts at load — under the existing
floats-become-integers rule — to integer ppm (`400`). Accrual:
`treasuryMg += floor(treasuryMg * ratePpm / 1_000_000)` — all integers, no overflow risk at POC
magnitudes (10⁶ mg × 10³ ppm ≪ 2⁵³). Consequence: balances under `1_000_000 / ratePpm` mg
(2.5 gold at 400 ppm) accrue nothing; accepted. The rate itself stays a playtest knob.

### D4 — All-spawn validation is one extra cost read, not one extra field

"Every spawn, dormant included, keeps a path" needs no new field: validation already builds the
inbound scratch field (treasury-sourced); reachability of *any* spawn is "finite cost at its
tile." The check simply iterates the level's declared spawn list instead of `activeSpawns`. The
returning scratch field (live-enemy stranding checks) keeps active-spawn sources — matching
what enemies actually steer by. Escape targets stay `activeSpawns`. Two spawn sets, each used
where its semantics apply.

### D5 — Terrain kinds live in the grid beside the mask

`grid.ts` gains a `terrain: Uint8Array` (dirt = 0, grass, rock, socket) parsed from the level
char-map at load; the blocked mask initializes to `kind !== dirt`. The mask stays the single
pathfinding truth — flowfield and steering code don't change. Buildability reads `terrain`;
occupancy stays `structureAt`. Alternative — encoding terrain in the mask via extra bit flags —
rejected: the mask is hashed hot state, terrain is immutable level data.

### D6 — Socket structures never touch the mask, including on removal

The socket placement branch validates bounds, terrain-kind, occupancy, and `canSpend`, then
records the structure **without** `setBlocked` (the tile is already terrain-blocked) and without
field rebuilds. Symmetrically, `tickRemovals` must NOT unblock a socket structure's tile or
trigger a rebuild when its countdown expires — the refund is the only effect. This asymmetry is
the one real trap in the feature; it gets a dedicated test.

### D7 — Activation happens at wave-start apply, atomically

Applying a valid `startWave` command (step 2) increments `waveIndex`, flips `runPhase` to
`'wave'`, initializes group cursors, and — if the new wave activates spawns — updates
`activeSpawns` and rebuilds the returning field in the same apply. No mask changed, so no
commitment invalidation runs (spec: enemies re-read at their next waypoint). The wave-preview
UI reads the same wave data the scheduler will use.

### D8 — Liquidation total is a derived query, not state

The UI's "recovery impossible" flag needs `sum(refund value of all structures)`. That is
derivable from `structures` + balance data, so it is computed on demand (sim-side pure helper
shared with the HUD), never stored — nothing new to hash, nothing to drift.

### D9 — State growth regenerates the golden replays once, after phase 3's

The hash walk extends over the new `SimState` fields in one place, mirroring phase-3's D10
sequencing: land state-shape changes, then re-author `level_01`/`level_02` waves, then
regenerate golden replay hashes a single time at the end of implementation.

### D10 — Ground merge gains per-kind templates; models come from the kit

`buildGround` maps kind → template (`tile-dirt`, `tile`, `tile-rock`, socket = `tile` +
`tower-square-bottom-b` translated onto it) and still merges everything once.
`tower-square-bottom-b.glb` is copied from the kit into `public/models/`; the wall mesh becomes
`tower-square-bottom-a`, retiring the placeholder. Spawn tiles keep `tile-spawn`; a dormant
spawn MAY get a visual treatment, but that is cosmetic garnish, not contract.

## Risks / Trade-offs

- [Overdraw makes theft strictly harsher, invalidating phase-3 balance feel] → wave authoring
  happens against the leak-rate harness with overdraw in place; interest and bounties are the
  tuning levers before any stipend is considered.
- [Drained-detection edge: a wave whose enemies all die before its last group spawns] → drained
  requires cursors exhausted AND field empty; covered by a scheduling test.
- [Settlement-tick subtleties (death-drop sacks returning the same tick they drop)] → step
  order makes this well-defined (step 8 drops, step 9 returns); asserted in a test, not left to
  reading.
- [Char-map re-author of level_01 could silently lose the instrumented-gauntlet features] → the
  existing level-data requirement stays in force; the re-authored map is checked against its
  scenario before waves are added.
- [`settled-locked` + concede UX may still confuse a newcomer despite the impossible-recovery
  flag] → phase gate explicitly judges "can a newcomer play unaided"; cheap to iterate on copy.

## Migration Plan

1. Phase-3-combat archives first; rebase this change's assumptions if its landing changed.
2. Sim-state growth (D1) and terrain (D5) land before behavior so tests build against the final
   shapes; golden hashes regenerate once at the end (D9).
3. Docs sweep in the same change: README bankruptcy paragraph, ROADMAP Phase-4 section (and its
   gate list), ARCHITECTURE tick-order §7 and economy §5. The archived phase-2 theft spec is
   superseded by this change's `theft-economy` delta at archive time.
4. Rollback: revert the change; level JSONs are versioned with the code, so old data never
   meets new schema.

## Open Questions

- Final interest rate and per-wave compositions — authored during implementation, judged at the
  phase gate (ROADMAP open questions 3 and 4 stay open by design).
- Socket count/positions per level — a balance knob to tune while authoring waves.
- Whether the phase-3 debug spawn panel stays reachable in deployed builds or gates behind a
  dev flag once waves exist.
