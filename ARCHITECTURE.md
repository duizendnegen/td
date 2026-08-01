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
| D6 | Tower footprint | **Scale kit models 2×** | Preserves the 2×2 Desktop TD mazing; towers gain imposing height |
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
being UFOs is fortunate: a procedural tilt-wobble plus yaw spin is fully convincing where a walk
cycle would have been required for ground units. The saucers skim just above the ground rather than
hovering high: under the orthographic camera any elevation projects as up-screen drift, which makes
an enemy's tile ambiguous, so height is capped at a whisker above the ground plane and a blob
shadow under each enemy keeps its position grid-legible.

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
│  ├─ placement.ts         validation, removal timers
│  ├─ enemy.ts             steering, state machine, theft
│  ├─ tower.ts             targeting, firing, upgrades
│  ├─ economy.ts           treasury, interest, bounties, bankruptcy
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
│  └─ debug.ts             flow-field arrows, ranges, sim readout
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
   `Object.keys` or a `Set` where order affects state. Removal uses tombstone-and-compact, not
   swap-remove, so ordering is deterministic.
5. **Commands are the only input.** The sim never reads the pointer, the clock, or the DOM. Every
   player action becomes a `Command` stamped with the tick it applies on.
6. **Division truncates explicitly.** `Math.floor` for money accrual (well-defined for the negative
   balances bankruptcy allows), `Math.trunc` for geometry. Never rely on `| 0`, which breaks above
   2³¹.

Enforcement: `tests/replay.test.ts` runs a fixed seed plus a recorded command list and asserts the
state hash after N ticks matches a golden value. Any accidental float, any `Math.random`, any order
change breaks it immediately. Without this test the discipline rots silently, which is why it exists
from Phase 1 rather than being deferred with the rest of the test suite.

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
balance = 200_000;                              // 200.000 gold
interest = Math.floor(balance * 4 / 10_000);    // rate 0.0004/tick → 80 mg/tick
                                                // = 0.08 g/tick = 1.6 g/sec at 200 g
```

Whole-gold integers were rejected precisely here: per-tick interest below 1 gold truncates to zero,
which silently deletes the mechanic. Milli-gold makes the accrual exact without a separate
accumulator. The HUD renders `balance / 1000`.

Interest accrues **only while a wave is active** and **only on a positive balance** — a negative
treasury does not compound the death spiral.

**HP, damage and bounties** are plain integers. **Timers** (`slowUntil`, `removalCompleteTick`,
`nextFireTick`) are absolute tick numbers, never countdowns, so they need no per-tick decrement and
survive serialisation trivially.

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
accumulator += Math.min(now - last, MAX_FRAME_MS);   // clamp to avoid spiral of death
while (accumulator >= TICK_MS) {
  sim.tick(commandQueue.drain());
  accumulator -= TICK_MS;
}
render(sim.state, accumulator / TICK_MS);            // alpha ∈ [0,1)
```

`MAX_FRAME_MS` caps catch-up at 5 ticks per frame. Commands queued during a frame apply on the next
tick boundary — up to 50 ms of input latency, imperceptible for tower placement.

### Tick order

Fixed and documented, because order is part of the determinism contract:

1. Snapshot `prevPos` for every entity
2. Apply commands (sorted by type, then by issue sequence)
3. Advance removal timers; rebuild flow fields if the blocked mask changed
4. Wave scheduler — spawn due enemies
5. Enemy movement and waypoint re-evaluation
6. Enemy arrival: theft at treasury, escape at spawn, gold pickup
7. Tower targeting and firing (damage applies this tick)
8. Deaths, bounties, gold-sack drops
9. Economy: interest accrual, bankruptcy check
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

**Removal delay: 4.0 s = 80 ticks.** The tile stays **blocked** for the whole delay — otherwise the
delay is free and the anti-juggling rule does nothing.

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
No `InstancedMesh` needed at this scale; it can be introduced for enemies if a swarm wave ever
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

### Tower composition and the 2× scale

Kit towers are 1×1 units. Scaled 2×, a tower fills its 2×2 tile footprint exactly, and vertical
segments become 1.0–1.2 units tall each:

| Level | Composition | Approx. height |
|---|---|---|
| 1 | `bottom-a` + `top-a` + head | ~2.4 units |
| 2 | `bottom-a` + `middle-a` + `top-a` + head | ~3.4 units |
| 3 | `bottom-a` + `middle-a` + `middle-b` + `top-a` + `roof-a` + head | ~4.4 units |

Upgrading literally makes the tower taller. Against 1-unit-wide walls and a 0.2-unit ground plane,
that is a strong read — and the isometric pitch is low enough to show it.

The head is parented to the top segment and yaws toward its current target. Since damage is hitscan,
the yaw is cosmetic and lives entirely in `render/`.

### Camera

One fixed isometric camera: an `OrthographicCamera` at 45° yaw and ~30–35° pitch (true isometric is
arctan(1/√2) ≈ 35.26°; the exact pitch is tuned by eye), framing the whole 30×20 board.

Orthographic is not a stylistic choice: with no perspective distortion, a 1-tile gap and a 2×2
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
  GROUND_TOP_Y + REST_HEIGHT,
  lerp(e.prevPos.y, e.pos.y, alpha) / TILE,
);
```

Zero allocation per tick, and it is the whole mechanism. A snapshot ring buffer was rejected: it buys
rollback netcode and time-scrub debugging that the POC has no use for, at the cost of a full state
copy every tick.

Render-only motion — UFO tilt wobble, yaw spin, tower head rotation, tracer fade, gold-sack sparkle —
is driven by frame time and never touches the sim. The wobble is rotation-only by design: any
vertical cosmetic motion would reintroduce the up-screen drift that grounding the enemies removed.

---

## 9. UI

An HTML overlay above the canvas, updated each frame from a read-only sim snapshot. No framework.

- **HUD** — treasury (rendered from milli-gold), interest rate indicator, wave number and progress.
- **Palette** — four towers plus wall, with costs, greyed out when unaffordable or when
  `balance < 0` (the README's no-spending-while-negative rule).
- **Inspector** — selected tower: level, damage, rate, range, upgrade cost, sell/remove with the
  removal-delay countdown.
- **Input** — pointer → raycast against the ground plane → tile coordinate → **command**. The UI never
  writes sim state.

Placement preview (ghost mesh, valid/invalid tint) runs the real validation function through a
`dryRun` flag, so the preview and the commit can never disagree.

---

## 10. Data

Levels and balance are JSON, validated by zod at load:

```ts
const LevelSchema = z.object({
  id: z.string(),
  grid: z.object({ width: z.int().positive(), height: z.int().positive() }),
  treasury: TileSchema,
  spawns: z.array(SpawnSchema).min(1),
  terrain: z.object({ blocked: z.array(TileSchema), prebuilt: z.array(PrebuiltSchema) }),
  economy: z.object({ startingTreasury: z.int(), interestRatePerTick: z.number() }),
  waves: z.array(WaveSchema).min(1),
});
export type Level = z.infer<typeof LevelSchema>;
```

Validation goes beyond shape, and this is the main reason it is worth a dependency:

- Every `groups[].spawn` references a declared spawn id.
- Every `groups[].type` exists in `balance.json`.
- Treasury and spawns are inside the grid and not on blocked terrain.
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
| `F1` | Flow-field direction arrows per tile, colour-coded inbound/returning; blocked tiles |
| `F2` | Enemy state: committed waypoint line, inbound/returning, carried gold, slow timer |
| `F3` | Tower ranges and current target lines |
| `F4` | Readout: tick, state hash, entity count, ms/tick, field rebuild count |

`F1` in particular is how the corner-cutting rule gets verified at all — an illegal diagonal is
obvious as an arrow and invisible as motion.

---

## 12. Testing

Vitest, `sim/` only. No render or UI tests.

| File | Asserts |
|---|---|
| `flowfield.test.ts` | Reachability; no diagonal between two blocked tiles; costs monotonic toward source |
| `placement.test.ts` | Seal attempt rejected; stranded-enemy case rejected; removal keeps tile blocked for 80 ticks |
| `theft.test.ts` | Full round trip: steal → carry at 80% → killed → sack drops → picked up → flip to returning → escape |
| `economy.test.ts` | Interest only during waves and only on positive balance; bounties; no spending below 0; loss at −100 |
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

1. Is 4.0 s the right removal delay? (D: 3–5 s range from the README.)
2. Does turn-around penalisation become necessary, or does the removal delay alone kill juggling?
3. Does uncapped interest actually self-balance, or does hoarding dominate?
4. Is a flat per-wave stipend needed to soften the death spiral? (Only if testing demands it — never
   by softening theft itself.)
