// Zod schemas for level and balance files
// See ARCHITECTURE.md §10
//
// Responsibilities:
//   - Shape validation plus semantic checks
//   - Terrain as a char-map over the four-kind palette (phase-4 design D5)
//   - Every group.spawn references a declared spawn id that is active by then
//   - Every group.type exists in balance.json
//   - Every spawn reaches the treasury on the starting terrain
//   - Per-archetype level tables: exactly three hand-authored rows, with each
//     archetype's non-axis stats identical across rows (phase-3 design D2)
//   - Power data (energy-infrastructure): a rated power per tower level, the
//     standby fraction and the panel block in balance; a non-empty, strictly
//     ascending connection-tier table and a flat tariff per level
//   - Float rates from JSON converted to integers once, here, at load

import { z } from 'zod';
import { GOLD, POWER, TICK_HZ, TILE } from '../sim/fixed';
import { buildField } from '../sim/flowfield';
import { Grid, TERRAIN } from '../sim/grid';

const TileSchema = z.object({ x: z.int().nonnegative(), y: z.int().nonnegative() });

const SpawnSchema = TileSchema.extend({
  id: z.string().min(1),
  activeFromWave: z.int().positive(),
});

const WaveSchema = z.object({
  groups: z
    .array(
      z.object({
        spawn: z.string(),
        type: z.string(),
        count: z.int().positive(),
        spawnInterval: z.int().nonnegative(),
        delay: z.int().nonnegative(),
      }),
    )
    .min(1),
});

const TERRAIN_KINDS = ['dirt', 'grass', 'rock', 'socket'] as const;

/**
 * One grid connection tier (power-grid spec): its capacity in authored power
 * units and the one-time cost of upgrading INTO it. The first tier is the
 * starting connection, so its cost is ignored.
 */
const GridTierSchema = z.object({
  capacity: z.number().positive(),
  cost: z.int().nonnegative(),
});

export const LevelSchema = z.object({
  id: z.string().min(1),
  grid: z.object({ width: z.int().positive(), height: z.int().positive() }),
  treasury: TileSchema,
  spawns: z.array(SpawnSchema).min(1),
  terrain: z.object({
    /** Character → terrain kind; every map character must appear here. */
    legend: z.record(z.string().length(1), z.enum(TERRAIN_KINDS)),
    /** One string row per grid row, one character per tile. */
    map: z.array(z.string()),
  }),
  economy: z.object({
    startingTreasury: z.int().nonnegative(),
    interestRatePerTick: z.number().nonnegative(),
  }),
  /** The grid connection (energy-infrastructure design D6/D8). */
  power: z.object({
    /** Ordered, non-empty; capacities strictly ascending (checked below). */
    tiers: z.array(GridTierSchema).min(1),
    /** Gold per power unit per SECOND; converted to mg per 1000 mp per tick. */
    tariff: z.number().nonnegative(),
  }),
  waves: z.array(WaveSchema).min(1),
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
  /**
   * Rated power in authored units — drawn in full while the tower has a
   * target, scaled by the standby fraction otherwise (power-grid spec).
   */
  ratedPower: z.number().nonnegative(),
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
  /**
   * Settlement speed bonus (balance-ux-tweaks design D4): full baseGold when a
   * wave settles within graceTicks of its last scheduled spawn, then decaying
   * linearly to zero over decayTicks.
   */
  waveBonus: z.object({
    baseGold: z.int().nonnegative(),
    graceTicks: z.int().nonnegative(),
    decayTicks: z.int().positive(),
  }),
  towers: z.object({
    rapid: TowerSchema,
    sniper: TowerSchema,
    area: TowerSchema,
    slow: TowerSchema,
  }),
  /** Power block (energy-infrastructure design D1/D7). */
  power: z.object({
    /** Share of the rating a tower draws with nothing in range, in [0, 1]. */
    standbyFraction: z.number().min(0).max(1),
    /** The solar panel: gold cost and constant output in authored units. */
    panel: z.object({
      cost: z.int().nonnegative(),
      output: z.number().nonnegative(),
    }),
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
  /** Rated power in mp, drawn while engaged; standby is a fraction of it. */
  ratedPowerMp: number;
}

/** One grid connection tier, integer-converted. */
export interface GridTier {
  capacityMp: number;
  /** Cost of upgrading into this tier; 0 and never charged for tiers[0]. */
  costMg: number;
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
  /**
   * interestRatePerTick in integer parts-per-million (design D3) — accrual is
   * floor(balance × ratePpm / 1 000 000) per wave tick on positive balances.
   */
  interestRatePpm: number;
  /** Sorted by key so typeId assignment ignores authoring order. */
  enemyTypes: EnemyType[];
  wallCostMg: number;
  /** removalRefundFraction × 1000, rounded — refund is paidMg*frac/1000, floored. */
  refundPer1000: number;
  /** Settlement speed bonus, integer-converted (design D4). */
  waveBonus: { baseMg: number; graceTicks: number; decayTicks: number };
  /** Indexed by archetypeId (canonical ARCHETYPES order). */
  towers: TowerDef[];
  /** The single global slow multiplier: slowed speed = speed × this / 100. */
  slowSpeedPer100: number;
  /** standbyFraction × 1000, rounded — standby draw is rated × this / 1000, floored. */
  standbyPer1000: number;
  panelCostMg: number;
  /** Constant per-tick output of one panel while a wave runs. */
  panelOutputMp: number;
  /** The level's connection tiers, in order; SimState.gridTier indexes this. */
  gridTiers: GridTier[];
  /**
   * Tariff in milli-gold per 1000 mp per TICK (design D8) — the bill is
   * floor(gridSupplyMp × tariffMgPer1000 / 1000), one floor per tick.
   */
  tariffMgPer1000: number;
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
 * The connection-tier table must ascend strictly (level-data delta): a later
 * tier with no more capacity than an earlier one is an upgrade that buys
 * nothing. The error names the tier, 1-based like the authoring.
 */
function checkGridTiers(level: Level): void {
  const tiers = level.power.tiers;
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.capacity <= tiers[i - 1]!.capacity) {
      throw new Error(
        `level ${level.id}: power tier ${i + 1} capacity ${tiers[i]!.capacity} is not greater than tier ${i} (${tiers[i - 1]!.capacity})`,
      );
    }
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
  checkGridTiers(level);

  const { width, height } = level.grid;
  const grid = new Grid(width, height);
  const { legend, map } = level.terrain;
  if (map.length !== height) {
    throw new Error(`level ${level.id}: terrain map has ${map.length} rows, grid height is ${height}`);
  }
  map.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(
        `level ${level.id}: terrain map row ${y} has ${row.length} tiles, grid width is ${width}`,
      );
    }
    for (let x = 0; x < width; x++) {
      const kind = legend[row[x]!];
      if (kind === undefined) {
        throw new Error(`level ${level.id}: terrain map row ${y} has unmapped character "${row[x]}"`);
      }
      grid.setTerrain(x, y, TERRAIN[kind]);
    }
  });

  const placed = (name: string, t: { x: number; y: number }): void => {
    if (t.x >= width || t.y >= height) {
      throw new Error(`level ${level.id}: ${name} (${t.x}, ${t.y}) is out of bounds`);
    }
    if (grid.terrainAt(t.x, t.y) !== TERRAIN.dirt) {
      throw new Error(`level ${level.id}: ${name} (${t.x}, ${t.y}) is not on dirt terrain`);
    }
  };
  placed('treasury', level.treasury);
  for (const s of level.spawns) placed(`spawn "${s.id}"`, s);

  const spawnIds = new Set(level.spawns.map((s) => s.id));
  if (spawnIds.size !== level.spawns.length) {
    throw new Error(`level ${level.id}: duplicate spawn ids`);
  }
  const activeFromByid = new Map(level.spawns.map((s) => [s.id, s.activeFromWave]));
  level.waves.forEach((wave, i) => {
    for (const g of wave.groups) {
      if (!spawnIds.has(g.spawn)) {
        throw new Error(`level ${level.id}: wave ${i + 1} references undeclared spawn "${g.spawn}"`);
      }
      if (!balance.enemies[g.type]) {
        throw new Error(`level ${level.id}: wave ${i + 1} references unknown enemy type "${g.type}"`);
      }
      if (activeFromByid.get(g.spawn)! > i + 1) {
        throw new Error(
          `level ${level.id}: wave ${i + 1} spawns at "${g.spawn}", which is dormant until wave ${activeFromByid.get(g.spawn)}`,
        );
      }
    }
  });

  // Reachability: every declared spawn must reach the treasury on starting
  // terrain — under the in-game routing rule that spawn tiles are endpoints,
  // not corridors (return-to-origin-spawn spec). The flow-field builder
  // doubles as the graph check (D8).
  const inbound = buildField(grid, [level.treasury], level.spawns);
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
    interestRatePpm: Math.round(level.economy.interestRatePerTick * 1_000_000),
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
    waveBonus: {
      baseMg: balance.waveBonus.baseGold * GOLD,
      graceTicks: balance.waveBonus.graceTicks,
      decayTicks: balance.waveBonus.decayTicks,
    },
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
          ratedPowerMp: Math.round(l.ratedPower * POWER),
        })),
        burstRadiusUnits: Math.round((t.burstRadiusTiles ?? 0) * TILE),
      };
    }),
    slowSpeedPer100: balance.towers.slow.slowSpeedPercent ?? 100,
    standbyPer1000: Math.round(balance.power.standbyFraction * 1000),
    panelCostMg: balance.power.panel.cost * GOLD,
    panelOutputMp: Math.round(balance.power.panel.output * POWER),
    gridTiers: level.power.tiers.map((t, i) => ({
      capacityMp: Math.round(t.capacity * POWER),
      // The first tier is the starting connection: never bought, never charged.
      costMg: i === 0 ? 0 : t.cost * GOLD,
    })),
    // Authored per unit per second → mg per 1000 mp (one unit) per tick.
    tariffMgPer1000: Math.round((level.power.tariff * GOLD) / TICK_HZ),
  };
}
