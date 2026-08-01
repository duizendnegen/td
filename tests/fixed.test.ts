// See ARCHITECTURE.md §12
import { describe, expect, it } from 'vitest';
import { DIAG, HALF, TILE, normalize, tileCentre, toTile } from '../src/sim/fixed';

describe('fixed-point', () => {
  it('normalize() is exact for axis-aligned and diagonal offsets', () => {
    // Axis-aligned: length divides exactly.
    expect(normalize(5000, 0, 154)).toEqual([154, 0]);
    expect(normalize(0, -5000, 154)).toEqual([0, -154]);
    // Perfect diagonal of one tile: d = trunc(sqrt(2 * 1024^2)) = 1448 = DIAG.
    expect(normalize(TILE, TILE, TILE)).toEqual([
      Math.trunc((TILE * TILE) / DIAG),
      Math.trunc((TILE * TILE) / DIAG),
    ]);
    // Zero offset never divides by zero.
    expect(normalize(0, 0, 154)).toEqual([0, 0]);
  });

  it('truncates toward zero at negative values (not floor)', () => {
    // d = trunc(sqrt(2_000_000)) = 1414; -1000 * 1024 / 1414 = -724.18…
    // trunc gives -724 where floor would give -725.
    expect(normalize(-1000, -1000, TILE)).toEqual([-724, -724]);
    // Symmetry: negating the offset exactly negates the result.
    const [px, py] = normalize(1000, 1000, TILE);
    expect(normalize(-1000, -1000, TILE)).toEqual([-px, -py]);
  });

  it('no float ever escapes normalize()', () => {
    // Sweep offsets that produce irrational lengths.
    for (let dx = -3000; dx <= 3000; dx += 137) {
      for (let dy = -3000; dy <= 3000; dy += 251) {
        const [nx, ny] = normalize(dx, dy, 154);
        expect(Number.isInteger(nx)).toBe(true);
        expect(Number.isInteger(ny)).toBe(true);
      }
    }
  });

  it('tile↔unit helpers round-trip on tile centres', () => {
    expect(tileCentre(15)).toBe(15 * TILE + HALF);
    expect(toTile(tileCentre(15))).toBe(15);
    expect(toTile(15 * TILE)).toBe(15); // tile edge belongs to that tile
    expect(toTile(15 * TILE + TILE - 1)).toBe(15);
  });
});
