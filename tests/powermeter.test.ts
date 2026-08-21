// See the energy-infrastructure build-ui delta: the power meter's derivation
// (live vs planning, warning while browning out, the connection-upgrade
// control's palette-consistent states) as a pure function, tested without
// a DOM like waveprogress.
import { describe, expect, it } from 'vitest';
import { COVERAGE_SCALE } from '../src/sim/power';
import type { PowerReadout } from '../src/sim/sim';
import { formatGoldPerSecond, formatKw, meterState, type MeterInputs } from '../src/ui/powermeter';

const TIERS = [
  { capacityMp: 4000, costMg: 0 },
  { capacityMp: 7000, costMg: 60_000 },
  { capacityMp: 11_000, costMg: 120_000 },
];

const idle: PowerReadout = {
  drawMp: 0,
  engagedMp: 0,
  solarMp: 0,
  batterySupplyMp: 0,
  chargedMp: 0,
  gridSupplyMp: 0,
  coverage: COVERAGE_SCALE,
  billMg: 0,
  storedMpTick: 0,
  storageCapacityMpTick: 0,
};

/** A wave-tick readout with no battery standing unless `over` says otherwise. */
const readout = (over: Partial<PowerReadout>): PowerReadout => ({ ...idle, ...over });

const inputs = (over: Partial<MeterInputs> = {}): MeterInputs => ({
  runPhase: 'wave',
  treasuryMg: 200_000,
  gridTier: 0,
  tiers: TIERS,
  ratedTotalMp: 4500,
  solarMp: 2000,
  power: readout({ drawMp: 3200, engagedMp: 3000, solarMp: 2000, gridSupplyMp: 1200, coverage: COVERAGE_SCALE, billMg: 14 }),
  ...over,
});

describe('power meter derivation', () => {
  it('formats mp as kW with one decimal and the bill as gold per second', () => {
    expect(formatKw(1500)).toBe('1.5 kW');
    expect(formatKw(0)).toBe('0.0 kW');
    expect(formatKw(12_345)).toBe('12.3 kW');
    // 14 mg/tick × 20 ticks/s = 280 mg/s = 0.28 g/s → "0.3 g/s"
    expect(formatGoldPerSecond(14)).toBe('0.3 g/s');
    expect(formatGoldPerSecond(0)).toBe('0.0 g/s');
  });

  it('live during a wave: the tick\'s draw against the ceiling, the split, the cost, the tier', () => {
    const m = meterState(inputs());
    expect(m.mode).toBe('live');
    expect(m.loadMp).toBe(3200);
    expect(m.capacityMp).toBe(4000);
    expect(m.solarMp).toBe(2000);
    expect(m.ceilingMp).toBe(6000);
    expect(m.gridMp).toBe(1200);
    expect(m.billMgPerTick).toBe(14);
    expect(m.tier).toBe(1);
    expect(m.tierCount).toBe(3);
    expect(m.warning).toBe(false);
    expect(m.over).toBe(false);
  });

  it('reads as a warning the frame coverage is below 1, and not otherwise', () => {
    const brown = meterState(
      inputs({ power: readout({ drawMp: 8000, engagedMp: 7700, solarMp: 2000, gridSupplyMp: 4000, coverage: 768, billMg: 48 }) }),
    );
    expect(brown.warning).toBe(true);
    expect(brown.over).toBe(true);
    expect(brown.coverage).toBe(768);
    // Coverage 1 with the load exactly at the ceiling: no warning.
    const full = meterState(
      inputs({ power: readout({ drawMp: 6000, engagedMp: 5800, solarMp: 2000, gridSupplyMp: 4000, coverage: COVERAGE_SCALE, billMg: 48 }) }),
    );
    expect(full.warning).toBe(false);
    expect(full.over).toBe(false);
  });

  it('planning between waves: the rated total against the ceiling, grid cost zero, never a warning', () => {
    for (const runPhase of ['build', 'settled-locked', 'won', 'lost'] as const) {
      const m = meterState(inputs({ runPhase, power: idle }));
      expect(m.mode).toBe('planning');
      expect(m.loadMp).toBe(4500);
      expect(m.ceilingMp).toBe(6000);
      expect(m.gridMp).toBe(0);
      expect(m.billMgPerTick).toBe(0);
      expect(m.coverage).toBe(COVERAGE_SCALE);
      expect(m.warning).toBe(false);
    }
    // A rated total past the ceiling is flagged as over — the peak would brown out.
    expect(meterState(inputs({ runPhase: 'build', power: idle, ratedTotalMp: 6500 })).over).toBe(true);
    // Even a stale live readout is ignored outside a wave: the derivation reads the phase.
    expect(meterState(inputs({ runPhase: 'build' })).warning).toBe(false);
  });

  it('the upgrade control: affordable, debt-warned, blocked below 0, maxed at the last tier', () => {
    expect(meterState(inputs()).upgrade).toEqual({ kind: 'affordable', capacityMp: 7000, costMg: 60_000 });
    expect(meterState(inputs({ treasuryMg: 50_000 })).upgrade).toEqual({ kind: 'debt', capacityMp: 7000, costMg: 60_000 });
    expect(meterState(inputs({ treasuryMg: 0 })).upgrade.kind).toBe('debt'); // ≥ 0: warned, still actionable
    expect(meterState(inputs({ treasuryMg: -1 })).upgrade).toEqual({ kind: 'blocked', capacityMp: 7000, costMg: 60_000 });
    expect(meterState(inputs({ gridTier: 1 })).upgrade).toEqual({ kind: 'affordable', capacityMp: 11_000, costMg: 120_000 });
    expect(meterState(inputs({ gridTier: 2 })).upgrade).toEqual({ kind: 'maxed' });
    // Maxed regardless of the balance.
    expect(meterState(inputs({ gridTier: 2, treasuryMg: -500 })).upgrade).toEqual({ kind: 'maxed' });
  });

  it('the tier changes the capacity the moment it applies', () => {
    expect(meterState(inputs({ gridTier: 1 })).capacityMp).toBe(7000);
    expect(meterState(inputs({ gridTier: 1 })).ceilingMp).toBe(9000);
    expect(meterState(inputs({ gridTier: 1 })).tier).toBe(2);
  });
});

// The stored-energy line (add-battery build-ui delta): present whenever a
// battery stands, in both phases; absent otherwise; the live split carries
// the store's share.
describe('the store on the meter (add-battery)', () => {
  it('no battery, no store readout — in either phase', () => {
    expect(meterState(inputs()).store).toBeNull();
    expect(meterState(inputs({ runPhase: 'build', power: idle })).store).toBeNull();
    expect(meterState(inputs()).batteryMp).toBe(0);
  });

  it('planning between waves: the reserve reads against capacity while the other figures are idle', () => {
    const m = meterState(
      inputs({
        runPhase: 'build',
        power: readout({ storedMpTick: 120_000, storageCapacityMpTick: 200_000 }),
      }),
    );
    expect(m.mode).toBe('planning');
    expect(m.store).toEqual({ storedMpTick: 120_000, capacityMpTick: 200_000 });
    expect(m.batteryMp).toBe(0);
    expect(m.gridMp).toBe(0);
    expect(m.billMgPerTick).toBe(0);
    expect(m.warning).toBe(false);
  });

  it('live: the split includes the store\'s share and the stored figure is the tick\'s', () => {
    const m = meterState(
      inputs({
        power: readout({
          drawMp: 3200,
          engagedMp: 3000,
          solarMp: 2000,
          batterySupplyMp: 800,
          gridSupplyMp: 400,
          coverage: COVERAGE_SCALE,
          billMg: 5,
          storedMpTick: 41_200,
          storageCapacityMpTick: 200_000,
        }),
      }),
    );
    expect(m.mode).toBe('live');
    expect(m.batteryMp).toBe(800);
    expect(m.gridMp).toBe(400);
    expect(m.store).toEqual({ storedMpTick: 41_200, capacityMpTick: 200_000 });
    expect(m.warning).toBe(false);
  });

  it('an empty store with a battery standing still shows: 0 of capacity', () => {
    const m = meterState(inputs({ power: readout({ storageCapacityMpTick: 200_000 }) }));
    expect(m.store).toEqual({ storedMpTick: 0, capacityMpTick: 200_000 });
  });
});
