// Enemy steering, state machine, theft
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Waypoint commitment and re-evaluation on arrival
//   - Commitment invalidation on mask changes (phase-2 design D2)
//   - Carriers move at 80% speed

import { length, normalize, tileCentre, toTile } from './fixed';
import type { FlowField } from './flowfield';
import { nextTile } from './flowfield';
import type { Grid } from './grid';
import type { Enemy, SimState } from './types';

/** Both live fields, picked per enemy by its mode. */
export interface Fields {
  inbound: FlowField;
  returning: FlowField;
}

/** Effective per-tick speed: carriers move at 80%, via integer math. */
export function effectiveSpeed(e: Enemy): number {
  return e.carriedMg > 0 ? Math.trunc((e.speed * 4) / 5) : e.speed;
}

/**
 * Tick step 5: move every enemy toward its committed waypoint at fixed speed.
 *
 * The commitment is never revised between waypoints (the one exception is the
 * invalidation sweep below): only on arriving at the waypoint does the enemy
 * re-read the field for its mode at its current tile and commit the next tile
 * centre.
 */
export function stepEnemies(state: SimState, grid: Grid, fields: Fields): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const field = e.mode === 'inbound' ? fields.inbound : fields.returning;
    let budget = effectiveSpeed(e);
    // An enemy that lands mid-tick with movement budget left continues toward
    // the next waypoint, so speed is honoured exactly through turns.
    while (budget > 0) {
      const dx = e.waypoint.x - e.pos.x;
      const dy = e.waypoint.y - e.pos.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= budget * budget) {
        e.pos.x = e.waypoint.x;
        e.pos.y = e.waypoint.y;
        budget -= length(dx, dy);
        const next = nextTile(field, grid, toTile(e.pos.x), toTile(e.pos.y));
        if (!next) break; // at a field source (treasury/spawn) or unreachable: hold
        e.waypoint.x = tileCentre(next.x);
        e.waypoint.y = tileCentre(next.y);
      } else {
        const [mx, my] = normalize(dx, dy, budget);
        e.pos.x += mx;
        e.pos.y += my;
        break;
      }
    }
  }
}

/**
 * Design D2: after any mask-change rebuild, re-commit every enemy whose
 * committed move became illegal — its waypoint tile is now blocked, or the
 * move is diagonal and either flanking orthogonal tile is now blocked. Runs
 * before movement in the same tick, so an enemy never walks into a fresh
 * wall. Removal (unblocking) never invalidates, so this only ever fires on
 * newly blocked tiles.
 */
export function invalidateCommitments(state: SimState, grid: Grid, fields: Fields): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const ctx = toTile(e.pos.x);
    const cty = toTile(e.pos.y);
    const wtx = toTile(e.waypoint.x);
    const wty = toTile(e.waypoint.y);
    if (wtx === ctx && wty === cty) continue; // committed to its own tile
    const diagonal = wtx !== ctx && wty !== cty;
    const illegal =
      grid.isBlocked(wtx, wty) ||
      (diagonal && (grid.isBlocked(wtx, cty) || grid.isBlocked(ctx, wty)));
    if (!illegal) continue;
    const field = e.mode === 'inbound' ? fields.inbound : fields.returning;
    const next = nextTile(field, grid, ctx, cty);
    // Placement validation guarantees a live enemy is never stranded, so
    // next is null only when the enemy already stands on a source tile.
    e.waypoint.x = tileCentre(next ? next.x : ctx);
    e.waypoint.y = tileCentre(next ? next.y : cty);
  }
}

/**
 * Tick step 4 (Phase-1 stand-in for the wave scheduler): spawn one enemy per
 * spawn point whenever its absolute-tick timer comes due.
 */
export function spawnDueEnemies(
  state: SimState,
  spawns: readonly { x: number; y: number }[],
  typeId: number,
  speed: number,
  hp: number,
  intervalTicks: number,
): void {
  spawns.forEach((spawn, i) => {
    if (state.tick < state.nextSpawnTicks[i]!) return;
    state.nextSpawnTicks[i] = state.tick + intervalTicks;
    const x = tileCentre(spawn.x);
    const y = tileCentre(spawn.y);
    const enemy: Enemy = {
      id: state.nextEnemyId++,
      typeId,
      pos: { x, y },
      prevPos: { x, y },
      // Committing the own tile centre makes the first movement tick re-read
      // the field and commit the real first waypoint.
      waypoint: { x, y },
      speed,
      mode: 'inbound',
      hp,
      carriedMg: 0,
      alive: true,
    };
    state.enemies.push(enemy);
  });
}
