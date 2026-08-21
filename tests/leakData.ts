// Versioned test data for the leak-rate harness (phase-3 design D9).
//
// The counter-matrix contract as executable checks: authored defense layouts
// at (near-)equal spend versus authored bursts, with directional thresholds.
// Layouts, bursts, and thresholds live HERE, with the tuning sessions — a
// rebalance that breaks the contract breaks these tests, visibly. The
// DIRECTION of each assertion is the contract; the numbers move with tuning.

import type { TowerArchetype } from '../src/data/schema';
import type { BurstGroup } from '../src/app/presets';
import type { Command, CommandBody } from '../src/sim/commands';
import { INERT_POWER } from './helpers';

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
    power: INERT_POWER,
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

/** Four rapids flanking the lane — the mono-archetype baseline, 280g mounted. */
const MONO_RAPID: LayoutItem[] = [
  { build: 'rapid', tx: 5, ty: 2 },
  { build: 'rapid', tx: 8, ty: 4 },
  { build: 'rapid', tx: 11, ty: 2 },
  { build: 'rapid', tx: 14, ty: 4 },
];

// Balance-ux-tweaks re-derivation: wall 20g and slow 60g re-solve every
// spend-parity equation. Each scenario's mono/counter pair is re-balanced to
// EXACT parity at the new prices; the directions are unchanged.
// Build-over-walls re-derivation: every tower item now stands on a wall, so a
// tower costs its price + 20g and every parity equation gained 20g per tower
// on each side. The geometry is untouched — a tower's tile was already
// blocked — so only the padding counts moved: the runner scenario's mono
// side gained one wall (5 towers vs 4), the swarm scenario's counter side two
// (2 towers vs 4). The directions are unchanged.
export const SCENARIOS: LeakScenario[] = [
  {
    // Runners punish the missing slow: each one crosses a window too fast
    // for focus fire to finish. The burst is sparse on purpose — the runner
    // pressure is per-enemy exposure, not train throughput.
    name: 'runner burst vs rapid-only → slow closes the leak',
    burst: [{ type: 'runner', count: 3, spawnInterval: 250 }],
    // 4 mounted rapid (280g) + 4 padding walls = 360g: same rapids as the
    // counter side, so the slow tower versus dead walls IS the experiment.
    mono: [...MONO_RAPID, ...padding(4)],
    counter: [
      // 4 mounted rapid clustered inside the slow zone + 1 mounted slow = 360g.
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
    mono: MONO_RAPID, // 4 mounted rapid = 280g
    counter: [
      // 2 mounted area (200g) + 4 padding walls = 280g.
      { build: 'area', tx: 8, ty: 2 },
      { build: 'area', tx: 10, ty: 4 },
      ...padding(4),
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
    // 4 mounted rapid (280g) + 2 padding walls = 320g.
    mono: [...MONO_RAPID, ...padding(2)],
    counter: [
      // 2 mounted sniper (180g) + 2 mounted rapid (140g) = 320g.
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

// ── The power-aware scripts (energy-infrastructure), for helpers.ts powerRun ──

/**
 * The replay's opening on the build-over-walls board: a mounted rapid and
 * area holding wall B's north-gap exit (2.2 kW rated) under the 4 kW tier-1
 * connection. Two waves: gold binds, not power.
 */
export function openingBuild(): ReadonlyMap<number, Command[]> {
  let seq = 0;
  const cmd = (body: CommandBody): Command => ({ ...body, seq: seq++ });
  return new Map<number, Command[]>([
    [
      50,
      [
        cmd({ kind: 'place', structure: 'wall', tx: 10, ty: 1 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 10, ty: 1 }),
        cmd({ kind: 'place', structure: 'wall', tx: 9, ty: 2 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'area', tx: 9, ty: 2 }),
      ],
    ],
  ]);
}

/**
 * The opening, then the (8,6) socket sniper before wave 3 (wave 2 settles at
 * 698, wave 3 starts at 748) — 3.7 kW, still under the tier — and a slow
 * mounted beside the pair before wave 4 (wave 3 settles at 1225, wave 4
 * starts at 1275), lifting the rated total to 4.5 kW on a 4 kW tier: by
 * then three waves of bounties have paid for both with a buffer to spare,
 * and the cluster engages as one, so the ceiling bites exactly while the
 * pack passes it. Four waves.
 */
export function fourWaveBuild(): Map<number, Command[]> {
  const build = new Map(openingBuild());
  build.set(730, [{ kind: 'place', structure: 'tower', archetype: 'sniper', tx: 8, ty: 6, seq: 99 }]);
  build.set(1250, [
    { kind: 'place', structure: 'wall', tx: 10, ty: 2, seq: 100 },
    { kind: 'place', structure: 'tower', archetype: 'slow', tx: 10, ty: 2, seq: 101 },
  ]);
  return build;
}

/**
 * The solar line (add-battery harness): the four-wave build with the slow's
 * gold spent on a panel at (13,0) before wave 4 instead (wave 3 settles at
 * 1176, wave 4 starts at 1226 — 3.7 kW rated against 2 kW of solar, so quiet
 * ticks run a surplus and engaged ticks a deficit), then — before wave 5
 * (wave 4 settles at 1733, wave 5 starts at 1783) — either a battery beside
 * the panel, or three far-corner walls for the same 60 g, so both runs start
 * wave 5 on the same balance and differ only in the store (the leak
 * scenarios' spend-parity padding, applied to the power harness). Five waves.
 */
export function solarBuild(storage: 'battery' | 'padding'): Map<number, Command[]> {
  const build = fourWaveBuild();
  build.delete(1250);
  build.set(1200, [{ kind: 'place', structure: 'panel', tx: 13, ty: 0, seq: 100 }]);
  build.set(
    1745,
    storage === 'battery'
      ? [{ kind: 'place', structure: 'battery', tx: 14, ty: 0, seq: 101 }]
      : [
          { kind: 'place', structure: 'wall', tx: 16, ty: 0, seq: 101 },
          { kind: 'place', structure: 'wall', tx: 17, ty: 0, seq: 102 },
          { kind: 'place', structure: 'wall', tx: 18, ty: 0, seq: 103 },
        ],
  );
  return build;
}
