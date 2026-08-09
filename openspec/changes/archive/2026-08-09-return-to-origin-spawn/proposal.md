## Why

Returning enemies currently drain to whichever active spawn is cheapest from where they stand — a
single multi-source returning field makes "nearest exit" the only possible routing. That reads as
wrong ("why is the raider from the north gate leaving through the south gate?"), lets all theft
funnel through the one cheapest exit, and makes only that exit's lane matter defensively. Carriers
should run home: each enemy returns to the spawn it entered from.

## What Changes

- Enemies remember their origin spawn and, when returning, path to **that** spawn — not the
  nearest one. The single aggregate returning field becomes **one returning field per spawn**.
- Spawn tiles become **endpoints, not corridors**: no route (inbound or returning) may pass
  through any declared spawn tile as an intermediate step. Spawn tiles still receive a cost so an
  enemy can step off its own spawn. Applies to dormant spawns from construction, so activation
  still changes no walkability and forces no waypoint re-read.
- Escape is **origin-only**: a returning enemy despawns at its own spawn. With no-transit spawn
  tiles it can never stand on a foreign spawn tile, so no other case exists.
- **BREAKING (validation strictness)**: `strands-enemy` becomes per-origin — a placement that
  cuts any returning enemy off from *its* spawn is rejected, even when other spawns remain
  reachable. Some placements legal today become illegal mid-wave.
- The sniper's carrier-first cascade ranks carriers by cost in each carrier's **own** origin
  field ("closest to escaping" now means closest to *its* exit).
- The path preview draws **one return lane per active spawn** (treasury → spawn through that
  spawn's field) instead of exactly one return lane.
- **BREAKING (replay/capture)**: the enemy's origin spawn is new hashed state, so existing replay
  hashes and CI wave-preview baselines shift.
- Accepted, uncompensated: origin-return lengthens carrier escape trips, easing gold recovery.
  Balance data stays untouched in this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `flowfield-pathfinding`: the dual-field requirement becomes one inbound field plus one returning
  field per declared spawn; spawn tiles are no-transit in every field; spawn activation no longer
  rebuilds any returning field.
- `theft-economy`: returning enemies path to and escape through their origin spawn, not the
  nearest active spawn (escape requirement and the sack-pickup flip scenario).
- `structure-placement`: the strand check verifies each returning enemy against its origin
  spawn's field rather than "any active spawn reachable".
- `path-preview`: the ribbon draws one return lane per active spawn; the "return lane may not go
  where the enemy came from" behavior is removed.
- `tower-combat`: the sniper carrier cascade's returning-field cost is read from the carrier's
  origin field.

## Impact

- **Sim**: `types.ts` (`Enemy.originSpawn`, hashed — hash.ts line lands in the same commit per
  the standing rule), `enemy.ts` (field selection by origin, spawn signature), `flowfield.ts`
  (no-transit tile support in field construction), `sim.ts` (per-spawn field arrays, rebuild
  sites, scratch swap, lane tracing), `placement.ts` (per-origin strand check, scratch shape),
  `economy.ts` (origin-only escape), `tower.ts` (sniper cost source), `waves.ts` / spawn command
  (origin recorded by declared-spawn index — stable across activations, unlike active-set
  indices).
- **UI/render**: ribbon lane count, F3 debug overlay draws all per-spawn returning fields.
- **Perf**: hover validation rebuilds 1 + N fields instead of 2; memory is (1 + N) live plus
  (1 + N) scratch fields. Fine at this game's spawn counts and grid size.
- **CI/tests**: replay and capture hashes change; flowfield, economy, placement, and roster tests
  extend; wave-preview baselines regenerate.
