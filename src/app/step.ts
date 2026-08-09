// One synchronous simulation step — the single tick path shared by the
// real-time loop, the F8 probe, and capture-mode stepping (debug-tooling
// spec: "Capture mode uses the same tick path").
//
// Scheduled preset spawns join the queue at their tick boundary, then drain
// with everything else — replays never need the scheduler.

import type { CommandQueue } from '../sim/commands';
import type { Sim } from '../sim/sim';
import type { SpawnScheduler } from './presets';

export function stepOnce(sim: Sim, scheduler: SpawnScheduler, commands: CommandQueue): void {
  scheduler.flushDue(sim.state.tick, commands);
  sim.tick(commands.drain());
}
