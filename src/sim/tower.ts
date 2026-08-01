// Targeting and hitscan firing
// See ARCHITECTURE.md §7 and phase-2 design D5
//
// Responsibilities:
//   - "First along path" targeting = minimal inbound-field cost at the
//     enemy's current tile, tie-broken by insertion order
//   - Damage applies on the firing tick; the tracer is a render-only event
//   - (Upgrades and other archetypes are Phase 3)

import type { TowerStats } from '../data/schema';
import { TILE, toTile } from './fixed';
import type { FlowField } from './flowfield';
import type { Grid } from './grid';
import type { RenderEvent } from './events';
import type { SimState, Structure } from './types';

/** A tower's centre in fixed-point units: the middle of its 2×2 footprint. */
export function towerCentre(t: Structure): { x: number; y: number } {
  return { x: (t.tx + 1) * TILE, y: (t.ty + 1) * TILE };
}

/**
 * Tick step 7: every tower at or past its next-fire tick with a target in
 * range fires once — hitscan, damage this tick, tracer event for the
 * renderer. A tower with nothing in range holds its fire tick, so it shoots
 * the moment a target appears.
 */
export function fireTowers(
  state: SimState,
  grid: Grid,
  inbound: FlowField,
  stats: TowerStats,
  events: RenderEvent[],
): void {
  for (const t of state.structures) {
    if (t.kind !== 'tower' || state.tick < t.nextFireTick) continue;
    const { x: cx, y: cy } = towerCentre(t);
    const range2 = stats.rangeUnits * stats.rangeUnits;

    let target = null;
    let bestCost = -1;
    for (const e of state.enemies) {
      // hp <= 0 marks a same-tick earlier kill; step 8 reaps it — don't overkill.
      if (!e.alive || e.hp <= 0) continue;
      const dx = e.pos.x - cx;
      const dy = e.pos.y - cy;
      if (dx * dx + dy * dy > range2) continue;
      const cost = inbound.cost[grid.idx(toTile(e.pos.x), toTile(e.pos.y))]!;
      if (cost < 0) continue;
      // Strict < keeps the earlier-inserted enemy on equal cost (design D5).
      if (target === null || cost < bestCost) {
        target = e;
        bestCost = cost;
      }
    }
    if (!target) continue;

    target.hp -= stats.damage;
    t.nextFireTick = state.tick + stats.fireIntervalTicks;
    events.push({
      kind: 'tracer',
      fromX: cx,
      fromY: cy,
      toX: target.pos.x,
      toY: target.pos.y,
    });
  }
}
