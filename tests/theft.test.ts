// See ARCHITECTURE.md §12 and the phase-4 theft-economy spec
import { describe, expect, it } from 'vitest';
import { effectiveSpeed } from '../src/sim/enemy';
import { returnSacks } from '../src/sim/economy';
import { tileCentre } from '../src/sim/fixed';
import { injectEnemy, makeSim, openLevel, spawnCmd, testBalance } from './helpers';

// A short straight corridor: spawn (0,1) → treasury (6,1).
const corridor = () => openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 });

describe('treasury grab', () => {
  it('grabs full capacity from a rich treasury and flips to returning', () => {
    const { sim } = makeSim(corridor());
    const e = injectEnemy(sim, 6, 1); // parked on the treasury
    sim.tick([]);
    expect(sim.state.treasuryMg).toBe(175_000);
    expect(e.carriedMg).toBe(25_000);
    expect(e.mode).toBe('returning');
    expect(sim.state.stolenMg).toBe(25_000);
  });

  it('overdraws a poor treasury: the grab is always full capacity', () => {
    const { sim } = makeSim(corridor());
    sim.state.treasuryMg = 20_000;
    const e = injectEnemy(sim, 6, 1);
    sim.tick([]);
    expect(sim.state.treasuryMg).toBe(-5000);
    expect(e.carriedMg).toBe(25_000);
    expect(e.mode).toBe('returning');
  });

  it('an empty or negative treasury still bleeds the full grab', () => {
    for (const [balance, after] of [
      [0, -25_000],
      [-50_000, -75_000],
    ] as const) {
      const { sim } = makeSim(corridor());
      sim.state.treasuryMg = balance;
      const e = injectEnemy(sim, 6, 1);
      sim.tick([]);
      expect(sim.state.treasuryMg).toBe(after);
      expect(e.carriedMg).toBe(25_000);
      expect(e.mode).toBe('returning');
      expect(e.alive).toBe(true); // never a despawn at the treasury
    }
  });

  it('intercepting an overdrawing carrier makes the raid recoverable', () => {
    const { sim } = makeSim(corridor());
    sim.state.treasuryMg = 10_000;
    const e = injectEnemy(sim, 6, 1);
    sim.tick([]); // grab: treasury −15 000, carrier holds 25 000
    expect(sim.state.treasuryMg).toBe(-15_000);
    e.hp = 0; // intercepted before escaping
    sim.tick([]);
    expect(sim.state.sacks).toHaveLength(1);
    expect(sim.state.sacks[0]!.amountMg).toBe(25_000);
    // Settlement's sack return recovers the raid (minus nothing here).
    const bounty = 6000; // the kill credited the runner bounty
    returnSacks(sim.state);
    expect(sim.state.treasuryMg).toBe(-15_000 + bounty + 25_000);
  });
});

describe('carrier speed', () => {
  it('is 80% via integer math when carrying, full when not', () => {
    const { sim } = makeSim(corridor(), testBalance({ speed: 128 }));
    const carrier = injectEnemy(sim, 3, 1, { speed: 128, carriedMg: 25_000 });
    const empty = injectEnemy(sim, 3, 0, { speed: 128 });
    expect(effectiveSpeed(carrier, sim.state.tick, 55)).toBe(102); // trunc(128 * 4 / 5)
    expect(effectiveSpeed(empty, sim.state.tick, 55)).toBe(128);
  });

  it('a full round trip: steal at the treasury, walk back slower, escape at the spawn', () => {
    const { sim } = makeSim(corridor(), testBalance({ speed: 128 }));
    // March one commanded spawn to the treasury (the debug timer is gone).
    sim.tick([spawnCmd('runner')]);
    let guard = 0;
    while (sim.state.enemies.every((e) => e.mode === 'inbound') && guard++ < 500) sim.tick([]);
    const carrier = sim.state.enemies.find((e) => e.mode === 'returning')!;
    expect(carrier).toBeDefined();
    expect(carrier.carriedMg).toBe(25_000);

    // On the straight return stretch it covers exactly 102 units per tick.
    sim.tick([]);
    const before = carrier.pos.x;
    sim.tick([]);
    expect(before - carrier.pos.x).toBe(102);

    // It escapes at the spawn and the gold never comes back.
    const stolen = sim.state.treasuryMg;
    guard = 0;
    while (sim.state.enemies.some((e) => e.id === carrier.id) && guard++ < 500) sim.tick([]);
    expect(sim.state.enemies.some((e) => e.id === carrier.id)).toBe(false);
    expect(sim.state.escapedMg).toBe(25_000);
    expect(sim.state.treasuryMg).toBe(stolen);
  });
});

describe('gold sacks', () => {
  it('a swarm splits a large sack across successive ticks', () => {
    const { sim } = makeSim(corridor(), testBalance({ carryCapacity: 40 }));
    sim.state.sacks.push({ id: sim.state.nextSackId++, tx: 3, ty: 1, amountMg: 100_000 });

    const first = injectEnemy(sim, 3, 1);
    sim.tick([]);
    expect(first.carriedMg).toBe(40_000);
    expect(sim.state.sacks[0]!.amountMg).toBe(60_000);

    // Move the sated carrier off and march the next one on.
    first.pos.x = tileCentre(5);
    const second = injectEnemy(sim, 3, 1);
    sim.tick([]);
    expect(second.carriedMg).toBe(40_000);
    expect(sim.state.sacks[0]!.amountMg).toBe(20_000);

    second.pos.x = tileCentre(5);
    const third = injectEnemy(sim, 3, 1);
    sim.tick([]);
    expect(third.carriedMg).toBe(20_000);
    expect(sim.state.sacks).toHaveLength(0); // drained sacks are removed
  });

  it('same-tick contention resolves by insertion order', () => {
    const { sim } = makeSim(corridor());
    sim.state.sacks.push({ id: sim.state.nextSackId++, tx: 3, ty: 1, amountMg: 30_000 });
    const earlier = injectEnemy(sim, 3, 1);
    const later = injectEnemy(sim, 3, 1);
    sim.tick([]);
    expect(earlier.carriedMg).toBe(25_000);
    expect(later.carriedMg).toBe(5000);
    expect(sim.state.sacks).toHaveLength(0);
  });

  it('an inbound enemy that picks up any gold flips to returning that tick', () => {
    const { sim } = makeSim(corridor());
    sim.state.sacks.push({ id: sim.state.nextSackId++, tx: 3, ty: 1, amountMg: 1000 });
    const e = injectEnemy(sim, 3, 1);
    expect(e.mode).toBe('inbound');
    sim.tick([]);
    expect(e.carriedMg).toBe(1000);
    expect(e.mode).toBe('returning');
  });

  it('a returning enemy tops up from a sack without flipping back', () => {
    const { sim } = makeSim(corridor());
    sim.state.sacks.push({ id: sim.state.nextSackId++, tx: 3, ty: 1, amountMg: 30_000 });
    const e = injectEnemy(sim, 3, 1, { mode: 'returning', carriedMg: 20_000 });
    sim.tick([]);
    expect(e.carriedMg).toBe(25_000); // capped at capacity
    expect(e.mode).toBe('returning');
    expect(sim.state.sacks[0]!.amountMg).toBe(25_000);
  });
});

describe('spawn escape', () => {
  it('removes the enemy and its gold permanently', () => {
    const { sim } = makeSim(corridor());
    injectEnemy(sim, 0, 1, { mode: 'returning', carriedMg: 25_000 });
    const balance = sim.state.treasuryMg;
    sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    // The escaped gold is not credited then or by any later mechanism.
    for (let t = 0; t < 100; t++) sim.tick([]);
    expect(sim.state.treasuryMg).toBe(balance);
    expect(sim.state.sacks).toHaveLength(0);
  });

  it('does not remove inbound enemies standing on the spawn', () => {
    const { sim } = makeSim(corridor());
    const e = injectEnemy(sim, 0, 1, { mode: 'inbound' });
    sim.tick([]);
    expect(e.alive).toBe(true);
  });
});
