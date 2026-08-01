// See ARCHITECTURE.md §12 and design D-P1-6: a buggy xoshiro (plain * instead
// of Math.imul) would mint a golden replay hash that passes anyway, so the
// PRNG is held to known-answer vectors minted from an independent BigInt
// model of the reference C implementation
// (https://prng.di.unimi.it/xoshiro128starstar.c).
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';

describe('xoshiro128**', () => {
  it('matches reference vectors from state [1, 2, 3, 4]', () => {
    const rng = Rng.fromState(1, 2, 3, 4);
    const expected = [
      0x2d00, 0x0, 0x5a7080, 0x4389d80, 0x79199d9b, 0x61963b24, 0x4cb9b57a, 0xde9d7431,
      0xde458f35, 0xfdce1a54,
    ];
    for (const value of expected) expect(rng.next()).toBe(value);
  });

  it('matches reference vectors from a high-bit-heavy state', () => {
    // High bits set in every word — the exact case plain `*` corrupts.
    const rng = Rng.fromState(0x12345678, 0x9abcdef0, 0xdeadbeef, 0x0badf00d);
    const expected = [
      0x99981812, 0x4548108f, 0x30314c70, 0x7aea25a0, 0xe2cbaa6d, 0x870b77f, 0x79772bf9,
      0x83a3dff0, 0x9596061e, 0x38d8a61e,
    ];
    for (const value of expected) expect(rng.next()).toBe(value);
  });

  it('same seed produces the same sequence', () => {
    const a = new Rng(0xc0ffee);
    const b = new Rng(0xc0ffee);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('different seeds diverge', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const aOut = Array.from({ length: 10 }, () => a.next());
    const bOut = Array.from({ length: 10 }, () => b.next());
    expect(aOut).not.toEqual(bOut);
  });

  it('outputs are unsigned 32-bit integers', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
