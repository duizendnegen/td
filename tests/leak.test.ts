// The leak-rate harness (phase-3 design D9): the counter-matrix contract of
// the enemy-variety spec as executable, directional checks. Headless scripted
// runs — an authored defense at fixed spend versus an authored burst —
// measuring the gold that escapes back through the spawn. Scenario data
// (layouts, bursts, thresholds) is versioned in leakData.ts.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import { expandPreset } from '../src/app/presets';
import { loadGameData } from '../src/data/schema';
import type { Command } from '../src/sim/commands';
import { Sim } from '../src/sim/sim';
import { corridorLevel, fourWaveBuild, openingBuild, SCENARIOS, solarBuild, type LayoutItem } from './leakData';

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

import { COVERAGE_SCALE } from '../src/sim/power';
import { powerRun as scriptedRun } from './helpers';

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
  /** Surplus solar the store took over the wave (add-battery), in mp·tick. */
  chargedMp: number;
  /** The store's discharge over the wave, in mp·tick. */
  batteryMp: number;
  /** Surplus solar beyond the store's room, in mp·tick. */
  solarWastedMp: number;
  /** The store as the wave settled, in mp·tick. */
  storedAtSettlementMpTick: number;
}

/**
 * Run the script against level_01 for `waves` waves through the shared
 * driver (helpers.ts powerRun: each wave starts 50 ticks after the previous
 * settlement, the first at tick 100) and summarise the power figures per wave.
 */
function powerRun(
  build: ReadonlyMap<number, Command[]>,
  waves: number,
): {
  table: WavePower[];
  capacityMp: number;
  batteryCapacityMpTick: number;
  /** The highest the store stood on any tick. */
  maxStoredMpTick: number;
  /** Ticks on which the store exceeded its capacity — always 0. */
  overCapacityTicks: number;
} {
  const table: WavePower[] = [];
  let current: WavePower | null = null;
  let maxStoredMpTick = 0;
  let overCapacityTicks = 0;
  const { data } = scriptedRun(build, waves, ({ sim, commands, treasuryBefore }) => {
    const s = sim.state;
    maxStoredMpTick = Math.max(maxStoredMpTick, s.storedMpTick);
    if (s.storedMpTick > sim.power.storageCapacityMpTick) overCapacityTicks++;
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
          chargedMp: 0,
          batteryMp: 0,
          solarWastedMp: 0,
          storedAtSettlementMpTick: 0,
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
      current.chargedMp += p.chargedMp;
      current.batteryMp += p.batterySupplyMp;
      current.solarWastedMp += Math.max(0, p.solarMp - p.drawMp) - p.chargedMp;
      // Income is what the tick added net of the bill and of anything spent
      // through commands (placements/upgrades are issued in build ticks only).
      const delta = s.treasuryMg - treasuryBefore + p.billMg;
      if (delta > 0 && commands.length === 0) current.incomeMg += delta;
      if (s.runPhase !== 'wave') {
        // Settled this tick: the readout is idle, the bonus has landed.
        current.meanDrawMp = Math.floor(current.meanDrawMp / current.ticks);
        current.storedAtSettlementMpTick = s.storedMpTick;
        current = null;
      }
    }
  });
  return {
    table,
    capacityMp: data.gridTiers[0]!.capacityMp,
    batteryCapacityMpTick: data.batteryCapacityMpTick,
    maxStoredMpTick,
    overCapacityTicks,
  };
}

describe('power-aware run (energy-infrastructure balance harness)', () => {
  // The scripts (leakData.ts): the replay's opening pair — a mounted rapid
  // and area holding wall B's north-gap exit (2.2 kW rated) — then the (8,6)
  // socket sniper before wave 3 (3.7 kW) under the 4 kW tier-1 connection,
  // then a slow mounted beside the pair before wave 4 (4.5 kW rated: over it
  // at a full peak).
  it('opening waves: gold binds, not power — the opening never browns out and the wave has a load curve', () => {
    const { table, capacityMp } = powerRun(openingBuild(), 2);
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
    const { table, capacityMp } = powerRun(fourWaveBuild(), 4);
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

  // The storage slot (add-battery design D9): one panel and one battery
  // beside the panel-less runs, against the same layout spending the
  // battery's gold on padding walls, so wave 5 starts on the same balance.
  it('a battery beside a panel: at equal spend the bill and the wasted solar both fall, the store never exceeds capacity and is non-empty at settlement', () => {
    const withBattery = powerRun(solarBuild('battery'), 5);
    const without = powerRun(solarBuild('padding'), 5);
    if (POWER_LOG) console.log(JSON.stringify({ withBattery, without }, null, 1));
    expect(withBattery.table).toHaveLength(5);
    expect(without.table).toHaveLength(5);
    // Waves 1–4 are the same run: no battery stands yet.
    for (let i = 0; i < 4; i++) {
      expect(withBattery.table[i]!.billMg).toBe(without.table[i]!.billMg);
      expect(withBattery.table[i]!.solarWastedMp).toBe(without.table[i]!.solarWastedMp);
      expect(withBattery.table[i]!.chargedMp).toBe(0);
    }
    // The panel's surplus is wasted without a store (wave 4 onwards)…
    expect(without.table[3]!.solarWastedMp).toBeGreaterThan(0);
    expect(without.table[4]!.solarWastedMp).toBeGreaterThan(0);
    // …and with one, wave 5 stores what it would have wasted and spends it
    // against the deficit: the bill and the wasted solar both fall.
    const b5 = withBattery.table[4]!;
    const p5 = without.table[4]!;
    expect(b5.chargedMp).toBeGreaterThan(0);
    expect(b5.batteryMp).toBeGreaterThan(0);
    expect(b5.billMg).toBeLessThan(p5.billMg);
    expect(b5.solarWastedMp).toBeLessThan(p5.solarWastedMp);
    // The store is a reserve: never above capacity, and carried into the
    // next build phase non-empty.
    expect(withBattery.overCapacityTicks).toBe(0);
    expect(b5.storedAtSettlementMpTick).toBeGreaterThan(0);
    expect(b5.storedAtSettlementMpTick).toBeLessThanOrEqual(withBattery.batteryCapacityMpTick);
    // Sizing rule (design D9): one panel's surplus never fills the battery.
    expect(withBattery.maxStoredMpTick).toBeLessThan(withBattery.batteryCapacityMpTick);
    expect(withBattery.maxStoredMpTick).toBeGreaterThan(withBattery.batteryCapacityMpTick / 4);
  });
});
