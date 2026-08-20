## Context

See proposal.md — Why. What's already in place:

- `Enemy` (`src/sim/types.ts`) carries `hp` but no `maxHp`. Every spawn path — wave cursors
  (`src/sim/waves.ts`), the debug `spawn` command (`src/sim/sim.ts`) — sets `hp` to
  `enemyTypes[typeId].hp` with no per-wave scaling, and `src/sim/tower.ts` already reads that
  stat as "max hp" for the sniper's strongest-first rule. Max hp is therefore a pure lookup.
- `EnemyRenderer` (`src/render/enemies.ts`) already maintains per-enemy satellites driven
  read-only from sim state — the ground shadow, the carried-gold octahedron and slowed icon at
  `y + 0.75` — created on first sight, positioned every frame from the interpolated model
  position (bob included), and swept in one cleanup loop when the id disappears. It receives the
  type keys (for the model mapping) at construction from `src/app/game.ts`.
- The camera (`src/render/cameras.ts`) is one fixed `OrthographicCamera` — zoom and pan only,
  never a rotation.
- The move-tell outline (`src/render/towers.ts`) sets the precedent for `depthTest: false` plus a
  `renderOrder` when a marker must read through geometry.
- Enemies at `hp ≤ 0` are compacted at the end of the tick that killed them, so a render frame
  never sees a non-positive hp; hp never regenerates.

## Goals / Non-Goals

**Goals:**

- A per-enemy bar that reads at a glance at the whole-board zoom, appears only once an enemy is
  damaged, and follows the existing satellite pattern in `EnemyRenderer`.
- Zero simulation changes — hashes and replay goldens untouched.

**Non-Goals:**

- No damage numbers, no drain/tween animation, no colour shift with hp — the two static colours
  and the proportion carry the whole message.
- No DOM/HTML overlay layer for per-entity UI.
- No change to the gold / slowed icons beyond the bar sitting below them.

## Decisions

### D1: Max hp is the type's hp stat, passed to the renderer at construction

`EnemyRenderer` gets the enemy types' hp alongside the type keys it already receives (one
constructor argument in `game.ts`, `data.enemyTypes.map((t) => t.hp)`), and computes the
remaining fraction as `hp / maxHp[typeId]`. Nothing is added to `Enemy` or the hash.

Alternative rejected: storing `maxHp` on the `Enemy` record. It would be redundant today (a
hashed field that always equals a lookup) and would touch every golden replay hash for no
observable gain. The coupling is real, though: **if per-wave hp scaling ever lands, `maxHp` moves
onto the record and into the hash** — written down in ARCHITECTURE.md §8 so it isn't rediscovered
the hard way.

### D2: Two camera-facing quads per enemy — red track, left-anchored green fill

Each bar is a red track quad of the bar's full width and a green fill quad whose x-scale is
`width × fraction`, both unlit (`MeshBasicMaterial`) so the colours stay flat under the scene
light, sharing two module-level materials. The fill is anchored at the track's left edge (its
geometry offset so its origin is at the left end, or `THREE.Sprite` with `center = (0, 0.5)`), so
scaling it exposes the red on the right — exactly the "revealed from the right" reading. Because
the camera never rotates, facing is a fixed orientation: copy the camera's quaternion once at
construction (or use `THREE.Sprite`, which billboards for free). Both quads live in one `Group`
per enemy so positioning is a single `set` per frame.

Alternatives rejected: a single quad with a canvas texture per enemy (a texture upload per hit,
per enemy — needless); a single quad with a shader uniform for the fraction (a custom material
for a feature that is two rectangles); a colour-lerping single fill (the empty portion needs its
own colour anyway, so it's the two-quad design plus a lerp).

### D3: Bar shown only while `hp < maxHp`

The bar group is created lazily on the first frame the enemy is seen below max hp and toggled
`visible` from then on (it never goes back to full, but the toggle costs nothing and keeps the
sync loop uniform with the gold/slowed indicators). Undamaged enemies allocate nothing.

### D4: Placement, size, and draw order

- **Height**: `y + 0.55` above the interpolated model position — above the model's top, below
  the gold/slowed icons at `+0.75`, tracking the hover bob so the bar never detaches. Icons and
  bar therefore never overlap.
- **Width**: a base width scaled by the model's render scale (the `TYPE_MODELS` scale the
  renderer already applies), so a 0.8-scale tank carries a bar ~⅓ wider than a 0.6-scale swarm
  — "somewhat" scaled, not a size chart. Height is a fixed thin sliver; the exact numbers are
  tuned by eye at the whole-board zoom during apply.
- **Draw order**: `depthTest: false`, `depthWrite: false`, `transparent` (so it lands in the
  transparent pass) and a `renderOrder` above everything else, per the move-tell precedent, so
  walls, towers, and other enemies never hide a bar. The bar's own two quads order track-then-fill
  via `renderOrder` so the fill always paints over the track.

Alternative rejected: a screen-space DOM overlay projected like the touch confirm affordance
(`projectTile` in `src/ui/inputcore.ts`) — pixel-crisp and zoom-invariant, but it would
introduce a per-entity DOM layer with per-frame repositioning of tens of elements, and no
existing indicator works that way. In-world sprites match every other enemy indicator and zoom
with the board like they do.

### D5: The remaining fraction is a pure helper

`hpFraction(hp, maxHp)` clamped to `[0, 1]` (and `0` for a non-positive max) lives as an exported
function in `src/render/enemies.ts` and is unit-tested; the renderer body itself is verified by
exploratory Playwright testing during apply, consistent with how the other renderers are covered.

## Risks / Trade-offs

- [Bars drawn on top read through the enemy's own model when the camera looks down a canyon] →
  Accepted; the bar sits above the model's top so this only ever happens for a taller occluder,
  which is the case we want it to win.
- [Two extra draw calls per damaged enemy] → At the swarm sizes in play (tens of enemies) this
  is well inside budget; `InstancedMesh` for bars is a later option if a Phase-4 spawner ever
  justifies it, per ARCHITECTURE.md §8's stance on enemy instancing.
- [Bar dimensions tuned by eye may read too small at whole-board zoom or too big zoomed in] →
  Constants live in one place in `enemies.ts`; the width scales with zoom like every other
  in-world marker, so the whole-board fit is the case to tune for.
- [Max-hp coupling silently breaks under a future hp-scaling feature] → Named in D1 and in
  ARCHITECTURE.md; a spec scenario ("three-quarters green" after a quarter-hp hit) would also
  fail visibly if the fraction were computed against a wrong max.
