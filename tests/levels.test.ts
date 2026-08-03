// See the level-progression spec (balance-ux-tweaks) and design D9
import { describe, expect, it } from 'vitest';
import { LEVEL_SEQUENCE, levelForParam, nextLevelUrl } from '../src/app/levels';

describe('level sequence (level-progression spec)', () => {
  it('level_01 leads to level_02, which is final', () => {
    expect(LEVEL_SEQUENCE.map((l) => l.param)).toEqual(['1', '2']);
    expect(levelForParam('1').next).toBe('2');
    expect(levelForParam('2').next).toBeNull();
  });

  it('direct selection still works, defaulting to level_01', () => {
    expect(levelForParam('2')).toBe(LEVEL_SEQUENCE[1]);
    expect(levelForParam(null)).toBe(LEVEL_SEQUENCE[0]);
    expect(levelForParam('nonsense')).toBe(LEVEL_SEQUENCE[0]);
  });

  it('the successor URL selects the next level and nothing else', () => {
    expect(nextLevelUrl('2', '', '/td/')).toBe('/td/?level=2');
    expect(nextLevelUrl(null, '', '/td/')).toBeNull();
  });

  it('an explicit ?seed= is carried through; other params are dropped', () => {
    expect(nextLevelUrl('2', '?seed=1234&level=1', '/td/')).toBe('/td/?level=2&seed=1234');
    expect(nextLevelUrl('2', '?level=1&foo=bar', '/td/')).toBe('/td/?level=2');
  });
});
