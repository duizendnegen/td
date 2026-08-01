// See the phase-3 enemy-variety spec: burst presets expand to ordinary
// commands outside the simulation, so replays reproduce bursts without them.
import { describe, expect, it } from 'vitest';
import { expandPreset, PRESETS, SpawnScheduler } from '../src/app/presets';
import { CommandQueue, type Command } from '../src/sim/commands';
import { Sim } from '../src/sim/sim';
import { loadGameData } from '../src/data/schema';
import { openLevel, testBalance } from './helpers';

const LEVEL = () => openLevel(12, 7, { x: 0, y: 3 }, { x: 11, y: 3 });
const BALANCE = () =>
  testBalance(
    { speed: 96 },
    {
      swarm: { hp: 25, speed: 110, carryCapacity: 8, bounty: 2, slowImmune: false },
      tank: { hp: 420, speed: 70, carryCapacity: 60, bounty: 20, slowImmune: false },
    },
  );

describe('burst presets (design D8)', () => {
  it('expands groups into typed spawns at the scheduled tick boundaries', () => {
    const preset = PRESETS.find((p) => p.id === 'mixed-pressure')!;
    const scheduled = expandPreset(preset, 100);
    const total = preset.groups.reduce((n, g) => n + g.count, 0);
    expect(scheduled).toHaveLength(total);
    // Sorted by tick, all typed spawn commands, delays honoured.
    expect(scheduled.every((s) => s.body.kind === 'spawn')).toBe(true);
    for (let i = 1; i < scheduled.length; i++) {
      expect(scheduled[i]!.tick).toBeGreaterThanOrEqual(scheduled[i - 1]!.tick);
    }
    const group = preset.groups.find((g) => g.type === 'swarm')!;
    const swarm = scheduled.filter((s) => s.body.kind === 'spawn' && s.body.type === 'swarm');
    expect(swarm[0]!.tick).toBe(100 + group.delay!); // delay honoured
    expect(swarm[1]!.tick).toBe(100 + group.delay! + group.spawnInterval); // interval honoured
  });

  it('a recorded command stream reproduces burst hashes without the panel', () => {
    const data = () => loadGameData(LEVEL(), BALANCE());
    const TICKS = 400;

    // Live session: the scheduler expands two presets into the ordinary
    // queue; every drained command is recorded per tick, hash logged per tick.
    const live = new Sim(data(), 7);
    const queue = new CommandQueue();
    const scheduler = new SpawnScheduler();
    scheduler.add(expandPreset(PRESETS.find((p) => p.id === 'swarm-burst')!, 10));
    scheduler.add(expandPreset(PRESETS.find((p) => p.id === 'mixed-pressure')!, 120));
    const recorded = new Map<number, Command[]>();
    const liveHashes: number[] = [];
    for (let t = 0; t < TICKS; t++) {
      scheduler.flushDue(live.state.tick, queue);
      const commands = queue.drain();
      if (commands.length > 0) recorded.set(t, commands);
      live.tick(commands);
      liveHashes.push(live.hash());
    }
    expect(live.state.enemies.length).toBeGreaterThan(0); // bursts actually ran

    // Replay: no scheduler, no presets — just the recorded stream.
    const replay = new Sim(data(), 7);
    for (let t = 0; t < TICKS; t++) {
      replay.tick(recorded.get(t) ?? []);
      expect(replay.hash()).toBe(liveHashes[t]);
    }
  });
});
