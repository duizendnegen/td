// Seeded PRNG (xoshiro128**) — the only randomness source in sim/
// See ARCHITECTURE.md §4
//
// Responsibilities:
//   - Deterministic and serialisable state
//   - Owned by the Sim instance, never module-global

// All 32-bit multiplications go through Math.imul: plain `*` silently loses
// low bits above 2^32 (design D-P1-6), and tests/rng.test.ts holds this
// implementation to reference vectors minted from an independent BigInt model.

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** One splitmix32 step — expands a 32-bit seed into the 128-bit state. */
function splitmix32(a: number): [next: number, out: number] {
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  return [a >>> 0, (t ^ (t >>> 15)) >>> 0];
}

export class Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(seed: number) {
    let a = seed >>> 0;
    let out: number;
    [a, out] = splitmix32(a);
    this.s0 = out;
    [a, out] = splitmix32(a);
    this.s1 = out;
    [a, out] = splitmix32(a);
    this.s2 = out;
    [, out] = splitmix32(a);
    this.s3 = out;
    // The all-zero state is the one fixed point of xoshiro; splitmix cannot
    // produce it from any seed, but guard anyway.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s3 = 1;
  }

  /** For known-answer tests against the reference C implementation. */
  static fromState(s0: number, s1: number, s2: number, s3: number): Rng {
    const rng = new Rng(0);
    rng.s0 = s0 >>> 0;
    rng.s1 = s1 >>> 0;
    rng.s2 = s2 >>> 0;
    rng.s3 = s3 >>> 0;
    return rng;
  }

  /** Next uniform uint32. */
  next(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9)) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Full internal state, in canonical order, for the state hash. */
  state(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }
}
