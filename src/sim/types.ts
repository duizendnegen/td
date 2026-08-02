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

/** Hashed as an integer via ENEMY_STATE_ID. */
export type EnemyMode = 'inbound' | 'returning';

export const ENEMY_STATE_ID: Record<EnemyMode, number> = { inbound: 0, returning: 1 };

/**
 * The run state machine (phase-4 design D1). 'settled-locked' is the
 * post-final-wave debt state: every earlier negative settlement returns to
 * 'build', where locked-ness is just the startWave validation reading the
 * balance. Hashed as an integer via RUN_PHASE_ID.
 */
export type RunPhase = 'build' | 'wave' | 'settled-locked' | 'won' | 'lost';

export const RUN_PHASE_ID: Record<RunPhase, number> = {
  build: 0,
  wave: 1,
  'settled-locked': 2,
  won: 3,
  lost: 4,
};

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
  hp: number;
  /** Carried gold in milli-gold; > 0 makes this a carrier (80% speed). */
  carriedMg: number;
  /**
   * Absolute tick the slow status expires; 0 = never slowed. While
   * tick < slowUntil the slow percentage applies after the carrier factor.
   * Re-application takes max(...) — slow extends, never stacks (design D4).
   */
  slowUntil: number;
  /** Tombstone flag; compacted at the end of the tick that clears it. */
  alive: boolean;
}

/** Hashed as an integer via STRUCTURE_KIND_ID. */
export type StructureKind = 'wall' | 'tower';

export const STRUCTURE_KIND_ID: Record<StructureKind, number> = { wall: 0, tower: 1 };

export interface Structure {
  id: number;
  kind: StructureKind;
  /** The structure's tile; every structure is 1×1 (phase-3 design D1). */
  tx: number;
  ty: number;
  /** Towers: index into the canonical archetype list. Walls: -1. */
  archetypeId: number;
  /** Towers: current upgrade level, 1–3. Walls: 0. */
  level: number;
  /**
   * Total invested in milli-gold — base cost plus every upgrade cost paid.
   * The basis of the removal refund (phase-3 design D3).
   */
  paidMg: number;
  /** Absolute tick a pending removal completes, or -1 while not being removed. */
  removalCompleteTick: number;
  /** Towers: absolute tick of the earliest permitted next shot. Walls: 0. */
  nextFireTick: number;
}

/** One sack per tile (drops merge); insertion-ordered like every entity array. */
export interface GoldSack {
  id: number;
  tx: number;
  ty: number;
  amountMg: number;
}

export interface SimState {
  tick: number;
  /** Treasury balance in milli-gold. */
  treasuryMg: number;
  /** Insertion-ordered; iteration order is part of the determinism contract. */
  enemies: Enemy[];
  nextEnemyId: number;
  structures: Structure[];
  nextStructureId: number;
  sacks: GoldSack[];
  nextSackId: number;
  /** The run state machine (design D1). */
  runPhase: RunPhase;
  /** Waves started so far; 0 before the first startWave. 1-based wave number. */
  waveIndex: number;
  /** Absolute tick the active wave started, or -1 outside waves. */
  waveStartTick: number;
  /** Enemies spawned so far per group of the active wave; empty outside waves. */
  groupCursors: number[];
  /** Run summary counters (run-lifecycle spec): totals over the whole run. */
  stolenMg: number;
  escapedMg: number;
  kills: number;
}
