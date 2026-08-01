// Zod schemas for level and balance files
// See ARCHITECTURE.md §10
//
// Responsibilities:
//   - Shape validation plus semantic checks
//   - Every group.spawn references a declared spawn id
//   - Every group.type exists in balance.json
//   - Every spawn reaches the treasury on the starting terrain
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

/** Phase 2's one live tower; the other archetypes stay unshaped until Phase 3. */
const RapidTowerSchema = z.looseObject({
  cost: z.int().nonnegative(),
  damage: z.int().positive(),
  /** Authored in tiles for readability; converted to fixed-point units at load. */
  rangeTiles: z.number().positive(),
  fireIntervalTicks: z.int().positive(),
});

export const BalanceSchema = z.object({
  build: z.object({
    wallCost: z.int().nonnegative(),
    removalRefundFraction: z.number().min(0).max(1),
  }),
  // Only rapid has its real Phase-2 shape; the rest arrive in Phase 3.
  towers: z.looseObject({ rapid: RapidTowerSchema }),
  enemies: z.record(z.string(), EnemyStatsSchema),
});
export type Balance = z.infer<typeof BalanceSchema>;

/** One enemy type in canonical order; a sim typeId is an index into this list. */
export interface EnemyType {
  key: string;
  speed: number;
  hp: number;
  /** Carry capacity in milli-gold. */
  carryMg: number;
  /** Kill bounty in milli-gold. */
  bountyMg: number;
}

/** The rapid tower's stats, integer-converted for the sim. */
export interface TowerStats {
  costMg: number;
  damage: number;
  /** Range in fixed-point units, measured from the tower's centre. */
  rangeUnits: number;
  fireIntervalTicks: number;
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
  rapidTower: TowerStats;
}

/**
 * Validate and load level + balance data. Throws with a message naming the
 * offending reference; a level that fails here never reaches the sim or the
 * renderer.
 */
export function loadGameData(levelJson: unknown, balanceJson: unknown): GameData {
  const level = LevelSchema.parse(levelJson);
  const balance = BalanceSchema.parse(balanceJson);

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

  const rapid = balance.towers.rapid;
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
        };
      }),
    wallCostMg: balance.build.wallCost * GOLD,
    refundPer1000: Math.round(balance.build.removalRefundFraction * 1000),
    rapidTower: {
      costMg: rapid.cost * GOLD,
      damage: rapid.damage,
      rangeUnits: Math.round(rapid.rangeTiles * TILE),
      fireIntervalTicks: rapid.fireIntervalTicks,
    },
  };
}
