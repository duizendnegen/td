// Targeting and hitscan firing for the four archetypes
// See ARCHITECTURE.md §7 and phase-3 designs D4–D7
//
// Responsibilities:
//   - "First along path" targeting (rapid/area/slow) = minimal inbound-field
//     cost at the enemy's current tile, tie-broken by insertion order
//   - Sniper cascade (D5): carriers (carried > 0) by minimal cost in each
//     carrier's origin returning field; else max stat-block hp, then minimal
//     inbound cost, then insertion
//   - Area burst (D6): flat damage within radiusSq of the target's position
//   - Slow (D4): slowUntil = max(...), no damage; slowImmune short-circuits
//   - Within a tick towers fire in insertion order and skip the dead (D7)
//   - Damage applies on the firing tick; all events are render-only
//   - Every hit records its effective damage — min(hp, damage), never
//     overkill — on the firing tower's waveDamage/totalDamage counters
//     (tower-damage-stats D2); recorded, never read, by the sim
//   - Step 7 is two passes (energy-infrastructure design D2): a target
//     pre-pass over every tower — its engagement is what draws power — then,
//     once the tick's coverage is known, the firing pass, which stretches the
//     next-shot interval by 1/coverage and holds fire at coverage zero (D3)

import type { GameData, TowerLevelStats } from '../data/schema';
import { HALF, TILE, toTile } from './fixed';
import type { Fields } from './enemy';
import type { Grid } from './grid';
import type { RenderEvent } from './events';
import { COVERAGE_SCALE, drawOf, stretchedInterval } from './power';
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
    // focus fire emerges with no persistence state. Carriers judged by their
    // ORIGIN spawn's returning field (closest to escaping through its own
    // exit — return-to-origin-spawn spec); the strongest bucket by stat-block
    // hp (never current hp), then the inbound field.
    const carrier = e.carriedMg > 0 ? 1 : 0;
    const hp = carrier ? 0 : data.enemyTypes[e.typeId]!.hp;
    const cost = (carrier ? fields.returning[e.originSpawn]! : fields.inbound).cost[tileIdx]!;
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

/** The target pre-pass result: one slot per structure (null for non-towers and idle towers) and the tick's draw. */
export interface TargetPass {
  /** Aligned with state.structures; the pre-pass target of each tower, if any. */
  targets: (Enemy | null)[];
  /** The tick's total draw in mp: rated while engaged, standby otherwise. */
  drawMp: number;
  /**
   * The engaged share of `drawMp` — the rated draw of every tower that found
   * a target (wave-ledger design D4); standby is the remainder.
   */
  engagedMp: number;
}

/**
 * One landed hit: the victim loses `damage` hp and the firing tower records
 * what actually landed (tower-damage-stats design D2). Selection and the
 * burst loop both skip hp <= 0, so the victim's hp is positive here and the
 * effective figure is in [1, damage] — overkill is never counted.
 */
function hit(t: Structure, victim: Enemy, damage: number): void {
  const dealt = Math.min(victim.hp, damage);
  victim.hp -= damage;
  t.waveDamage += dealt;
  t.totalDamage += dealt;
}

/**
 * Step 7, pass one (energy-infrastructure design D2): every tower selects its
 * target once — engaged if it found one — and the tick's draw is summed from
 * that. Pure over the state; the firing pass reuses these targets so the
 * extra pass costs one selectTarget per tower, not two.
 */
export function preTargetTowers(state: SimState, grid: Grid, fields: Fields, data: GameData): TargetPass {
  const targets: (Enemy | null)[] = [];
  let drawMp = 0;
  let engagedMp = 0;
  for (const t of state.structures) {
    if (t.kind !== 'tower') {
      targets.push(null);
      continue;
    }
    const target = selectTarget(t, state, grid, fields, data);
    targets.push(target);
    const draw = drawOf(t, target !== null, data);
    drawMp += draw;
    if (target !== null) engagedMp += draw;
  }
  return { targets, drawMp, engagedMp };
}

/**
 * Tick step 7, pass two: towers due to fire resolve in insertion order (D7);
 * each with a target in range fires once — hitscan, damage this tick, events
 * for the renderer. A tower with nothing in range holds its fire tick, so it
 * shoots the moment a target appears.
 *
 * `coverage` (COVERAGE_SCALE = full) stretches the NEXT shot's interval by
 * 1/coverage (design D2/D3): the shot due now lands now, uniformly for every
 * archetype — a slow tower's reapplication cadence stretches, its duration
 * does not. At coverage zero a due tower holds without advancing its fire
 * tick, so it fires on the first later tick with any coverage. `pre` is the
 * pre-pass; a cached target that an earlier tower killed this tick is dead
 * to selection exactly as before, so the tower re-selects among the living
 * (skip-the-dead, D7) rather than firing at a corpse.
 */
export function fireTowers(
  state: SimState,
  grid: Grid,
  fields: Fields,
  data: GameData,
  events: RenderEvent[],
  coverage: number = COVERAGE_SCALE,
  pre: TargetPass | null = null,
): void {
  if (coverage <= 0) return; // brownout to nothing: every due tower holds
  for (let i = 0; i < state.structures.length; i++) {
    const t = state.structures[i]!;
    if (t.kind !== 'tower' || state.tick < t.nextFireTick) continue;
    // Between the passes only hp can fall, so a tower idle in the pre-pass is
    // idle now; a cached target that died since is re-selected among the living.
    let target = pre ? pre.targets[i]! : selectTarget(t, state, grid, fields, data);
    if (target === null) continue;
    if (!target.alive || target.hp <= 0) {
      target = selectTarget(t, state, grid, fields, data);
      if (target === null) continue;
    }

    const def = data.towers[t.archetypeId]!;
    const stats = towerStats(t, data);
    const { x: cx, y: cy } = towerCentre(t);
    t.nextFireTick = state.tick + stretchedInterval(stats.fireIntervalTicks, coverage);

    switch (def.archetype) {
      case 'rapid':
      case 'sniper':
        hit(t, target, stats.damage);
        break;
      case 'area': {
        // D6: flat damage to every live enemy within the burst radius of the
        // target's position — including the target itself, at distance 0.
        const radius2 = def.burstRadiusUnits * def.burstRadiusUnits;
        for (const e of state.enemies) {
          if (!e.alive || e.hp <= 0) continue;
          const dx = e.pos.x - target.pos.x;
          const dy = e.pos.y - target.pos.y;
          if (dx * dx + dy * dy <= radius2) hit(t, e, stats.damage);
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
