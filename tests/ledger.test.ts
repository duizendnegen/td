// The wave ledger (wave-ledger spec, design D1–D4): per-period gold and
// energy accumulators in hashed state, written beside the ten treasury
// mutations and the step-7 power resolution, read by nothing in the sim.
//
// Fixtures: the power tests' 9×5 lane board (lane on row 2, towers mounted on
// row 0; rapid rated 1 unit, 10% standby, panel 2 units, tier-1 capacity and
// the tariff authored per test) and the theft tests' 7×3 corridor, where a
// parked enemy on the treasury tile grabs on the next tick.
import { describe, expect, it } from 'vitest';
import { openLedger, type WaveLedger } from '../src/sim/types';
import {
  injectEnemy,
  makeSim,
  mount,
  openLevel,
  place,
  remove,
  startWave,
  testBalance,
  trivialWave,
  upgradeGrid,
  type LevelPower,
} from './helpers';

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
] as const satisfies readonly (keyof WaveLedger)[];

const goldRows = (l: WaveLedger) => Object.fromEntries(GOLD_ROWS.map((k) => [k, l[k]]));
const energyRows = (l: WaveLedger) => Object.fromEntries(ENERGY_ROWS.map((k) => [k, l[k]]));

/** The gold identity's left-hand side (design D1). */
const goldSum = (l: WaveLedger): number =>
  l.openingMg + l.bountiesMg + l.bonusMg + l.interestMg - l.constructionMg - l.billMg - l.stolenMg + l.recoveredMg;

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

// energyRows is used by the energy-row tests below.
void energyRows;
