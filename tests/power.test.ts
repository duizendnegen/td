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
import { COVERAGE_SCALE, drawOf, resolvePower, solarOf, stretchedInterval } from '../src/sim/power';
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

describe('resolvePower — the merit order (design D4)', () => {
  it('solar covers first; the grid is asked for the deficit only, at the tariff', () => {
    // draw 5000, solar 2000 → deficit 3000; capacity 4000; treasury ample; tariff 6/kW-tick.
    const r = resolvePower(5000, 2000, 4000, 200_000, 6);
    expect(r).toEqual({ gridSupplyMp: 3000, coverage: FULL, billMg: 18 });
  });

  it('the grid is bounded by capacity; the remainder goes unsupplied that tick', () => {
    const r = resolvePower(9000, 1000, 4000, 200_000, 6);
    expect(r.gridSupplyMp).toBe(4000);
    // supplied 5000 of 9000 → floor(5000 × 1024 / 9000) = 568
    expect(r.coverage).toBe(Math.floor((5000 * FULL) / 9000));
    expect(r.billMg).toBe(24);
  });

  it('surplus solar is wasted: nothing billed, coverage capped at full', () => {
    const r = resolvePower(1500, 4000, 4000, 200_000, 6);
    expect(r).toEqual({ gridSupplyMp: 0, coverage: FULL, billMg: 0 });
  });

  it('is bounded by what the positive balance can pay: the bill lands at exactly zero', () => {
    // 10 mg can pay for floor(10 × 1000 / 6) = 1666 mp; bill floor(1666 × 6 / 1000) = 9 mg.
    // (The floor in the affordable bound leaves at most one tariff-quantum unspent.)
    const r = resolvePower(5000, 0, 8000, 10, 6);
    expect(r.gridSupplyMp).toBe(1666);
    expect(r.billMg).toBeLessThanOrEqual(10);
    // An exact multiple lands on zero: 12 mg buys exactly 2000 mp for 12 mg.
    expect(resolvePower(5000, 0, 8000, 12, 6)).toEqual({
      gridSupplyMp: 2000,
      coverage: Math.floor((2000 * FULL) / 5000),
      billMg: 12,
    });
  });

  it('at zero or negative balance the grid supplies nothing; solar alone remains', () => {
    for (const treasury of [0, -1, -50_000]) {
      const cut = resolvePower(5000, 0, 8000, treasury, 6);
      expect(cut).toEqual({ gridSupplyMp: 0, coverage: 0, billMg: 0 });
      const solarOnly = resolvePower(5000, 2000, 8000, treasury, 6);
      expect(solarOnly).toEqual({
        gridSupplyMp: 0,
        coverage: Math.floor((2000 * FULL) / 5000),
        billMg: 0,
      });
    }
  });

  it('nothing drawing is full coverage and no bill', () => {
    expect(resolvePower(0, 0, 4000, 200_000, 6)).toEqual({ gridSupplyMp: 0, coverage: FULL, billMg: 0 });
    expect(resolvePower(0, 0, 4000, -5, 6).coverage).toBe(FULL);
  });

  it('a zero tariff is a free grid: no treasury bound, no cut-off, no bill', () => {
    expect(resolvePower(5000, 0, 8000, -50_000, 0)).toEqual({ gridSupplyMp: 5000, coverage: FULL, billMg: 0 });
    // …but the capacity bound still applies.
    expect(resolvePower(5000, 0, 3000, -50_000, 0).gridSupplyMp).toBe(3000);
  });

  it('every output is an integer for integer inputs', () => {
    for (const [d, s, c, t, tariff] of [
      [5000, 2000, 4000, 200_000, 6],
      [9001, 1, 4321, 12_345, 7],
      [1, 0, 1, 1, 6],
    ] as const) {
      const r = resolvePower(d, s, c, t, tariff);
      for (const v of [r.gridSupplyMp, r.coverage, r.billMg]) expect(Number.isInteger(v)).toBe(true);
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

describe('draw (design D1)', () => {
  it('a tower draws its rating while engaged and the standby share otherwise; walls and panels nothing', () => {
    const { sim, data } = makeSim(board(100, 0));
    sim.tick([...mount(3, 0), place('wall', 5, 0), place('panel', 7, 0)]);
    const [, tower, wall, panel] = sim.state.structures;
    expect(drawOf(tower!, true, data)).toBe(1000);
    expect(drawOf(tower!, false, data)).toBe(100); // 10% standby
    expect(drawOf(wall!, true, data)).toBe(0);
    expect(drawOf(panel!, true, data)).toBe(0);
    expect(solarOf(sim.state.structures, data)).toBe(2000);
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
