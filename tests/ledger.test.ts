// The wave ledger (wave-ledger spec, design D1–D4): per-period gold and
// energy accumulators in hashed state, written beside the ten treasury
// mutations and the step-7 power resolution, read by nothing in the sim.
//
// Fixtures: the power tests' 9×5 lane board (lane on row 2, towers mounted on
// row 0; rapid rated 1 unit, 10% standby, panel 2 units, tier-1 capacity and
// the tariff authored per test) and the theft tests' 7×3 corridor, where a
// parked enemy on the treasury tile grabs on the next tick.
import { describe, expect, it } from 'vitest';
import type { Command, CommandBody } from '../src/sim/commands';
import { openLedger, type WaveLedger } from '../src/sim/types';
import {
  TEST_BATTERY_MP_TICK,
  injectEnemy,
  makeSim,
  mount,
  openLevel,
  place,
  powerRun,
  remove,
  startWave,
  testBalance,
  trivialWave,
  upgrade,
  upgradeGrid,
  type LevelPower,
} from './helpers';
import { fourWaveBuild, openingBuild } from './leakData';

const GOLD_ROWS = [
  'openingMg',
  'bountiesMg',
  'bonusMg',
  'interestMg',
  'constructionMg',
  'billMg',
  'stolenMg',
  'recoveredMg',
] as const satisfies readonly (keyof WaveLedger)[];

const ENERGY_ROWS = [
  'engagedMp',
  'standbyMp',
  'solarUsedMp',
  'solarWastedMp',
  'gridMp',
  'unmetMp',
  'chargedMp',
  'batteryMp',
] as const satisfies readonly (keyof WaveLedger)[];

const goldRows = (l: WaveLedger) => Object.fromEntries(GOLD_ROWS.map((k) => [k, l[k]]));
const energyRows = (l: WaveLedger) => Object.fromEntries(ENERGY_ROWS.map((k) => [k, l[k]]));

/** The gold identity's left-hand side (design D1). */
const goldSum = (l: WaveLedger): number =>
  l.openingMg + l.bountiesMg + l.bonusMg + l.interestMg - l.constructionMg - l.billMg - l.stolenMg + l.recoveredMg;

/**
 * The energy identity's two sides (design D4, add-battery design D6): usage
 * against sources, the source side's solar being the panels' whole output —
 * used, stored and wasted. The store itself is no row.
 */
const usageSum = (l: WaveLedger): number => l.engagedMp + l.standbyMp + l.chargedMp + l.solarWastedMp;
const sourceSum = (l: WaveLedger): number =>
  l.solarUsedMp + l.chargedMp + l.solarWastedMp + l.batteryMp + l.gridMp + l.unmetMp;

const group = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  spawn: 'main',
  type: 'runner',
  count: 1,
  spawnInterval: 1,
  delay: 0,
  ...over,
});

/** A wave that stays open: one enemy due far in the future keeps a cursor open. */
const openEndedWave = () => ({ groups: [group({ delay: 100_000 })] });

/** The lane board with an authored grid (see power.test.ts). */
const board = (
  capacity: number,
  tariff: number,
  extra: { waves?: Record<string, unknown>[]; interest?: number; treasury?: number } = {},
) =>
  openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 }, [], {
    power: {
      tiers: [
        { capacity, cost: 0 },
        { capacity: capacity + 3, cost: 60 },
      ],
      tariff,
    } satisfies LevelPower,
    waves: extra.waves ?? [openEndedWave(), trivialWave()],
    economy: { startingTreasury: extra.treasury ?? 200, interestRatePerTick: extra.interest ?? 0 },
  });

/** The theft corridor: spawn (0,1) → treasury (6,1); runners park where they spawn. */
const corridor = (waves: Record<string, unknown>[], interestRatePerTick = 0) =>
  openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
    waves,
    economy: { startingTreasury: 200, interestRatePerTick },
  });

describe('gold rows — one writer beside each treasury mutation (design D3)', () => {
  it('a placement is construction; removing it while provisional nets the row back to 0', () => {
    const { sim } = makeSim(board(100, 0));
    sim.tick([...mount(3, 0)]); // wall 4g + rapid 50g
    expect(sim.state.ledger.constructionMg).toBe(54_000);
    expect(goldSum(sim.state.ledger)).toBe(sim.state.treasuryMg);
    sim.tick([remove(3, 0)]); // the tower: provisional, full refund
    expect(sim.state.ledger.constructionMg).toBe(4000);
    sim.tick([remove(3, 0)]); // then the wall
    expect(sim.state.ledger.constructionMg).toBe(0);
    expect(sim.state.treasuryMg).toBe(200_000);
    expect(goldSum(sim.state.ledger)).toBe(sim.state.treasuryMg);
  });

  it('a committed removal nets the floored refund, not the price', () => {
    const { sim } = makeSim(board(100, 0));
    sim.tick([place('wall', 3, 0)]);
    sim.tick([startWave()]); // a wave tick commits it
    sim.tick([]);
    sim.state.runPhase = 'build'; // back to a phase that allows removal
    sim.tick([remove(3, 0)]); // 50% of 4000
    expect(sim.state.ledger.constructionMg).toBe(4000 - 2000);
    expect(goldSum(sim.state.ledger)).toBe(sim.state.treasuryMg);
  });

  it('a tower upgrade is construction', () => {
    const { sim } = makeSim(board(100, 0));
    sim.tick([...mount(3, 0)]);
    sim.tick([upgrade(3, 0)]); // rapid level 2: 85g
    expect(sim.state.ledger.constructionMg).toBe(54_000 + 85_000);
    expect(goldSum(sim.state.ledger)).toBe(sim.state.treasuryMg);
  });

  it('a connection upgrade mid-wave adds its cost to construction and to nothing else', () => {
    const { sim } = makeSim(board(100, 0));
    sim.tick([startWave()]);
    const before = goldRows(sim.state.ledger);
    sim.tick([upgradeGrid()]); // tier 2 costs 60g
    expect(sim.state.gridTier).toBe(1);
    expect(goldRows(sim.state.ledger)).toEqual({ ...before, constructionMg: before['constructionMg']! + 60_000 });
    expect(goldSum(sim.state.ledger)).toBe(sim.state.treasuryMg);
  });

  it('the bill row is the sum of what step 9 debited over the wave', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    injectEnemy(sim, 5, 2, { hp: 100_000 }); // engaged throughout, never dies
    sim.tick([startWave()]);
    let debited = sim.power.billMg;
    for (let t = 0; t < 40; t++) {
      sim.tick([]);
      debited += sim.power.billMg; // the readout IS what step 9 debited this tick
    }
    expect(debited).toBeGreaterThan(0);
    expect(sim.state.ledger.billMg).toBe(debited);
    expect(goldSum(sim.state.ledger)).toBe(sim.state.treasuryMg);
  });

  it('the interest row is the sum of the floored credits', () => {
    const { sim } = makeSim(corridor([openEndedWave(), trivialWave()], 0.01));
    let credited = 0;
    for (let t = 0; t < 30; t++) {
      const before = sim.state.treasuryMg;
      // The wave tick starts accruing at once; nothing else moves gold
      // (inert grid, no enemy in play).
      sim.tick(t === 0 ? [startWave()] : []);
      credited += sim.state.treasuryMg - before;
    }
    expect(credited).toBeGreaterThan(0);
    expect(sim.state.ledger.interestMg).toBe(credited);
    expect(goldSum(sim.state.ledger)).toBe(sim.state.treasuryMg);
  });

  it('a grab is stolen; the settlement sack return is recovered — both in the period then closed', () => {
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]));
    sim.tick([startWave()]); // the wave's runner spawns parked at (0,1)
    const thief = injectEnemy(sim, 6, 1); // parked on the treasury
    sim.tick([]);
    expect(sim.state.ledger.stolenMg).toBe(25_000);
    expect(sim.state.treasuryMg).toBe(175_000);
    // Intercepted on the treasury tile: its sack drops there; the parked
    // runner dies too, so the wave drains and settles in the same tick.
    thief.hp = 0;
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]);
    expect(sim.state.runPhase).toBe('build');
    const closed = sim.state.lastLedger;
    expect(closed.waveNo).toBe(1);
    expect(closed.stolenMg).toBe(25_000);
    expect(closed.recoveredMg).toBe(25_000);
    expect(closed.bountiesMg).toBe(2 * 6000);
    expect(goldSum(closed)).toBe(sim.state.treasuryMg);
    expect(sim.state.ledger.openingMg).toBe(sim.state.treasuryMg);
  });

  it('the speed bonus lands in the period that then closes on the post-bonus balance', () => {
    const BONUS = { baseGold: 40, graceTicks: 10, decayTicks: 100 };
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]), testBalance({ bounty: 0 }, {}, BONUS));
    sim.tick([startWave()]);
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]); // settles inside the grace window: the full 40g
    expect(sim.state.lastWaveBonusMg).toBe(40_000);
    expect(sim.state.lastLedger.bonusMg).toBe(40_000);
    expect(sim.state.ledger.bonusMg).toBe(0);
    expect(sim.state.ledger.openingMg).toBe(240_000);
    expect(sim.state.treasuryMg).toBe(240_000);
  });
});

describe('periods — settlement to settlement (design D2)', () => {
  it('opens at run start on the starting treasury with no wave; the closed slot reads empty', () => {
    const { sim } = makeSim(corridor([trivialWave()]));
    expect(sim.state.ledger).toEqual(openLedger(200_000));
    expect(sim.state.ledger.waveNo).toBe(0);
    expect(sim.state.lastLedger.waveNo).toBe(0);
  });

  it('build-phase spending is booked to the wave that then starts; the closed period is untouched', () => {
    const { sim } = makeSim(board(100, 0, { waves: [trivialWave(), trivialWave(), trivialWave()] }));
    // Wave 1: the runner spawns parked; kill it so the wave settles.
    sim.tick([startWave()]);
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]);
    expect(sim.state.runPhase).toBe('build');
    const closed = { ...sim.state.lastLedger };
    expect(closed.waveNo).toBe(1);
    // The build phase after it: spend, then start wave 2.
    sim.tick([...mount(3, 0)]);
    expect(sim.state.ledger.waveNo).toBe(0);
    expect(sim.state.ledger.constructionMg).toBe(54_000);
    sim.tick([startWave()]);
    expect(sim.state.ledger.waveNo).toBe(2);
    expect(sim.state.ledger.constructionMg).toBe(54_000);
    expect(sim.state.lastLedger).toEqual(closed);
  });

  it('settlement copies the open period into the closed slot and opens a fresh one on the settled balance', () => {
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]));
    sim.tick([...mount(3, 0)]);
    sim.tick([startWave()]);
    sim.state.enemies[0]!.hp = 0;
    const open = sim.state.ledger;
    sim.tick([]); // settles: +6000 bounty
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.lastLedger).toEqual({ ...open, bountiesMg: 6000 });
    expect(sim.state.lastLedger).not.toBe(open); // a copy, not an alias
    expect(sim.state.ledger).toEqual(openLedger(sim.state.treasuryMg));
    expect(sim.state.ledger.openingMg).toBe(200_000 - 54_000 + 6000);
    // Mutating the new open period leaves the closed one alone.
    const closed = { ...sim.state.lastLedger };
    sim.tick([place('wall', 5, 0)]);
    expect(sim.state.ledger.constructionMg).toBe(4000);
    expect(sim.state.lastLedger).toEqual(closed);
  });

  it('a replay reproduces both slots exactly', () => {
    const run = () => {
      const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]));
      sim.tick([...mount(3, 0)]);
      sim.tick([startWave()]);
      sim.state.enemies[0]!.hp = 0;
      sim.tick([]);
      sim.tick([place('wall', 5, 0)]);
      return sim;
    };
    const a = run();
    const b = run();
    expect(a.state.ledger).toEqual(b.state.ledger);
    expect(a.state.lastLedger).toEqual(b.state.lastLedger);
    expect(a.hash()).toBe(b.hash());
  });
});

describe('energy rows — the tick\'s buckets after resolvePower (design D4)', () => {
  const ZERO_ENERGY = energyRows(openLedger(0));

  it('surplus solar splits into used and wasted; the grid and unmet stay 0', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0), place('panel', 6, 0)]); // 1 unit engaged vs 2 units of solar
    injectEnemy(sim, 5, 2, { hp: 100_000 });
    sim.tick([startWave()]);
    expect(sim.power).toMatchObject({ drawMp: 1000, engagedMp: 1000, solarMp: 2000, gridSupplyMp: 0 });
    expect(energyRows(sim.state.ledger)).toEqual({
      engagedMp: 1000,
      standbyMp: 0,
      solarUsedMp: 1000,
      solarWastedMp: 1000,
      gridMp: 0,
      unmetMp: 0,
      chargedMp: 0,
      batteryMp: 0,
    });
    // Wasted solar is on both sides: as usage, and inside the solar output.
    expect(usageSum(sim.state.ledger)).toBe(sourceSum(sim.state.ledger));
    expect(usageSum(sim.state.ledger)).toBe(2000);
  });

  it('a tier-capped tick puts the shortfall in unmet', () => {
    // Two rapids engaged draw 2000 on a 1-unit connection: the grid gives 1000.
    const { sim } = makeSim(board(1, 0.12));
    sim.tick([...mount(3, 0), ...mount(6, 0)]);
    injectEnemy(sim, 5, 2, { hp: 100_000 });
    sim.tick([startWave()]);
    expect(energyRows(sim.state.ledger)).toEqual({
      engagedMp: 2000,
      standbyMp: 0,
      solarUsedMp: 0,
      solarWastedMp: 0,
      gridMp: 1000,
      unmetMp: 1000,
      chargedMp: 0,
      batteryMp: 0,
    });
  });

  it('a broke tick puts the whole deficit in unmet', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    injectEnemy(sim, 5, 2, { hp: 100_000 });
    sim.state.treasuryMg = 0;
    sim.state.ledger.openingMg = 0; // keep the fixture's books straight
    sim.tick([startWave()]);
    expect(sim.power.coverage).toBe(0);
    expect(energyRows(sim.state.ledger)).toEqual({
      engagedMp: 1000,
      standbyMp: 0,
      solarUsedMp: 0,
      solarWastedMp: 0,
      gridMp: 0,
      unmetMp: 1000,
      chargedMp: 0,
      batteryMp: 0,
    });
  });

  it('build-phase ticks with towers and batteries standing and engaged change no energy row', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0), place('panel', 6, 0), place('battery', 1, 0)]);
    sim.state.storedMpTick = 50_000;
    const e = injectEnemy(sim, 5, 2, { hp: 100_000 });
    for (let t = 0; t < 10; t++) sim.tick([]);
    expect(e.hp).toBeLessThan(100_000); // it fired: engaged, at full coverage
    expect(energyRows(sim.state.ledger)).toEqual(ZERO_ENERGY);
    expect(sim.state.storedMpTick).toBe(50_000);
  });

  // The storage slot's rows (add-battery design D6, wave-ledger delta). The
  // spec's worked figures (30/40 with room 6; 50/20 with store 20 and grid
  // 10) are resolvePower's and are asserted in power.test.ts; here the same
  // shapes in the sim's units: standby 100 against 2000 of solar, and three
  // engaged rapids against one panel on a 1-unit connection.
  it('surplus that is stored is charging, not wasted; the rest of the surplus is', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0), place('panel', 6, 0), place('battery', 1, 0)]);
    sim.state.storedMpTick = TEST_BATTERY_MP_TICK - 600; // room for 600
    sim.tick([startWave()]); // standby 100 vs solar 2000: surplus 1900
    expect(energyRows(sim.state.ledger)).toEqual({
      engagedMp: 0,
      standbyMp: 100,
      solarUsedMp: 100,
      solarWastedMp: 1300,
      gridMp: 0,
      unmetMp: 0,
      chargedMp: 600,
      batteryMp: 0,
    });
    expect(usageSum(sim.state.ledger)).toBe(sourceSum(sim.state.ledger));
    expect(usageSum(sim.state.ledger)).toBe(2000);
    expect(sim.state.storedMpTick).toBe(TEST_BATTERY_MP_TICK);
    // Full now: the next tick's surplus is all wasted.
    sim.tick([]);
    expect(sim.state.ledger.chargedMp).toBe(600);
    expect(sim.state.ledger.solarWastedMp).toBe(1300 + 1900);
  });

  it('discharge is a source, between solar and the grid; unmet is what none of them covered', () => {
    // Three rapids engaged (3000) against one panel (2000) on a 1-unit
    // connection: deficit 1000; the store holds 400.
    const { sim } = makeSim(board(1, 0.12, { treasury: 300 }));
    sim.tick([...mount(1, 0), ...mount(4, 0), ...mount(7, 0), place('panel', 2, 4), place('battery', 5, 4)]);
    sim.tick([startWave()]);
    const before = { ...sim.state.ledger };
    sim.state.storedMpTick = 400;
    injectEnemy(sim, 1, 2, { hp: 100_000 });
    injectEnemy(sim, 4, 2, { hp: 100_000 });
    injectEnemy(sim, 7, 2, { hp: 100_000 });
    sim.tick([]);
    const tick1 = { ...sim.state.ledger };
    expect(tick1.engagedMp - before.engagedMp).toBe(3000);
    expect(tick1.solarUsedMp - before.solarUsedMp).toBe(2000);
    expect(tick1.batteryMp - before.batteryMp).toBe(400);
    expect(tick1.gridMp - before.gridMp).toBe(600);
    expect(tick1.unmetMp - before.unmetMp).toBe(0);
    expect(tick1.chargedMp - before.chargedMp).toBe(0);
    expect(sim.state.storedMpTick).toBe(0);
    // Empty store: the tier caps the grid at 1000 and the rest is unmet.
    sim.tick([]);
    const tick2 = sim.state.ledger;
    expect(tick2.batteryMp).toBe(tick1.batteryMp);
    expect(tick2.gridMp - tick1.gridMp).toBe(1000);
    expect(tick2.unmetMp - tick1.unmetMp).toBe(0);
    expect(usageSum(tick2)).toBe(sourceSum(tick2));
  });

  it('a clamp on removal moves no energy row', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([place('battery', 1, 0), place('battery', 3, 0)]);
    sim.state.storedMpTick = TEST_BATTERY_MP_TICK + 120_000; // 16 kWh of 20
    const before = energyRows(sim.state.ledger);
    sim.tick([remove(3, 0)]);
    expect(sim.state.storedMpTick).toBe(TEST_BATTERY_MP_TICK);
    expect(energyRows(sim.state.ledger)).toEqual(before);
    expect(goldSum(sim.state.ledger)).toBe(sim.state.treasuryMg);
  });

  it('the settlement tick\'s draw is in the energy rows while the bill row did not move that tick', () => {
    const { sim } = makeSim(board(100, 0.12, { waves: [trivialWave(), trivialWave()] }));
    sim.tick([...mount(3, 0)]);
    const victim = injectEnemy(sim, 5, 2, { hp: 100_000 });
    sim.tick([startWave()]); // the runner spawns parked at (0,2), out of range
    // Engaged: 1000 mp from the grid, 6 mg a tick — up to the tick the next shot is due.
    const tower = sim.state.structures.find((x) => x.kind === 'tower')!;
    while (sim.state.tick < tower.nextFireTick) sim.tick([]);
    const before = { ...sim.state.ledger };
    expect(before.billMg).toBe(6 * (sim.state.tick - 1)); // every wave tick so far
    // The killing shot lands this tick; the parked runner dies too: drained, settled.
    victim.hp = 4;
    sim.state.enemies.find((e) => e !== victim)!.hp = 0;
    sim.tick([]);
    expect(sim.state.runPhase).toBe('build');
    const closed = sim.state.lastLedger;
    expect(closed.engagedMp).toBe(before.engagedMp + 1000);
    expect(closed.gridMp).toBe(before.gridMp + 1000);
    expect(closed.billMg).toBe(before.billMg); // nothing billed on the settlement tick
    expect(goldSum(closed)).toBe(sim.state.treasuryMg);
  });

  it('engaged + standby is the sum of the readout\'s draw over a wave', () => {
    const { sim } = makeSim(board(2, 0.12));
    sim.tick([...mount(1, 0), ...mount(4, 0), ...mount(7, 0)]);
    sim.tick([startWave()]);
    let draw = sim.power.drawMp;
    injectEnemy(sim, 4, 2, { hp: 40 }); // in the middle tower's range only
    for (let t = 0; t < 30; t++) {
      sim.tick([]);
      draw += sim.power.drawMp;
    }
    const l = sim.state.ledger;
    expect(l.engagedMp).toBeGreaterThan(0);
    expect(l.standbyMp).toBeGreaterThan(0);
    expect(l.engagedMp + l.standbyMp).toBe(draw);
  });

  it('engaged is rated power × engaged ticks for one tower with a known engagement window', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]); // rapid: rated 1000, standby 100
    sim.tick([startWave()]);
    for (let t = 0; t < 7; t++) sim.tick([]); // 8 standby ticks so far, the start tick included
    injectEnemy(sim, 5, 2, { hp: 100_000 });
    for (let t = 0; t < 12; t++) sim.tick([]); // 12 engaged ticks
    expect(sim.state.ledger.engagedMp).toBe(12 * 1000);
    expect(sim.state.ledger.standbyMp).toBe(8 * 100);
  });
});

describe('the identities hold on every tick of the harness runs (design D10)', () => {
  /**
   * The four-wave harness script plus the sites it does not reach: a wall
   * placed after wave 1 and sold committed after wave 2 (a floored refund),
   * another placed and sold provisional in the same build phase (a full
   * refund), a panel before wave 4 in place of the base script's slow —
   * its output exceeds the quiet draw, so solar is wasted on standby ticks
   * — the connection bought during wave 4, which runs the balance into debt
   * mid-wave, so the grid cuts off and the towers run on the panel alone
   * (unmet) for the rest of the wave, and a concede while wave 4 still
   * runs. The base script already has thefts in waves 3 and 4 and their
   * sacks returning at settlement; the tower-upgrade writer has its unit
   * test above.
   */
  const extendedBuild = (): ReadonlyMap<number, Command[]> => {
    const build = fourWaveBuild();
    build.delete(1250); // the slow: its 80g is the panel's here
    let seq = 500;
    const at = (t: number, ...bodies: CommandBody[]): void => {
      build.set(t, [...(build.get(t) ?? []), ...bodies.map((b): Command => ({ ...b, seq: seq++ }))]);
    };
    at(350, { kind: 'place', structure: 'wall', tx: 18, ty: 0 });
    at(705, { kind: 'place', structure: 'wall', tx: 18, ty: 1 });
    at(706, { kind: 'remove', tx: 18, ty: 1 });
    at(710, { kind: 'remove', tx: 18, ty: 0 });
    at(1200, { kind: 'place', structure: 'panel', tx: 13, ty: 0 });
    at(1230, { kind: 'upgradeGrid' });
    at(1400, { kind: 'concede' });
    return build;
  };

  /**
   * The battery run (add-battery design D6): the four-wave script with the
   * slow's gold spent on a panel before wave 4 and a battery beside it
   * bought mid-wave — a debt purchase, so the grid cuts off at once and the
   * towers run on the panel and the store for the rest of the wave: quiet
   * ticks charge, engaged ticks discharge, the surplus beyond a full store
   * is wasted, and broke ticks are carried by the store. Conceded while
   * wave 4 runs, like the extended build.
   */
  const batteryBuild = (): ReadonlyMap<number, Command[]> => {
    const build = fourWaveBuild();
    build.delete(1250);
    let seq = 500;
    const at = (t: number, ...bodies: CommandBody[]): void => {
      build.set(t, [...(build.get(t) ?? []), ...bodies.map((b): Command => ({ ...b, seq: seq++ }))]);
    };
    at(1200, { kind: 'place', structure: 'panel', tx: 13, ty: 0 });
    at(1227, { kind: 'place', structure: 'battery', tx: 14, ty: 0 });
    at(1400, { kind: 'concede' });
    return build;
  };

  const scripts: [string, () => ReadonlyMap<number, Command[]>, number][] = [
    ['the opening (two waves)', openingBuild, 2],
    ['the four-wave build', fourWaveBuild, 4],
    ['the four-wave build extended with refunds, upgrades, debt and a concede', extendedBuild, 4],
    ['the four-wave build with a panel and a battery, charging, discharging and broke', batteryBuild, 4],
  ];

  for (const [name, build, waves] of scripts) {
    it(name, () => {
      let closedWave = 0;
      let settlements = 0;
      let ticks = 0;
      let sawDebt = false;
      let sawUnmet = false;
      let sawWasted = false;
      let sawCharging = false;
      let sawDischarge = false;
      let sawBrokeDischarge = false;
      const { sim } = powerRun(build(), waves, ({ sim }) => {
        const s = sim.state;
        ticks++;
        // The open period, every tick.
        expect(goldSum(s.ledger)).toBe(s.treasuryMg);
        expect(usageSum(s.ledger)).toBe(sourceSum(s.ledger));
        if (s.treasuryMg < 0) sawDebt = true;
        if (s.ledger.unmetMp > 0) sawUnmet = true;
        if (s.ledger.solarWastedMp > 0) sawWasted = true;
        if (sim.power.chargedMp > 0) sawCharging = true;
        if (sim.power.batterySupplyMp > 0) sawDischarge = true;
        if (sim.power.batterySupplyMp > 0 && s.treasuryMg <= 0) sawBrokeDischarge = true;
        // The store never exceeds its capacity.
        expect(s.storedMpTick).toBeLessThanOrEqual(sim.power.storageCapacityMpTick);
        // At each settlement: the closed period reconciles to the new opening.
        if (s.lastLedger.waveNo !== closedWave) {
          closedWave = s.lastLedger.waveNo;
          settlements++;
          expect(s.runPhase).not.toBe('wave');
          expect(goldSum(s.lastLedger)).toBe(s.ledger.openingMg);
          expect(usageSum(s.lastLedger)).toBe(sourceSum(s.lastLedger));
          expect(s.ledger.waveNo).toBe(0);
        }
      });
      expect(ticks).toBeGreaterThan(500);
      expect(sim.state.stolenMg > 0 || waves < 3).toBe(true); // waves 3–4 are where the grabs land
      if (build === extendedBuild) {
        expect(settlements).toBe(3); // wave 4 was conceded, not settled
        expect(sim.state.runPhase).toBe('lost');
        expect(sim.state.gridTier).toBe(1);
        expect(sim.state.structures.some((x) => x.kind === 'panel')).toBe(true);
        expect(sim.state.structures.some((x) => x.tx === 18)).toBe(false); // both walls sold
        expect(sawDebt).toBe(true);
        expect(sawUnmet).toBe(true);
        expect(sawWasted).toBe(true);
        expect(sim.state.lastLedger.recoveredMg).toBeGreaterThan(0);
      } else if (build === batteryBuild) {
        expect(settlements).toBe(3); // conceded mid-wave 4
        expect(sim.state.runPhase).toBe('lost');
        expect(sim.state.structures.some((x) => x.kind === 'panel')).toBe(true);
        expect(sim.state.structures.some((x) => x.kind === 'battery')).toBe(true);
        expect(sawDebt).toBe(true);
        expect(sawCharging).toBe(true);
        expect(sawDischarge).toBe(true);
        expect(sawBrokeDischarge).toBe(true);
        expect(sawWasted).toBe(true);
        // The two rows are in the open period's books, and the store ended non-empty.
        expect(sim.state.ledger.chargedMp).toBeGreaterThan(0);
        expect(sim.state.ledger.batteryMp).toBeGreaterThan(0);
        expect(sim.state.storedMpTick).toBeGreaterThan(0);
      } else {
        expect(settlements).toBe(waves);
      }
    });
  }
});
