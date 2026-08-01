// See ARCHITECTURE.md §12
//
// ENFORCES ARCHITECTURE.md §4. The golden hash below was minted from a run
// whose fixed-point, RNG (reference-vector), and flow-field tests were green
// first (task 4.2). Regenerating it is a deliberate act that means "the
// simulation intentionally changed" — never do it to make CI pass.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import { formatHash } from '../src/sim/hash';
import { Sim } from '../src/sim/sim';

const SEED = 0xc0ffee;
const TICKS = 2000;
const GOLDEN_HASH = 'c9d02418';

function makeSim(): Sim {
  return new Sim(loadGameData(levelJson, balanceJson), SEED);
}

describe('replay determinism', () => {
  it(`same seed and commands produce the golden hash after ${TICKS} ticks`, () => {
    const sim = makeSim();
    for (let t = 0; t < TICKS; t++) sim.tick([]);
    expect(sim.state.tick).toBe(TICKS);
    expect(sim.state.enemies.length).toBeGreaterThan(0);
    expect(formatHash(sim.hash())).toBe(GOLDEN_HASH);
  });

  it('display rate does not affect state: 1-tick steps == 5-tick bursts', () => {
    const oneAtATime = makeSim();
    for (let t = 0; t < TICKS; t++) oneAtATime.tick([]);

    const inBursts = makeSim();
    for (let t = 0; t < TICKS / 5; t++) {
      for (let burst = 0; burst < 5; burst++) inBursts.tick([]);
    }

    expect(inBursts.state.tick).toBe(oneAtATime.state.tick);
    expect(inBursts.hash()).toBe(oneAtATime.hash());
  });

  it(`no float leaks into sim state after ${TICKS} ticks of steering`, () => {
    const sim = makeSim();
    for (let t = 0; t < TICKS; t++) sim.tick([]);
    const s = sim.state;
    expect(Number.isInteger(s.tick)).toBe(true);
    expect(Number.isInteger(s.treasuryMg)).toBe(true);
    expect(Number.isInteger(s.nextEnemyId)).toBe(true);
    for (const t of s.nextSpawnTicks) expect(Number.isInteger(t)).toBe(true);
    for (const e of s.enemies) {
      for (const v of [e.id, e.typeId, e.pos.x, e.pos.y, e.prevPos.x, e.prevPos.y, e.waypoint.x, e.waypoint.y, e.speed]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});
