// Targeting and hitscan firing for the four archetypes
// See ARCHITECTURE.md §7 and phase-3 designs D4–D7
//
// Responsibilities:
//   - "First along path" targeting (rapid/area/slow) = minimal inbound-field
//     cost at the enemy's current tile, tie-broken by insertion order
//   - Sniper cascade (D5): carriers (carried > 0) by minimal returning-field
//     cost; else max stat-block hp, then minimal inbound cost, then insertion
//   - Area burst (D6): flat damage within radiusSq of the target's position
//   - Slow (D4): slowUntil = max(...), no damage; slowImmune short-circuits
//   - Within a tick towers fire in insertion order and skip the dead (D7)
//   - Damage applies on the firing tick; all events are render-only

import type { GameData, TowerLevelStats } from '../data/schema';
import { HALF, TILE, toTile } from './fixed';
import type { Fields } from './enemy';
import type { Grid } from './grid';
import type { RenderEvent } from './events';
import type { Enemy, SimState, Structure } from './types';

/** A tower's centre in fixed-point units: the middle of its single tile. */
export function towerCentre(t: Structure): { x: number; y: number } {
  return { x: t.tx * TILE + HALF, y: t.ty * TILE + HALF };
}

/** The level row a tower currently fires with. */
export function towerStats(t: Structure, data: GameData): TowerLevelStats {
  return data.towers[t.archetypeId]!.levels[t.level - 1]!;
}

/**
 * Target selection for one tower against the current state — pure, so the
 * F3 overlay and the weapon-head yaw can read the sim's actual choice without
 * touching it. Selection sees only alive enemies with hp > 0 (design D7:
 * an earlier same-tick kill is never targeted again).
 */
export function selectTarget(
  t: Structure,
  state: SimState,
  grid: Grid,
  fields: Fields,
  data: GameData,
): Enemy | null {
  const { x: cx, y: cy } = towerCentre(t);
  const stats = towerStats(t, data);
  const range2 = stats.rangeUnits * stats.rangeUnits;
  const sniper = data.towers[t.archetypeId]!.archetype === 'sniper';

  let target: Enemy | null = null;
  // Sniper cascade class: 1 = carrier, 0 = strongest bucket (D5).
  let bestCarrier = -1;
  let bestHp = -1;
  let bestCost = -1;
  for (const e of state.enemies) {
    if (!e.alive || e.hp <= 0) continue;
    const dx = e.pos.x - cx;
    const dy = e.pos.y - cy;
    if (dx * dx + dy * dy > range2) continue;
    const tileIdx = grid.idx(toTile(e.pos.x), toTile(e.pos.y));

    if (!sniper) {
      // First along path: minimal inbound cost; strict < keeps the
      // earlier-inserted enemy on equal cost (phase-2 design D5).
      const cost = fields.inbound.cost[tileIdx]!;
      if (cost < 0) continue;
      if (target === null || cost < bestCost) {
        target = e;
        bestCost = cost;
      }
      continue;
    }

    // Sniper (D5): every key is static over a target's in-range lifetime, so
    // focus fire emerges with no persistence state. Carriers judged by the
    // returning field (closest to escaping); the strongest bucket by
    // stat-block hp (never current hp), then the inbound field.
    const carrier = e.carriedMg > 0 ? 1 : 0;
    const hp = carrier ? 0 : data.enemyTypes[e.typeId]!.hp;
    const cost = (carrier ? fields.returning : fields.inbound).cost[tileIdx]!;
    if (cost < 0) continue;
    const better =
      target === null ||
      carrier > bestCarrier ||
      (carrier === bestCarrier && !carrier && hp > bestHp) ||
      (carrier === bestCarrier && hp === bestHp && cost < bestCost);
    if (better) {
      target = e;
      bestCarrier = carrier;
      bestHp = hp;
      bestCost = cost;
    }
  }
  return target;
}

/**
 * Tick step 7: towers due to fire resolve in insertion order (D7); each with
 * a target in range fires once — hitscan, damage this tick, events for the
 * renderer. A tower with nothing in range holds its fire tick, so it shoots
 * the moment a target appears.
 */
export function fireTowers(
  state: SimState,
  grid: Grid,
  fields: Fields,
  data: GameData,
  events: RenderEvent[],
): void {
  for (const t of state.structures) {
    if (t.kind !== 'tower' || state.tick < t.nextFireTick) continue;
    const target = selectTarget(t, state, grid, fields, data);
    if (!target) continue;

    const def = data.towers[t.archetypeId]!;
    const stats = towerStats(t, data);
    const { x: cx, y: cy } = towerCentre(t);
    t.nextFireTick = state.tick + stats.fireIntervalTicks;

    switch (def.archetype) {
      case 'rapid':
      case 'sniper':
        target.hp -= stats.damage;
        break;
      case 'area': {
        // D6: flat damage to every live enemy within the burst radius of the
        // target's position — including the target itself, at distance 0.
        const radius2 = def.burstRadiusUnits * def.burstRadiusUnits;
        for (const e of state.enemies) {
          if (!e.alive || e.hp <= 0) continue;
          const dx = e.pos.x - target.pos.x;
          const dy = e.pos.y - target.pos.y;
          if (dx * dx + dy * dy <= radius2) e.hp -= stats.damage;
        }
        events.push({
          kind: 'aoeBurst',
          towerId: t.id,
          x: target.pos.x,
          y: target.pos.y,
          radiusUnits: def.burstRadiusUnits,
        });
        break;
      }
      case 'slow':
        // D4: extend, never stack; immune stat blocks short-circuit.
        if (!data.enemyTypes[target.typeId]!.slowImmune) {
          target.slowUntil = Math.max(target.slowUntil, state.tick + stats.slowDurationTicks);
        }
        break;
    }
    events.push({
      kind: 'tracer',
      towerId: t.id,
      archetypeId: t.archetypeId,
      fromX: cx,
      fromY: cy,
      toX: target.pos.x,
      toY: target.pos.y,
    });
  }
}
