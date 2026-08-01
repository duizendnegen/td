## Why

The Phase-1 enemy UFO hovers 0.35 units above the ground. Under the fixed orthographic camera
(45° yaw, ~35° pitch), that elevation projects as an up-screen shift of roughly a third of a
tile, so the enemy appears displaced toward the tile diagonally behind its true position. All
grounding cues — range circles, flow-field arrows, selection decals — are flat quads at ground
level, so the enemy visibly disagrees with everything that communicates board position. Which
tile an enemy occupies is gameplay-relevant (Phase-2 placement rejects towers with an enemy in
the footprint), so the ambiguity must go before that lands.

## What Changes

- Enemies rest just above the ground (small clearance over the debug-decal plane) instead of
  hovering at 0.35, restoring the one-to-one mapping between screen position and board position.
- The vertical sine bob is replaced by a small tilt wobble (rotation about x/z) so no cosmetic
  motion reintroduces vertical offset or clips the floor; yaw spin and per-enemy phase desync
  are kept.
- Each enemy gets a ground-level contact decal (the kit's `selection-a`/`selection-b` quad)
  directly beneath it, giving the round hull an unambiguous grid-aligned contact point.
- ARCHITECTURE.md is updated where it describes the hover: the §1 rationale for hover-bob as
  the animation substitute, and the §8 interpolation snippet's `HOVER_Y`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `render-pipeline`: enemies must read unambiguously on their true tile — grounded placement
  plus a ground-level contact marker; cosmetic animation must not introduce vertical
  displacement.

## Impact

- `src/render/enemies.ts`: hover/bob constants, position and rotation in `sync()`, contact
  decal lifecycle alongside the mesh map.
- `src/render/assets.ts` / `src/app/game.ts`: `selection-a` (or `-b`) added to the loaded
  model set if not already present.
- `ARCHITECTURE.md`: §1 hover rationale, §8 interpolation snippet.
- No simulation code changes; the determinism requirement (render never mutates sim state) is
  unaffected and must keep holding.
