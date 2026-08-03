// See the aether-ui-redesign build-ui spec (wave progress bar) and design D6
import { describe, expect, it } from 'vitest';
import { waveProgress } from '../src/ui/waveprogress';

describe('wave progress derivation', () => {
  it('is empty at wave start (nothing spawned, nothing alive)', () => {
    expect(waveProgress([6, 4], [0, 0], 0)).toBe(0);
  });

  it('spawned-but-alive enemies do not advance the bar', () => {
    expect(waveProgress([6, 4], [3, 2], 5)).toBe(0);
  });

  it('kills and escapes advance the bar: 4 dead + 1 escaped of 10 is half', () => {
    // 10-enemy wave, all spawned, 5 resolved (dead or escaped), 5 alive.
    expect(waveProgress([10], [10], 5)).toBe(0.5);
  });

  it('is full when every spawn is resolved', () => {
    expect(waveProgress([6, 4], [6, 4], 0)).toBe(1);
  });

  it('tracks partially-spawned waves: resolved counts against the whole wave', () => {
    // 2 of 8 spawned, both already resolved.
    expect(waveProgress([8], [2], 0)).toBe(0.25);
  });

  it('clamps to [0, 1] against out-of-band enemies (debug spawns)', () => {
    // More alive than spawned (debug spawn mid-wave) must not go negative.
    expect(waveProgress([4], [1], 3)).toBe(0);
    // Cursors can never exceed counts under strict-sequential waves, but the
    // derivation still refuses to overshoot.
    expect(waveProgress([4], [6], 0)).toBe(1);
  });

  it('returns 0 for an empty wave definition', () => {
    expect(waveProgress([], [], 0)).toBe(0);
  });
});
