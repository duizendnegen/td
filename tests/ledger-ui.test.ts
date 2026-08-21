// The ledger panels' pure derivation (wave-ledger build-ui delta, design
// D5–D7, D9): which period is shown, the reconciling rounding, the kWh and
// tariff presentation — no DOM, like powermeter.test.ts.
import { describe, expect, it } from 'vitest';
import { GOLD } from '../src/sim/fixed';
import { openLedger, type WaveLedger } from '../src/sim/types';
import {
  closingMg,
  energyBalance,
  formatKwh,
  formatTariff,
  formatTenths,
  goldBlocks,
  KWH_PER_MP_TICK,
  kwhTenths,
  reconcile,
  shown,
} from '../src/ui/ledger';

const period = (over: Partial<WaveLedger>): WaveLedger => ({ ...openLedger(0), ...over });

describe('shown — the period with the latest wave start (design D5)', () => {
  it('before the first wave: no period, the open one preparing', () => {
    const ledger = openLedger(200_000);
    const s = shown(ledger, openLedger(0));
    expect(s).toEqual({ period: null, preparing: ledger });
  });

  it('mid-wave: the open period, nothing preparing', () => {
    const ledger = period({ waveNo: 4, openingMg: 412_000 });
    const last = period({ waveNo: 3 });
    expect(shown(ledger, last)).toEqual({ period: ledger, preparing: null });
  });

  it('build phase: the closed period, the open one preparing', () => {
    const ledger = period({ openingMg: 460_000, constructionMg: 95_000 });
    const last = period({ waveNo: 4 });
    expect(shown(ledger, last)).toEqual({ period: last, preparing: ledger });
  });

  it('after a final settlement (won or locked): the closed final wave, the open one beneath', () => {
    const ledger = period({ openingMg: 900_000 });
    const last = period({ waveNo: 10 });
    expect(shown(ledger, last)).toEqual({ period: last, preparing: ledger });
  });

  it('conceded mid-wave: the open period, frozen', () => {
    const ledger = period({ waveNo: 6, stolenMg: 75_000 });
    const last = period({ waveNo: 5 });
    expect(shown(ledger, last)).toEqual({ period: ledger, preparing: null });
  });
});

describe('reconcile — largest-remainder rounding (design D6)', () => {
  const within = (parts: readonly number[], out: readonly number[], scale: number): void => {
    parts.forEach((p, i) => {
      const exact = p / scale;
      expect(out[i]! - Math.floor(exact)).toBeGreaterThanOrEqual(0);
      expect(out[i]! - Math.floor(exact)).toBeLessThanOrEqual(1);
      expect(Math.abs(out[i]! - Math.round(exact))).toBeLessThanOrEqual(1);
    });
  };

  it('floors that fall short of the total: the largest remainders take the difference', () => {
    // 1.5 + 1.5 floors to 1 + 1 against a total of 3.
    const out = reconcile([1500, 1500], 3, GOLD);
    expect(out.reduce((a, b) => a + b, 0)).toBe(3);
    expect(out).toEqual([2, 1]); // the tie goes to the earlier part
    within([1500, 1500], out, GOLD);
    // 0.7 + 0.7 + 0.6 = 2.0 floors to 0; total 2: the two largest remainders.
    expect(reconcile([700, 700, 600], 2, GOLD)).toEqual([1, 1, 0]);
  });

  it('independent rounding that overshoots the total is pulled back within one unit per part', () => {
    // Rounded independently 2 + 2 + 2 = 6; the total is 5.
    const parts = [1600, 1600, 1600];
    const out = reconcile(parts, 5, GOLD);
    expect(out.reduce((a, b) => a + b, 0)).toBe(5);
    within(parts, out, GOLD);
    expect(out).toEqual([2, 2, 1]);
  });

  it('handles signed parts: a negative row floors away from zero and can be pulled back', () => {
    // −1.5 + 2.5 = 1.0; floors −2 + 2 = 0; total 1.
    const out = reconcile([-1500, 2500], 1, GOLD);
    expect(out).toEqual([-1, 2]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('exact parts are untouched', () => {
    expect(reconcile([180_000, 25_000, -140_000], 65, GOLD)).toEqual([180, 25, -140]);
    expect(reconcile([], 0, GOLD)).toEqual([]);
  });
});

describe('gold blocks (design D9)', () => {
  // The spec's wave 3, in milli-gold that does not floor cleanly: opening
  // 412.4, bounties 180.3, bonus 25.3, interest 6.3, construction 140.2, bill
  // 13.2, stolen 40.1, recovered 30.1 → closing 460.9. Independent floors of
  // the signed rows sum to 45 against a displayed delta of 48.
  const wave3 = period({
    waveNo: 3,
    openingMg: 412_400,
    bountiesMg: 180_300,
    bonusMg: 25_300,
    interestMg: 6_300,
    constructionMg: 140_200,
    billMg: 13_200,
    stolenMg: 40_100,
    recoveredMg: 30_100,
  });

  it('a block\'s displayed rows sum exactly to floor(closing) − floor(opening)', () => {
    expect(closingMg(wave3)).toBe(460_900);
    const [block] = goldBlocks({ period: wave3, preparing: null }, 10);
    expect(block!.title).toBe('WAVE 3');
    expect(block!.opening).toBe(412);
    expect(block!.closing).toBe(460);
    expect(block!.closingLabel).toBe('Balance');
    const sum = block!.rows.reduce((a, r) => a + r.amount, 0);
    expect(sum).toBe(460 - 412);
    expect(block!.rows.map((r) => [r.label, r.amount])).toEqual([
      ['Bounties', 180],
      ['Wave bonus', 25],
      ['Interest', 6],
      ['Construction', -140],
      ['Energy', -13],
      ['Stolen', -40],
      ['Recovered', 30],
    ]);
  });

  it('the build phase chains the closed wave into the preparing block, whose balance is the readout', () => {
    const preparing = period({ openingMg: 460_900, constructionMg: 95_000 });
    const [closed, prep] = goldBlocks({ period: wave3, preparing }, 10);
    expect(closed!.closingLabel).toBe('Closing');
    expect(closed!.closing).toBe(460);
    expect(prep!.title).toBe('PREPARING WAVE 4');
    expect(prep!.opening).toBe(460);
    expect(prep!.rows).toEqual([{ label: 'Construction', amount: -95 }]);
    expect(prep!.closingLabel).toBe('Balance');
    expect(prep!.closing).toBe(365);
    expect(prep!.closing).toBe(Math.floor(closingMg(preparing) / GOLD));
  });

  it('a selling build phase shows construction positive; a debug bounty keeps the chain exact', () => {
    const preparing = period({ openingMg: 100_500, constructionMg: -10_000, bountiesMg: 6_000 });
    const [prep] = goldBlocks({ period: null, preparing }, 10);
    expect(prep!.title).toBe('PREPARING WAVE 1');
    expect(prep!.rows.map((r) => [r.label, r.amount])).toEqual([
      ['Bounties', 6],
      ['Construction', 10],
    ]);
    expect(prep!.opening + 6 + 10).toBe(prep!.closing);
    expect(prep!.closing).toBe(116);
  });

  it('after the final wave the second block is labelled as such, not as preparing an eleventh', () => {
    const last = period({ waveNo: 10, openingMg: 800_000, bountiesMg: 100_000 });
    const open = period({ openingMg: 900_000 });
    const [, after] = goldBlocks({ period: last, preparing: open }, 10);
    expect(after!.title).toBe('AFTER WAVE 10');
    expect(after!.rows).toEqual([{ label: 'Construction', amount: 0 }]);
  });

  it('a negative balance floors like the readout does', () => {
    const open = period({ waveNo: 6, openingMg: 73_000, stolenMg: 100_000 });
    const [block] = goldBlocks({ period: open, preparing: null }, 10);
    expect(block!.closing).toBe(Math.floor(-27_000 / GOLD));
    expect(block!.closing).toBe(-27);
    expect(block!.opening + block!.rows.reduce((a, r) => a + r.amount, 0)).toBe(-27);
  });
});

describe('kWh and the tariff (design D7)', () => {
  it('one mp·tick is 1 / (POWER × TICK_HZ) kWh; the harness magnitudes read at one decimal', () => {
    expect(KWH_PER_MP_TICK).toBe(1 / 20_000);
    // A twelve-second opening wave at a mean 0.9 kW: 240 ticks × 900 mp ≈ 215 100 mp·tick.
    expect(formatKwh(215_100)).toBe('10.8');
    expect(kwhTenths(215_100)).toBe(108);
    expect(formatKwh(0)).toBe('0.0');
    expect(formatKwh(1_440_000)).toBe('72.0');
    expect(formatTenths(3)).toBe('0.3');
    expect(formatTenths(1005)).toBe('100.5');
  });

  it('the authored tariff reads unchanged as gold per kWh', () => {
    expect(formatTariff(12)).toBe('0.24');
    expect(formatTariff(6)).toBe('0.12');
    expect(formatTariff(0)).toBe('0.00');
    expect(formatTariff(50)).toBe('1.00');
  });
});

describe('energy columns (design D9)', () => {
  it('the spec\'s wave 4: both columns total 43.0 and the grid row is marked billed', () => {
    // One displayed tenth is 2000 mp·tick. The solar source row is the
    // panels' output — 30.5 = 26.8 used + 3.7 wasted.
    const wave4 = period({
      waveNo: 4,
      engagedMp: 312 * 2000,
      standbyMp: 81 * 2000,
      solarWastedMp: 37 * 2000,
      solarUsedMp: 268 * 2000,
      gridMp: 125 * 2000,
      unmetMp: 0,
    });
    const b = energyBalance(wave4, 12);
    expect(b.title).toBe('WAVE 4');
    expect(b.tariff).toBe('0.24 g/kWh');
    expect(b.usage.totalTenths).toBe(430);
    expect(b.sources.totalTenths).toBe(430);
    expect(b.usage.rows.map((r) => [r.label, formatTenths(r.tenths)])).toEqual([
      ['Engaged', '31.2'],
      ['Standby', '8.1'],
      ['Wasted', '3.7'],
    ]);
    expect(b.sources.rows.map((r) => [r.label, formatTenths(r.tenths), r.billed ?? false])).toEqual([
      ['Solar', '30.5', false],
      ['Grid', '12.5', true],
      ['Unmet', '0.0', false],
    ]);
  });

  it('rows that do not fall on tenths still sum to the displayed total in each column', () => {
    // Raw sums chosen so every row has a fractional tenth; the draw
    // (engaged + standby) is what solar used, the grid and unmet cover.
    const l = period({
      waveNo: 2,
      engagedMp: 123_456,
      standbyMp: 45_678,
      solarWastedMp: 9_012,
      solarUsedMp: 100_000,
      gridMp: 61_000,
      unmetMp: 8_134,
    });
    expect(l.engagedMp + l.standbyMp).toBe(l.solarUsedMp + l.gridMp + l.unmetMp);
    const b = energyBalance(l, 12);
    const sum = (rows: { tenths: number }[]) => rows.reduce((a, r) => a + r.tenths, 0);
    expect(sum(b.usage.rows)).toBe(b.usage.totalTenths);
    expect(sum(b.sources.rows)).toBe(b.sources.totalTenths);
    expect(b.usage.totalTenths).toBe(kwhTenths(178_146));
    expect(b.usage.totalTenths).toBe(89); // 8.9073 kWh
  });
});
