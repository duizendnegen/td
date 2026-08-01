// Zod schemas for level and balance files
// See ARCHITECTURE.md §10
//
// Responsibilities:
//   - Shape validation plus semantic checks
//   - Every group.spawn references a declared spawn id
//   - Every group.type exists in balance.json
//   - Every spawn reaches the treasury on the starting terrain
//   - Per-archetype level tables: exactly three hand-authored rows, with each
//     archetype's non-axis stats identical across rows (phase-3 design D2)
//   - Float rates from JSON converted to integers once, here, at load

import { z } from 'zod';
import { GOLD, TILE } from '../sim/fixed';
import { buildField } from '../sim/flowfield';
import { Grid } from '../sim/grid';

const TileSchema = z.object({ x: z.int().nonnegative(), y: z.int().nonnegative() });

const SpawnSchema = TileSchema.extend({
  id: z.string().min(1),
  activeFromWave: z.int().positive(),
});

const WaveSchema = z.object({
  groups: z.array(
    z.object({
      spawn: z.string(),
      type: z.string(),
      count: z.int().positive(),
      spawnInterval: z.int().nonnegative(),
      delay: z.int().nonnegative(),
    }),
  ),
});

export const LevelSchema = z.object({
  id: z.string().min(1),
  grid: z.object({ width: z.int().positive(), height: z.int().positive() }),
  treasury: TileSchema,
  spawns: z.array(SpawnSchema).min(1),
  terrain: z.object({
    blocked: z.array(TileSchema),
    // Prebuilt walls/towers get a real shape in Phase 2.
    prebuilt: z.array(z.unknown()),
  }),
  economy: z.object({
    startingTreasury: z.int().nonnegative(),
    interestRatePerTick: z.number().nonnegative(),
  }),
  // Allowed empty until Phase 4 introduces the wave loader (design D-P1-5).
  waves: z.array(WaveSchema),
});
export type Level = z.infer<typeof LevelSchema>;

const EnemyStatsSchema = z.object({
  punishes: z.string().optional(),
  hp: z.int().nonnegative(),
  /** Movement speed in integer 1/1024-tile units per tick. */
  speed: z.int().nonnegative(),
  carryCapacity: z.int().nonnegative(),
  bounty: z.int().nonnegative(),
  slowImmune: z.boolean(),
});

/** One hand-authored level row (design D2: nothing computed from multipliers). */
const TowerLevelSchema = z.object({
  cost: z.int().positive(),
  /** 0 for the slow tower — it never deals damage. */
  damage: z.int().nonnegative(),
  /** Authored in tiles for readability; converted to fixed-point units at load. */
  rangeTiles: z.number().positive(),
  fireIntervalTicks: z.int().positive(),
  /** Slow only: status duration bought by upgrades. */
  slowDurationTicks: z.int().positive().optional(),
});

const TowerSchema = z.looseObject({
  levels: z.array(TowerLevelSchema).length(3),
  /** Area only: burst radius, fixed across levels. */
  burstRadiusTiles: z.number().positive().optional(),
  /** Slow only: the single global slow percentage — slowed speed = speed × pct / 100. */
  slowSpeedPercent: z.int().min(1).max(99).optional(),
});

export const BalanceSchema = z.object({
  build: z.object({
    wallCost: z.int().nonnegative(),
    removalRefundFraction: z.number().min(0).max(1),
  }),
  towers: z.object({
    rapid: TowerSchema,
    sniper: TowerSchema,
    area: TowerSchema,
    slow: TowerSchema,
  }),
  enemies: z.record(z.string(), EnemyStatsSchema),
});
export type Balance = z.infer<typeof BalanceSchema>;

/** Canonical archetype order; a structure's archetypeId is an index into this. */
export const ARCHETYPES = ['rapid', 'sniper', 'area', 'slow'] as const;
export type TowerArchetype = (typeof ARCHETYPES)[number];

/** One enemy type in canonical order; a sim typeId is an index into this list. */
export interface EnemyType {
  key: string;
  speed: number;
  hp: number;
  /** Carry capacity in milli-gold. */
  carryMg: number;
  /** Kill bounty in milli-gold. */
  bountyMg: number;
  /** Immune to the slow status (reserved for Phase 4's spawner). */
  slowImmune: boolean;
}

/** One level row, integer-converted for the sim. */
export interface TowerLevelStats {
  costMg: number;
  damage: number;
  /** Range in fixed-point units, measured from the tower's centre. */
  rangeUnits: number;
  fireIntervalTicks: number;
  /** 0 for every archetype but slow. */
  slowDurationTicks: number;
}

/** One archetype, integer-converted; indexed by archetypeId in GameData. */
export interface TowerDef {
  archetype: TowerArchetype;
  /** Exactly three rows; a tower at level L uses levels[L - 1]. */
  levels: readonly TowerLevelStats[];
  /** Burst radius in fixed-point units; 0 for every archetype but area. */
  burstRadiusUnits: number;
}

/** Everything the sim needs, converted to integers exactly once, here. */
export interface GameData {
  level: Level;
  balance: Balance;
  grid: Grid;
  startingTreasuryMg: number;
  /** interestRatePerTick × 10 000, rounded — accrual is balance*rate/10000 per tick. */
  interestRatePer10k: number;
  /** Sorted by key so typeId assignment ignores authoring order. */
  enemyTypes: EnemyType[];
  wallCostMg: number;
  /** removalRefundFraction × 1000, rounded — refund is paidMg*frac/1000, floored. */
  refundPer1000: number;
  /** Indexed by archetypeId (canonical ARCHETYPES order). */
  towers: TowerDef[];
  /** The single global slow multiplier: slowed speed = speed × this / 100. */
  slowSpeedPer100: number;
}

/**
 * D2 semantic checks: each archetype scales exactly its two axes, and every
 * non-axis stat repeats verbatim across its three rows.
 */
function checkTowerAxes(balance: Balance): void {
  const constantAcross = (
    archetype: TowerArchetype,
    stat: string,
    pick: (l: z.infer<typeof TowerLevelSchema>) => number | undefined,
  ): void => {
    const levels = balance.towers[archetype].levels;
    if (levels.some((l) => pick(l) !== pick(levels[0]!))) {
      throw new Error(`balance: ${archetype}.${stat} is not a scaling axis and must be identical across levels`);
    }
  };
  constantAcross('rapid', 'rangeTiles', (l) => l.rangeTiles);
  constantAcross('sniper', 'fireIntervalTicks', (l) => l.fireIntervalTicks);
  constantAcross('area', 'fireIntervalTicks', (l) => l.fireIntervalTicks);
  constantAcross('slow', 'fireIntervalTicks', (l) => l.fireIntervalTicks);
  if (balance.towers.slow.levels.some((l) => l.damage !== 0)) {
    throw new Error('balance: the slow tower deals no damage; every slow level needs damage 0');
  }
  if (balance.towers.slow.levels.some((l) => l.slowDurationTicks === undefined)) {
    throw new Error('balance: every slow level needs slowDurationTicks');
  }
  if (balance.towers.area.burstRadiusTiles === undefined) {
    throw new Error('balance: area needs burstRadiusTiles');
  }
  if (balance.towers.slow.slowSpeedPercent === undefined) {
    throw new Error('balance: slow needs slowSpeedPercent');
  }
}

/**
 * Validate and load level + balance data. Throws with a message naming the
 * offending reference; a level that fails here never reaches the sim or the
 * renderer.
 */
export function loadGameData(levelJson: unknown, balanceJson: unknown): GameData {
  const level = LevelSchema.parse(levelJson);
  const balance = BalanceSchema.parse(balanceJson);
  checkTowerAxes(balance);

  const { width, height } = level.grid;
  const grid = new Grid(width, height);
  for (const t of level.terrain.blocked) {
    if (t.x >= width || t.y >= height) {
      throw new Error(`level ${level.id}: blocked tile (${t.x}, ${t.y}) is out of bounds`);
    }
    grid.setBlocked(t.x, t.y, true);
  }

  const placed = (name: string, t: { x: number; y: number }): void => {
    if (t.x >= width || t.y >= height) {
      throw new Error(`level ${level.id}: ${name} (${t.x}, ${t.y}) is out of bounds`);
    }
    if (grid.isBlocked(t.x, t.y)) {
      throw new Error(`level ${level.id}: ${name} (${t.x}, ${t.y}) is on blocked terrain`);
    }
  };
  placed('treasury', level.treasury);
  for (const s of level.spawns) placed(`spawn "${s.id}"`, s);

  const spawnIds = new Set(level.spawns.map((s) => s.id));
  if (spawnIds.size !== level.spawns.length) {
    throw new Error(`level ${level.id}: duplicate spawn ids`);
  }
  level.waves.forEach((wave, i) => {
    for (const g of wave.groups) {
      if (!spawnIds.has(g.spawn)) {
        throw new Error(`level ${level.id}: wave ${i + 1} references undeclared spawn "${g.spawn}"`);
      }
      if (!balance.enemies[g.type]) {
        throw new Error(`level ${level.id}: wave ${i + 1} references unknown enemy type "${g.type}"`);
      }
    }
  });

  // Reachability: every declared spawn must reach the treasury on starting
  // terrain. The flow-field builder doubles as the graph check (D8).
  const inbound = buildField(grid, [level.treasury]);
  for (const s of level.spawns) {
    if (inbound.cost[grid.idx(s.x, s.y)]! < 0) {
      throw new Error(
        `level ${level.id}: spawn "${s.id}" (${s.x}, ${s.y}) cannot reach the treasury`,
      );
    }
  }

  return {
    level,
    balance,
    grid,
    startingTreasuryMg: level.economy.startingTreasury * GOLD,
    interestRatePer10k: Math.round(level.economy.interestRatePerTick * 10_000),
    enemyTypes: Object.keys(balance.enemies)
      .sort()
      .map((key) => {
        const e = balance.enemies[key]!;
        return {
          key,
          speed: e.speed,
          hp: e.hp,
          carryMg: e.carryCapacity * GOLD,
          bountyMg: e.bounty * GOLD,
          slowImmune: e.slowImmune,
        };
      }),
    wallCostMg: balance.build.wallCost * GOLD,
    refundPer1000: Math.round(balance.build.removalRefundFraction * 1000),
    towers: ARCHETYPES.map((archetype) => {
      const t = balance.towers[archetype];
      return {
        archetype,
        levels: t.levels.map((l) => ({
          costMg: l.cost * GOLD,
          damage: l.damage,
          rangeUnits: Math.round(l.rangeTiles * TILE),
          fireIntervalTicks: l.fireIntervalTicks,
          slowDurationTicks: l.slowDurationTicks ?? 0,
        })),
        burstRadiusUnits: Math.round((t.burstRadiusTiles ?? 0) * TILE),
      };
    }),
    slowSpeedPer100: balance.towers.slow.slowSpeedPercent ?? 100,
  };
}
