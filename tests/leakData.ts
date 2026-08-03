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
 * The harness board: an open 20×7 corridor, spawn west, treasury east.
 * Towers flank the centre row; no wave is ever started, so the authored
 * burst's spawn commands are the only pressure.
 */
export function corridorLevel(): Record<string, unknown> {
  return {
    id: 'leak-harness',
    grid: { width: 20, height: 7 },
    treasury: { x: 19, y: 3 },
    spawns: [{ id: 'west', x: 0, y: 3, activeFromWave: 1 }],
    terrain: {
      legend: { '.': 'dirt' },
      map: Array.from({ length: 7 }, () => '.'.repeat(20)),
    },
    // Ample treasury: every thief that arrives leaves with full capacity, so
    // leak numbers measure the defense, not treasury exhaustion.
    economy: { startingTreasury: 10_000, interestRatePerTick: 0 },
    // Never started; present only to satisfy the waves-required validation.
    waves: [{ groups: [{ spawn: 'west', type: 'runner', count: 1, spawnInterval: 1, delay: 0 }] }],
  };
}

/**
 * Spend-parity padding: walls in the far corner, away from the corridor and
 * every tower range. They equalise treasury spend without touching the maze.
 */
function padding(count: number): LayoutItem[] {
  const walls: LayoutItem[] = [];
  for (let i = 0; i < count; i++) {
    walls.push({ build: 'wall', tx: 15 + (i % 5), ty: i < 5 ? 0 : 6 });
  }
  return walls;
}

/** Four rapids flanking the lane — the mono-archetype baseline, 200g. */
const MONO_RAPID: LayoutItem[] = [
  { build: 'rapid', tx: 5, ty: 2 },
  { build: 'rapid', tx: 8, ty: 4 },
  { build: 'rapid', tx: 11, ty: 2 },
  { build: 'rapid', tx: 14, ty: 4 },
];

// Balance-ux-tweaks re-derivation: wall 20g and slow 60g re-solve every
// spend-parity equation. Each scenario's mono/counter pair is re-balanced to
// EXACT parity at the new prices; the directions are unchanged.
export const SCENARIOS: LeakScenario[] = [
  {
    // Runners punish the missing slow: each one crosses a window too fast
    // for focus fire to finish. The burst is sparse on purpose — the runner
    // pressure is per-enemy exposure, not train throughput.
    name: 'runner burst vs rapid-only → slow closes the leak',
    burst: [{ type: 'runner', count: 3, spawnInterval: 250 }],
    // 4 rapid + 3 padding walls = 260g: same rapids as the counter side, so
    // the slow tower versus dead walls IS the experiment.
    mono: [...MONO_RAPID, ...padding(3)],
    counter: [
      // 4 rapid clustered inside the slow zone + 1 slow = 260g.
      { build: 'rapid', tx: 8, ty: 2 },
      { build: 'rapid', tx: 9, ty: 2 },
      { build: 'slow', tx: 9, ty: 4 },
      { build: 'rapid', tx: 10, ty: 2 },
      { build: 'rapid', tx: 10, ty: 4 },
    ],
    // Tuned 2026-08 (balance-ux-tweaks): observed 75k vs 0.
    monoMinLeakMg: 60_000,
    counterMaxLeakMg: 40_000,
  },
  {
    // Swarms punish the missing area: single-target rate can't clear a clump.
    name: 'swarm burst vs rapid-only → area closes the leak',
    burst: [{ type: 'swarm', count: 50, spawnInterval: 2 }],
    mono: MONO_RAPID, // 200g
    counter: [
      // 2 area + 2 padding walls = 200g at the new wall price.
      { build: 'area', tx: 8, ty: 2 },
      { build: 'area', tx: 10, ty: 4 },
      ...padding(2),
    ],
    // Tuned 2026-08 (balance-ux-tweaks): observed 208k vs 0 — even at the
    // nerfed L1 damage (3-shots a swarm), two areas still hold the corridor.
    monoMinLeakMg: 100_000,
    counterMaxLeakMg: 40_000,
  },
  {
    // Tanks punish the missing sniper: rapid chip damage never breaks tank hp.
    name: 'tank burst vs rapid-only → sniper closes the leak',
    burst: [{ type: 'tank', count: 3, spawnInterval: 30 }],
    // 4 rapid + 2 padding walls = 240g.
    mono: [...MONO_RAPID, ...padding(2)],
    counter: [
      // 2 sniper + 2 rapid = 240g.
      { build: 'sniper', tx: 8, ty: 2 },
      { build: 'sniper', tx: 11, ty: 4 },
      { build: 'rapid', tx: 9, ty: 4 },
      { build: 'rapid', tx: 12, ty: 2 },
    ],
    // Tuned 2026-08 (balance-ux-tweaks): observed 120k vs 0.
    monoMinLeakMg: 80_000,
    counterMaxLeakMg: 40_000,
  },
];
