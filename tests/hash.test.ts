// See ARCHITECTURE.md §12 and design D-P1-2: the hash walks ALL sim state, so
// any single-field divergence is visible at the tick it happens.
import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash';
import type { Enemy, SimState } from '../src/sim/types';

function makeEnemy(id: number): Enemy {
  return {
    id,
    typeId: 0,
    pos: { x: 512, y: 10752 },
    prevPos: { x: 512, y: 10752 },
    waypoint: { x: 1536, y: 10752 },
    speed: 120,
    mode: 'inbound',
    alive: true,
  };
}

function makeState(): SimState {
  return {
    tick: 17,
    treasuryMg: 200_000,
    enemies: [makeEnemy(0), makeEnemy(1)],
    nextEnemyId: 2,
    nextSpawnTicks: [40],
  };
}

const RNG_STATE = [0x1234, 0x5678, 0x9abc, 0xdef0] as const;

describe('state hash', () => {
  it('is stable for identical states', () => {
    expect(hashState(makeState(), RNG_STATE)).toBe(hashState(makeState(), RNG_STATE));
  });

  it('changes when any single field changes', () => {
    const base = hashState(makeState(), RNG_STATE);

    const mutations: ((s: SimState) => void)[] = [
      (s) => s.tick++,
      (s) => s.treasuryMg--,
      (s) => s.nextEnemyId++,
      (s) => s.nextSpawnTicks[0]!++,
      (s) => s.enemies[1]!.pos.x++,
      (s) => s.enemies[1]!.pos.y--,
      (s) => s.enemies[0]!.waypoint.x++,
      (s) => s.enemies[0]!.speed++,
      (s) => s.enemies[0]!.id++,
      (s) => s.enemies.pop(),
    ];
    for (const mutate of mutations) {
      const state = makeState();
      mutate(state);
      expect(hashState(state, RNG_STATE)).not.toBe(base);
    }

    // RNG state is inside the hash too.
    expect(hashState(makeState(), [0x1235, 0x5678, 0x9abc, 0xdef0])).not.toBe(base);
  });

  it('ignores prevPos — the render-only interpolation snapshot', () => {
    const state = makeState();
    const base = hashState(state, RNG_STATE);
    state.enemies[0]!.prevPos.x += 999;
    expect(hashState(state, RNG_STATE)).toBe(base);
  });
});
