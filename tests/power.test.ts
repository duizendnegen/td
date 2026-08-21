// See ARCHITECTURE.md §5/§7/§12 and the energy-infrastructure power-grid,
// tower-combat, theft-economy and run-lifecycle specs.
//
// Fixtures: the 9×5 board with the lane on row 2 and towers on row 0 — each
// mounted on its own wall (build-over-walls), so a tower is the tile's second
// structure and `towers()` picks the tower layer; the test balance rates
// rapid 1/1.3/1.6, sniper 1.5, area 1.2, slow 0.8 (units → ×1000 mp),
// standby 10%, panel 40g for 2 units, wall 4g. Power blocks are passed per
// test so each number below is authored where it is asserted.
import { describe, expect, it } from 'vitest';
import {
  COVERAGE_SCALE,
  drawOf,
  resolvePower,
  solarOf,
  storageCapacityOf,
  stretchedInterval,
} from '../src/sim/power';
import {
  TEST_BATTERY_MP_TICK,
  injectEnemy,
  makeSim,
  mount,
  openLevel,
  place,
  remove,
  startWave,
  testBalance,
  trivialWave,
  upgrade,
  upgradeGrid,
  type LevelPower,
} from './helpers';
import type { Sim } from '../src/sim/sim';
import type { Structure } from '../src/sim/types';

/** The tower layer, in placement order — the walls beneath are not rated. */
const towers = (sim: Sim): Structure[] => sim.state.structures.filter((s) => s.kind === 'tower');

/** A wave that stays open: one enemy due far in the future keeps a cursor open. */
const openEndedWave = () => ({
  groups: [{ spawn: 'main', type: 'runner', count: 1, spawnInterval: 1, delay: 100_000 }],
});

/**
 * The lane board with an authored grid: `capacity` units on tier 1 (a second
 * tier at +3 for 60g), `tariff` gold per unit per second, and an open-ended
 * wave so power resolves tick after tick without settling.
 */
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

const FULL = COVERAGE_SCALE;

/** The merit order with no battery standing: an empty store of zero capacity. */
const noStore = (
  drawMp: number,
  solarMp: number,
  tierCapacityMp: number,
  treasuryMg: number,
  tariffMgPer1000: number,
) => resolvePower(drawMp, solarMp, 0, 0, tierCapacityMp, treasuryMg, tariffMgPer1000);

/** A resolution with nothing stored or charged — the no-battery shape of the result. */
const idle = (gridSupplyMp: number, coverage: number, billMg: number) => ({
  batterySupplyMp: 0,
  chargedMp: 0,
  gridSupplyMp,
  coverage,
  billMg,
});

describe('resolvePower — the merit order (design D4)', () => {
  it('solar covers first; the grid is asked for the deficit only, at the tariff', () => {
    // draw 5000, solar 2000 → deficit 3000; capacity 4000; treasury ample; tariff 6/kW-tick.
    const r = noStore(5000, 2000, 4000, 200_000, 6);
    expect(r).toEqual(idle(3000, FULL, 18));
  });

  it('the grid is bounded by capacity; the remainder goes unsupplied that tick', () => {
    const r = noStore(9000, 1000, 4000, 200_000, 6);
    expect(r.gridSupplyMp).toBe(4000);
    // supplied 5000 of 9000 → floor(5000 × 1024 / 9000) = 568
    expect(r.coverage).toBe(Math.floor((5000 * FULL) / 9000));
    expect(r.billMg).toBe(24);
  });

  it('surplus solar is wasted: nothing billed, coverage capped at full', () => {
    const r = noStore(1500, 4000, 4000, 200_000, 6);
    expect(r).toEqual(idle(0, FULL, 0));
  });

  it('is bounded by what the positive balance can pay: the bill lands at exactly zero', () => {
    // 10 mg can pay for floor(10 × 1000 / 6) = 1666 mp; bill floor(1666 × 6 / 1000) = 9 mg.
    // (The floor in the affordable bound leaves at most one tariff-quantum unspent.)
    const r = noStore(5000, 0, 8000, 10, 6);
    expect(r.gridSupplyMp).toBe(1666);
    expect(r.billMg).toBeLessThanOrEqual(10);
    // An exact multiple lands on zero: 12 mg buys exactly 2000 mp for 12 mg.
    expect(noStore(5000, 0, 8000, 12, 6)).toEqual(idle(2000, Math.floor((2000 * FULL) / 5000), 12));
  });

  it('at zero or negative balance the grid supplies nothing; solar alone remains', () => {
    for (const treasury of [0, -1, -50_000]) {
      const cut = noStore(5000, 0, 8000, treasury, 6);
      expect(cut).toEqual(idle(0, 0, 0));
      const solarOnly = noStore(5000, 2000, 8000, treasury, 6);
      expect(solarOnly).toEqual(idle(0, Math.floor((2000 * FULL) / 5000), 0));
    }
  });

  it('nothing drawing is full coverage and no bill', () => {
    expect(noStore(0, 0, 4000, 200_000, 6)).toEqual(idle(0, FULL, 0));
    expect(noStore(0, 0, 4000, -5, 6).coverage).toBe(FULL);
  });

  it('a zero tariff is a free grid: no treasury bound, no cut-off, no bill', () => {
    expect(noStore(5000, 0, 8000, -50_000, 0)).toEqual(idle(5000, FULL, 0));
    // …but the capacity bound still applies.
    expect(noStore(5000, 0, 3000, -50_000, 0).gridSupplyMp).toBe(3000);
  });

  it('every output is an integer for integer inputs', () => {
    for (const [d, s, st, cap, c, t, tariff] of [
      [5000, 2000, 0, 0, 4000, 200_000, 6],
      [9001, 1, 0, 0, 4321, 12_345, 7],
      [1, 0, 0, 0, 1, 1, 6],
      [9001, 1, 777, 12_345, 4321, 12_345, 7],
      [1, 9001, 777, 12_345, 4321, 12_345, 7],
    ] as const) {
      const r = resolvePower(d, s, st, cap, c, t, tariff);
      for (const v of [r.batterySupplyMp, r.chargedMp, r.gridSupplyMp, r.coverage, r.billMg]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('the stretched interval is interval ÷ coverage, integer ceiling', () => {
    expect(stretchedInterval(5, FULL)).toBe(5);
    expect(stretchedInterval(5, FULL / 2)).toBe(10);
    expect(stretchedInterval(5, FULL / 4)).toBe(20);
    // 5 × 1024 / 700 = 7.31… → 8
    expect(stretchedInterval(5, 700)).toBe(8);
    expect(stretchedInterval(20, 1)).toBe(20 * FULL);
  });
});

// The storage slot (add-battery design D3, power-grid delta): surplus charges
// the store up to its room and the rest is wasted; the store covers the
// deficit before the grid is asked; a tick charges or discharges, never both.
describe('resolvePower — the storage slot (add-battery design D3)', () => {
  it('surplus charges the store up to its room; only the rest is wasted; nothing billed', () => {
    // draw 30, solar 40, store 4 of 10 → charged 6, 4 wasted (by the caller's subtraction).
    const r = resolvePower(30, 40, 4, 10, 100, 200_000, 6);
    expect(r).toEqual({ batterySupplyMp: 0, chargedMp: 6, gridSupplyMp: 0, coverage: FULL, billMg: 0 });
    // Room to spare: the whole surplus is taken.
    expect(resolvePower(30, 40, 0, 100, 100, 200_000, 6).chargedMp).toBe(10);
  });

  it('a full store takes nothing: all surplus is wasted', () => {
    const r = resolvePower(30, 40, 10, 10, 100, 200_000, 6);
    expect(r).toEqual({ batterySupplyMp: 0, chargedMp: 0, gridSupplyMp: 0, coverage: FULL, billMg: 0 });
  });

  it('no batteries: every existing case reads exactly as before storage existed', () => {
    const cases = [
      [5000, 2000, 4000, 200_000, 6],
      [9000, 1000, 4000, 200_000, 6],
      [1500, 4000, 4000, 200_000, 6],
      [5000, 0, 8000, 10, 6],
      [5000, 0, 8000, 0, 6],
      [5000, 2000, 8000, -1, 6],
      [0, 0, 4000, 200_000, 6],
      [5000, 0, 8000, -50_000, 0],
    ] as const;
    for (const [d, so, c, t, tariff] of cases) {
      const r = noStore(d, so, c, t, tariff);
      expect(r.batterySupplyMp).toBe(0);
      expect(r.chargedMp).toBe(0);
      // The pre-storage formula, inline: deficit after solar, twice bounded.
      const deficit = Math.max(0, d - so);
      const affordable = tariff === 0 ? deficit : t > 0 ? Math.floor((t * 1000) / tariff) : 0;
      const grid = Math.min(deficit, c, affordable);
      const supplied = Math.min(d, so) + grid;
      expect(r.gridSupplyMp).toBe(grid);
      expect(r.coverage).toBe(d === 0 ? FULL : Math.min(FULL, Math.floor((supplied * FULL) / d)));
      expect(r.billMg).toBe(Math.floor((grid * tariff) / 1000));
    }
  });

  it('the store covers the deficit before the grid: nothing billed while it holds enough', () => {
    // draw 50, solar 20, store 40 → battery 30, grid 0.
    const r = resolvePower(50, 20, 40, 100, 100, 200_000, 6);
    expect(r).toEqual({ batterySupplyMp: 30, chargedMp: 0, gridSupplyMp: 0, coverage: FULL, billMg: 0 });
  });

  it('an emptying store hands the rest to the grid under both bounds', () => {
    // draw 50, solar 20, store 12 → battery 12, grid asked for 18.
    const ample = resolvePower(50, 20, 12, 100, 100, 200_000, 6);
    expect(ample).toEqual({ batterySupplyMp: 12, chargedMp: 0, gridSupplyMp: 18, coverage: FULL, billMg: 0 });
    // Tier bound: a 10-unit connection supplies 10 of the 18; 8 unmet.
    const tier = resolvePower(50, 20, 12, 100, 10, 200_000, 6);
    expect(tier.batterySupplyMp).toBe(12);
    expect(tier.gridSupplyMp).toBe(10);
    expect(tier.coverage).toBe(Math.floor((42 * FULL) / 50));
    // Treasury bound: at a tariff of 1000 mg per 1000 mp, 5 mg buys 5 mp.
    const broke = resolvePower(50, 20, 12, 100, 100, 5, 1000);
    expect(broke.batterySupplyMp).toBe(12);
    expect(broke.gridSupplyMp).toBe(5);
    expect(broke.billMg).toBe(5);
  });

  it('a charged store carries a broke tick: full coverage, nothing billed', () => {
    for (const treasury of [0, -1, -50_000]) {
      const r = resolvePower(50, 20, 100, 100, 8000, treasury, 6);
      expect(r).toEqual({ batterySupplyMp: 30, chargedMp: 0, gridSupplyMp: 0, coverage: FULL, billMg: 0 });
    }
  });

  it('a broke tick with an empty store and no solar is coverage zero', () => {
    const r = resolvePower(50, 0, 0, 100, 8000, 0, 6);
    expect(r).toEqual({ batterySupplyMp: 0, chargedMp: 0, gridSupplyMp: 0, coverage: 0, billMg: 0 });
  });

  it('a tick never both charges and discharges', () => {
    for (const draw of [0, 10, 30, 40, 50, 90]) {
      for (const solar of [0, 20, 40, 60]) {
        for (const stored of [0, 5, 10]) {
          const r = resolvePower(draw, solar, stored, 10, 100, 200_000, 6);
          expect(r.chargedMp === 0 || r.batterySupplyMp === 0).toBe(true);
          expect(r.chargedMp).toBeLessThanOrEqual(10 - stored);
          expect(r.batterySupplyMp).toBeLessThanOrEqual(stored);
        }
      }
    }
  });

  it('is pure: the same inputs resolve the same twice and it mutates nothing', () => {
    const a = resolvePower(50, 20, 40, 100, 100, 200_000, 6);
    const b = resolvePower(50, 20, 40, 100, 100, 200_000, 6);
    expect(a).toEqual(b);
  });
});

describe('draw (design D1)', () => {
  it('a tower draws its rating while engaged and the standby share otherwise; walls, panels and batteries nothing', () => {
    const { sim, data } = makeSim(board(100, 0));
    sim.tick([...mount(3, 0), place('wall', 5, 0), place('panel', 7, 0), place('battery', 1, 0)]);
    const [, tower, wall, panel, battery] = sim.state.structures;
    expect(drawOf(tower!, true, data)).toBe(1000);
    expect(drawOf(tower!, false, data)).toBe(100); // 10% standby
    expect(drawOf(wall!, true, data)).toBe(0);
    expect(drawOf(panel!, true, data)).toBe(0);
    expect(drawOf(battery!, true, data)).toBe(0);
    // A battery neither draws nor produces: solar counts panels only.
    expect(solarOf(sim.state.structures, data)).toBe(2000);
    expect(storageCapacityOf(sim.state.structures, data)).toBe(TEST_BATTERY_MP_TICK);
  });

  it('every archetype is rated, slow included, and an upgrade changes the draw', () => {
    const { sim, data } = makeSim(board(100, 0, { treasury: 500 }));
    sim.tick([
      ...mount(1, 0, 'rapid'),
      ...mount(3, 0, 'sniper'),
      ...mount(5, 0, 'area'),
      ...mount(7, 0, 'slow'),
    ]);
    expect(towers(sim).map((s) => drawOf(s, true, data))).toEqual([1000, 1500, 1200, 800]);
    sim.tick([upgrade(1, 0)]);
    expect(drawOf(towers(sim)[0]!, true, data)).toBe(1300);
  });

  it('the sim reads engaged draw off the target pre-pass, standby with nothing in range', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    sim.tick([startWave()]);
    // Nothing in range: standby only.
    expect(sim.power.drawMp).toBe(100);
    injectEnemy(sim, 5, 2);
    sim.tick([]); // fires; engaged the whole tick regardless
    expect(sim.power.drawMp).toBe(1000);
    // Between shots the tower is still engaged: the draw is a state, not a shot.
    sim.tick([]);
    expect(sim.state.tick < towers(sim)[0]!.nextFireTick).toBe(true);
    expect(sim.power.drawMp).toBe(1000);
  });

  it('nothing draws and nothing is billed outside a wave, whatever is engaged', () => {
    const { sim } = makeSim(board(1, 0.12)); // a 1-unit connection: any engaged tower would exceed it
    sim.tick([...mount(3, 0)]);
    const e = injectEnemy(sim, 5, 2);
    const before = sim.state.treasuryMg;
    for (let t = 0; t < 10; t++) sim.tick([]);
    // Build phase: fired at full cadence (two shots by tick 6), no draw, no bill.
    expect(e.hp).toBeLessThan(130 - 8);
    expect(sim.power).toMatchObject({ drawMp: 0, gridSupplyMp: 0, coverage: FULL, billMg: 0 });
    expect(sim.state.treasuryMg).toBe(before);
  });
});

describe('the grid bill (theft-economy / run-lifecycle deltas)', () => {
  it('debits floor(gridSupply × tariff / 1000) each wave tick, before interest', () => {
    // 1% interest per tick makes the ordering plainly visible.
    const { sim } = makeSim(board(100, 0.12, { interest: 0.01 }));
    sim.tick([...mount(3, 0)]); // 146 000 left: the wall's 4g and the rapid's 50g
    injectEnemy(sim, 5, 2);
    sim.tick([startWave()]);
    // Engaged: 1000 mp from the grid at 6 mg per 1000 mp → 6 mg, then 1% on the post-bill balance.
    const postBill = 146_000 - 6;
    expect(sim.power).toMatchObject({ drawMp: 1000, solarMp: 0, gridSupplyMp: 1000, billMg: 6 });
    expect(sim.state.treasuryMg).toBe(postBill + Math.floor(postBill * 0.01));
  });

  it('solar first: with panels covering the draw nothing is billed', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0), place('panel', 6, 0)]); // 2000 mp of solar
    injectEnemy(sim, 5, 2);
    const before = sim.state.treasuryMg;
    sim.tick([startWave()]);
    expect(sim.power).toMatchObject({ drawMp: 1000, solarMp: 2000, gridSupplyMp: 0, billMg: 0, coverage: FULL });
    expect(sim.state.treasuryMg).toBe(before);
    for (let t = 0; t < 20; t++) sim.tick([]);
    expect(sim.state.treasuryMg).toBe(before); // surplus solar has no effect on later ticks either
  });

  it('brings the balance to exactly zero, never below, then supplies nothing', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    injectEnemy(sim, 5, 2, { hp: 100_000 }); // never dies: no bounty ever lands
    sim.tick([startWave()]);
    sim.state.treasuryMg = 12; // enough for exactly two ticks of the engaged draw at 6 mg
    sim.tick([]);
    expect(sim.state.treasuryMg).toBe(6);
    sim.tick([]);
    expect(sim.state.treasuryMg).toBe(0);
    // Broke: cut off, coverage zero, nothing billed, balance holds at zero.
    sim.tick([]);
    expect(sim.power).toMatchObject({ gridSupplyMp: 0, coverage: 0, billMg: 0 });
    expect(sim.state.treasuryMg).toBe(0);
    for (let t = 0; t < 30; t++) sim.tick([]);
    expect(sim.state.treasuryMg).toBe(0);
  });

  it('a partial last tick supplies only the affordable share and lands at zero', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    injectEnemy(sim, 5, 2, { hp: 100_000 });
    sim.tick([startWave()]);
    sim.state.treasuryMg = 3; // half a tick's bill: 500 mp affordable, billed 3 mg
    sim.tick([]);
    expect(sim.power.gridSupplyMp).toBe(500);
    expect(sim.power.coverage).toBe(FULL / 2);
    expect(sim.state.treasuryMg).toBe(0);
  });

  it('cut off at ≤ 0 during a wave; a bounty that brings the balance positive restores supply that tick', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    sim.tick([startWave()]);
    sim.state.treasuryMg = -50;
    const victim = injectEnemy(sim, 5, 2, { hp: 8 }); // one shot kills it — if a shot can land
    sim.tick([]);
    // Broke and no solar: coverage zero, the due tower held, the enemy lives.
    expect(sim.power.coverage).toBe(0);
    expect(victim.hp).toBe(8);
    expect(towers(sim)[0]!.nextFireTick).toBe(0); // did not advance
    // A refund brings the balance positive (the same as any bounty would).
    sim.state.treasuryMg = 6000;
    sim.tick([]);
    expect(sim.power.coverage).toBe(FULL);
    expect(victim.alive).toBe(false); // fired the first tick supply returned
    // …and the bounty raised the post-bill balance further.
    expect(sim.state.treasuryMg).toBe(6000 - 6 + 6000);
  });

  it('a bounty landing in step 8 restores supply from the NEXT tick, not retroactively', () => {
    // Two towers: the first sits at coverage 0 too, so nothing fires while broke.
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0), place('panel', 7, 0)]); // solar 2000: towers keep some coverage
    sim.tick([startWave()]);
    sim.state.treasuryMg = 0;
    const victim = injectEnemy(sim, 5, 2, { hp: 8 });
    sim.tick([]);
    // Solar alone: 2000 ≥ 1000 draw → full coverage even while broke; the kill lands.
    expect(sim.power).toMatchObject({ gridSupplyMp: 0, coverage: FULL, billMg: 0 });
    expect(victim.alive).toBe(false);
    expect(sim.state.treasuryMg).toBe(6000);
  });

  it('charges nothing on the settlement tick and nothing in the build phase that follows', () => {
    const { sim } = makeSim(board(100, 0.12, { waves: [trivialWave(), trivialWave()] }));
    sim.tick([...mount(3, 0)]);
    sim.tick([startWave()]); // spawns the runner at (0,2), out of range: standby 100 mp → 0 mg (floor)
    expect(sim.power.billMg).toBe(0);
    injectEnemy(sim, 5, 2, { hp: 4 }); // engaged AND killed this tick…
    sim.state.enemies[0]!.hp = 0; // …and the parked runner dies too: the wave drains
    const before = sim.state.treasuryMg;
    sim.tick([]);
    expect(sim.state.runPhase).toBe('build');
    // Two bounties, no bill despite an engaged tick.
    expect(sim.state.treasuryMg).toBe(before + 2 * 6000);
    expect(sim.power.billMg).toBe(0);
    injectEnemy(sim, 5, 2, { hp: 100_000 });
    for (let t = 0; t < 10; t++) sim.tick([]);
    expect(sim.state.treasuryMg).toBe(before + 2 * 6000);
  });

  it('a standby draw below one tariff quantum bills zero, not a negative or a float', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    sim.tick([startWave()]);
    // standby 100 mp × 6 / 1000 = 0.6 → 0
    expect(sim.power).toMatchObject({ drawMp: 100, gridSupplyMp: 100, billMg: 0 });
    expect(Number.isInteger(sim.state.treasuryMg)).toBe(true);
  });
});

describe('coverage and brownout (tower-combat delta, design D2/D3)', () => {
  it('full coverage is today\'s cadence exactly', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    const e = injectEnemy(sim, 5, 2);
    sim.tick([startWave()]);
    expect(sim.power.coverage).toBe(FULL);
    expect(e.hp).toBe(122);
    expect(towers(sim)[0]!.nextFireTick).toBe(1 + 5);
  });

  it('half coverage doubles the interval; the shot due now still lands now', () => {
    // Two rapids engaged draw 2000; a 1-unit connection supplies 1000 → coverage ½.
    const { sim } = makeSim(board(1, 0.12));
    sim.tick([...mount(3, 0), ...mount(6, 0)]);
    const e = injectEnemy(sim, 5, 2, { hp: 1000 });
    sim.tick([startWave()]);
    expect(sim.power.coverage).toBe(FULL / 2);
    expect(e.hp).toBe(1000 - 16); // both fired this tick
    expect(towers(sim).map((s) => s.nextFireTick)).toEqual([1 + 10, 1 + 10]);
    for (let t = 0; t < 9; t++) sim.tick([]);
    expect(e.hp).toBe(1000 - 16);
    sim.tick([]);
    expect(e.hp).toBe(1000 - 32);
  });

  it('coverage zero holds fire without advancing the due tick, then fires on the first tick with supply', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0)]);
    sim.tick([startWave()]);
    sim.state.treasuryMg = 0;
    const e = injectEnemy(sim, 5, 2);
    for (let t = 0; t < 5; t++) {
      sim.tick([]);
      expect(sim.power.coverage).toBe(0);
      expect(e.hp).toBe(130);
      expect(towers(sim)[0]!.nextFireTick).toBe(0);
    }
    sim.state.treasuryMg = 100_000;
    sim.tick([]);
    expect(e.hp).toBe(122);
    expect(towers(sim)[0]!.nextFireTick).toBe(sim.state.tick - 1 + 5);
  });

  it('a slow tower stretches its reapplication cadence, never its duration', () => {
    // A slow (800) and a rapid (1000) engaged against a 0.9-unit connection:
    // coverage = floor(900 × 1024 / 1800) = 512 = ½.
    const { sim } = makeSim(board(0.9, 0.12));
    sim.tick([...mount(3, 0, 'slow'), ...mount(6, 0)]);
    const e = injectEnemy(sim, 5, 2, { hp: 1000 });
    sim.tick([startWave()]);
    expect(sim.power.coverage).toBe(FULL / 2);
    expect(e.slowUntil).toBe(1 + 30); // the full authored duration
    expect(towers(sim)[0]!.nextFireTick).toBe(1 + 20); // interval 10 → 20
  });

  it('full cadence resumes the tick coverage returns to 1', () => {
    const { sim } = makeSim(board(1, 0.12));
    sim.tick([...mount(3, 0), ...mount(6, 0)]);
    const e = injectEnemy(sim, 5, 2, { hp: 1000 });
    sim.tick([startWave()]); // both fire at coverage ½: next due at 11
    expect(towers(sim).map((s) => s.nextFireTick)).toEqual([11, 11]);
    sim.tick([upgradeGrid()]); // tier 2: 4 units — enough for both
    while (sim.state.tick < 11) sim.tick([]);
    expect(sim.power.coverage).toBe(FULL);
    expect(e.hp).toBe(1000 - 16); // nothing due until 11
    sim.tick([]); // tick 11
    // The shots due at 11 land at 11 (their delay was fixed when they fired),
    // and from here the cadence is the authored 5 again.
    expect(e.hp).toBe(1000 - 32);
    expect(towers(sim).map((s) => s.nextFireTick)).toEqual([16, 16]);
  });

  it('peak, brownout, recovery across a burst: towers slow while the peak lasts and recover as it thins', () => {
    // Three rapids (3000 engaged) on a 2-unit connection. A burst engages all
    // three; as they die and the survivors move out of some ranges, the draw
    // falls back under the ceiling.
    const { sim } = makeSim(board(2, 0.12));
    sim.tick([...mount(1, 0), ...mount(4, 0), ...mount(7, 0)]);
    sim.tick([startWave()]);
    // Quiet: standby only, full coverage.
    expect(sim.power.coverage).toBe(FULL);
    // The burst: an enemy in every tower's range at once.
    const a = injectEnemy(sim, 1, 2, { hp: 40 });
    const b = injectEnemy(sim, 4, 2, { hp: 40 });
    const c = injectEnemy(sim, 7, 2, { hp: 40 });
    sim.tick([]);
    expect(sim.power.drawMp).toBe(3000);
    expect(sim.power.coverage).toBe(Math.floor((2000 * FULL) / 3000));
    const brownedOut = sim.power.coverage;
    // Every tower fired (the shot due lands), each rescheduled at the stretched interval.
    expect([a.hp, b.hp, c.hp]).toEqual([32, 32, 32]);
    const stretched = stretchedInterval(5, brownedOut);
    const firedAt = sim.state.tick - 1;
    expect(towers(sim).every((s) => s.nextFireTick === firedAt + stretched)).toBe(true);
    // Thin the burst: two die, the draw falls to 1000 + 200 standby, under capacity.
    a.hp = 0;
    b.hp = 0;
    sim.tick([]);
    sim.tick([]);
    expect(sim.power.drawMp).toBe(1000 + 2 * 100);
    expect(sim.power.coverage).toBe(FULL);
  });

  it('overbuilding is allowed: placement never refuses for lack of power', () => {
    const { sim } = makeSim(board(1, 0.12, { treasury: 500 }));
    sim.tick([...mount(1, 0), ...mount(3, 0), ...mount(5, 0), ...mount(7, 0)]);
    expect(towers(sim)).toHaveLength(4);
    expect(sim.previewPlacement('tower', 2, 4, true)).toBe('ok');
  });

  it('coverage is derived, not stored: two runs agree on it at every tick, and it is not in the hash', () => {
    const run = () => {
      const { sim } = makeSim(board(1, 0.12));
      sim.tick([...mount(3, 0), ...mount(6, 0)]);
      injectEnemy(sim, 5, 2, { hp: 1000 });
      sim.tick([startWave()]);
      return sim;
    };
    const a = run();
    const b = run();
    for (let t = 0; t < 30; t++) {
      a.tick([]);
      b.tick([]);
      expect(a.power).toEqual(b.power);
      expect(a.hash()).toBe(b.hash());
    }
  });
});

describe('panels in play (power-grid spec)', () => {
  it('enemies ignore panels: output is unchanged with an enemy walking past', () => {
    const { sim } = makeSim(board(100, 0.12), testBalance({ speed: 100 }));
    sim.tick([place('panel', 3, 1)]);
    sim.tick([startWave()]);
    injectEnemy(sim, 2, 2, { speed: 100 });
    for (let t = 0; t < 40; t++) {
      sim.tick([]);
      expect(sim.power.solarMp).toBe(2000);
    }
    expect(sim.state.structures[0]!.kind).toBe('panel');
  });

  it('a removed panel stops contributing the tick it goes', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([place('panel', 3, 0), place('panel', 5, 0)]);
    sim.tick([startWave()]);
    expect(sim.power.solarMp).toBe(4000);
    // Placed during the wave (provisional) then sold: fine mid-wave.
    sim.commit([place('panel', 7, 0)]);
    sim.advance();
    expect(sim.power.solarMp).toBe(6000);
    // Committed now — cannot be sold until the wave ends; a provisional one could.
    sim.commit([remove(7, 0)]);
    expect(sim.state.structures).toHaveLength(3);
  });
});

// The pooled store in play (add-battery design D2/D4, power-grid delta): one
// hashed quantity, capacity derived from the standing batteries, moved only
// by step 7 of a wave tick — the settlement tick included — and clamped when
// a battery is sold.
describe('the store in play (add-battery)', () => {
  /** A tower on a wall, a panel, and a battery on the lane board. */
  const withBattery = (capacity: number, tariff: number, extra: Parameters<typeof board>[2] = {}) => {
    const { sim, data } = makeSim(board(capacity, tariff, extra));
    sim.tick([...mount(3, 0), place('panel', 7, 0), place('battery', 1, 0)]);
    return { sim, data };
  };

  it('surplus on a quiet tick charges the store by the surplus; it persists tick to tick', () => {
    const { sim } = withBattery(100, 0.12);
    sim.tick([startWave()]);
    // Standby 100 against solar 2000: surplus 1900 a tick, all of it stored.
    expect(sim.power).toMatchObject({ drawMp: 100, solarMp: 2000, chargedMp: 1900, batterySupplyMp: 0 });
    expect(sim.state.storedMpTick).toBe(1900);
    expect(sim.power.storedMpTick).toBe(1900);
    expect(sim.power.storageCapacityMpTick).toBe(TEST_BATTERY_MP_TICK);
    sim.tick([]);
    expect(sim.state.storedMpTick).toBe(3800);
  });

  it('fills to capacity and then wastes: the store never exceeds capacity', () => {
    const { sim } = withBattery(100, 0.12);
    sim.tick([startWave()]);
    // 1900 a tick into 200 000: full after ceil(200000/1900) = 106 ticks.
    for (let t = 0; t < 120; t++) {
      sim.tick([]);
      expect(sim.state.storedMpTick).toBeLessThanOrEqual(TEST_BATTERY_MP_TICK);
    }
    expect(sim.state.storedMpTick).toBe(TEST_BATTERY_MP_TICK);
    expect(sim.power.chargedMp).toBe(0);
    expect(sim.state.ledger.solarWastedMp).toBeGreaterThan(0);
  });

  it('a charged store holds coverage at full through an over-capacity peak and drains by the deficit', () => {
    // A 1-unit connection with two rapids: engaged draw 2000 > 1000 + 0 (no panel here).
    const { sim } = makeSim(board(1, 0.12));
    sim.tick([...mount(3, 0), ...mount(6, 0), place('battery', 1, 0)]);
    sim.tick([startWave()]);
    sim.state.storedMpTick = 5000; // set after the start tick's standby draw
    const e = injectEnemy(sim, 5, 2, { hp: 100_000 });
    sim.tick([]);
    // Deficit 2000; the store covers all of it before the grid is asked.
    expect(sim.power).toMatchObject({ drawMp: 2000, batterySupplyMp: 2000, gridSupplyMp: 0, coverage: FULL, billMg: 0 });
    expect(sim.state.storedMpTick).toBe(3000);
    sim.tick([]);
    expect(sim.state.storedMpTick).toBe(1000);
    // The emptying tick: 1000 from the store, the grid's 1000 for the rest → full still.
    sim.tick([]);
    expect(sim.power).toMatchObject({ batterySupplyMp: 1000, gridSupplyMp: 1000, coverage: FULL, billMg: 6 });
    expect(sim.state.storedMpTick).toBe(0);
    // Empty: the brownout begins.
    sim.tick([]);
    expect(sim.power).toMatchObject({ batterySupplyMp: 0, gridSupplyMp: 1000, coverage: FULL / 2 });
    expect(e.alive).toBe(true);
  });

  it('the store is unaffected by the balance: a broke tick discharges like any other', () => {
    const { sim } = withBattery(100, 0.12);
    sim.tick([startWave()]);
    sim.state.treasuryMg = 0;
    sim.state.storedMpTick = 10_000;
    // Without the panel the engaged 1000 is all deficit, and the balance is nil.
    sim.state.structures = sim.state.structures.filter((s) => s.kind !== 'panel');
    injectEnemy(sim, 5, 2, { hp: 100_000 });
    sim.tick([]);
    expect(sim.power).toMatchObject({ drawMp: 1000, solarMp: 0, batterySupplyMp: 1000, gridSupplyMp: 0, coverage: FULL, billMg: 0 });
    expect(sim.state.storedMpTick).toBe(9000);
    expect(sim.state.treasuryMg).toBe(0);
  });

  it('the store persists across settlement and the build phase: nothing moves outside a wave', () => {
    const { sim } = withBattery(100, 0.12, { waves: [trivialWave(), trivialWave()] });
    sim.tick([startWave()]); // the runner spawns parked at (0,2); standby 100, surplus 1900
    expect(sim.state.storedMpTick).toBe(1900);
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]); // the settlement tick: supply resolves, the store moves once more
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.storedMpTick).toBe(3800);
    // The readout reads idle but keeps the reserve.
    expect(sim.power).toMatchObject({
      drawMp: 0,
      chargedMp: 0,
      batterySupplyMp: 0,
      storedMpTick: 3800,
      storageCapacityMpTick: TEST_BATTERY_MP_TICK,
    });
    injectEnemy(sim, 5, 2, { hp: 100_000 }); // engaged through the build phase
    for (let t = 0; t < 20; t++) sim.tick([]);
    expect(sim.state.storedMpTick).toBe(3800);
    expect(sim.power.storedMpTick).toBe(3800);
    // The next wave starts with the reserve.
    sim.tick([startWave()]);
    expect(sim.power.batterySupplyMp).toBe(0); // solar 2000 still covers the engaged 1000
    expect(sim.state.storedMpTick).toBe(3800 + 1000);
  });

  it('a battery placed mid-wave enlarges capacity from that tick and fills from the next surplus', () => {
    const { sim } = makeSim(board(100, 0.12));
    sim.tick([...mount(3, 0), place('panel', 7, 0)]);
    sim.tick([startWave()]);
    // No battery: the surplus is wasted, the store stays empty.
    expect(sim.power).toMatchObject({ chargedMp: 0, storedMpTick: 0, storageCapacityMpTick: 0 });
    expect(sim.state.storedMpTick).toBe(0);
    sim.tick([place('battery', 1, 0)]);
    expect(sim.power.storageCapacityMpTick).toBe(TEST_BATTERY_MP_TICK);
    expect(sim.power.chargedMp).toBe(1900);
    expect(sim.state.storedMpTick).toBe(1900);
  });

  it('a second battery doubles the capacity; selling one clamps the store in the build phase', () => {
    const { sim } = withBattery(100, 0.12, { waves: [trivialWave(), trivialWave()] });
    sim.tick([place('battery', 5, 0)]);
    sim.tick([startWave()]);
    expect(sim.power.storageCapacityMpTick).toBe(2 * TEST_BATTERY_MP_TICK);
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]); // settles
    sim.state.storedMpTick = TEST_BATTERY_MP_TICK + 60_000; // 13 kWh of 20
    sim.tick([remove(5, 0)]);
    expect(sim.state.storedMpTick).toBe(TEST_BATTERY_MP_TICK);
    expect(sim.power.storedMpTick).toBe(TEST_BATTERY_MP_TICK);
    expect(sim.power.storageCapacityMpTick).toBe(TEST_BATTERY_MP_TICK);
  });

  it('the store is hashed and derived figures are not: two runs agree tick for tick', () => {
    const run = () => {
      const { sim } = withBattery(1, 0.12);
      sim.tick([...mount(6, 0)]);
      injectEnemy(sim, 5, 2, { hp: 100_000 });
      sim.tick([startWave()]);
      return sim;
    };
    const a = run();
    const b = run();
    for (let t = 0; t < 40; t++) {
      a.tick([]);
      b.tick([]);
      expect(a.power).toEqual(b.power);
      expect(a.hash()).toBe(b.hash());
    }
    // And a store that differs is a hash that differs.
    a.state.storedMpTick += 1;
    expect(a.hash()).not.toBe(b.hash());
  });
});
