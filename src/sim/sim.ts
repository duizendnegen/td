// Sim class — the tick entry point
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Owns all state, the RNG, and the tick counter
//   - Fixed 10-step tick order (see ARCHITECTURE.md §7)
//   - Exposes render-only events, which are outside the state hash

import type { Command } from './commands';
import { hashState } from './hash';
import { Rng } from './rng';
import type { SimState } from './types';

export interface SimConfig {
  seed: number;
  /** Starting balance in milli-gold. */
  startingTreasuryMg: number;
  /** One debug-timer slot per level spawn (Phase 4 replaces this with waves). */
  spawnCount: number;
}

export const DEBUG_SPAWN_INTERVAL_TICKS = 30;

export class Sim {
  readonly state: SimState;
  private readonly rng: Rng;

  constructor(cfg: SimConfig) {
    this.rng = new Rng(cfg.seed);
    this.state = {
      tick: 0,
      treasuryMg: cfg.startingTreasuryMg,
      enemies: [],
      nextEnemyId: 0,
      // Absolute tick numbers, never countdowns (ARCHITECTURE.md §5).
      nextSpawnTicks: Array.from({ length: cfg.spawnCount }, () => DEBUG_SPAWN_INTERVAL_TICKS),
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
    // 3. Removal timers / field rebuild — Phase 2 (placement)
    // 4. Wave scheduler / debug-timer spawning — lands with enemy.ts (task 4.1)
    // 5. Enemy movement — task 4.1
    // 6. Enemy arrival — task 4.1
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
