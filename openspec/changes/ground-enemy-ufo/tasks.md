## 1. Ground the enemy

- [ ] 1.1 In `src/render/enemies.ts`, replace `HOVER_BASE`/`BOB_AMPLITUDE` with a `REST_HEIGHT`
      of 0.05 and set the mesh y to `GROUND_TOP_Y + REST_HEIGHT` (no time-varying term)
- [ ] 1.2 Add the tilt wobble: small sine oscillation on `rotation.x` and `rotation.z`, reusing
      the existing per-enemy id-based phase desync; keep the yaw spin unchanged
- [ ] 1.3 Verify in the running app that a stationary enemy's silhouette sits centred on its
      tile and nothing clips the ground through a full wobble cycle

## 2. Contact decal

- [ ] 2.1 Add `selection-a` to the loaded model set in `src/app/game.ts` (`MODELS`)
- [ ] 2.2 In `EnemyRenderer`, create a decal instance alongside each enemy mesh, positioned at
      the enemy's interpolated x/z at the debug-overlay height; keep it axis-aligned (no tilt
      or spin)
- [ ] 2.3 Remove the decal together with the mesh when an enemy id disappears from the sim
- [ ] 2.4 Verify with the flow-field debug overlay enabled that the decal neither z-fights the
      overlay nor lags the enemy during movement

## 3. Documentation and validation

- [ ] 3.1 Update ARCHITECTURE.md §1: hover-bob rationale becomes tilt-wobble-plus-spin as the
      walk-cycle substitute
- [ ] 3.2 Update ARCHITECTURE.md §8: interpolation snippet's `HOVER_Y` and the render-only
      motion list to match the new cosmetics
- [ ] 3.3 Run the test suite and confirm the headless-vs-rendered state hash still matches
      (render-only change must not perturb determinism)
