// Capture-mode stepping uses the same tick path as normal running
// (debug-tooling spec, "Capture mode uses the same tick path").
//
// Both runs drive stepOnce — the exact composition behind the real-time
// loop's tick hook and the __td.step seam — with the same seed and the same
// scheduled command stream fed through the SpawnScheduler, the way the
// capture driver delivers its scenario. Only the batching differs: the
// "normal" run steps once per virtual frame, the "capture" run steps in
// uneven driver-sized bursts. The state hash at the common tick must match.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { SpawnScheduler, type ScheduledCommand } from '../src/app/presets';
import { stepOnce } from '../src/app/step';
import { loadGameData } from '../src/data/schema';
import { CommandQueue } from '../src/sim/commands';
import { Sim } from '../src/sim/sim';

const SEED = 0xc0ffee;
const TICKS = 1200;

/** A miniature of the eventual capture scenario: builds, waves, injections. */
function stream(): ScheduledCommand[] {
  return [
    { tick: 20, body: { kind: 'place', structure: 'tower', archetype: 'rapid', tx: 10, ty: 1 } },
    { tick: 20, body: { kind: 'place', structure: 'tower', archetype: 'sniper', tx: 9, ty: 2 } },
    { tick: 60, body: { kind: 'startWave' } },
    { tick: 120, body: { kind: 'spawn', type: 'tank', spawn: 0 } },
    { tick: 140, body: { kind: 'spawn', type: 'brute', spawn: 0 } },
    { tick: 600, body: { kind: 'place', structure: 'wall', tx: 13, ty: 0 } },
  ];
}

function makeRun(): { sim: Sim; commands: CommandQueue; scheduler: SpawnScheduler } {
  const sim = new Sim(loadGameData(levelJson, balanceJson), SEED);
  const commands = new CommandQueue();
  const scheduler = new SpawnScheduler();
  scheduler.add(stream());
  return { sim, commands, scheduler };
}

describe('capture-mode stepping', () => {
  it('reaches the same state hash as a normal run to the same tick', () => {
    // Normal running: one tick at a time, like the real-time loop.
    const normal = makeRun();
    while (normal.sim.state.tick < TICKS) {
      stepOnce(normal.sim, normal.scheduler, normal.commands);
    }

    // Capture driving: a warm-up burst, then uneven step(n) batches like a
    // driver photographing every 2nd tick with occasional stalls.
    const capture = makeRun();
    const batches = [400, 2, 2, 7, 2, 2, 151, 2, 3];
    let b = 0;
    while (capture.sim.state.tick < TICKS) {
      const n = Math.min(batches[b % batches.length]!, TICKS - capture.sim.state.tick);
      for (let i = 0; i < n; i += 1) {
        stepOnce(capture.sim, capture.scheduler, capture.commands);
      }
      b += 1;
    }

    // The stream must actually have produced activity, or the hash equality
    // below would be vacuous.
    expect(normal.sim.state.tick).toBe(TICKS);
    expect(normal.sim.state.structures.length).toBeGreaterThan(0);
    expect(normal.sim.state.kills).toBeGreaterThan(0);

    expect(capture.sim.state.tick).toBe(TICKS);
    expect(capture.sim.hash()).toBe(normal.sim.hash());
  });
});
