// See ARCHITECTURE.md §12
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';

/** A minimal valid level to mutate per test. */
function baseLevel(): Record<string, unknown> {
  return {
    id: 'test',
    grid: { width: 10, height: 8 },
    treasury: { x: 8, y: 4 },
    spawns: [{ id: 'west', x: 0, y: 4, activeFromWave: 1 }],
    terrain: { blocked: [], prebuilt: [] },
    economy: { startingTreasury: 200, interestRatePerTick: 0.0004 },
    waves: [],
  };
}

describe('level and balance schemas', () => {
  it('accepts the shipped level_01 + balance pair, with waves: []', () => {
    const data = loadGameData(levelJson, balanceJson);
    expect(data.level.waves).toEqual([]);
    expect(data.grid.isBlocked(5, 0)).toBe(true);
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

  it('rejects out-of-bounds or blocked treasury and spawns', () => {
    const outOfBounds = baseLevel();
    outOfBounds['treasury'] = { x: 10, y: 4 };
    expect(() => loadGameData(outOfBounds, balanceJson)).toThrow(/treasury.*out of bounds/);

    const blockedSpawn = baseLevel();
    blockedSpawn['terrain'] = { blocked: [{ x: 0, y: 4 }], prebuilt: [] };
    expect(() => loadGameData(blockedSpawn, balanceJson)).toThrow(/spawn "west".*blocked/);
  });

  it('rejects a sealed level (spawn cannot reach the treasury)', () => {
    const sealed = baseLevel();
    // A full-height wall at x = 5.
    sealed['terrain'] = {
      blocked: Array.from({ length: 8 }, (_, y) => ({ x: 5, y })),
      prebuilt: [],
    };
    expect(() => loadGameData(sealed, balanceJson)).toThrow(/cannot reach the treasury/);
  });

  it('converts float rates and gold to integers at load', () => {
    const data = loadGameData(baseLevel(), balanceJson);
    expect(data.startingTreasuryMg).toBe(200_000);
    expect(data.interestRatePer10k).toBe(4);
    expect(Number.isInteger(data.interestRatePer10k)).toBe(true);
    for (const t of data.enemyTypes) expect(Number.isInteger(t.speed)).toBe(true);
  });

  it('assigns enemy typeIds in sorted key order, independent of authoring order', () => {
    const data = loadGameData(baseLevel(), {
      build: { wallCost: 4, removalRefundFraction: 0.5 },
      towers: { rapid: { cost: 50, damage: 8, rangeTiles: 3.5, fireIntervalTicks: 5 } },
      enemies: {
        tank: { hp: 0, speed: 1, carryCapacity: 0, bounty: 0, slowImmune: false },
        runner: { hp: 0, speed: 128, carryCapacity: 0, bounty: 0, slowImmune: false },
      },
    });
    expect(data.enemyTypes.map((t) => t.key)).toEqual(['runner', 'tank']);
  });

  it('converts phase-2 build and tower blocks to integers at load', () => {
    const data = loadGameData(baseLevel(), balanceJson);
    expect(data.wallCostMg).toBe(4000);
    expect(data.refundPer1000).toBe(500);
    expect(data.rapidTower.costMg).toBe(50_000);
    expect(data.rapidTower.rangeUnits).toBe(3584); // 3.5 tiles × 1024
    expect(Number.isInteger(data.rapidTower.rangeUnits)).toBe(true);
    // Tuned values stay in balance.json; only the ×1000 gold scaling is pinned.
    const runner = data.enemyTypes.find((t) => t.key === 'runner')!;
    expect(runner.carryMg).toBe((balanceJson.enemies.runner.carryCapacity as number) * 1000);
    expect(runner.bountyMg).toBe((balanceJson.enemies.runner.bounty as number) * 1000);
    expect(runner.hp).toBeGreaterThan(0);
  });
});
