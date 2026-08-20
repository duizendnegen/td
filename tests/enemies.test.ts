// Health bar remaining fraction (build-ui spec "Enemy health bar",
// enemy-health-bar design D5): the one pure piece of the enemy renderer.
import { describe, expect, it } from 'vitest';
import { hpFraction } from '../src/render/enemies';

describe('hpFraction', () => {
  it('is 1 at full hp and the plain ratio in between', () => {
    expect(hpFraction(900, 900)).toBe(1);
    expect(hpFraction(675, 900)).toBe(0.75);
    expect(hpFraction(1, 4)).toBe(0.25);
  });

  it('clamps to [0, 1]', () => {
    expect(hpFraction(0, 50)).toBe(0);
    expect(hpFraction(-30, 50)).toBe(0); // overkill in the tick before compaction
    expect(hpFraction(120, 50)).toBe(1); // never happens, but never overflows the track
  });

  it('is 0 for a non-positive max rather than NaN or Infinity', () => {
    expect(hpFraction(10, 0)).toBe(0);
    expect(hpFraction(0, 0)).toBe(0);
    expect(hpFraction(10, -5)).toBe(0);
  });
});
