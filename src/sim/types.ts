// Entity and state types
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Enemy, Tower, GoldSack, Structure
//   - SimState — everything inside the hash

// STANDING RULE (design D-P1-2): a new field added to any type in this file
// lands in the same commit as its line in hash.ts. The hash walks ALL sim
// state; an unhashed field is an invisible determinism leak.

/** Fixed-point position in 1/1024-tile units. Always integers. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Phase 2 adds 'returning'. Hashed as an integer via ENEMY_STATE_ID. */
export type EnemyMode = 'inbound';

export const ENEMY_STATE_ID: Record<EnemyMode, number> = { inbound: 0 };

export interface Enemy {
  id: number;
  /** Index into the balance file's enemy table (canonical key order at load). */
  typeId: number;
  pos: Vec2;
  /** Interpolation snapshot, re-taken at the top of every tick. Render-only: NOT hashed. */
  prevPos: Vec2;
  /** The committed waypoint — a tile centre, in units. */
  waypoint: Vec2;
  /** Movement speed in units per tick. */
  speed: number;
  mode: EnemyMode;
  /** Tombstone flag; compacted at the end of the tick that clears it. */
  alive: boolean;
}

export interface SimState {
  tick: number;
  /** Treasury balance in milli-gold. */
  treasuryMg: number;
  /** Insertion-ordered; iteration order is part of the determinism contract. */
  enemies: Enemy[];
  nextEnemyId: number;
  /** Absolute tick of the next debug-timer spawn, one slot per level spawn. */
  nextSpawnTicks: number[];
}
