// Sim class — the tick entry point
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Owns all state, the RNG, and the tick counter
//   - Fixed 10-step tick order (see ARCHITECTURE.md §7)
//   - Exposes render-only events, which are outside the state hash

import type { GameData } from '../data/schema';
import type { Command } from './commands';
import { despawnAtTreasury, spawnDueEnemies, stepEnemies } from './enemy';
import type { FlowField } from './flowfield';
import { buildField } from './flowfield';
import type { Grid } from './grid';
import { hashState } from './hash';
import { Rng } from './rng';
import type { SimState } from './types';

/** Phase-1 debug-timer spawn cadence (1.5 s); Phase 4 replaces it with waves. */
export const DEBUG_SPAWN_INTERVAL_TICKS = 30;

/** The single Phase-1 enemy type (ARCHITECTURE.md §8 model mapping: enemy-ufo-b). */
export const PHASE1_ENEMY = 'runner';

export class Sim {
  readonly state: SimState;
  readonly grid: Grid;
  /** Both fields are always built and displayable (spec: flowfield-pathfinding). */
  inbound: FlowField;
  returning: FlowField;

  private readonly rng: Rng;
  private readonly treasury: { x: number; y: number };
  private readonly activeSpawns: { x: number; y: number }[];
  private readonly spawnTypeId: number;
  private readonly spawnSpeed: number;

  constructor(data: GameData, seed: number) {
    this.rng = new Rng(seed);
    this.grid = data.grid;
    this.treasury = { x: data.level.treasury.x, y: data.level.treasury.y };
    // Phase 1 has no waves; every wave-1 spawn is active from the start.
    this.activeSpawns = data.level.spawns
      .filter((s) => s.activeFromWave === 1)
      .map((s) => ({ x: s.x, y: s.y }));
    this.spawnTypeId = data.enemyTypes.findIndex((t) => t.key === PHASE1_ENEMY);
    if (this.spawnTypeId < 0) throw new Error(`balance defines no "${PHASE1_ENEMY}" enemy`);
    this.spawnSpeed = data.enemyTypes[this.spawnTypeId]!.speed;

    this.inbound = buildField(this.grid, [this.treasury]);
    this.returning = buildField(this.grid, this.activeSpawns);

    this.state = {
      tick: 0,
      treasuryMg: data.startingTreasuryMg,
      enemies: [],
      nextEnemyId: 0,
      // Absolute tick numbers, never countdowns (ARCHITECTURE.md §5).
      nextSpawnTicks: this.activeSpawns.map(() => DEBUG_SPAWN_INTERVAL_TICKS),
    };
  }

  /** Advance one tick. The 10-step order is fixed; order is part of the contract. */
  tick(commands: readonly Command[]): void {
    const s = this.state;
    // 1. Snapshot prevPos for every entity
    for (const e of s.enemies) {
      e.prevPos.x = e.pos.x;
      e.prevPos.y = e.pos.y;
    }
    // 2. Apply commands (already drained in deterministic order)
    for (const c of commands) this.apply(c);
    // 3. Removal timers / field rebuild on mask change — Phase 2 (placement)
    // 4. Spawning (debug timer stands in for the Phase-4 wave scheduler)
    spawnDueEnemies(s, this.activeSpawns, this.spawnTypeId, this.spawnSpeed, DEBUG_SPAWN_INTERVAL_TICKS);
    // 5. Enemy movement and waypoint re-evaluation
    stepEnemies(s, this.grid, this.inbound);
    // 6. Enemy arrival: Phase 1 despawns at the treasury (theft is Phase 2)
    despawnAtTreasury(s, this.treasury);
    // 7. Tower targeting and firing — Phase 3
    // 8. Deaths, bounties — Phase 3
    // 9. Economy — Phase 2/4
    // 10. Compact tombstones; increment tick
    if (s.enemies.some((e) => !e.alive)) {
      s.enemies = s.enemies.filter((e) => e.alive);
    }
    s.tick++;
  }

  private apply(command: Command): void {
    switch (command.kind) {
      case 'noop':
        break;
    }
  }

  /** Canonical FNV-1a over all sim state. Computed on demand, not per tick. */
  hash(): number {
    return hashState(this.state, this.rng.state());
  }
}
