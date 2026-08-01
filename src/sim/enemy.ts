// Enemy steering, state machine, theft
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Waypoint commitment and re-evaluation on arrival
//   - inbound / returning state machine (theft is Phase 2; only inbound exists)
//   - Carriers move at 80% speed (Phase 2)

import { length, normalize, tileCentre, toTile } from './fixed';
import type { FlowField } from './flowfield';
import { nextTile } from './flowfield';
import type { Grid } from './grid';
import type { Enemy, SimState } from './types';

/**
 * Tick step 5: move every enemy toward its committed waypoint at fixed speed.
 *
 * The commitment is never revised between waypoints: only on arriving at the
 * waypoint (within one step's reach — landing is exact) does the enemy re-read
 * the field at its current tile and commit the next tile centre.
 */
export function stepEnemies(state: SimState, grid: Grid, inbound: FlowField): void {
  for (const e of state.enemies) {
    let budget = e.speed;
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
        const next = nextTile(inbound, grid, toTile(e.pos.x), toTile(e.pos.y));
        if (!next) break; // at a field source (treasury) or unreachable: hold
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

/** Tick step 6: enemies standing on the treasury centre despawn (Phase 1). */
export function despawnAtTreasury(state: SimState, treasury: { x: number; y: number }): void {
  const cx = tileCentre(treasury.x);
  const cy = tileCentre(treasury.y);
  for (const e of state.enemies) {
    if (e.pos.x === cx && e.pos.y === cy) e.alive = false;
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
      alive: true,
    };
    state.enemies.push(enemy);
  });
}
