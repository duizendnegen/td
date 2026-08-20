## Context

See proposal.md — Why. The load-bearing current state: one aggregate returning field, built
multi-source from all active spawns (`sim.ts`, `placement.ts`); enemies carry no memory of their
spawn (`types.ts`); the sniper cascade, the strand check, and the preview's single return lane
all read that one field. Fixed constraints: flow-field steering (no per-enemy pathfinding),
strict determinism with the canonical hash walking all sim state, and the standing rule that a
new state field lands in `hash.ts` in the same commit.

Decisions already made during exploration (with the user): strict per-origin strand validation,
origin-only escape with spawn tiles non-transitable, one return lane per active spawn in the
preview, and no balance compensation in this change.

## Goals / Non-Goals

**Goals:**

- Per-origin return routing with zero per-enemy pathfinding — enemies still roll downhill on
  shared fields.
- Spawn activation becomes a pure source-set event: no field content changes at all.
- Keep the placement-validation contract (scratch rebuild, swap-on-accept, purity on reject)
  structurally identical, just over more fields.

**Non-Goals:**

- Balance retuning (accepted easing; see proposal).
- Treasury-tile transit rules — the treasury remains an ordinary walkable grab point.
- Any UI redesign of the ribbon beyond lane count; visual styling stays as is.

## Decisions

### D1: One returning field per **declared** spawn, all built from construction

Fields are keyed by index into the declared-spawn list (`allSpawns`), and every declared spawn's
field is built at construction — dormant ones included — not lazily on activation.

- Why declared-index keying: `activeSpawns` is a filter over declarations, so an early-declared,
  late-activating spawn shifts every later spawn's position in the active list when it wakes up.
  A declared index is stable for the run; `Enemy.originSpawn` stores it directly.
- Why build dormant fields eagerly: uniform arrays (live + scratch always `1 + N` fields), and
  activation genuinely changes nothing — no allocation, no build, no branch. The wasted work is
  one Dijkstra per dormant spawn per mask change on a small grid.
- Alternative rejected: fields per *active* spawn, built on activation — saves negligible work
  and reintroduces an activation-time field event the spec just eliminated.

### D2: No-transit tiles as a field-construction rule: relax-in, never expand

`buildFieldInto` takes the declared spawn set as no-transit tiles. A no-transit tile may be
*relaxed into* (it receives a cost and a direction, so an enemy standing on it can step off) but
is never *expanded from* (its neighbours are never relaxed via it). Because a route enters a tile
only by some neighbour's direction pointing at it, and directions point only at expanded tiles or
sources, no route ever enters a non-source spawn tile — the spec property falls out structurally.

- The field's own source spawn is exempt (it is the terminus, sources never expand anyway —
  their expansion is the build itself; concretely: sources are pushed as cost 0 and DO expand,
  so the rule is "no-transit tiles other than this field's sources are not expanded").
- The grid mask is untouched: spawn tiles stay walkable for `isBlocked` / corner-flank checks,
  so commitment invalidation and diagonal legality need no changes.
- Alternative rejected: blocking foreign spawn tiles in per-field masks — requires per-field
  mask copies, breaks the shared-grid corner rule, and makes the inbound field unable to give
  spawning enemies a first step.

### D3: `Enemy.originSpawn` is hashed; the debug spawn command re-keys to declared indices

`originSpawn: number` (declared-spawn index) joins `Enemy`, set in `spawnEnemy` (signature gains
the index), hashed in `hash.ts` in the same commit (standing rule D-P1-2). `resolveWaves` resolves
each group's spawn id to its declared index once; the debug `spawn` command's `spawn` field
becomes a declared-spawn index too (it must still refuse a dormant or out-of-range index).
Sack-pickup flips need nothing: every enemy has an origin from birth.

### D4: Field plumbing — `Fields.returning` becomes an indexed array

`Fields` becomes `{ inbound: FlowField; returning: FlowField[] }` (indexed by declared spawn).
Consumers pick `returning[e.originSpawn]`: `stepEnemies`, `invalidateCommitments`, the sniper
cascade, and the strand check. The scratch pair becomes a scratch set of the same shape;
`swapScratchFields` swaps arrays wholesale. Rebuild sites (constructor, removal rebuild in
`commit`, placement validation) loop the declared spawns; `applyStartWave` no longer touches
fields at all — it only updates `activeSpawns` for spawn-escape/lane/validation purposes.

### D5: Escape check reads the origin tile only

`resolveArrivals` compares a returning enemy's position against `tileCentre` of its origin spawn
alone — no loop over `activeSpawns`. D2 guarantees the enemy can never stand on a foreign spawn
tile, so this is not just sufficient, it is the only reachable case; the loop's removal is what
makes the invariant legible in code.

### D6: Preview traces N return lanes; F3 overlays all returning fields

`traceLanes` emits one inbound lane per active spawn, then one return lane per active spawn
(treasury traced through that spawn's field), preserving "inbound lanes first" ordering so the
ribbon's inbound/return styling split becomes an index threshold at `activeSpawns.length`. The
F3 debug overlay draws every active spawn's returning field (per-spawn shades if cheap to do;
a single shared returning colour is acceptable — it is debug tooling).

## Risks / Trade-offs

- [Hover-validation cost grows to 1 + N Dijkstras per evaluated tile] → N is small (level_01
  declares 2 spawns) and the grid is small; if a future level makes this measurable, only spawns
  with live returning enemies actually need scratch rebuilds for the strand check — an
  optimization that changes no observable behavior and can land later.
- [Replay/capture hash break] → Expected and declared BREAKING in the proposal; regenerate CI
  wave-preview baselines in the same PR so main never carries a red capture job.
- [Stricter strand rule surprises players mid-wave] → The path preview already draws projected
  routes for strand-rejecting placements (path-preview spec: "stranding shows an ordinary
  trail"), and now shows every per-spawn return lane, so the refused wall's cause is visible.
- [No-transit spawn tiles lengthen some inbound routes] → Intended (spawns stop being shortcut
  corridors); the capture diff will show any level where this matters.

## Migration Plan

Single PR. Sim change, spec deltas, test updates, and regenerated ci-media baselines land
together; no data-format or save migration exists in this project. Rollback is a revert.
