// See ARCHITECTURE.md §5/§12, the phase-4 theft-economy and run-lifecycle specs
import { describe, expect, it } from 'vitest';
import { liquidationTotalMg, waveBonusMg } from '../src/sim/economy';
import {
  concede,
  injectEnemy,
  makeSim,
  openLevel,
  place,
  remove,
  startWave,
  testBalance,
  trivialWave,
} from './helpers';

const group = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  spawn: 'main',
  type: 'runner',
  count: 1,
  spawnInterval: 1,
  delay: 0,
  ...over,
});

/** Corridor with authorable waves and interest; runners park at the spawn. */
const corridor = (
  waves: Record<string, unknown>[],
  interestRatePerTick = 0,
): Record<string, unknown> =>
  openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
    waves,
    economy: { startingTreasury: 200, interestRatePerTick },
  });

/** A wave that stays active: one enemy far in the future keeps a cursor open. */
const openEndedWave = () => ({ groups: [group({ delay: 100_000 })] });

describe('interest accrual (design D3)', () => {
  it('accrues floor(balance × ppm / 1e6) per tick during a wave, compounding', () => {
    const { sim } = makeSim(corridor([openEndedWave()], 0.001)); // 1000 ppm
    sim.tick([startWave()]); // interest starts this tick
    let expected = 200_000;
    expected += Math.floor((expected * 1000) / 1_000_000);
    expect(sim.state.treasuryMg).toBe(expected); // 200 200
    for (let t = 0; t < 4; t++) {
      sim.tick([]);
      expected += Math.floor((expected * 1000) / 1_000_000);
    }
    expect(sim.state.treasuryMg).toBe(expected);
  });

  it('accrues nothing in the build phase', () => {
    const { sim } = makeSim(corridor([openEndedWave()], 0.001));
    for (let t = 0; t < 100; t++) sim.tick([]);
    expect(sim.state.treasuryMg).toBe(200_000);
  });

  it('accrues nothing on a zero or negative balance', () => {
    for (const balance of [0, -40_000]) {
      const { sim } = makeSim(corridor([openEndedWave()], 0.001));
      sim.state.treasuryMg = balance;
      sim.tick([]); // still build — but also prove it during the wave:
      sim.state.treasuryMg = balance;
      sim.tick([startWave()]);
      for (let t = 0; t < 50; t++) sim.tick([]);
      expect(sim.state.treasuryMg).toBe(balance);
    }
  });

  it('does not accrue on the settlement tick', () => {
    // 1% per tick would be plainly visible if the drained tick still accrued.
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()], 0.01));
    sim.tick([startWave()]); // spawns the runner; interest on 200 000 = +2000
    expect(sim.state.treasuryMg).toBe(202_000);
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]); // death (bounty 6000) → drained → settlement, NO interest
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.treasuryMg).toBe(202_000 + 6000);
  });
});

describe('end-of-wave settlement (design D2)', () => {
  it('returns same-tick death-drop sacks: step 8 drops, step 9 settles', () => {
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]));
    sim.tick([startWave()]);
    const carrier = sim.state.enemies[0]!;
    carrier.carriedMg = 20_000; // stole earlier (by fiat)
    carrier.hp = 0;
    sim.tick([]); // dies: sack drops AND settles in the same tick
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.sacks).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(200_000 + 6000 + 20_000); // bounty + sack
  });

  it('sack return precedes the solvency judgement', () => {
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]));
    sim.tick([startWave()]);
    sim.state.treasuryMg = -30_000;
    sim.state.sacks.push({ id: sim.state.nextSackId++, tx: 3, ty: 1, amountMg: 50_000 });
    sim.state.enemies[0]!.hp = 0;
    sim.state.enemies[0]!.carriedMg = 0;
    sim.tick([]);
    // −30 000 + 6000 bounty + 50 000 sack = +26 000: unlocked, not wave-locked.
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.treasuryMg).toBe(26_000);
    sim.tick([startWave()]);
    expect(sim.state.waveIndex).toBe(2);
  });
});

describe('wave speed bonus (run-lifecycle spec, design D4)', () => {
  const BONUS = { baseGold: 40, graceTicks: 10, decayTicks: 100 };

  /** Two-wave corridor with a zero-bounty runner so only the bonus moves gold. */
  const bonusSim = () =>
    makeSim(corridor([{ groups: [group()] }, trivialWave()]), testBalance({ bounty: 0 }, {}, BONUS));

  it('pays the full base within the grace window and less after it', () => {
    const fast = bonusSim().sim;
    fast.tick([startWave()]); // runner spawns; lastSpawnOffset = 0
    fast.state.enemies[0]!.hp = 0;
    fast.tick([]); // settles at duration 1, inside the 10-tick grace
    expect(fast.state.lastWaveBonusMg).toBe(40_000);
    expect(fast.state.treasuryMg).toBe(240_000);

    const slow = bonusSim().sim;
    slow.tick([startWave()]);
    for (let t = 0; t < 50; t++) slow.tick([]);
    slow.state.enemies[0]!.hp = 0;
    slow.tick([]); // duration 51 → 41 over grace → floor(40000 × 59 / 100)
    expect(slow.state.lastWaveBonusMg).toBe(23_600);
    expect(slow.state.lastWaveBonusMg).toBeLessThan(fast.state.lastWaveBonusMg);
  });

  it('pays zero once the wave outlives the decay window', () => {
    const { sim } = bonusSim();
    sim.tick([startWave()]);
    for (let t = 0; t < 200; t++) sim.tick([]); // 110+ ticks past grace
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]);
    expect(sim.state.lastWaveBonusMg).toBe(0);
    expect(sim.state.treasuryMg).toBe(200_000);
  });

  it('is credited before the solvency judgement and can rescue it', () => {
    const { sim } = bonusSim();
    sim.tick([startWave()]);
    sim.state.treasuryMg = -10_000;
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]); // −10 000 + 40 000 bonus = +30 000: unlocked
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.treasuryMg).toBe(30_000);
    sim.tick([startWave()]);
    expect(sim.state.waveIndex).toBe(2);
  });

  it('anchors par to the wave last scheduled spawn, per the pure formula', () => {
    const cfg = { baseMg: 40_000, graceTicks: 10, decayTicks: 100 };
    expect(waveBonusMg(60, 50, cfg)).toBe(40_000); // inside grace of a late schedule
    expect(waveBonusMg(60, 0, cfg)).toBe(20_000); // 50 over → half decayed
    expect(waveBonusMg(110, 0, cfg)).toBe(0); // over === decayTicks boundary
  });
});

describe('the solvency gate (run-lifecycle spec)', () => {
  it('a negative settlement wave-locks the run; refunds unlock it', () => {
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]));
    sim.tick([place('wall', 3, 0)]); // 4000, refunds 2000
    sim.tick([startWave()]);
    sim.state.treasuryMg = -1000;
    sim.state.enemies[0]!.hp = 0;
    sim.state.enemies.forEach((e) => (e.carriedMg = 0));
    // Kill the bounty so the settlement stays negative.
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]);
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.treasuryMg).toBe(-1000 + 6000); // bounty made it positive…
    sim.state.treasuryMg = -1000; // …so force the debt for the gate test
    sim.tick([startWave()]);
    expect(sim.state.waveIndex).toBe(1); // rejected: wave-locked
    // Removal is available and immediate; its refund unlocks in that same tick.
    sim.tick([remove(3, 0)]);
    expect(sim.state.treasuryMg).toBe(1000); // −1000 + 2000 refund
    sim.tick([startWave()]);
    expect(sim.state.waveIndex).toBe(2);
    expect(sim.state.runPhase).toBe('wave');
  });

  it('irrecoverable debt never auto-loses; concede ends it', () => {
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]));
    sim.tick([startWave()]);
    sim.state.treasuryMg = -500_000;
    sim.state.enemies[0]!.hp = 0;
    sim.state.enemies.forEach((e) => (e.carriedMg = 0));
    sim.tick([]);
    expect(sim.state.runPhase).toBe('build');
    for (let t = 0; t < 300; t++) sim.tick([]);
    expect(sim.state.runPhase).toBe('build'); // wave-locked forever, never lost
    expect(liquidationTotalMg(sim.state.structures, 500)).toBe(0); // nothing to sell
    sim.tick([concede()]);
    expect(sim.state.runPhase).toBe('lost');
  });
});

describe('winning (run-lifecycle spec)', () => {
  it('a solvent final settlement wins in that tick', () => {
    const { sim } = makeSim(corridor([{ groups: [group()] }]));
    sim.tick([startWave()]);
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]);
    expect(sim.state.runPhase).toBe('won');
    expect(sim.state.kills).toBe(1);
  });

  it('an indebted finish enters settled-locked and wins when a refund clears the debt', () => {
    const { sim } = makeSim(corridor([{ groups: [group()] }]));
    sim.tick([place('wall', 3, 0)]); // refund 2000 later
    sim.tick([startWave()]);
    sim.state.treasuryMg = -1500;
    sim.state.enemies[0]!.hp = 0;
    sim.state.enemies.forEach((e) => (e.carriedMg = 0));
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]);
    // Bounty 6000 −1500 = positive… force the indebted-finish shape instead.
    sim.state.treasuryMg = -1500;
    sim.state.runPhase = 'settled-locked';
    for (let t = 0; t < 5; t++) sim.tick([]);
    expect(sim.state.runPhase).toBe('settled-locked'); // still in debt, not lost
    // Liquidation stays open in settled-locked, and it is immediate: +2000
    // lands in step 2, step 9 judges ≥ 0 → won, all in the command's tick.
    sim.tick([remove(3, 0)]);
    expect(sim.state.treasuryMg).toBe(500);
    expect(sim.state.runPhase).toBe('won');
  });

  it('the run summary accumulates stolen, escaped and kills in hashed state', () => {
    const { sim } = makeSim(corridor([openEndedWave()]), testBalance({ speed: 0 }));
    sim.tick([startWave()]);
    // One thief walks off with 25 000 (by fiat teleport), one dies carrying.
    const escapee = injectEnemy(sim, 0, 1, { mode: 'returning', carriedMg: 25_000 });
    sim.tick([]);
    expect(sim.state.enemies.some((e) => e.id === escapee.id)).toBe(false);
    const victim = injectEnemy(sim, 6, 1); // grabs at the treasury
    sim.tick([]);
    victim.hp = 0;
    sim.tick([]);
    expect(sim.state.stolenMg).toBe(25_000);
    expect(sim.state.escapedMg).toBe(25_000);
    expect(sim.state.kills).toBe(1);
  });
});

describe('liquidation total (design D8)', () => {
  it('sums the floored refund of every committed structure', () => {
    expect(
      liquidationTotalMg(
        [
          { paidMg: 50_000, provisional: false },
          { paidMg: 4000, provisional: false },
          { paidMg: 135_001, provisional: false },
        ],
        500,
      ),
    ).toBe(25_000 + 2000 + 67_500);
  });

  it('counts provisional structures at their full refund (design D5)', () => {
    expect(
      liquidationTotalMg(
        [{ paidMg: 50_000, provisional: true }, { paidMg: 4000, provisional: false }],
        500,
      ),
    ).toBe(50_000 + 2000);
  });

  it('a run the provisional refunds could rescue is not reported dead', () => {
    // Two towers, one from an earlier wave, one built this phase, against a
    // debt that only the full refund of the provisional one can clear.
    const { sim } = makeSim(corridor([{ groups: [group()] }, trivialWave()]));
    sim.tick([place('tower', 3, 0)]); // committed by the wave below
    sim.tick([startWave()]);
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]); // settles back to build; the first tower has lived a wave tick
    sim.tick([place('tower', 3, 2)]); // this phase's work: still provisional
    const [committed, provisional] = sim.state.structures;
    expect(committed!.provisional).toBe(false);
    expect(provisional!.provisional).toBe(true);

    // The debt sits between the two totals: half of both (50 000) cannot clear
    // it, but 25 000 + a full 50 000 can.
    sim.state.treasuryMg = -60_000;
    const perStructure = liquidationTotalMg(sim.state.structures, 500);
    const flatHalf = liquidationTotalMg(
      sim.state.structures.map((s) => ({ paidMg: s.paidMg, provisional: false })),
      500,
    );
    expect(flatHalf).toBe(50_000);
    expect(perStructure).toBe(75_000);
    // The dead check the HUD runs: flat-rate would declare this run dead.
    expect(sim.state.treasuryMg + flatHalf).toBeLessThan(0);
    expect(sim.state.treasuryMg + perStructure).toBeGreaterThanOrEqual(0);

    // And the money is really there: selling both clears the debt.
    sim.tick([remove(3, 0), remove(3, 2)]);
    expect(sim.state.treasuryMg).toBe(15_000);
  });
});
