// See the phase-4 wave-scheduling spec and design D2/D7
import { describe, expect, it } from 'vitest';
import { toTile } from '../src/sim/fixed';
import { INERT_POWER, concede, makeSim, openLevel, startWave, testBalance, trivialWave } from './helpers';

// A short straight corridor: spawn (0,1) → treasury (6,1).
const corridor = (waves: Record<string, unknown>[]) =>
  openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], { waves });

const group = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  spawn: 'main',
  type: 'runner',
  count: 1,
  spawnInterval: 1,
  delay: 0,
  ...over,
});

describe('wave scheduling', () => {
  it('a group unrolls at exactly startTick + delay + n × interval', () => {
    const { sim } = makeSim(
      corridor([{ groups: [group({ count: 3, spawnInterval: 20, delay: 40 })] }]),
    );
    for (let t = 0; t < 5; t++) sim.tick([]);
    const startTick = sim.state.tick; // 5
    const spawnTicks: number[] = [];
    let seen = 0;
    sim.tick([startWave()]);
    for (let t = 0; t < 120; t++) {
      if (sim.state.enemies.length > seen) {
        spawnTicks.push(sim.state.tick - 1); // the tick that just ran
        seen = sim.state.enemies.length;
      }
      sim.tick([]);
    }
    expect(spawnTicks).toEqual([startTick + 40, startTick + 60, startTick + 80]);
  });

  it('overlapping groups run concurrently, each at its own cadence', () => {
    const { sim } = makeSim(
      corridor([
        {
          groups: [
            group({ count: 3, spawnInterval: 10, delay: 0 }),
            group({ count: 2, spawnInterval: 10, delay: 5 }),
          ],
        },
      ]),
    );
    const counts: number[] = [];
    sim.tick([startWave()]); // startTick 0: group-1 enemy 0 spawns this tick
    counts.push(sim.state.enemies.length);
    for (let t = 0; t < 30; t++) {
      sim.tick([]);
      counts.push(sim.state.enemies.length);
    }
    // Spawn ticks: g1 at 0/10/20, g2 at 5/15.
    expect(counts[0]).toBe(1);
    expect(counts[5]).toBe(2);
    expect(counts[10]).toBe(3);
    expect(counts[15]).toBe(4);
    expect(counts[20]).toBe(5);
    expect(counts[30]).toBe(5);
  });

  it('no spawning between waves, however long the build phase lasts', () => {
    const { sim } = makeSim(corridor([trivialWave(), trivialWave()]));
    for (let t = 0; t < 200; t++) sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.runPhase).toBe('build');
  });

  it('start during an active wave is rejected with no hash divergence', () => {
    const build = () =>
      makeSim(corridor([{ groups: [group({ count: 2, spawnInterval: 50 })] }, trivialWave()])).sim;
    const withAttempt = build();
    const without = build();
    withAttempt.tick([startWave()]);
    without.tick([startWave()]);
    withAttempt.tick([startWave()]); // rejected: wave 1 is active
    without.tick([]);
    for (let t = 0; t < 20; t++) {
      withAttempt.tick([]);
      without.tick([]);
    }
    expect(withAttempt.state.waveIndex).toBe(1);
    expect(withAttempt.hash()).toBe(without.hash());
  });

  it('a wave stays active until its last enemy dies — even if all die before the last group spawns', () => {
    const { sim } = makeSim(
      corridor([
        {
          groups: [
            group({ count: 1, delay: 0 }),
            group({ count: 1, delay: 100 }),
          ],
        },
        trivialWave(),
      ]),
    );
    sim.tick([startWave()]); // first enemy spawns at tick 0
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]); // dies; zero live enemies, but a cursor is unexhausted
    expect(sim.state.enemies).toHaveLength(0);
    for (let t = sim.state.tick; t < 100; t++) {
      sim.tick([]);
      expect(sim.state.runPhase).toBe('wave');
    }
    sim.tick([]); // tick 100: the late group spawns
    expect(sim.state.enemies).toHaveLength(1);
    expect(sim.state.runPhase).toBe('wave');
    sim.state.enemies[0]!.hp = 0;
    sim.tick([]); // dies → drained → settlement
    expect(sim.state.runPhase).toBe('build');
  });

  it('a fleeing carrier keeps the wave active; its escape ends it', () => {
    const { sim } = makeSim(
      corridor([{ groups: [group()] }, trivialWave()]),
      testBalance({ speed: 128 }),
    );
    sim.tick([startWave()]);
    let guard = 0;
    while (sim.state.enemies.some((e) => e.mode === 'inbound') && guard++ < 500) {
      sim.tick([]);
      expect(sim.state.runPhase).toBe('wave');
    }
    // Returning with the loot: the wave is still active, startWave rejected.
    expect(sim.state.enemies[0]!.mode).toBe('returning');
    sim.tick([startWave()]);
    expect(sim.state.waveIndex).toBe(1);
    guard = 0;
    while (sim.state.enemies.length > 0 && guard++ < 500) sim.tick([]);
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.escapedMg).toBe(25_000);
  });
});

describe('spawn activation by wave (design D7)', () => {
  // Two spawns: main (0,1) active from wave 1, east (6,0) dormant until wave
  // 2 — deliberately one tile from the treasury, the maximally tempting
  // wrong exit for anything that is not origin-true routing.
  const twoFront = (waves: Record<string, unknown>[]): Record<string, unknown> => ({
    id: 'test',
    grid: { width: 7, height: 3 },
    treasury: { x: 6, y: 1 },
    spawns: [
      { id: 'main', x: 0, y: 1, activeFromWave: 1 },
      { id: 'east', x: 6, y: 0, activeFromWave: 2 },
    ],
    terrain: { legend: { '.': 'dirt' }, map: ['.......', '.......', '.......'] },
    economy: { startingTreasury: 200, interestRatePerTick: 0 },
    power: INERT_POWER,
    waves,
  });

  it('a dormant spawn emits nothing and is no escape target', () => {
    const { sim } = makeSim(
      twoFront([
        { groups: [group()] },
        { groups: [group({ spawn: 'east' })] },
      ]),
      testBalance({ speed: 128 }),
    );
    sim.tick([startWave()]);
    let guard = 0;
    while (sim.state.enemies.length > 0 && guard++ < 500) {
      // Nothing ever appears at the dormant east spawn...
      for (const e of sim.state.enemies) {
        expect(toTile(e.pos.x) === 6 && toTile(e.pos.y) === 0).toBe(false);
      }
      sim.tick([]);
    }
    // ...and the carrier walked all the way back out the west spawn, even
    // though the dormant east spawn sat one tile from the treasury.
    expect(sim.state.escapedMg).toBe(25_000);
    expect(sim.state.runPhase).toBe('build');
  });

  it('activation at wave start opens the second front and redraws the exits', () => {
    const { sim } = makeSim(
      twoFront([
        { groups: [group()] },
        { groups: [group({ spawn: 'east' })] },
      ]),
      testBalance({ speed: 128 }),
    );
    sim.tick([startWave()]);
    let guard = 0;
    while (sim.state.runPhase === 'wave' && guard++ < 500) sim.tick([]);
    sim.tick([startWave()]); // wave 2: east activates, its group spawns there
    expect(sim.state.enemies).toHaveLength(1);
    const e = sim.state.enemies[0]!;
    expect(toTile(e.pos.x)).toBe(6);
    expect(toTile(e.pos.y)).toBe(0);
    // East is this carrier's ORIGIN: it grabs at the treasury (6,1) and
    // escapes right back through the adjacent east spawn it entered from.
    guard = 0;
    while (sim.state.enemies.length > 0 && guard++ < 500) sim.tick([]);
    expect(sim.state.escapedMg).toBe(50_000); // wave 1's carrier plus this one
    expect(guard).toBeLessThan(30); // one tile in, one tile out — not a trek west
  });

  it('a carrier from the farther spawn exits at its origin, never the nearer one', () => {
    // Both fronts active from wave 1; the wave's runner enters at the far
    // west spawn, so its whole return trip runs PAST the east spawn that
    // sits one tile from the treasury.
    const level = twoFront([
      { groups: [group()] },
      { groups: [group({ spawn: 'east' })] },
    ]) as { spawns: { activeFromWave: number }[] };
    level.spawns[1]!.activeFromWave = 1;
    const { sim } = makeSim(level, testBalance({ speed: 128 }));
    sim.tick([startWave()]);
    expect(sim.state.enemies[0]!.originSpawn).toBe(0); // declared index of west
    let walkedHomeWest = false;
    let guard = 0;
    while (sim.state.enemies.length > 0 && guard++ < 500) {
      const e = sim.state.enemies[0]!;
      const tile = { x: toTile(e.pos.x), y: toTile(e.pos.y) };
      // The active east spawn tile (6,0) is never entered — not inbound, not
      // returning — even though it is the nearest exit from the treasury.
      expect(tile).not.toEqual({ x: 6, y: 0 });
      if (e.mode === 'returning' && tile.x <= 1) walkedHomeWest = true;
      sim.tick([]);
    }
    // It escaped — and did so via the full trek back to the west spawn, not
    // through the exit one tile from the treasury. (The spawn tile itself is
    // unobservable from outside a tick: arrival and despawn share the tick.)
    expect(sim.state.escapedMg).toBe(25_000);
    expect(walkedHomeWest).toBe(true);
  });

  it('activation changes no field content and swaps no field object', () => {
    const { sim } = makeSim(
      twoFront([
        { groups: [group()] },
        { groups: [group({ spawn: 'east' })] },
      ]),
      testBalance({ speed: 128 }),
    );
    // Dormant east's returning field is built from construction (design D1).
    expect(sim.returning).toHaveLength(2);
    expect(sim.returning[1]!.cost.some((c) => c > 0)).toBe(true);

    // Drain wave 1, then snapshot every field right before wave 2 activates east.
    sim.tick([startWave()]);
    let guard = 0;
    while (sim.state.runPhase === 'wave' && guard++ < 500) sim.tick([]);
    const inboundRef = sim.inbound;
    const returningRefs = [...sim.returning];
    const costs = [Array.from(sim.inbound.cost), ...sim.returning.map((f) => Array.from(f.cost))];

    sim.tick([startWave()]); // east activates here

    expect(sim.inbound).toBe(inboundRef);
    sim.returning.forEach((f, i) => expect(f).toBe(returningRefs[i]));
    expect([Array.from(sim.inbound.cost), ...sim.returning.map((f) => Array.from(f.cost))]).toEqual(
      costs,
    );
  });
});

describe('startWave and concede commands', () => {
  it('startWave is rejected in debt, leaving no trace in the hash', () => {
    const build = () => {
      const { sim } = makeSim(corridor([trivialWave()]));
      sim.state.treasuryMg = -1000;
      return sim;
    };
    const withAttempt = build();
    const without = build();
    withAttempt.tick([startWave()]);
    without.tick([]);
    expect(withAttempt.state.runPhase).toBe('build');
    expect(withAttempt.state.waveIndex).toBe(0);
    expect(withAttempt.hash()).toBe(without.hash());
  });

  it('concede ends the run as lost from build and from an active wave', () => {
    const inBuild = makeSim(corridor([trivialWave()])).sim;
    inBuild.tick([concede()]);
    expect(inBuild.state.runPhase).toBe('lost');

    const inWave = makeSim(corridor([{ groups: [group({ count: 2, spawnInterval: 90 })] }])).sim;
    inWave.tick([startWave()]);
    inWave.tick([concede()]);
    expect(inWave.state.runPhase).toBe('lost');
    // Lost is terminal: no further wave can start.
    inWave.tick([startWave()]);
    expect(inWave.state.waveIndex).toBe(1);
    expect(inWave.state.runPhase).toBe('lost');
  });

  it('startWave after the run is decided is rejected', () => {
    const { sim } = makeSim(corridor([trivialWave(), trivialWave()]));
    sim.tick([concede()]);
    sim.tick([startWave()]);
    expect(sim.state.waveIndex).toBe(0);
    expect(sim.state.runPhase).toBe('lost');
  });
});
