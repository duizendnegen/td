# Enemy Health Bar

## Why

Damage is invisible today: a tower fires, a tracer flashes, and the enemy flies on looking exactly as it did — the player has no way to tell a tank at 90% from one about to drop, so they can't judge whether a lane is holding, which enemy is worth the sniper's next shot, or whether a maze needs one more tower. A per-enemy health bar closes that gap with the smallest possible surface: a two-colour bar above each damaged enemy, readable at a glance from the fixed isometric camera.

## What Changes

- Every enemy that has taken damage displays a health bar above its model: a green segment on the left proportional to remaining hp over a red track, so the red portion is *revealed* from the right as hp is lost. An undamaged enemy shows no bar — the bar's appearance is itself the "it's been hit" signal, and full-hp swarms stay uncluttered.
- The bar is purely render-side: remaining fraction is `hp / <type's hp stat>` — the same "max hp is the type's stat block" reading the sniper's targeting rule already uses. No new sim state, no hashed fields, no command; determinism and golden replay hashes are untouched.
- The bar sits between the model and the existing carried-gold / slowed icons, follows the model's hover bob so it never detaches from its owner, and always faces the camera. It is drawn on top of world geometry — walls and towers never hide it — since legibility of the maze's contents outranks occlusion fidelity here, the same call the move-tell outline makes.
- Bar width scales (somewhat) with the enemy's render scale, so a tank's bar reads chunkier than a swarm's — a free "big one" cue — without becoming a size chart.
- The bar is removed with the enemy; nothing lingers on death or leak.

## Capabilities

### New Capabilities

None — the health bar extends the existing enemy status treatment.

### Modified Capabilities

- `build-ui`: new requirement alongside "Enemy status icons" — a purely render-side per-enemy health bar shown only once the enemy has taken damage, green-remaining over red-lost with the red revealed from the right, camera-facing, drawn over occluding geometry, sized with the enemy's model, and removed with the enemy.

## Impact

- **Render**: `src/render/enemies.ts` (`EnemyRenderer` gains a per-enemy bar satellite created on first damage, positioned each frame with the model, swept in the existing cleanup loop; needs max hp per type alongside the type keys it already receives).
- **App**: `src/app/game.ts` (pass the enemy types' hp to the renderer at construction — one argument).
- **Sim**: none. `Enemy.hp` and `enemyTypes[typeId].hp` already exist; the hash is unchanged.
- **Tests**: a pure remaining-fraction helper (clamped to `[0, 1]`) unit-tested; the renderer itself verified by exploratory Playwright testing during apply, per the project's apply guidance.
- **Docs**: ARCHITECTURE.md §8's render-only motion list gains the bar; the "max hp = type stat" coupling is written down so a future per-wave hp scaling knows it must move `maxHp` onto the enemy record (and into the hash).
