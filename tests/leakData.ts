// Versioned test data for the leak-rate harness (phase-3 design D9).
//
// The counter-matrix contract as executable checks: authored defense layouts
// at (near-)equal spend versus authored bursts, with directional thresholds.
// Layouts, bursts, and thresholds live HERE, with the tuning sessions — a
// rebalance that breaks the contract breaks these tests, visibly. The
// DIRECTION of each assertion is the contract; the numbers move with tuning.

import type { TowerArchetype } from '../src/data/schema';
import type { BurstGroup } from '../src/app/presets';

export interface LayoutItem {
  build: TowerArchetype | 'wall';
  tx: number;
  ty: number;
}

export interface LeakScenario {
  name: string;
  /** The enemy type this scenario's burst pressures the defense with. */
  burst: BurstGroup[];
  /** Defense missing the counter archetype. */
  mono: LayoutItem[];
  /** Same spend including the counter archetype (walls pad spend parity). */
  counter: LayoutItem[];
  /** The mono defense must leak MORE than this (milli-gold). */
  monoMinLeakMg: number;
  /** The countered defense must leak LESS than this (milli-gold). */
  counterMaxLeakMg: number;
}

/**
 * The harness board: an open 40×7 corridor, spawn west, treasury east —
 * doubled with the scale-world-experiment board so exposure times match the
 * real game's geometry. Towers flank the centre row; no wave is ever
 * started, so the authored burst's spawn commands are the only pressure.
 */
export function corridorLevel(): Record<string, unknown> {
  return {
    id: 'leak-harness',
    grid: { width: 40, height: 7 },
    treasury: { x: 39, y: 3 },
    spawns: [{ id: 'west', x: 0, y: 3, activeFromWave: 1 }],
    terrain: {
      legend: { '.': 'dirt' },
      map: Array.from({ length: 7 }, () => '.'.repeat(40)),
    },
    // Ample treasury: every thief that arrives leaves with full capacity, so
    // leak numbers measure the defense, not treasury exhaustion.
    economy: { startingTreasury: 10_000, interestRatePerTick: 0 },
    // Never started; present only to satisfy the waves-required validation.
    waves: [{ groups: [{ spawn: 'west', type: 'runner', count: 1, spawnInterval: 1, delay: 0 }] }],
  };
}

/**
 * Spend-parity padding: walls on the border rows, off the centre lane the
 * enemies walk. They equalise treasury spend without touching the maze —
 * walls are inert, so tower coverage of these tiles is irrelevant.
 */
function padding(count: number): LayoutItem[] {
  const walls: LayoutItem[] = [];
  for (let i = 0; i < count; i++) {
    // Three border bands of ten: (10..19, 0), (10..19, 6), (0..9, 0).
    const band = Math.floor(i / 10);
    walls.push({ build: 'wall', tx: band === 2 ? i - 20 : 10 + (i % 10), ty: band === 1 ? 6 : 0 });
  }
  return walls;
}

/** Six rapids flanking the lane — the mono-archetype baseline, 300g. */
const MONO_RAPID: LayoutItem[] = [
  { build: 'rapid', tx: 8, ty: 2 },
  { build: 'rapid', tx: 13, ty: 4 },
  { build: 'rapid', tx: 18, ty: 2 },
  { build: 'rapid', tx: 23, ty: 4 },
  { build: 'rapid', tx: 28, ty: 2 },
  { build: 'rapid', tx: 33, ty: 4 },
];

// Scale-world-experiment re-derivation: the corridor doubled to 40, spends
// grew to ~300g (hp ×5 with damage-per-encounter ×0.6 needs more towers),
// and wall 5g re-solves every spend-parity equation. The directions are
// unchanged — they ARE the contract.
export const SCENARIOS: LeakScenario[] = [
  {
    // Runners punish the missing slow: each one crosses a window too fast
    // for focus fire to finish. The burst is sparse on purpose — the runner
    // pressure is per-enemy exposure, not train throughput.
    name: 'runner burst vs rapid-only → slow closes the leak',
    burst: [{ type: 'runner', count: 3, spawnInterval: 250 }],
    // 6 rapid + 20 padding walls = 360g at wall 3: same rapids as the counter
    // side, so the slow tower versus dead walls IS the experiment.
    mono: [...MONO_RAPID, ...padding(20)],
    counter: [
      // 6 rapid clustered inside the slow zone + 1 slow = 360g.
      { build: 'rapid', tx: 17, ty: 2 },
      { build: 'rapid', tx: 19, ty: 4 },
      { build: 'slow', tx: 20, ty: 4 },
      { build: 'rapid', tx: 21, ty: 2 },
      { build: 'rapid', tx: 23, ty: 4 },
      { build: 'rapid', tx: 25, ty: 2 },
      { build: 'rapid', tx: 27, ty: 4 },
    ],
    // Tuned 2026-08 (scale-world-experiment, final values): observed 75k vs 0.
    monoMinLeakMg: 60_000,
    counterMaxLeakMg: 40_000,
  },
  {
    // Swarms punish the missing area: single-target rate can't clear a clump.
    name: 'swarm burst vs rapid-only → area closes the leak',
    burst: [{ type: 'swarm', count: 50, spawnInterval: 2 }],
    // 6 rapid + 7 padding walls = 321g at wall 3.
    mono: [...MONO_RAPID, ...padding(7)],
    counter: [
      // 4 area = 320g.
      { build: 'area', tx: 14, ty: 2 },
      { build: 'area', tx: 18, ty: 4 },
      { build: 'area', tx: 22, ty: 2 },
      { build: 'area', tx: 26, ty: 4 },
    ],
    // Tuned 2026-08 (scale-world-experiment, final values): observed 232k vs 0.
    monoMinLeakMg: 100_000,
    counterMaxLeakMg: 40_000,
  },
  {
    // Tanks punish the missing sniper: rapid chip damage never breaks tank hp.
    name: 'tank burst vs rapid-only → sniper closes the leak',
    burst: [{ type: 'tank', count: 3, spawnInterval: 30 }],
    // 6 rapid + 4 padding walls = 312g at wall 3.
    mono: [...MONO_RAPID, ...padding(4)],
    counter: [
      // 3 sniper + 2 rapid = 310g.
      { build: 'sniper', tx: 17, ty: 2 },
      { build: 'sniper', tx: 21, ty: 4 },
      { build: 'sniper', tx: 25, ty: 2 },
      { build: 'rapid', tx: 19, ty: 4 },
      { build: 'rapid', tx: 23, ty: 4 },
    ],
    // Tuned 2026-08 (scale-world-experiment, final values): observed 120k
    // (1 kill) vs 0 (all 3) at the calibrated hp ×2.
    monoMinLeakMg: 80_000,
    counterMaxLeakMg: 40_000,
  },
];
