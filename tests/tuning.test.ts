// Balance tuning dials (scale-world-experiment, debug-tooling spec)
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import level01Json from '../src/data/levels/level_01.json';
import level02Json from '../src/data/levels/level_02.json';
import { applyTuning, parseTuning } from '../src/app/tuning';
import { loadGameData } from '../src/data/schema';
import { Sim } from '../src/sim/sim';
import { spawnCmd } from './helpers';

const params = (query: string): URLSearchParams => new URLSearchParams(query);

describe('tuning dials (debug-tooling spec)', () => {
  it('absent dials mean authored values, referentially untouched', () => {
    expect(parseTuning(params(''))).toEqual({});
    // ?seed= and ?level= are not dials and must not trip validation.
    expect(parseTuning(params('seed=1234&level=2'))).toEqual({});
    const out = applyTuning(level01Json, balanceJson, {});
    expect(out.levelJson).toBe(level01Json);
    expect(out.balanceJson).toBe(balanceJson);
  });

  it('multiplier dials scale authored values before fixed-point conversion', () => {
    const tuning = parseTuning(params('rangeScale=2&hpScale=3'));
    expect(tuning).toEqual({ rangeScale: 2, hpScale: 3 });
    const out = applyTuning(level01Json, balanceJson, tuning);
    const data = loadGameData(out.levelJson, out.balanceJson);
    // Authored rapid range 4.5 tiles → 9 tiles → one rounding at load.
    expect(data.towers[0]!.levels[0]!.rangeUnits).toBe(9_216);
    // Authored swarm hp 100 → 300.
    expect(data.enemyTypes.find((t) => t.key === 'swarm')!.hp).toBe(300);
    // The authored objects were not mutated.
    expect(balanceJson.towers.rapid.levels[0]!.rangeTiles).toBe(4.5);
    expect(balanceJson.enemies.swarm.hp).toBe(100);
  });

  it('waveScale stretches waves at constant spawned hp per tick', () => {
    const tuning = parseTuning(params('waveScale=5'));
    expect(tuning).toEqual({ waveScale: 5 });
    const out = applyTuning(level01Json, balanceJson, tuning);
    const data = loadGameData(out.levelJson, out.balanceJson);
    // Wave 1: one swarm group of 6 at interval 10, delay 40 → 30 at the same
    // interval, delay 200: 5× the enemies over ~5× the span.
    const wave1 = data.level.waves[0]!.groups[0]!;
    expect(wave1).toMatchObject({ count: 30, spawnInterval: 10, delay: 200 });
    // Wave 5's two groups keep their choreography: the swarm's delay still
    // sits ~mid-way through the tank stream.
    const [tanks, swarm] = data.level.waves[4]!.groups;
    expect(tanks).toMatchObject({ count: 15, spawnInterval: 80, delay: 200 });
    expect(swarm).toMatchObject({ count: 30, spawnInterval: 10, delay: 600 });
    // The authored level was not mutated.
    expect(level01Json.waves[0]!.groups[0]!.count).toBe(6);
  });

  it('waveScale leaves single-enemy groups single (only their delay scales)', () => {
    const out = applyTuning(level02Json, balanceJson, { waveScale: 5 });
    const data = loadGameData(out.levelJson, out.balanceJson);
    // Level 2 wave 2 is a lone tank (count 1, delay 120): still one tank, later.
    const boss = data.level.waves[1]!.groups.find((g) => g.type === 'tank')!;
    expect(boss).toMatchObject({ count: 1, delay: 600 });
    // Fractional scales round once and never drop a group below one enemy.
    const down = applyTuning(level01Json, balanceJson, { waveScale: 0.25 });
    const small = loadGameData(down.levelJson, down.balanceJson);
    // Wave 3's runner pair (count 2) → round(0.5) = 0 → clamped to 1.
    const runners = small.level.waves[2]!.groups.find((g) => g.type === 'runner')!;
    expect(runners.count).toBe(1);
  });

  it('absolute dials override balance and level economy values', () => {
    const tuning = parseTuning(
      params(
        'carrierSpeedPer100=80&wallCost=20&interestRatePpm=100&startingTreasury=350&bonusGraceTicks=150&bonusDecayTicks=600&sackRecoveryPer1000=1000&refundPer1000=750',
      ),
    );
    const out = applyTuning(level01Json, balanceJson, tuning);
    const data = loadGameData(out.levelJson, out.balanceJson);
    expect(data.carrierSpeedPer100).toBe(80);
    expect(data.wallCostMg).toBe(20_000);
    expect(data.interestRatePpm).toBe(100);
    expect(data.startingTreasuryMg).toBe(350_000);
    expect(data.waveBonus.graceTicks).toBe(150);
    expect(data.waveBonus.decayTicks).toBe(600);
    expect(data.sackRecoveryPer1000).toBe(1000);
    expect(data.refundPer1000).toBe(750);
  });

  it('a dialed run is deterministic: identical replays, identical hashes', () => {
    const run = (): number => {
      const out = applyTuning(level01Json, balanceJson, parseTuning(params('rangeScale=2&hpScale=3')));
      const sim = new Sim(loadGameData(out.levelJson, out.balanceJson), 42);
      sim.tick([spawnCmd('runner'), spawnCmd('swarm')]);
      for (let t = 0; t < 400; t++) sim.tick([]);
      return sim.hash();
    };
    expect(run()).toBe(run());
  });

  it('invalid dials fail loudly, naming the parameter', () => {
    expect(() => parseTuning(params('hpScale=-1'))).toThrow(/hpScale/);
    expect(() => parseTuning(params('rangeScale=abc'))).toThrow(/rangeScale/);
    expect(() => parseTuning(params('carrierSpeedPer100=1.5'))).toThrow(/carrierSpeedPer100/);
    expect(() => parseTuning(params('sackRecoveryPer1000=1001'))).toThrow(/sackRecoveryPer1000/);
    expect(() => parseTuning(params('bonusDecayTicks=0'))).toThrow(/bonusDecayTicks/);
    expect(() => parseTuning(params('waveScale=0'))).toThrow(/waveScale/);
  });

  it('dialed data still passes the schema’s semantic checks', () => {
    // A uniform range multiplier preserves the 2-axis invariant; the load
    // must succeed rather than trip the rapid.rangeTiles constancy check.
    const out = applyTuning(level01Json, balanceJson, { rangeScale: 0.5 });
    expect(() => loadGameData(out.levelJson, out.balanceJson)).not.toThrow();
  });
});
