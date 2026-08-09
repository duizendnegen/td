# Architecture

Decisions and structure for the Maze Tower Defense POC. See [README.md](README.md) for the game
design and [ROADMAP.md](ROADMAP.md) for the build phases.

This document records **why** each choice was made, so that a later change is a deliberate reversal
rather than an accident.

---

## 1. Decision log

| # | Decision | Choice | Chief reason |
|---|---|---|---|
| D1 | Renderer | **three.js + GLB** | The bundled Kenney kit is 3D-only; a true isometric projection comes free in 3D |
| D2 | Determinism | **Full lockstep-grade** (fixed-point) | Co-op is the stated end goal; retrofitting bit-determinism is a rewrite |
| D3 | HUD layer | **Plain DOM + TypeScript** | POC HUD is small; no framework lifecycle fighting a 20 Hz loop |
| D4 | Testing | **Targeted sim tests (Vitest)** + one replay-hash test | Cover the invariants that are invisible by eye, nothing more |
| D5 | Phasing | **4 phases, risk-first** | Both hard unknowns (determinism, WebGL) proven on day one |
| D6 | Tower footprint | ~~Scale kit models 2×~~ **All structures 1×1, kit models at native scale** (reworked in Phase 3) | The Phase-2 playtest showed a 2×2 tower cannot be a segment of a 1-wide wall line; towers are now wall segments that shoot |
| D7 | Attack resolution | **Hitscan + render-only tracer** | Smallest deterministic surface; no projectile entities in the hash |
| D8 | Data authoring | **JSON + zod validation** | Matches the README format; hand-editable; validator doubles as reachability check |
| D9 | Interpolation | **prev/curr on each entity** | Near-free, no per-tick allocation, sufficient for client prediction |
| D10 | Numeric model | **1/1024 tile units, milli-gold** | int32-safe headroom; per-tick interest accrues exactly |
| D11 | Repo & deploy | **git init + GitHub Pages** | Shareable link exists from Phase 1, so every gate is externally playtestable |
| D12 | Debug tooling | **First-class overlay in Phase 1** | Flow fields and fixed-point state cannot be verified by watching |

### D1 in detail — why 3D

The `assets/kenney_tower-defense-kit/` bundle contains 160 GLB models and **no 2D sprites**. Measured
properties that drove the call:

- Every tile and tower is exactly **1×1 world unit**, Y-up, **origin at the base** — world position is
  the tile centre with no pivot correction.
- **One** material (`colormap`) and **one** 512×512 palette atlas shared by all 160 models. The entire
  scene collapses to a handful of draw calls.
- 24–730 triangles per model. The full 30×20 ground plane is ~14k triangles.
- **Zero animations, zero skinning.** All static meshes.

The palette atlas carries no surface detail, and nothing is animated, so the camera must stay
elevated and mid-distance — ground-level views would expose static, featureless meshes. The enemies
being UFOs is fortunate: a procedural hover-bob plus yaw spin is fully convincing where a walk cycle
would have been required for ground units.

The decisive argument: in Canvas 2D an isometric view means baking a sprite set per model and
hand-writing a painter's-algorithm depth sorter. In three.js it is one orthographic camera and a
depth buffer.

---

## 2. Stack

| Package | Version | Role |
|---|---|---|
| `three` | ^0.185.1 | WebGL renderer, GLTF loading, cameras |
| `@types/three` | ^0.185.3 | Types |
| `typescript` | ^7.0.2 | Native Go compiler, stable since 2026-07-08 |
| `vite` | ^8.2.0 | Dev server and bundler |
| `vitest` | ^4.1.10 | Sim tests (peers `vite ^8`) |
| `zod` | ^4.4.3 | Level and balance file validation |

Node ≥ 22.12 (Vite 8 engine requirement). Package manager: **npm**.

No UI framework, no state library, no physics engine, no ECS library. Everything else is hand-written.

> TypeScript 7's programmatic compiler API is not stable until 7.1. This is irrelevant here — it only
> affects Vue/Svelte/Astro/MDX tooling, none of which this project uses.

### Addon import paths

three.js 0.185 exposes an `./addons/*` export map. Use it rather than the older `examples/jsm` path:

```ts
import { GLTFLoader }     from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
```

`mergeBufferGeometries` is the deprecated name; the current function is `mergeGeometries`.

---

## 3. Layering

```
                 commands (one-way)
    ui/  ──────────────────────────────►  sim/
     ▲                                      │
     │  reads snapshot                      │  reads snapshot
     │                                      ▼
    app/  ◄──────────────────────────►  render/
                                            │
    data/  ────────────────────────────────►┘
   (JSON + zod)        loaded once at boot
```

**The dependency rule, enforced by review and by the import lint:**

- `sim/` imports **nothing** outside `sim/` and type-only imports from `data/schema.ts`.
  No `three`, no DOM, no `window`, no `Date`, no `Math.random`.
- `render/` may read sim state (read-only) and import `three`. It must never mutate sim state.
- `ui/` may read sim state for display and **emits commands**. It never mutates sim state directly.
- `app/` owns the loop and wires the three together.

This is the seam that makes co-op possible later: replace `app/` with a networked command source and
neither `sim/` nor `render/` changes.

### Directory layout

```
src/
├─ main.ts                 boot: load data, build sim, start loop
├─ sim/                    PURE. no DOM, no three, no wall clock
│  ├─ fixed.ts             fixed-point constants and helpers
│  ├─ rng.ts               seeded PRNG (xoshiro128**)
│  ├─ hash.ts              FNV-1a state hash for replay tests
│  ├─ types.ts             entity and state types
│  ├─ grid.ts              tile storage, blocked mask, footprints
│  ├─ flowfield.ts         dual Dijkstra fields + corner rule
│  ├─ placement.ts         validation, removal + its phase gate
│  ├─ enemy.ts             steering, state machine, theft
│  ├─ tower.ts             targeting, firing, upgrades
│  ├─ economy.ts           treasury, interest, bounties, settlement
│  ├─ waves.ts             wave scheduling and spawn activation
│  ├─ commands.ts          command types and application
│  └─ sim.ts               Sim class — the tick entry point
├─ data/
│  ├─ schema.ts            zod schemas + inferred types
│  ├─ balance.json         tower and enemy stat blocks
│  └─ levels/level_01.json level composition
├─ render/
│  ├─ renderer.ts          scene, lights, frame entry point
│  ├─ assets.ts            GLB loading, shared material, model registry
│  ├─ ground.ts            merged static ground geometry
│  ├─ towers.ts            modular tower composition
│  ├─ enemies.ts           enemy meshes, hover, status icons
│  ├─ cameras.ts           the fixed isometric camera
│  ├─ fx.ts                tracers, impacts, gold sacks (render-only)
│  ├─ ribbon.ts            lane ribbon: traced routes, projected reroute, orphaned region
│  └─ debug.ts             waypoints, ranges, sim readout
├─ ui/
│  ├─ hud.ts               treasury, wave
│  ├─ palette.ts           build menu
│  ├─ inspector.ts         selected tower panel
│  └─ input.ts             pointer → grid picking → command emission
└─ app/
   ├─ loop.ts              fixed-timestep accumulator
   └─ game.ts              wiring
tests/                     Vitest, sim only
public/models/             the ~18 GLBs actually used + colormap.png
```

---

## 4. The determinism contract

Bit-identical simulation across machines and runs. Six rules, all enforceable:

1. **All sim state is integer.** Positions, velocities, HP, money, timers. No floats stored anywhere
   in `sim/`.
2. **`Math.random` and `Date.now` are banned in `sim/`.** All randomness comes from the seeded PRNG
   owned by the `Sim` instance.
3. **`Math.sqrt` is the only permitted float operation**, and its result is immediately re-quantised
   to an integer. IEEE-754 requires `sqrt` to be correctly rounded, so it is exact and portable.
   `sin`, `cos`, `pow`, `atan2`, `hypot` are **not** required to be exact and are banned — use lookup
   tables or squared comparisons instead.
4. **Iteration order is stable.** Entities live in insertion-ordered flat arrays. Never iterate
   `Object.keys` or a `Set` where order affects state. Deletion is always order-preserving and
   never swap-remove: enemies are tombstoned (`alive = false`) and compacted once at step 10, so
   the array shape holds still across the steps that can kill; structures, only ever removed in
   step 2 with nothing else iterating them, are filtered out directly.
5. **Commands are the only input.** The sim never reads the pointer, the clock, or the DOM. Every
   player action becomes a `Command` stamped with the tick it applies on.
6. **Division truncates explicitly.** `Math.floor` for money accrual (well-defined for the negative
   balances bankruptcy allows), `Math.trunc` for geometry. Never rely on `| 0`, which breaks above
   2³¹.

Enforcement: `tests/replay.test.ts` runs a fixed seed plus a recorded command list and asserts the
state hash after N ticks matches a golden value. Any accidental float, any `Math.random`, any order
change breaks it immediately. Without this test the discipline rots silently, which is why it exists
from Phase 1 rather than being deferred with the rest of the test suite.

### The hash is a history fingerprint, not a position fingerprint

Two boards that look identical can hash differently, and that is correct. `nextStructureId` is
monotonic and hashed, so placing a structure and selling it again restores the mask, both flow
fields and the structure list — but not the hash. The state carries how it was reached, which is
exactly what a lockstep peer must agree on.

This has always been true; provisional construction (§7) makes the round trip cheap enough that
someone will now notice it and file it as a bug. It is not one.

### Comparison against floats

Floats were rejected because the retrofit cost is not local. Changing `pos.x` from float to fixed
touches steering, flow-field lookup, range checks, collision epsilon, and every balance number
simultaneously — it is a rewrite of `sim/`, not a refactor. Paying the tax up front costs a helper
module and slightly noisier arithmetic.

---

## 5. Numeric model

```ts
export const TILE = 1024;          // fixed-point units per tile
export const HALF = 512;           // tile centre offset
export const DIAG = 1448;          // round(1024 * √2), diagonal step cost
```

**Positions** are in 1/1024 of a tile. A 30×20 board spans 30 720 × 20 480 units — comfortably inside
int32, and squared distances peak near 9.4 × 10⁸, well below 2⁵³, so squared-distance comparisons are
exact in a JS `number`.

```ts
// tile 15, dead centre
const x = 15 * TILE + HALF;   // 15872
// current tile
const tx = Math.trunc(x / TILE);
```

**Money** is held in **milli-gold** — integer thousandths.

```ts
balance = 200_000;                                    // 200.000 gold
ratePpm = Math.round(0.0004 * 1_000_000);             // authored float → 400 ppm, once, at load
interest = Math.floor(balance * ratePpm / 1_000_000); // 80 mg/tick = 1.6 g/sec at 200 g
```

Whole-gold integers were rejected precisely here: per-tick interest below 1 gold truncates to zero,
which silently deletes the mechanic. Milli-gold makes the accrual exact without a separate
accumulator. The HUD renders `balance / 1000`.

Interest accrues **only while a wave is active** and **only on a positive balance** — a negative
treasury does not compound the death spiral. It stops the tick the wave drains: settlement (unclaimed
sacks returning, then the run-progression judgement) runs in that same step 9 slot, after the field
empties, with no interest on the settlement tick. There is no bankruptcy threshold — theft may
overdraw the balance arbitrarily far below zero, and the only consequences are the spending block
below 0 and the solvency gate on starting the next wave.

**HP, damage and bounties** are plain integers. **Timers** (`slowUntil`, `nextFireTick`) are
absolute tick numbers, never countdowns, so they need no per-tick decrement and survive
serialisation trivially.

Speeds are units-per-tick. A 3 tiles/sec enemy at 20 Hz is `3 * 1024 / 20 = 153.6` → **154**
units/tick; the rounding is chosen once, in the balance file, in integer units.

### Fixed-point normalisation

Steering toward a waypoint needs a normalised direction from an arbitrary offset:

```ts
export function normalize(dx: number, dy: number, len: number): [number, number] {
  const d = Math.trunc(Math.sqrt(dx * dx + dy * dy));   // exact per IEEE-754
  if (d === 0) return [0, 0];
  return [Math.trunc(dx * len / d), Math.trunc(dy * len / d)];
}
```

This is the single place a float appears inside `sim/`, and the result leaves as an integer.

---

## 6. Coordinate systems

There are two, and the conversion lives in exactly one file (`render/renderer.ts`).

| | Sim | three.js world |
|---|---|---|
| Units | 1024 per tile, integer | 1.0 per tile, float |
| Axes | `x` right, `y` **down** (matches level JSON rows) | `x` right, `z` **forward/down**, `y` up |
| Origin | tile (0,0) top-left corner | world (0,0,0) at that same corner |

```ts
// sim (fixed) → world (float)
worldX = simX / TILE;
worldZ = simY / TILE;
// tile (tx,ty) centre → world
worldX = tx + 0.5;  worldZ = ty + 0.5;
```

Ground tile tops sit at `y = 0.2`; everything placed on the board is offset by that.

Keeping sim `y` pointing **down** means the level JSON, the flow-field arrays, and the debug overlay
all read in the same orientation as the file you authored. The single axis flip happens at the render
boundary.

---

## 7. Simulation

### Tick loop

Fixed 20 Hz (`TICK_MS = 50`) driven by an accumulator in `app/loop.ts`:

```ts
accumulator += Math.min(now - last, MAX_FRAME_MS) * rate;  // clamp the STALL, then scale
if (rate === 0) {
  sim.commit(commandQueue.drain());                        // absorb intent, consume no time
} else {
  while (accumulator >= TICK_MS) {
    sim.tick(commandQueue.drain());
    accumulator -= TICK_MS;
  }
}
render(sim.state, rate === 0 ? 1 : accumulator / TICK_MS);  // alpha ∈ [0,1), or 1 when frozen
```

`MAX_FRAME_MS` caps catch-up at 5 ticks per frame. It is applied to the elapsed wall-clock gap
*before* `rate` scales it, so it stays a stall guard rather than a speed limit. Commands queued
during a running frame apply on the next tick boundary — up to 50 ms of input latency,
imperceptible for tower placement.

### Time controls

`rate` comes from `app/time.ts`: play/pause sets the resting rate (1 or 0) and fast-forward
overrides it while held, including while paused — which is what makes a stopped game scrubbable.

**The simulation has no clock and no notion of pause.** Pause is an *absence*, not a state: it is
this loop declining to call `advance()`. No field expressing pause or speed exists in `SimState`,
none reaches the hash, and the replay goldens are indifferent to every value in `time.ts`. A future
change must never implement pause by skipping the wave scheduler or scaling entity speeds.

While frozen no time accumulates, so resuming cannot burst; and the loop commits every frozen
frame, which both lands player intent immediately and re-snapshots each `prevPos` onto its `pos`,
holding entities still through the pause.

### The commit/advance seam

`sim.tick(commands)` is exactly `sim.commit(commands)` followed by `sim.advance()`, split at the
boundary the tick order already has:

| | steps | character |
| --- | --- | --- |
| `commit` | 1–3 | absorb intent — snapshot, apply commands, rebuild fields, sweep commitments |
| `advance` | 4–10 | let time pass — spawn, move, resolve, settle, `tick++` |

`commit` is safe to call any number of times before an `advance`, with the same result as one
commit carrying the concatenated commands in the same order: step 1 re-snapshots an unmoved
position, `validatePlacement` builds its scratch fields from the live mask rather than depending on
step 3, and the step-3 sweep is idempotent while nothing has moved.

This is what lets a paused game respond immediately — a tower placed while stopped is charged,
blocks its tile, rebuilds both fields and re-targets enemy waypoints at once — while advancing
nothing.

**State comparability is defined at tick boundaries.** A state that has been committed but not yet
advanced is mid-tick, and its hash is not expected to equal any completed tick's. Nothing that
compares hashes pauses (the two-machine gate check and the replay goldens both run `tick()`), but
`F4` marks a pending commit so a hash moving at a standing tick reads as intended rather than as
determinism drift.

### Tick order

Fixed and documented, because order is part of the determinism contract:

1. Snapshot `prevPos` for every entity
2. Apply commands (sorted by type, then by issue sequence)
3. Rebuild flow fields if step 2's commands changed the blocked mask; sweep stale commitments
4. Wave scheduler — the active wave's group cursors spawn due enemies
5. Enemy movement and waypoint re-evaluation
6. Enemy arrival: theft at treasury (full-capacity overdraw), escape at spawn, gold pickup
7. Tower targeting and firing (damage applies this tick)
8. Deaths, bounties, gold-sack drops
9. Run progression: interest accrual while the wave is live; end-of-wave settlement (sack
   return, then the won / wave-locked / build judgement) the tick it drains; refund-driven
   win checks from the post-final-wave locked state
10. Compact tombstones; increment tick

### Entity storage

Enemies live in a flat insertion-ordered array, as the README specifies. At POC scale (dozens of
enemies, tens of towers) an O(n·m) range check per tick is a few thousand operations — nothing. No
spatial hash, no tile-occupancy grid as primary storage.

Range checks compare **squared** fixed-point distances, avoiding a square root entirely.

### Flow fields

Two fields, both rebuilt on any blocked-mask change:

- **Inbound** — multi-source Dijkstra from the treasury tiles outward.
- **Returning** — multi-source Dijkstra from **all currently active spawns** simultaneously, which
  gives "nearest active spawn" for free without per-enemy target selection.

8-connected, with integer costs `1024` orthogonal and `1448` diagonal. A bucket queue keyed on cost
is used rather than a comparison heap — costs are small integers, and it keeps pop order
deterministic without a tie-break rule.

**Corner-cutting is prevented at field-build time**, not at movement time: a diagonal edge from A to B
is only relaxed if both orthogonally-adjacent tiles between them are walkable. Enemies therefore
cannot express an illegal move, because the field never points that way.

Each field stores `dir: Int8Array` (0–7 direction index, or −1 unreachable) plus `cost: Int32Array`
for the debug overlay. Two `Int8Array(600)` allocations for a 30×20 board — rebuilt in well under a
millisecond.

### Movement

Waypoint-based, per the README. An enemy holds a committed `waypoint` tile centre and steers toward
it; on arrival within epsilon it re-reads the field and commits the next. The commitment is one tile
of hysteresis, which prevents jitter under rapid placement and is the hook for turn-around detection
if anti-juggling needs escalating.

### Placement validation

Before any build is confirmed:

1. Footprint is in bounds, all tiles walkable, no existing structure.
2. **No enemy currently occupies any footprint tile** — reject rather than displace.
3. Tentatively set the blocked mask, rebuild the inbound field.
4. Every **active** spawn must have finite cost to the treasury.
5. **Every live enemy's current tile** must also have finite cost in the field matching its state.
   This is stricter than the README's spawn-only check and is necessary: a placement can strand an
   enemy already inside the maze without sealing any spawn.
6. Pass → commit and charge the treasury. Fail → revert the mask, restore the previous field, reject.

The previous field is kept in a spare buffer and swapped, so a rejected placement costs one rebuild
and no allocation.

**Removal is immediate, and refused during a wave for committed construction.** Selling an
established maze is a between-waves action: the gate (`canRemove`, shared by the sim and every UI
remove control) is the whole anti-juggling rule, so no delay is needed and none exists — unblock,
refund and drop all land in the tick the command applies. Removal needs no validation either:
unblocking a tile is monotone on the flow fields, so it can never seal a spawn or strand an enemy.

### Provisional construction

A structure is **provisional** from the tick it is placed until the simulation advances a tick while
a wave is running. That advance — the first live tick of the wave, swept at the top of `advance()`,
before spawning and combat — commits every standing structure. `Structure.provisional` is ordinary
hashed state, so replays reproduce it exactly.

While provisional, a structure refunds **100%** of its total invested cost (upgrades included) and
may be sold in any live phase, the wave included. Once committed it is unchanged in every respect:
the configured refund fraction, and no selling while a wave runs.

The window is deliberately *not* "the next tick". What the build phase and a stopped game share is
that **no consequential tick has elapsed** — the build phase because spawns and settlement are gated
off, a pause because time is not running at all. One predicate covers both:

```
   build phase           →  ticks advance, but runPhase ≠ 'wave' → stays provisional
   press START WAVE      →  first advanced tick → EVERYTHING COMMITS
   stopped wave, place   →  advance() is never called → provisional
   running wave, place   →  committed within 50 ms — live play has no free undo
```

**The simulation still knows nothing about pause.** The rule reads only "an advance happened while a
wave was live"; pause manifests as `advance()` not being called, so the seam above is preserved
whole. The upgrade path is deliberately not covered: upgrading a *committed* tower stays
irreversible, because reversing it means storing a committed baseline rather than a flag, plus a
revert command.

The player-facing consequence — the build phase is a planning board, and START WAVE is the decision
— is in [README.md](README.md).

### Attack resolution

Hitscan. On the tick a tower's `nextFireTick` is reached it selects a target by its fixed priority,
applies damage immediately, and emits a render-only event:

```ts
if (sim.tick >= t.nextFireTick) {
  const target = pickTarget(t, enemies);        // priority is per tower type
  if (target) {
    damage(target, t.damage);                   // instant
    events.push({ kind: 'shot', from: t.pos, to: target.pos, tower: t.type });
    t.nextFireTick = sim.tick + t.fireIntervalTicks;
  }
}
```

Stats (`damage`, `fireIntervalTicks`, range, slow duration) come from the tower archetype's
current level row in balance data. Within a tick, towers due to fire resolve in **insertion
order**, and target selection skips enemies already at `hp ≤ 0` from an earlier same-tick shot —
build order pins same-tick resolution, and no shot is wasted on the dead. Priorities read the two
flow fields: rapid/area/slow pick minimal *inbound* cost (first along path); the sniper's
carrier rule picks minimal *returning* cost (closest to escaping), otherwise max stat-block hp.

`events` is drained by the renderer each frame and never read by the sim, so it is outside the state
hash. The known cost: a catapult boulder can visibly land after its target has already died.
Acceptable for a POC whose thesis is the maze and the economy, not projectile feel. Upgrading the
area-damage tower to a genuinely simulated lob later is additive — a new entity array and a step in
the tick order — and is the one place where travel time would carry real balance weight.

Slow does not stack: `slowUntil = Math.max(slowUntil, sim.tick + durationTicks)`.

---

## 8. Rendering

### Scene construction

All 160 models share one material, so the renderer loads `colormap.png` once, builds a single
`MeshLambertMaterial` (the flat palette look needs no PBR response), and assigns it to every mesh.

The 600 static ground tiles are merged into **one** `BufferGeometry` via `mergeGeometries` at level
load — one draw call for the entire board, rebuilt only when terrain changes (never, during a level).
No `InstancedMesh` needed at this scale; it can be introduced for enemies if a swarm burst ever
justifies it, which at these triangle counts it will not.

Only the ~18 models actually used are copied into `public/models/`, not all 160.

### Model mapping

| Tower | Body | Head |
|---|---|---|
| Rapid fire | `tower-square-*` | `weapon-turret` |
| Sniper | `tower-square-*` | `weapon-ballista` |
| Area damage | `tower-square-*` | `weapon-catapult` |
| Slow | `tower-round-*` | `tower-round-crystals` |

Round body plus crystals reads as a frost/arcane tower without needing a new asset, and its distinct
silhouette makes the no-kill-power tower identifiable at a glance from the ortho view.

| Enemy | Model | Render scale |
|---|---|---|
| Swarm | `enemy-ufo-c` | 0.6 |
| Tank | `enemy-ufo-a` | 1.0 |
| Runner | `enemy-ufo-b` | 0.7 |
| (slow-immune, late waves) | `enemy-ufo-d` | 0.8 |

Models are a full tile wide as authored; scaling is purely cosmetic and never enters the sim, where
enemies are points.

### Tower composition at 1×1

Kit towers are 1×1 units and render at native scale on their single tile (Phase-3 rework of D6:
towers are wall segments that shoot). Each archetype composes from its own kit pieces — square
bases with a weapon head for the damage towers, the round base with crystals for slow — and each
upgrade level stacks one more middle segment:

| Level | Composition (rapid, e.g.) |
|---|---|
| 1 | `tower-square-bottom-a` + `weapon-turret` |
| 2 | `bottom-a` + `middle-a` + `weapon-turret` |
| 3 | `bottom-a` + `middle-a` + `middle-a` + `weapon-turret` |

Upgrading literally makes the tower taller — a spire above the 0.55-unit walls. The spire
proportions at a 1-unit-wide base are a cosmetic call, re-judged at the Phase-3 gate.

The head is the top segment and yaws toward the tower's current target, re-derived read-only from
sim state each frame (the same pure selection the sim fires with). Since damage is hitscan, the
yaw is cosmetic and lives entirely in `render/`.

### Camera

One fixed camera: an `OrthographicCamera` at 45° yaw and a fixed 30° pitch — the classic 2:1
dimetric projection of RollerCoaster Tycoon-era games (a ground tile projects as a diamond of
width:height = 1/sin(pitch), so 30° gives an exact 2:1 diamond) — framing the whole 30×20 board.

Orthographic is not a stylistic choice: with no perspective distortion, a 1-tile gap and a 1×1
footprint measure identically anywhere on the board, which is what makes maze planning legible.
Overlays (grid, ranges, flow field) render as flat decals on the ground plane. The kit's
`selection-a` / `selection-b` are 1×1 decal quads 0.05 units tall, authored for exactly this.

The low pitch is what sells height: tower levels read as silhouette differences, and walls turn the
maze into shallow canyons. The cost is some occlusion of tiles directly behind tall towers —
accepted, and re-judged at the Phase 1 legibility gate. If it hurts, the pitch steepens toward
top-down: the isometric look is negotiable, legibility is not.

### Interpolation

Every sim entity carries `prevPos` alongside `pos`, snapshotted at the top of each tick. The renderer
lerps with the accumulator's alpha:

```ts
mesh.position.set(
  lerp(e.prevPos.x, e.pos.x, alpha) / TILE,
  HOVER_Y,
  lerp(e.prevPos.y, e.pos.y, alpha) / TILE,
);
```

Zero allocation per tick, and it is the whole mechanism. A snapshot ring buffer was rejected: it buys
rollback netcode and time-scrub debugging that the POC has no use for, at the cost of a full state
copy every tick.

Render-only motion — UFO hover bob, yaw spin, tower head rotation, tracer fade, gold-sack sparkle — is
driven by frame time and never touches the sim.

---

## 9. UI

An HTML overlay above the canvas, updated each frame from a read-only sim snapshot. The DOM
stays framework-free vanilla TS; **Tailwind (v4, `@tailwindcss/vite`) is the styling layer** —
build-time CSS generation only, no runtime framework. Theme tokens live in `src/ui/hud.css`
(`@theme`, ported from STYLEGUIDE.md); state changes swap whole literal class-string constants
so Tailwind's scanner sees every class verbatim.

`index.html` carries a static **slot skeleton** — `#topbar`, `#rail`, `#inspector`, `#bottom`,
`#overlay` — that components mount into once; desktop vs. mobile placement is pure CSS
(responsive variants at one breakpoint: ≥768px wide and ≥480px tall is desktop).

- **HUD** — treasury (rendered from milli-gold), wave number, segmented wave progress bar.
- **Palette** — four towers plus wall and remove, with costs, greyed out when unaffordable or
  when `balance < 0` (the README's no-spending-while-negative rule). The remove tool ignores the
  balance and greys out while a wave runs instead.
- **Inspector** — selected tower: level, damage, rate, range, upgrade cost, and sell/remove showing
  the refund it returns, locked while a wave runs. Right panel on desktop; bottom sheet on mobile.
- **Lane ribbon** — shown only while a build tool is armed: one traced route per active spawn to
  the treasury plus one back out, drawn as marching dashes so direction reads without colour.
  While a ghost sits on a tile whose validation produced post-placement routing, the projected
  routes join it, classified per segment into shared / current-only / projected-only so only the
  diverged span is doubled; a `seals-spawn` candidate additionally shades the region it would
  orphan. Geometry lives in `render/ribbon.ts`; the routes come from `Sim.currentLanes()` and
  `Sim.previewRoutes()` as copied tile arrays, never as references into the sim's field buffers.
- **Input** — two thin drivers over one shared core (`InputCore`: ground-plane raycast → tile,
  ghost verdict loop, selection, **command** emission). `PointerDriver` (hover + fine pointer):
  hover ghost, one-click commit. `TouchDriver` (everything else): tap anchors a pending ghost,
  ✓/✕ confirm/cancel, tap-select, and pinch-zoom/pan camera gestures that stay render-side.
  The UI never writes sim state.

Placement preview (ghost mesh, valid/invalid tint) runs the real validation function through a
`dryRun` flag, so the preview and the commit can never disagree — on both drivers.

---

## 10. Data

Levels and balance are JSON, validated by zod at load:

```ts
const LevelSchema = z.object({
  id: z.string(),
  grid: z.object({ width: z.int().positive(), height: z.int().positive() }),
  treasury: TileSchema,
  spawns: z.array(SpawnSchema).min(1),
  terrain: z.object({
    legend: z.record(z.string().length(1), z.enum(['dirt', 'grass', 'rock', 'socket'])),
    map: z.array(z.string()),          // one row string per grid row, one char per tile
  }),
  economy: z.object({ startingTreasury: z.int(), interestRatePerTick: z.number() }),
  waves: z.array(WaveSchema).min(1),
});
export type Level = z.infer<typeof LevelSchema>;
```

Validation goes beyond shape, and this is the main reason it is worth a dependency:

- The char-map matches the declared grid size and every character appears in the legend.
- Every `groups[].spawn` references a declared spawn id that is active by that group's wave.
- Every `groups[].type` exists in `balance.json`, and at least one wave is declared.
- Treasury and spawns are inside the grid and on dirt terrain.
- **Every spawn can reach the treasury on the level's starting terrain** — a graph check, run at load,
  that catches an unwinnable level before it ever renders.

Float rates in the file (`interestRatePerTick: 0.0004`) are converted to integers **once**, at load,
and the sim only ever sees integers. Authoring stays readable; the sim stays deterministic.

`balance.json` holds tower and enemy stat blocks; level files are pure composition referencing them by
`type`, exactly as the README specifies.

---

## 11. Debug overlay

Toggleable, built in Phase 1, because flow-field correctness and fixed-point state cannot be verified
by watching the game:

| Key | Shows |
|---|---|
| `F2` | Enemy state: committed waypoint line, inbound/returning, carried gold, slow timer |
| `F3` | Tower ranges and current target lines |
| `F4` | Readout: tick, state hash, entity count, ms/tick, field rebuild count |

Routing has no debug overlay: the player-facing **lane ribbon** (§9) is the answer to "where do
they go", and its orphaned-region shade covers walkable-but-unreachable tiles. The corner-cutting
rule is verified by `flowfield.test.ts`, which sweeps the whole board rather than one route — an
illegal diagonal is invisible as motion and would be missed by eye either way.

### Headless capture mode

`?capture=1` builds the full game — data, renderer, HUD, input — but never starts the real-time
loop. The simulation advances and frames render only when an external driver asks, through the
`__td` seam: `step(n)` runs n ticks on the same tick path as normal running (`stepOnce` in
`src/app/step.ts`), and `renderFrame(nowMs)` renders exactly one frame with an injected clock, so
time-based presentation (hover bobs, effect fades) is a function of the tick, not of wall time.
`tests/capture.test.ts` asserts driven stepping reaches the same state hash as a normal run.

The boundary is deliberate (demo-agnostic): the application knows nothing about what gets
captured. The PR-preview scenario, driver, and encoding live entirely in `.github/capture/`, and
`?capture=1` is a mode flag, never a scenario selector. `tests/scenario.test.ts` reaches across
that boundary on purpose, binding the CI-side scenario to `balance.json` so the demo clip can
never silently fall behind the game's roster of towers and enemies.

---

## 12. Testing

Vitest, `sim/` only. No render or UI tests.

| File | Asserts |
|---|---|
| `flowfield.test.ts` | Reachability; no diagonal between two blocked tiles; costs monotonic toward source; route tracing terminates and follows the field |
| `placement.test.ts` | Seal attempt rejected; stranded-enemy case rejected; removal unblocks and refunds in its own tick; mid-wave removal refused with an unchanged hash |
| `theft.test.ts` | Full round trip: steal → carry at 80% → killed → sack drops → picked up → flip to returning → escape |
| `economy.test.ts` | Interest only during waves and only on positive balance; settlement order; the solvency gate lock and refund-driven unlock; solvent-to-win |
| `fixed.test.ts` | Normalisation exactness; no float leaks; division rounding at negatives |
| `level.test.ts` | Schema rejects bad spawn refs, unknown enemy types, unreachable treasury |
| `replay.test.ts` | Seed + recorded commands → state hash matches golden after N ticks |

`replay.test.ts` is the enforcement mechanism for section 4 and is the one test that must never be
skipped or have its golden casually regenerated. Regenerating it is a deliberate act that means "the
simulation intentionally changed".

---

## 13. Build and deploy

```
git init  →  GitHub  →  Actions on push to main  →  GitHub Pages
```

`vite.config.ts` sets `base: '/td/'` to match the repository name, for project-page hosting. The workflow uses `npm ci`,
`npm run build`, `actions/upload-pages-artifact`, `actions/deploy-pages`.

The live link exists from Phase 1 so every phase gate is playtestable by someone who is not you —
which is the entire point of a POC.

Pull requests run `ci.yml`: a required `test` job (typecheck + vitest, enforced on `main`; draft
PRs skip it until marked ready). The advisory preview lives in `preview.yml`, opted into per PR
via the `wave preview` label: when the label is added to a ready PR (or a labeled PR leaves
draft), it
captures the `.github/capture/` scenario headless (SwiftShader), pushes an animated WebP to the
`ci-media` branch as `pr-<n>/<sha>.webp`, and maintains one sticky PR comment embedding it.
Pushes never re-render — remove and re-add the label to refresh the clip. Preview failures update
the same comment with the run link and never block a merge; fork PRs skip the preview (read-only
token). `ci-media-prune.yml` deletes `pr-<n>/` when the PR closes.

---

## 14. Explicitly out of scope

Recorded so they are not accidentally rediscovered as gaps:

- Networking and co-op. The determinism and command-bus groundwork is built; no transport is.
- Rollback, prediction, or snapshot history.
- Audio.
- Save/load, progression, meta-game.
- Spatial hash for range queries — unjustified at this scale.
- Simulated projectiles (see D7; additive later).
- A general status-effect system. Carrying-gold and slowed are the only two states, with hover icons.
- Asset LOD, shadows beyond a single directional light, post-processing.
- Mobile or touch input.

---

## 15. Open questions

To be answered by playtesting, not by argument:

1. Does free re-mazing between waves flatten the difficulty curve, and is the 50% refund a stiff
   enough brake on its own? (Tunable via `removalRefundFraction`.)

   **Partially answered by fiat, not by playtest** (provisional-construction): revising *this
   phase's own* construction is now free, because the 50% spread was taxing misclicks and
   hesitation rather than re-mazing — and under tactical pause it could tax a purchase that could
   not be undone at all. Rearranging an *established* maze still pays the full 50%, so the brake
   survives where it was doing work.

   What remains open is the live half, now with a second variable: whether a build phase that is
   meaningfully cheaper to iterate in flattens the curve anyway, and whether the surviving 50% on
   committed construction is still the right number. Also open: whether upgrade misclicks — the one
   asymmetry left, since a committed tower's upgrade cannot be undone — sting enough to justify
   storing a committed baseline per structure and adding a revert command.
2. Does turn-around penalisation become necessary, or does the no-selling-during-a-wave rule alone
   kill juggling?
3. Does uncapped interest actually self-balance, or does hoarding dominate?
4. Is a flat per-wave stipend needed to soften the death spiral? (Only if testing demands it — never
   by softening theft itself.)
