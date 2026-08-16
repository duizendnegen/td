// See ARCHITECTURE.md §12 and the phase-3 tower-upgrades spec
import { describe, expect, it } from 'vitest';
import type { Sim } from '../src/sim/sim';
import { injectEnemy, makeSim, mount, openLevel, place, remove, testBalance, upgrade } from './helpers';

// 9×5 board, lane on row 2. Test-balance rapid ladder: 50/85/145 gold,
// damage 8/11/15, interval 5/4/3. Every tower stands on a wall
// (build-over-walls), so the tower is the tile's second structure.
const board = () => openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 });

function withTower(): Sim {
  const { sim } = makeSim(board(), testBalance(), 42);
  sim.tick(mount(3, 0));
  return sim;
}

/** The one tower on the board. */
const tower = (sim: Sim) => sim.state.structures.find((s) => s.kind === 'tower')!;

describe('tower upgrades', () => {
  it('applies the new level stats and the charge in the same tick', () => {
    const sim = withTower();
    const before = sim.state.treasuryMg;
    sim.tick([upgrade(3, 0)]);
    const t = tower(sim);
    expect(t.level).toBe(2);
    expect(sim.state.treasuryMg).toBe(before - 85_000);
    // The level-2 stats govern the very next shot: damage 11.
    const e = injectEnemy(sim, 5, 2);
    sim.tick([]);
    expect(e.hp).toBe(130 - 11);
  });

  it('upgrade stats come from balance data with no code change', () => {
    const tuned = testBalance();
    (tuned as { towers: { rapid: { levels: { damage: number }[] } } }).towers.rapid.levels[1]!.damage = 99;
    const { sim } = makeSim(board(), tuned, 42);
    sim.tick(mount(3, 0));
    sim.tick([upgrade(3, 0)]);
    const e = injectEnemy(sim, 5, 2);
    sim.tick([]);
    expect(e.hp).toBe(130 - 99);
  });

  it('debt blocks upgrades atomically: post-tick hash equals the run without the attempt', () => {
    const build = () => {
      const { sim } = makeSim(board(), testBalance(), 42);
      // 200g start: three mounted towers (54g each) and a wall leave 34g; the
      // fourth mount's wall leaves 30g and its tower dives into debt at −20g,
      // where every further purchase is blocked.
      sim.tick([...mount(3, 0), ...mount(5, 0), ...mount(7, 0), place('wall', 1, 0)]);
      sim.tick(mount(1, 4));
      expect(sim.state.treasuryMg).toBe(-20_000);
      return sim;
    };
    const withAttempt = build();
    const without = build();
    withAttempt.tick([upgrade(3, 0)]);
    without.tick([]);
    expect(tower(withAttempt).level).toBe(1);
    for (let t = 0; t < 10; t++) {
      withAttempt.tick([]);
      without.tick([]);
    }
    expect(withAttempt.hash()).toBe(without.hash());
  });

  it('max level is terminal: the third upgrade command is rejected with no state change', () => {
    const sim = withTower();
    sim.tick([upgrade(3, 0)]);
    sim.tick([upgrade(3, 0)]);
    expect(tower(sim).level).toBe(3);
    const balanceBefore = sim.state.treasuryMg;
    const hashBefore = () => {
      const probe = withTower();
      probe.tick([upgrade(3, 0)]);
      probe.tick([upgrade(3, 0)]);
      probe.tick([]);
      return probe;
    };
    sim.tick([upgrade(3, 0)]);
    expect(tower(sim).level).toBe(3);
    expect(sim.state.treasuryMg).toBe(balanceBefore);
    expect(sim.hash()).toBe(hashBefore().hash());
  });

  it('a removed tower cannot be upgraded: there is nothing there to upgrade', () => {
    const sim = withTower();
    sim.tick([remove(3, 0)]); // peels the tower; the bare wall stands
    expect(sim.state.structures.map((s) => s.kind)).toEqual(['wall']);
    const before = sim.state.treasuryMg;
    sim.tick([upgrade(3, 0)]); // a wall is not upgradable
    expect(sim.state.structures.map((s) => s.kind)).toEqual(['wall']);
    expect(sim.state.treasuryMg).toBe(before);
  });

  it('the removal refund reads total invested: base plus upgrades, halved', () => {
    const sim = withTower();
    sim.tick([upgrade(3, 0)]); // 50 + 85 invested
    expect(tower(sim).paidMg).toBe(135_000);
    // Halving is the COMMITTED rate: a wave tick clears the provisional flag
    // (exercised in placement.test.ts, where a provisional tower's upgrades
    // return in full). Set by fiat here so the arithmetic stays the subject.
    tower(sim).provisional = false;
    const beforeRemoval = sim.state.treasuryMg;
    sim.tick([remove(3, 0)]); // peels the tower; the wall keeps its own books
    expect(sim.state.structures.map((s) => s.kind)).toEqual(['wall']);
    // 50% of 135, not 50% of 50 — credited in the removal's own tick.
    expect(sim.state.treasuryMg).toBe(beforeRemoval + 67_500);
  });

  it('upgrade timing diverges the hash from the upgrade tick onward', () => {
    // An engaged enemy makes the divergence stick: the level-2 fire interval
    // and damage shift the whole rest of the fight, not just the ledger.
    const run = (upgradeTick: number, sampleTick: number): number => {
      const sim = withTower();
      injectEnemy(sim, 5, 2);
      while (sim.state.tick < sampleTick) {
        sim.tick(sim.state.tick === upgradeTick ? [upgrade(3, 0)] : []);
      }
      return sim.hash();
    };
    // Identical before the earlier upgrade tick…
    expect(run(10, 9)).toBe(run(20, 9));
    // …diverged once only one run has upgraded, and still diverged long after
    // both have (the fight resolved on different ticks).
    expect(run(10, 15)).not.toBe(run(20, 15));
    expect(run(10, 200)).not.toBe(run(20, 200));
  });
});
