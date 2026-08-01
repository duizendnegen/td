// Debug burst presets and the app-side spawn scheduler
// See the phase-3 enemy-variety spec and design D8
//
// Responsibilities:
//   - Presets are {type, count, spawnInterval} groups — deliberately shaped
//     like Phase-4 wave groups, but expanded HERE, outside the sim, into
//     ordinary typed spawn commands issued at future tick boundaries
//   - The sim holds no preset or schedule state: a recorded command stream
//     reproduces a burst identically without this module present
//   - Non-goal fence: this module may only inject spawn commands; any wave
//     state (active wave, wave index, interest hooks) is a Phase-4 reopening

import type { CommandBody, CommandQueue } from '../sim/commands';

export interface BurstGroup {
  type: string;
  count: number;
  /** Ticks between spawns within the group. */
  spawnInterval: number;
  /** Ticks after the burst trigger before the group starts. */
  delay?: number;
}

export interface BurstPreset {
  id: string;
  label: string;
  groups: BurstGroup[];
}

/**
 * One burst per enemy type plus one mixed-pressure preset (debug-tooling
 * spec). Shapes mirror the leak-harness bursts: swarms overwhelm in a dense
 * train, runners come sparse so each one races the kill window, tanks arrive
 * as a staggered column.
 */
export const PRESETS: readonly BurstPreset[] = [
  {
    id: 'swarm-burst',
    label: 'Swarm burst',
    groups: [{ type: 'swarm', count: 30, spawnInterval: 2 }],
  },
  {
    id: 'tank-burst',
    label: 'Tank burst',
    groups: [{ type: 'tank', count: 3, spawnInterval: 30 }],
  },
  {
    id: 'runner-burst',
    label: 'Runner burst',
    groups: [{ type: 'runner', count: 4, spawnInterval: 60 }],
  },
  {
    id: 'mixed-pressure',
    label: 'Mixed pressure',
    groups: [
      { type: 'tank', count: 2, spawnInterval: 40 },
      { type: 'swarm', count: 15, spawnInterval: 3, delay: 20 },
      { type: 'runner', count: 3, spawnInterval: 50, delay: 60 },
    ],
  },
];

export interface ScheduledCommand {
  /** Absolute tick the command is issued for (applies at that tick boundary). */
  tick: number;
  body: CommandBody;
}

/** Expand a preset triggered at `startTick` into scheduled typed spawn commands. */
export function expandPreset(
  preset: BurstPreset,
  startTick: number,
  spawn = 0,
): ScheduledCommand[] {
  const scheduled: ScheduledCommand[] = [];
  for (const group of preset.groups) {
    const first = startTick + (group.delay ?? 0);
    for (let i = 0; i < group.count; i++) {
      scheduled.push({
        tick: first + i * group.spawnInterval,
        body: { kind: 'spawn', type: group.type, spawn },
      });
    }
  }
  scheduled.sort((a, b) => a.tick - b.tick);
  return scheduled;
}

/**
 * Holds expanded commands and feeds them into the ordinary queue as their
 * ticks come due. Lives app-side by design: replays never need it.
 */
export class SpawnScheduler {
  private pending: ScheduledCommand[] = [];

  add(commands: readonly ScheduledCommand[]): void {
    this.pending.push(...commands);
    this.pending.sort((a, b) => a.tick - b.tick);
  }

  /** Issue everything due at `tick` — call once per tick, before the drain. */
  flushDue(tick: number, queue: CommandQueue): void {
    while (this.pending.length > 0 && this.pending[0]!.tick <= tick) {
      queue.issue(this.pending.shift()!.body);
    }
  }
}
