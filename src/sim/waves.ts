// Wave scheduling: group cursors and drained detection
// See the phase-4 wave-scheduling spec and design D2
//
// Responsibilities:
//   - Resolve authored wave groups to sim terms (typeId, spawn tile) once
//   - Step 4: while a wave is active, each group's cursor emits typed spawns
//     on its delay/interval schedule — fully deterministic in the start tick
//   - Drained = every cursor exhausted AND no live enemy after step 8

import type { GameData } from '../data/schema';
import { spawnEnemy } from './enemy';
import type { SimState } from './types';

/** One authored group, resolved against balance and the spawn list at load. */
export interface ResolvedGroup {
  spawn: { x: number; y: number };
  typeId: number;
  speed: number;
  hp: number;
  count: number;
  spawnInterval: number;
  delay: number;
}

/**
 * Resolve every wave's groups once at Sim construction. Schema validation
 * already guaranteed each reference exists, so lookups here cannot miss.
 */
export function resolveWaves(data: GameData): ResolvedGroup[][] {
  const spawnById = new Map(data.level.spawns.map((s) => [s.id, { x: s.x, y: s.y }]));
  return data.level.waves.map((wave) =>
    wave.groups.map((g) => {
      const typeId = data.enemyTypes.findIndex((t) => t.key === g.type);
      const stats = data.enemyTypes[typeId]!;
      return {
        spawn: spawnById.get(g.spawn)!,
        typeId,
        speed: stats.speed,
        hp: stats.hp,
        count: g.count,
        spawnInterval: g.spawnInterval,
        delay: g.delay,
      };
    }),
  );
}

/**
 * Tick step 4 while runPhase === 'wave': emit every spawn due at this tick.
 * Group i's enemy n spawns at waveStartTick + delay + n × spawnInterval; the
 * while loop makes a zero interval emit the whole group in one tick.
 */
export function stepWaveSpawns(state: SimState, groups: readonly ResolvedGroup[]): void {
  groups.forEach((g, i) => {
    let cursor = state.groupCursors[i]!;
    while (
      cursor < g.count &&
      state.waveStartTick + g.delay + cursor * g.spawnInterval <= state.tick
    ) {
      spawnEnemy(state, g.spawn, g.typeId, g.speed, g.hp);
      cursor++;
    }
    state.groupCursors[i] = cursor;
  });
}

/** Every group cursor exhausted — half of the drained condition (design D2). */
export function cursorsExhausted(state: SimState, groups: readonly ResolvedGroup[]): boolean {
  return groups.every((g, i) => state.groupCursors[i]! >= g.count);
}
