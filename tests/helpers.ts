// Shared fixtures for the phase-2 sim tests: tiny inline levels, a
// controllable balance file, direct enemy injection, and command shorthands.
import { loadGameData, type GameData } from '../src/data/schema';
import type { Command } from '../src/sim/commands';
import { tileCentre } from '../src/sim/fixed';
import { Sim } from '../src/sim/sim';
import type { Enemy, EnemyMode, StructureKind } from '../src/sim/types';

/** An empty rectangular level with one spawn and no terrain. */
export function openLevel(
  width: number,
  height: number,
  spawn: { x: number; y: number },
  treasury: { x: number; y: number },
  blocked: { x: number; y: number }[] = [],
): Record<string, unknown> {
  return {
    id: 'test',
    grid: { width, height },
    treasury,
    spawns: [{ id: 'main', ...spawn, activeFromWave: 1 }],
    terrain: { blocked, prebuilt: [] },
    economy: { startingTreasury: 200, interestRatePerTick: 0 },
    waves: [],
  };
}

export interface RunnerOverrides {
  hp?: number;
  speed?: number;
  carryCapacity?: number;
  bounty?: number;
}

/** Balance with a single 'runner' type; speed 0 by default parks all spawns. */
export function testBalance(runner: RunnerOverrides = {}): Record<string, unknown> {
  return {
    build: { wallCost: 4, removalRefundFraction: 0.5 },
    towers: { rapid: { cost: 50, damage: 8, rangeTiles: 3.5, fireIntervalTicks: 5 } },
    enemies: {
      runner: {
        hp: runner.hp ?? 130,
        speed: runner.speed ?? 0,
        carryCapacity: runner.carryCapacity ?? 25,
        bounty: runner.bounty ?? 6,
        slowImmune: false,
      },
    },
  };
}

export function makeSim(
  level: Record<string, unknown>,
  balance: Record<string, unknown> = testBalance(),
  seed = 42,
): { sim: Sim; data: GameData } {
  const data = loadGameData(level, balance);
  return { sim: new Sim(data, seed), data };
}

export interface InjectOptions {
  mode?: EnemyMode;
  speed?: number;
  hp?: number;
  carriedMg?: number;
}

/** Hand-place an enemy at a tile centre; speed 0 keeps it parked there. */
export function injectEnemy(sim: Sim, tx: number, ty: number, opts: InjectOptions = {}): Enemy {
  const x = tileCentre(tx);
  const y = tileCentre(ty);
  const enemy: Enemy = {
    id: sim.state.nextEnemyId++,
    typeId: 0,
    pos: { x, y },
    prevPos: { x, y },
    waypoint: { x, y },
    speed: opts.speed ?? 0,
    mode: opts.mode ?? 'inbound',
    hp: opts.hp ?? 130,
    carriedMg: opts.carriedMg ?? 0,
    alive: true,
  };
  sim.state.enemies.push(enemy);
  return enemy;
}

let seq = 0;

export function place(structure: StructureKind, tx: number, ty: number): Command {
  return { kind: 'place', structure, tx, ty, seq: seq++ };
}

export function remove(tx: number, ty: number): Command {
  return { kind: 'remove', tx, ty, seq: seq++ };
}
