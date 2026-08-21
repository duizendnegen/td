// Shared fixtures for the sim tests: tiny inline levels, a controllable
// balance file, direct enemy injection, and command shorthands.
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData, type GameData, type TowerArchetype } from '../src/data/schema';
import type { Command } from '../src/sim/commands';
import { tileCentre } from '../src/sim/fixed';
import { Sim } from '../src/sim/sim';
import type { Enemy, EnemyMode, StructureKind } from '../src/sim/types';

/** Char-map rows for a grid where `blocked` tiles are rock and the rest dirt. */
export function terrainRows(
  width: number,
  height: number,
  blocked: { x: number; y: number }[] = [],
): string[] {
  const rows: string[][] = Array.from({ length: height }, () => Array(width).fill('.'));
  for (const t of blocked) rows[t.y]![t.x] = 'r';
  return rows.map((r) => r.join(''));
}

/** The full four-kind legend, shared by every test level. */
export const LEGEND = { '.': 'dirt', g: 'grass', r: 'rock', o: 'socket' };

/** One-runner wave so a fixture passes the waves-required validation. */
export function trivialWave(spawn = 'main'): Record<string, unknown> {
  return { groups: [{ spawn, type: 'runner', count: 1, spawnInterval: 1, delay: 0 }] };
}

/** A level power block: connection tiers plus the flat tariff. */
export interface LevelPower {
  tiers: { capacity: number; cost: number }[];
  tariff: number;
}

/**
 * The inert grid: one connection tier of effectively unlimited capacity at a
 * zero tariff, so coverage is always full and nothing is ever billed. The
 * default for every fixture that is not about power, so pre-existing
 * arithmetic (treasury balances, fire cadence) holds verbatim. A zero tariff
 * is a free grid — the treasury bound does not apply (power.ts).
 */
export const INERT_POWER: LevelPower = { tiers: [{ capacity: 1_000_000, cost: 0 }], tariff: 0 };

export interface OpenLevelOptions {
  /** Terrain rows override; defaults to all-dirt plus `blocked` as rock. */
  map?: string[];
  /** Waves override; defaults to a single one-runner wave. */
  waves?: Record<string, unknown>[];
  economy?: { startingTreasury: number; interestRatePerTick: number };
  /** Grid connection override; defaults to INERT_POWER. */
  power?: LevelPower;
}

/** An empty rectangular level with one spawn and (by default) all-dirt terrain. */
export function openLevel(
  width: number,
  height: number,
  spawn: { x: number; y: number },
  treasury: { x: number; y: number },
  blocked: { x: number; y: number }[] = [],
  options: OpenLevelOptions = {},
): Record<string, unknown> {
  return {
    id: 'test',
    grid: { width, height },
    treasury,
    spawns: [{ id: 'main', ...spawn, activeFromWave: 1 }],
    terrain: { legend: LEGEND, map: options.map ?? terrainRows(width, height, blocked) },
    economy: options.economy ?? { startingTreasury: 200, interestRatePerTick: 0 },
    power: options.power ?? INERT_POWER,
    waves: options.waves ?? [trivialWave()],
  };
}

export interface RunnerOverrides {
  hp?: number;
  speed?: number;
  carryCapacity?: number;
  bounty?: number;
}

/** The balance power block: standby share and the panel. */
export interface BalancePower {
  standbyFraction: number;
  panel: { cost: number; output: number };
}

/**
 * Test-balance power defaults: a 10% standby, and a 40g panel putting out 2
 * units (2000 mp) — two level-1 rapids' worth. Ratings sit on the tower rows
 * (rapid 1/1.3/1.6, sniper 1.5/1.9/2.3, area 1.2/1.5/1.8, slow 0.8/1/1.2).
 */
export const TEST_POWER: BalancePower = { standbyFraction: 0.1, panel: { cost: 40, output: 2 } };

/**
 * Balance with all four archetypes and a 'runner' type (typeId 0 while it is
 * the only — alphabetically first — key); speed 0 by default parks all
 * spawns. Extra enemy types merge in for the multi-type targeting tests;
 * mind the canonical (sorted-key) typeId order when injecting.
 */
export function testBalance(
  runner: RunnerOverrides = {},
  extraEnemies: Record<string, unknown> = {},
  waveBonus: { baseGold: number; graceTicks: number; decayTicks: number } = {
    // Zero bonus by default so pre-existing settlement arithmetic still holds.
    baseGold: 0,
    graceTicks: 0,
    decayTicks: 1,
  },
  power: BalancePower = TEST_POWER,
): Record<string, unknown> {
  return {
    build: { wallCost: 4, removalRefundFraction: 0.5 },
    waveBonus,
    towers: {
      rapid: {
        levels: [
          { cost: 50, damage: 8, rangeTiles: 3.5, fireIntervalTicks: 5, ratedPower: 1 },
          { cost: 85, damage: 11, rangeTiles: 3.5, fireIntervalTicks: 4, ratedPower: 1.3 },
          { cost: 145, damage: 15, rangeTiles: 3.5, fireIntervalTicks: 3, ratedPower: 1.6 },
        ],
      },
      sniper: {
        levels: [
          { cost: 70, damage: 40, rangeTiles: 5, fireIntervalTicks: 20, ratedPower: 1.5 },
          { cost: 120, damage: 52, rangeTiles: 5.5, fireIntervalTicks: 20, ratedPower: 1.9 },
          { cost: 205, damage: 68, rangeTiles: 6, fireIntervalTicks: 20, ratedPower: 2.3 },
        ],
      },
      area: {
        burstRadiusTiles: 1.2,
        levels: [
          { cost: 80, damage: 12, rangeTiles: 3.5, fireIntervalTicks: 15, ratedPower: 1.2 },
          { cost: 135, damage: 16, rangeTiles: 4, fireIntervalTicks: 15, ratedPower: 1.5 },
          { cost: 230, damage: 21, rangeTiles: 4.5, fireIntervalTicks: 15, ratedPower: 1.8 },
        ],
      },
      slow: {
        // 55 (not 50): the pinned carrier-then-slow order rounds differently
        // from the reverse at 55%, so the composition tests can tell them apart.
        slowSpeedPercent: 55,
        levels: [
          { cost: 60, damage: 0, rangeTiles: 3.5, fireIntervalTicks: 10, slowDurationTicks: 30, ratedPower: 0.8 },
          { cost: 100, damage: 0, rangeTiles: 4, fireIntervalTicks: 10, slowDurationTicks: 45, ratedPower: 1 },
          { cost: 170, damage: 0, rangeTiles: 4.5, fireIntervalTicks: 10, slowDurationTicks: 60, ratedPower: 1.2 },
        ],
      },
    },
    power,
    enemies: {
      runner: {
        hp: runner.hp ?? 130,
        speed: runner.speed ?? 0,
        carryCapacity: runner.carryCapacity ?? 25,
        bounty: runner.bounty ?? 6,
        slowImmune: false,
      },
      ...extraEnemies,
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
  typeId?: number;
  mode?: EnemyMode;
  speed?: number;
  hp?: number;
  carriedMg?: number;
  /** Declared-spawn index the enemy counts as entered from; defaults to 0. */
  originSpawn?: number;
}

/** Hand-place an enemy at a tile centre; speed 0 keeps it parked there. */
export function injectEnemy(sim: Sim, tx: number, ty: number, opts: InjectOptions = {}): Enemy {
  const x = tileCentre(tx);
  const y = tileCentre(ty);
  const enemy: Enemy = {
    id: sim.state.nextEnemyId++,
    typeId: opts.typeId ?? 0,
    originSpawn: opts.originSpawn ?? 0,
    pos: { x, y },
    prevPos: { x, y },
    waypoint: { x, y },
    speed: opts.speed ?? 0,
    mode: opts.mode ?? 'inbound',
    hp: opts.hp ?? 130,
    carriedMg: opts.carriedMg ?? 0,
    slowUntil: 0,
    alive: true,
  };
  sim.state.enemies.push(enemy);
  return enemy;
}

let seq = 0;

export function place(
  structure: StructureKind,
  tx: number,
  ty: number,
  archetype: TowerArchetype = 'rapid',
): Command {
  return { kind: 'place', structure, archetype, tx, ty, seq: seq++ };
}

/**
 * A wall and a tower on it, as two place commands (build-over-walls design
 * D8): both are `place`, so ascending `seq` applies the wall first in the
 * same tick and the tower finds its foundation standing. The way every
 * scripted tower on dirt is built now that a tower needs a wall beneath it.
 */
export function mount(tx: number, ty: number, archetype: TowerArchetype = 'rapid'): Command[] {
  return [place('wall', tx, ty), place('tower', tx, ty, archetype)];
}

/**
 * A tower that brings its own wall — one place command with `withWall`
 * (build-over-walls design D6): the tower tool's click on bare dirt.
 */
export function placeWithWall(tx: number, ty: number, archetype: TowerArchetype = 'rapid'): Command {
  return { kind: 'place', structure: 'tower', archetype, tx, ty, withWall: true, seq: seq++ };
}

export function upgrade(tx: number, ty: number): Command {
  return { kind: 'upgrade', tx, ty, seq: seq++ };
}

export function upgradeGrid(): Command {
  return { kind: 'upgradeGrid', seq: seq++ };
}

export function move(tx: number, ty: number, toTx: number, toTy: number): Command {
  return { kind: 'move', tx, ty, toTx, toTy, seq: seq++ };
}

export function remove(tx: number, ty: number): Command {
  return { kind: 'remove', tx, ty, seq: seq++ };
}

export function spawnCmd(type: string, spawn = 0): Command {
  return { kind: 'spawn', type, spawn, seq: seq++ };
}

export function startWave(): Command {
  return { kind: 'startWave', seq: seq++ };
}

export function concede(): Command {
  return { kind: 'concede', seq: seq++ };
}

// ── The level_01 scripted driver (energy-infrastructure harness) ─────────

/** What `powerRun` hands its observer after every tick. */
export interface ScriptedTick {
  sim: Sim;
  /** The commands this tick absorbed — the script's plus any auto-issued startWave. */
  commands: readonly Command[];
  /** The balance before the tick advanced. */
  treasuryBefore: number;
}

/** The seed every level_01 harness and golden run shares. */
export const HARNESS_SEED = 0xc0ffee;

/**
 * Drive the shipped level_01 (shipped balance, HARNESS_SEED) for `waves`
 * waves: the script's commands at their ticks, each wave started 50 ticks
 * after the previous settlement (the first at tick 100), and `onTick` called
 * after every advance — the leak harness summarises power per wave from it,
 * the ledger tests assert the two identities on every tick. Stops once the
 * last wave has settled, or the run has ended, or at a 20 000-tick guard.
 */
export function powerRun(
  build: ReadonlyMap<number, Command[]>,
  waves: number,
  onTick: (step: ScriptedTick) => void = () => {},
): { sim: Sim; data: GameData } {
  const data = loadGameData(levelJson, balanceJson);
  const sim = new Sim(data, HARNESS_SEED);
  let seq = 1000;
  let settledAt = -1;
  let settled = 0;
  const startedWaves = new Set<number>();
  for (let guard = 0; guard < 20_000 && settled < waves; guard++) {
    const s = sim.state;
    if (s.runPhase === 'won' || s.runPhase === 'lost') break;
    const t = s.tick;
    const commands: Command[] = [...(build.get(t) ?? [])];
    const nextWave = s.waveIndex + 1;
    const startAt = settledAt < 0 ? 100 : settledAt + 50;
    if (s.runPhase === 'build' && t >= startAt && !startedWaves.has(nextWave) && nextWave <= waves) {
      commands.push({ kind: 'startWave', seq: seq++ });
      startedWaves.add(nextWave);
    }
    const treasuryBefore = s.treasuryMg;
    const inWave = s.runPhase === 'wave' || startedWaves.has(nextWave);
    sim.tick(commands);
    if (inWave && s.runPhase !== 'wave') {
      settledAt = t;
      settled++;
    }
    onTick({ sim, commands, treasuryBefore });
  }
  return { sim, data };
}
