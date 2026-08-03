// See ARCHITECTURE.md §12 and the phase-4 level-data spec
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import level01Json from '../src/data/levels/level_01.json';
import level02Json from '../src/data/levels/level_02.json';
import { loadGameData } from '../src/data/schema';
import { TERRAIN } from '../src/sim/grid';

/** A minimal valid level to mutate per test. */
function baseLevel(): Record<string, unknown> {
  return {
    id: 'test',
    grid: { width: 10, height: 8 },
    treasury: { x: 8, y: 4 },
    spawns: [{ id: 'west', x: 0, y: 4, activeFromWave: 1 }],
    terrain: {
      legend: { '.': 'dirt', g: 'grass', r: 'rock', o: 'socket' },
      map: Array.from({ length: 8 }, () => '.'.repeat(10)),
    },
    economy: { startingTreasury: 200, interestRatePerTick: 0.0004 },
    waves: [
      { groups: [{ spawn: 'west', type: 'runner', count: 3, spawnInterval: 10, delay: 0 }] },
    ],
  };
}

function withMapRow(level: Record<string, unknown>, y: number, row: string): void {
  const terrain = level['terrain'] as { map: string[] };
  terrain.map[y] = row;
}

describe('level and balance schemas', () => {
  it('accepts the shipped level_01 + balance pair, with 10 waves and the palette', () => {
    const data = loadGameData(level01Json, balanceJson);
    expect(data.level.waves).toHaveLength(10);
    expect(data.grid.isBlocked(4, 0)).toBe(true); // wall A is rock
    expect(data.grid.terrainAt(4, 4)).toBe(TERRAIN.socket);
    expect(data.grid.isBlocked(4, 4)).toBe(true); // sockets are never navigable
    expect(data.grid.terrainAt(0, 0)).toBe(TERRAIN.grass);
    expect(data.grid.terrainAt(0, 5)).toBe(TERRAIN.dirt); // spawn tile
  });

  it('accepts the shipped level_02: two spawns, second dormant, brute in the back half', () => {
    const data = loadGameData(level02Json, balanceJson);
    expect(data.level.spawns).toHaveLength(2);
    const second = data.level.spawns.find((s) => s.activeFromWave > 1)!;
    expect(second).toBeDefined();
    expect(second.activeFromWave).toBeGreaterThan(1);
    expect(data.level.waves).toHaveLength(10);
    // The brute debuts in the back half (level-data spec).
    const bruteWaves = data.level.waves
      .map((w, i) => ({ i: i + 1, hasBrute: w.groups.some((g) => g.type === 'brute') }))
      .filter((w) => w.hasBrute);
    expect(bruteWaves.length).toBeGreaterThan(0);
    expect(Math.min(...bruteWaves.map((w) => w.i))).toBeGreaterThan(5);
    // Full palette including at least one socket.
    const kinds = new Set<number>();
    for (let y = 0; y < data.level.grid.height; y++) {
      for (let x = 0; x < data.level.grid.width; x++) kinds.add(data.grid.terrainAt(x, y));
    }
    expect(kinds).toEqual(new Set([TERRAIN.dirt, TERRAIN.grass, TERRAIN.rock, TERRAIN.socket]));
  });

  it('level_01 teaches in order: runners near 3, tank check near 5, swarm check near 7', () => {
    const data = loadGameData(level01Json, balanceJson);
    const firstWaveWith = (type: string): number =>
      data.level.waves.findIndex((w) => w.groups.some((g) => g.type === type)) + 1;
    expect(firstWaveWith('runner')).toBe(3);
    const tankCheck = data.level.waves[4]!; // wave 5
    expect(tankCheck.groups.some((g) => g.type === 'tank')).toBe(true);
    const swarmCheck = data.level.waves[6]!; // wave 7
    const swarmCount = swarmCheck.groups
      .filter((g) => g.type === 'swarm')
      .reduce((n, g) => n + g.count, 0);
    expect(swarmCount).toBeGreaterThanOrEqual(20);
    expect(data.level.waves.some((w) => w.groups.some((g) => g.type === 'brute'))).toBe(false);
  });

  it('rejects a map whose row count disagrees with the grid height', () => {
    const level = baseLevel();
    (level['terrain'] as { map: string[] }).map.pop();
    expect(() => loadGameData(level, balanceJson)).toThrow(/7 rows.*height is 8/);
  });

  it('rejects a short row, naming it', () => {
    const level = baseLevel();
    withMapRow(level, 3, '.'.repeat(9));
    expect(() => loadGameData(level, balanceJson)).toThrow(/row 3 has 9 tiles/);
  });

  it('rejects an unmapped character, naming it', () => {
    const level = baseLevel();
    withMapRow(level, 2, '....X.....');
    expect(() => loadGameData(level, balanceJson)).toThrow(/row 2.*unmapped character "X"/);
  });

  it('rejects a spawn or treasury off the dirt', () => {
    for (const kind of ['g', 'r', 'o']) {
      const spawnOff = baseLevel();
      withMapRow(spawnOff, 4, kind + '.'.repeat(9));
      expect(() => loadGameData(spawnOff, balanceJson)).toThrow(/spawn "west".*not on dirt/);

      const treasuryOff = baseLevel();
      withMapRow(treasuryOff, 4, '.'.repeat(8) + kind + '.');
      expect(() => loadGameData(treasuryOff, balanceJson)).toThrow(/treasury.*not on dirt/);
    }
  });

  it('rejects a waveless level — the debug timer no longer substitutes', () => {
    const level = baseLevel();
    level['waves'] = [];
    expect(() => loadGameData(level, balanceJson)).toThrow();
  });

  it('rejects a wave group referencing an undeclared spawn id', () => {
    const level = baseLevel();
    level['waves'] = [
      { groups: [{ spawn: 'east', type: 'runner', count: 3, spawnInterval: 10, delay: 0 }] },
    ];
    expect(() => loadGameData(level, balanceJson)).toThrow(/undeclared spawn "east"/);
  });

  it('rejects a wave group referencing an unknown enemy type', () => {
    const level = baseLevel();
    level['waves'] = [
      { groups: [{ spawn: 'west', type: 'dragon', count: 3, spawnInterval: 10, delay: 0 }] },
    ];
    expect(() => loadGameData(level, balanceJson)).toThrow(/unknown enemy type "dragon"/);
  });

  it('rejects a group at a spawn still dormant in its wave', () => {
    const level = baseLevel();
    level['spawns'] = [
      { id: 'west', x: 0, y: 4, activeFromWave: 1 },
      { id: 'north', x: 4, y: 0, activeFromWave: 5 },
    ];
    level['waves'] = [
      { groups: [{ spawn: 'west', type: 'runner', count: 1, spawnInterval: 1, delay: 0 }] },
      { groups: [{ spawn: 'north', type: 'runner', count: 1, spawnInterval: 1, delay: 0 }] },
    ];
    expect(() => loadGameData(level, balanceJson)).toThrow(/wave 2.*"north".*dormant until wave 5/);
  });

  it('rejects an out-of-bounds treasury or spawn', () => {
    const outOfBounds = baseLevel();
    outOfBounds['treasury'] = { x: 10, y: 4 };
    expect(() => loadGameData(outOfBounds, balanceJson)).toThrow(/treasury.*out of bounds/);
  });

  it('rejects a sealed level (spawn cannot reach the treasury)', () => {
    const sealed = baseLevel();
    for (let y = 0; y < 8; y++) {
      withMapRow(sealed, y, '.'.repeat(5) + 'r' + '.'.repeat(4));
    }
    expect(() => loadGameData(sealed, balanceJson)).toThrow(/cannot reach the treasury/);
  });

  it('converts float rates and gold to integers at load', () => {
    const data = loadGameData(baseLevel(), balanceJson);
    expect(data.startingTreasuryMg).toBe(200_000);
    expect(data.interestRatePpm).toBe(400);
    expect(Number.isInteger(data.interestRatePpm)).toBe(true);
    for (const t of data.enemyTypes) expect(Number.isInteger(t.speed)).toBe(true);
  });

  it('assigns enemy typeIds in sorted key order, independent of authoring order', () => {
    const level = baseLevel();
    level['waves'] = [
      { groups: [{ spawn: 'west', type: 'tank', count: 1, spawnInterval: 1, delay: 0 }] },
    ];
    const data = loadGameData(level, {
      ...(balanceJson as Record<string, unknown>),
      enemies: {
        tank: { hp: 1, speed: 1, carryCapacity: 0, bounty: 0, slowImmune: false },
        runner: { hp: 1, speed: 128, carryCapacity: 0, bounty: 0, slowImmune: false },
      },
    });
    expect(data.enemyTypes.map((t) => t.key)).toEqual(['runner', 'tank']);
  });

  it('converts build and tower blocks to integers at load', () => {
    const data = loadGameData(baseLevel(), balanceJson);
    expect(data.wallCostMg).toBe(20_000);
    expect(data.refundPer1000).toBe(500);
    // Canonical archetype order pins archetypeId assignment.
    expect(data.towers.map((t) => t.archetype)).toEqual(['rapid', 'sniper', 'area', 'slow']);
    for (const tower of data.towers) {
      expect(tower.levels).toHaveLength(3);
      for (const level of tower.levels) {
        expect(level.costMg % 1000).toBe(0);
        for (const v of [level.costMg, level.damage, level.rangeUnits, level.fireIntervalTicks, level.slowDurationTicks]) {
          expect(Number.isInteger(v)).toBe(true);
        }
      }
      expect(Number.isInteger(tower.burstRadiusUnits)).toBe(true);
    }
    // The rapid baseline: 2.5 tiles × 1024 units.
    expect(data.towers[0]!.levels[0]!.rangeUnits).toBe(2560);
    expect(Number.isInteger(data.slowSpeedPer100)).toBe(true);
    // Tuned values stay in balance.json; only the ×1000 gold scaling is pinned.
    const runner = data.enemyTypes.find((t) => t.key === 'runner')!;
    expect(runner.carryMg).toBe((balanceJson.enemies.runner.carryCapacity as number) * 1000);
    expect(runner.bountyMg).toBe((balanceJson.enemies.runner.bounty as number) * 1000);
    expect(runner.hp).toBeGreaterThan(0);
    expect(runner.slowImmune).toBe(false);
    expect(data.enemyTypes.find((t) => t.key === 'brute')!.slowImmune).toBe(true);
  });

  it('rejects level tables that scale a non-axis stat', () => {
    const bad = JSON.parse(JSON.stringify(balanceJson)) as {
      towers: { rapid: { levels: { rangeTiles: number }[] } };
    };
    bad.towers.rapid.levels[2]!.rangeTiles = 4.5; // rapid never gains range (D2)
    expect(() => loadGameData(baseLevel(), bad)).toThrow(/rapid\.rangeTiles/);
  });
});
