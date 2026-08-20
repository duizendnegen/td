## 1. Max hp reaches the renderer

- [x] 1.1 In `src/render/enemies.ts`, add an exported pure `hpFraction(hp, maxHp)` returning the
      remaining fraction clamped to `[0, 1]` (`0` for a non-positive max) (design D5).
- [x] 1.2 Extend `EnemyRenderer`'s constructor to take the per-type max hp alongside the type
      keys, and pass `data.enemyTypes.map((t) => t.hp)` from `src/app/game.ts` (design D1).
- [x] 1.3 Unit-test `hpFraction` in a new `tests/enemies.test.ts` (or the nearest existing
      render-side test file): full, partial, zero/negative hp, non-positive max.

## 2. The bar

- [x] 2.1 In `src/render/enemies.ts`, add module-level bar constants (base width, height, height
      offset `+0.55`, red/green colours) and two shared unlit `MeshBasicMaterial`s with
      `depthTest: false`, `depthWrite: false`, `transparent: true` (design D2, D4).
- [x] 2.2 Add a per-enemy `bars` map of `THREE.Group`s: a red track quad at full width and a
      green fill quad anchored at the track's left edge (left-origin geometry, or `Sprite` with
      `center (0, 0.5)`), fill `renderOrder` above track, group `renderOrder` above everything
      else, group orientation facing the fixed camera (design D2, D4). Width scales with the
      enemy type's render scale.
- [x] 2.3 In `sync()`, for each enemy with `hp < maxHp[typeId]`: lazily create the group, set
      `visible = true`, position it at the interpolated model position `+ 0.55` (bob included),
      and set the fill's x-scale to `width × hpFraction(...)`; at full hp leave it absent/hidden
      (design D3).
- [x] 2.4 Sweep the bar group in the existing dead-id cleanup loop alongside mesh, shadow, and
      icons.

## 3. Docs

- [x] 3.1 ARCHITECTURE.md §8: add the health bar to the render-only motion/indicator list and
      record the "max hp = type's hp stat; per-wave hp scaling would move `maxHp` onto the enemy
      record and into the hash" coupling (design D1).

## 4. Verify

- [x] 4.1 `npm run typecheck` and `npm test` pass (no sim changes — replay goldens must be
      untouched).
- [x] 4.2 Playwright exploratory pass (per project apply guidance): no bars on a fresh wave;
      a hit reveals a bar with green on the left and red revealed on the right; further hits
      shrink the green; a bar reads through a wall canyon; a tank's bar is visibly wider than a
      swarm's; bars vanish on kill and on leak; gold/slowed icons don't overlap the bar. Tune the
      width/height constants by eye at whole-board zoom.
