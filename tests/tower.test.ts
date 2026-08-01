// See ARCHITECTURE.md §12 and the phase-2 tower-combat spec
import { describe, expect, it } from 'vitest';
import { injectEnemy, makeSim, openLevel, place } from './helpers';

// 9×5 board, lane on row 2; the tower's 2×2 sits on rows 0–1 above it.
const board = () => openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 });

describe('rapid-fire tower', () => {
  it('targets the in-range enemy furthest along its path (minimal inbound cost)', () => {
    const { sim } = makeSim(board());
    sim.tick([place('tower', 3, 0)]);
    const behind = injectEnemy(sim, 2, 2); // higher inbound cost (further from treasury)
    const ahead = injectEnemy(sim, 5, 2); // lower inbound cost
    sim.tick([]);
    expect(ahead.hp).toBe(122); // 130 − 8
    expect(behind.hp).toBe(130);
  });

  it('breaks inbound-cost ties by insertion order', () => {
    const { sim } = makeSim(board());
    sim.tick([place('tower', 3, 0)]);
    const earlier = injectEnemy(sim, 5, 2);
    const later = injectEnemy(sim, 5, 2); // same tile → identical inbound cost
    sim.tick([]);
    expect(earlier.hp).toBe(122);
    expect(later.hp).toBe(130);
  });

  it('ignores enemies out of range', () => {
    const { sim } = makeSim(openLevel(12, 5, { x: 0, y: 2 }, { x: 11, y: 2 }));
    sim.tick([place('tower', 0, 0)]); // centre (1,1); range 3.5 tiles
    const far = injectEnemy(sim, 9, 2);
    for (let t = 0; t < 10; t++) sim.tick([]);
    expect(far.hp).toBe(130);
  });

  it('applies damage on the firing tick and then respects the fire interval', () => {
    const { sim } = makeSim(board());
    sim.tick([place('tower', 3, 0)]);
    const e = injectEnemy(sim, 5, 2);
    sim.tick([]); // fires immediately (nextFireTick 0)
    expect(e.hp).toBe(122);
    const tower = sim.state.structures[0]!;
    expect(tower.nextFireTick).toBe(sim.state.tick - 1 + 5);
    // Four quiet ticks, then the next shot on the fifth.
    for (let t = 0; t < 4; t++) sim.tick([]);
    expect(e.hp).toBe(122);
    sim.tick([]);
    expect(e.hp).toBe(114);
  });

  it('credits the bounty when a kill lands', () => {
    const { sim } = makeSim(board());
    sim.tick([place('tower', 3, 0)]);
    const afterTower = sim.state.treasuryMg;
    injectEnemy(sim, 5, 2, { hp: 8 }); // dies to one shot
    sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterTower + 6000);
    expect(sim.state.sacks).toHaveLength(0); // no gold carried, no sack
  });

  it('a killed carrier drops its gold as a sack on its death tile', () => {
    const { sim } = makeSim(board());
    sim.tick([place('tower', 3, 0)]);
    const afterTower = sim.state.treasuryMg;
    injectEnemy(sim, 5, 2, { hp: 8, mode: 'returning', carriedMg: 25_000 });
    sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterTower + 6000);
    expect(sim.state.sacks).toHaveLength(1);
    expect(sim.state.sacks[0]).toMatchObject({ tx: 5, ty: 2, amountMg: 25_000 });
  });

  it('two towers do not overkill the same enemy in one tick', () => {
    const { sim } = makeSim(board());
    sim.tick([place('tower', 3, 0), place('tower', 6, 0)]);
    const weak = injectEnemy(sim, 5, 2, { hp: 4 }); // first shot kills it
    const next = injectEnemy(sim, 4, 2);
    sim.tick([]);
    expect(weak.alive).toBe(false);
    expect(next.hp).toBe(122); // the second tower re-targeted
  });

  it('render events never feed back: drained and discarded runs hash identically', () => {
    const run = (drain: boolean) => {
      const { sim } = makeSim(board());
      sim.tick([place('tower', 3, 0)]);
      injectEnemy(sim, 5, 2);
      injectEnemy(sim, 2, 2);
      for (let t = 0; t < 60; t++) {
        sim.tick([]);
        if (drain) sim.events.length = 0;
      }
      return { hash: sim.hash(), events: sim.events.length };
    };
    const drained = run(true);
    const kept = run(false);
    expect(kept.events).toBeGreaterThan(0); // tracers were actually emitted
    expect(drained.hash).toBe(kept.hash);
  });
});
