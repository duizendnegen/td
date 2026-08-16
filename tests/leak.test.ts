// The leak-rate harness (phase-3 design D9): the counter-matrix contract of
// the enemy-variety spec as executable, directional checks. Headless scripted
// runs — an authored defense at fixed spend versus an authored burst —
// measuring the gold that escapes back through the spawn. Scenario data
// (layouts, bursts, thresholds) is versioned in leakData.ts.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import { expandPreset } from '../src/app/presets';
import { loadGameData } from '../src/data/schema';
import type { Command, CommandBody } from '../src/sim/commands';
import { Sim } from '../src/sim/sim';
import { corridorLevel, SCENARIOS, type LayoutItem } from './leakData';

/** Ticks after the last scheduled spawn before a run is called unresolved. */
const DRAIN_TICKS = 1500;

interface LeakResult {
  leakedMg: number;
  spentMg: number;
  kills: number;
  escapes: number;
}

function runDefense(layout: LayoutItem[], burst: LeakScenarioBurst): LeakResult {
  const data = loadGameData(corridorLevel(), balanceJson);
  const sim = new Sim(data, 1);

  // Build the whole defense on tick 0; every placement must succeed, or the
  // scenario silently measures a different defense than it authored. A tower
  // item is a wall and the tower on it (build-over-walls): both are place
  // commands, so ascending seq lands the wall first in the same tick.
  let seq = 0;
  const placeCommands: Command[] = layout.flatMap((item): Command[] => {
    const wall: Command = { kind: 'place', structure: 'wall', tx: item.tx, ty: item.ty, seq: seq++ };
    if (item.build === 'wall') return [wall];
    return [
      wall,
      { kind: 'place', structure: 'tower', archetype: item.build, tx: item.tx, ty: item.ty, seq: seq++ },
    ];
  });
  sim.tick(placeCommands);
  expect(sim.state.structures).toHaveLength(placeCommands.length);
  const spentMg = data.startingTreasuryMg - sim.state.treasuryMg;

  // The burst starts at tick 10; run until the board is clear.
  const scheduled = expandPreset({ id: 'x', label: 'x', groups: burst }, 10);
  const lastSpawnTick = scheduled[scheduled.length - 1]!.tick;
  let next = 0;
  let leakedMg = 0;
  let escapes = 0;
  let spawned = 0;
  while (sim.state.tick <= lastSpawnTick + DRAIN_TICKS) {
    const commands: Command[] = [];
    while (next < scheduled.length && scheduled[next]!.tick <= sim.state.tick) {
      commands.push({ ...scheduled[next]!.body, seq: seq++ });
      next++;
      spawned++;
    }
    sim.tick(commands);
    for (const ev of sim.events) {
      if (ev.kind === 'goldLeaked') {
        leakedMg += ev.amountMg;
        escapes++;
      }
    }
    sim.events.length = 0;
    if (next >= scheduled.length && sim.state.enemies.length === 0) break;
  }
  expect(sim.state.enemies).toHaveLength(0); // the run resolved
  return { leakedMg, spentMg, kills: spawned - escapes, escapes };
}

type LeakScenarioBurst = (typeof SCENARIOS)[number]['burst'];

describe('leak-rate harness (counter-matrix contract)', () => {
  for (const scenario of SCENARIOS) {
    it(scenario.name, () => {
      const mono = runDefense(scenario.mono, scenario.burst);
      const counter = runDefense(scenario.counter, scenario.burst);

      // Equal-spend contract: the countered mix never outspends the mono
      // defense it beats (padding walls keep the spends aligned).
      expect(counter.spentMg).toBeLessThanOrEqual(mono.spentMg);

      // The directional assertions ARE the contract (design D9).
      expect(mono.leakedMg).toBeGreaterThan(scenario.monoMinLeakMg);
      expect(counter.leakedMg).toBeLessThan(scenario.counterMaxLeakMg);
      expect(counter.leakedMg).toBeLessThan(mono.leakedMg);
    });
  }
});

// ── The power-aware run (energy-infrastructure) ──────────────────────────
//
// The counter-matrix runs above never start a wave, so power never engages
// there (nothing draws outside a wave). This run drives the shipped level_01
// through its opening waves with an authored, growing defense and reads the
// tick's power figures off the sim's derived readout — the same numbers the
// meter and F4 show — so balance authoring can see where the peaks fall, how
// often the ceiling bites, and what share of income the bill takes. The
// assertions are the design intent from the proposal, directionally; the
// per-wave table prints with POWER_LOG=1 (`POWER_LOG=1 npx vitest run
// tests/leak.test.ts`) and stays quiet otherwise.

import levelJson from '../src/data/levels/level_01.json';
import { COVERAGE_SCALE } from '../src/sim/power';

/** POWER_LOG=1 prints the per-wave table; the test files carry no node types, hence the cast. */
const POWER_LOG =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['POWER_LOG'] !==
  undefined;

interface WavePower {
  wave: number;
  ticks: number;
  peakDrawMp: number;
  minDrawMp: number;
  meanDrawMp: number;
  /** Ticks with coverage below full. */
  brownTicks: number;
  /** Ticks with coverage zero. */
  darkTicks: number;
  minCoverage: number;
  billMg: number;
  /** Bounties + settlement bonus credited during the wave. */
  incomeMg: number;
  minTreasuryMg: number;
}

/**
 * Run `commandsAt` against level_01 for `waves` waves, starting each wave the
 * tick after the previous one settles (plus a build pause for placements),
 * and summarise the power figures per wave.
 */
function powerRun(
  build: ReadonlyMap<number, Command[]>,
  waves: number,
): { table: WavePower[]; capacityMp: number } {
  const data = loadGameData(levelJson, balanceJson);
  const sim = new Sim(data, 0xc0ffee);
  let seq = 1000;
  const table: WavePower[] = [];
  let current: WavePower | null = null;
  let treasuryBefore = 0;
  const startWave: Command = { kind: 'startWave', seq: seq++ };
  let settledAt = -1;
  const startedWaves = new Set<number>();
  for (let guard = 0; guard < 20_000 && (table.length < waves || current); guard++) {
    const t = sim.state.tick;
    const commands: Command[] = [...(build.get(t) ?? [])];
    // Start the next wave 50 ticks after the last settlement (or at tick 100).
    const nextWave = sim.state.waveIndex + 1;
    const startAt = settledAt < 0 ? 100 : settledAt + 50;
    if (sim.state.runPhase === 'build' && t >= startAt && !startedWaves.has(nextWave) && nextWave <= waves) {
      commands.push({ ...startWave, seq: seq++ });
      startedWaves.add(nextWave);
    }
    treasuryBefore = sim.state.treasuryMg;
    sim.tick(commands);
    const s = sim.state;
    if (s.runPhase === 'wave') {
      if (!current || current.wave !== s.waveIndex) {
        current = {
          wave: s.waveIndex,
          ticks: 0,
          peakDrawMp: 0,
          minDrawMp: Number.MAX_SAFE_INTEGER,
          meanDrawMp: 0,
          brownTicks: 0,
          darkTicks: 0,
          minCoverage: COVERAGE_SCALE,
          billMg: 0,
          incomeMg: 0,
          minTreasuryMg: s.treasuryMg,
        };
        table.push(current);
      }
    }
    if (current) {
      const p = sim.power;
      current.ticks++;
      current.peakDrawMp = Math.max(current.peakDrawMp, p.drawMp);
      current.minDrawMp = Math.min(current.minDrawMp, p.drawMp);
      current.meanDrawMp += p.drawMp;
      if (p.coverage < COVERAGE_SCALE) current.brownTicks++;
      if (p.coverage === 0) current.darkTicks++;
      current.minCoverage = Math.min(current.minCoverage, p.coverage);
      current.billMg += p.billMg;
      current.minTreasuryMg = Math.min(current.minTreasuryMg, s.treasuryMg);
      // Income is what the tick added net of the bill and of anything spent
      // through commands (placements/upgrades are issued in build ticks only).
      const delta = s.treasuryMg - treasuryBefore + p.billMg;
      if (delta > 0 && commands.length === 0) current.incomeMg += delta;
      if (s.runPhase !== 'wave') {
        // Settled this tick: the readout is idle, the bonus has landed.
        current.meanDrawMp = Math.floor(current.meanDrawMp / current.ticks);
        settledAt = t;
        current = null;
      }
    }
  }
  return { table, capacityMp: data.gridTiers[0]!.capacityMp };
}

describe('power-aware run (energy-infrastructure balance harness)', () => {
  // The replay's opening on the build-over-walls board: a mounted rapid and
  // area holding wall B's north-gap exit (2.2 kW rated), then the (8,6)
  // socket sniper before wave 3 (3.7 kW) — under the 4 kW tier-1 connection
  // — then a slow mounted beside the pair before wave 4 (4.5 kW rated: over
  // it at a full peak).
  const opening = (): ReadonlyMap<number, Command[]> => {
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
  };

  it('opening waves: gold binds, not power — the opening never browns out and the wave has a load curve', () => {
    const { table, capacityMp } = powerRun(opening(), 2);
    if (POWER_LOG) console.log(JSON.stringify({ capacityMp, table }, null, 1));
    expect(table).toHaveLength(2);
    for (const w of table) {
      expect(w.minCoverage).toBe(COVERAGE_SCALE);
      expect(w.brownTicks).toBe(0);
      // Engagement-based draw produces a curve: the peak is well above the
      // quiet standby floor — a battery would have something to shave.
      expect(w.peakDrawMp).toBeGreaterThan(2 * w.minDrawMp);
      expect(w.peakDrawMp).toBeLessThanOrEqual(capacityMp);
      // Felt, not dominating: a positive bill that stays a minor share of income.
      expect(w.billMg).toBeGreaterThan(0);
      expect(w.billMg).toBeLessThan(w.incomeMg / 4);
      expect(w.minTreasuryMg).toBeGreaterThan(0);
    }
  });

  it('once income exists the ceiling bites at peaks only, and only while the peak lasts', () => {
    const build = new Map(opening());
    // The socket sniper before wave 3 (wave 2 settles at 698, wave 3 starts at
    // 748) stays under the tier; the slow mounted beside the pair before wave
    // 4 (wave 3 settles at 1225, wave 4 starts at 1275) lifts the rated total
    // to 4.5 kW on a 4 kW tier — by then three waves of bounties have paid for
    // both with a buffer to spare — and the cluster engages as one, so the
    // ceiling bites exactly while the pack passes it.
    build.set(730, [{ kind: 'place', structure: 'tower', archetype: 'sniper', tx: 8, ty: 6, seq: 99 }]);
    build.set(1250, [
      { kind: 'place', structure: 'wall', tx: 10, ty: 2, seq: 100 },
      { kind: 'place', structure: 'tower', archetype: 'slow', tx: 10, ty: 2, seq: 101 },
    ]);
    const { table, capacityMp } = powerRun(build, 4);
    if (POWER_LOG) console.log(JSON.stringify({ capacityMp, table }, null, 1));
    const w3 = table[3]!;
    expect(w3.peakDrawMp).toBeGreaterThan(capacityMp);
    expect(w3.brownTicks).toBeGreaterThan(0);
    // …but at peaks, not throughout: most of the wave sits under the ceiling.
    expect(w3.brownTicks).toBeLessThan(w3.ticks / 2);
    // Solvent throughout, so never dark: broke-with-no-solar is the only
    // path to zero coverage, and a buffered player never walks it here.
    expect(w3.darkTicks).toBe(0);
    expect(w3.minTreasuryMg).toBeGreaterThan(0);
    // The brownout is shallow: capacity ÷ rated total, not a collapse.
    expect(w3.minCoverage).toBeGreaterThan(COVERAGE_SCALE / 2);
  });
});
