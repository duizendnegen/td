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
  /**
   * Index into the level's DECLARED spawn list of the spawn this enemy
   * entered play from — declared, not active, because the active list
   * reshuffles as dormant spawns wake (return-to-origin-spawn design D3).
   * Permanent from birth; a returning enemy steers by and escapes through
   * this spawn alone.
   */
  originSpawn: number;
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

/**
 * Hashed as an integer via STRUCTURE_KIND_ID. The panel (energy-infrastructure
 * design D7) is a wall that generates power: it lives on the wall's placement
 * and refund path and differs only in what the power step reads off it.
 */
export type StructureKind = 'wall' | 'tower' | 'panel';

export const STRUCTURE_KIND_ID: Record<StructureKind, number> = { wall: 0, tower: 1, panel: 2 };

export interface Structure {
  id: number;
  kind: StructureKind;
  /** The structure's tile; every structure is 1×1 (phase-3 design D1). */
  tx: number;
  ty: number;
  /** Towers: index into the canonical archetype list. Walls and panels: -1. */
  archetypeId: number;
  /** Towers: current upgrade level, 1–3. Walls and panels: 0. */
  level: number;
  /**
   * Total invested in milli-gold — base cost plus every upgrade cost paid.
   * The basis of the removal refund (phase-3 design D3).
   */
  paidMg: number;
  /** Towers: absolute tick of the earliest permitted next shot. Walls and panels: 0. */
  nextFireTick: number;
  /**
   * True from placement until the simulation advances a tick while a wave is
   * running (provisional-construction design D1/D2). Provisional construction
   * has not faced a live tick yet: it refunds in full and may be sold in any
   * live phase. The clearing event is an advance under an active wave, never
   * pause — which the simulation cannot see.
   */
  provisional: boolean;
  /**
   * Effective damage dealt in the current or most recent wave
   * (tower-damage-stats design D2/D3): each hit adds min(victim hp, damage),
   * so overkill never counts. Zeroed only in applyStartWave, in the tick the
   * wave-start command applies — between settlement and the next start it is
   * the previous wave's figure. Recorded, never read, by the simulation.
   * Walls: 0.
   */
  waveDamage: number;
  /** Effective damage dealt since placement; never reset. Walls: 0. */
  totalDamage: number;
}

/** One sack per tile (drops merge); insertion-ordered like every entity array. */
export interface GoldSack {
  id: number;
  tx: number;
  ty: number;
  amountMg: number;
}

/**
 * One ledger period's books (wave-ledger design D1): a period opens at run
 * start and at every settlement, and closes at the next settlement — so it
 * spans a build phase and the wave it led to. Every row is an integer sum of
 * tick-level figures, written beside the mutation it mirrors (design D3) and
 * read by nothing in the simulation: the ledger observes, never feeds back.
 *
 * Gold rows are magnitudes with a fixed direction each, except construction,
 * which is net. On every tick
 * `openingMg + bountiesMg + bonusMg + interestMg − constructionMg − billMg − stolenMg + recoveredMg === treasuryMg`.
 * Energy rows are per-tick mp sums; on every tick usage equals sources —
 * `engagedMp + standbyMp + solarWastedMp === (solarUsedMp + solarWastedMp) + gridMp + unmetMp`,
 * the source side's solar being the panels' whole output, used and wasted.
 */
export interface WaveLedger {
  /** Wave number whose start fell in this period (applyStartWave); 0 until one does. */
  waveNo: number;
  /** The treasury balance the period opened on — at run start, or the settled balance. */
  openingMg: number;
  /** + economy.ts resolveDeaths: every bounty credited. */
  bountiesMg: number;
  /** + sim.ts settlement: the wave speed bonus. */
  bonusMg: number;
  /** + economy.ts accrueInterest: the floored amount actually credited each tick. */
  interestMg: number;
  /**
   * Net construction spend: + sim.ts pushStructure / applyUpgrade /
   * applyUpgradeGrid (a connection tier is construction, like a panel),
   * − placement.ts removeStructure's refund. May go negative in a selling
   * build phase.
   */
  constructionMg: number;
  /** − sim.ts step 9: the grid bill as debited (nothing on the settlement tick). */
  billMg: number;
  /** − economy.ts resolveArrivals: gold grabbed at the treasury. */
  stolenMg: number;
  /** + economy.ts returnSacks: gold recovered from unclaimed sacks at settlement. */
  recoveredMg: number;
  /** Usage: rated draw of towers with a target this tick (sim.ts step 7). */
  engagedMp: number;
  /** Usage: standby draw of towers without a target this tick. */
  standbyMp: number;
  /** Source: min(solar, draw) per tick. */
  solarUsedMp: number;
  /** Usage: solar output beyond the draw — discarded, neither stored nor sold. */
  solarWastedMp: number;
  /** Source: the grid's supply as resolved — tier- and balance-bounded. */
  gridMp: number;
  /** Source: draw left uncovered by solar and grid — the brownout, in energy units. */
  unmetMp: number;
}

/** A fresh period with every row at zero, opened on `openingMg` (design D1/D2). */
export function openLedger(openingMg: number): WaveLedger {
  return {
    waveNo: 0,
    openingMg,
    bountiesMg: 0,
    bonusMg: 0,
    interestMg: 0,
    constructionMg: 0,
    billMg: 0,
    stolenMg: 0,
    recoveredMg: 0,
    engagedMp: 0,
    standbyMp: 0,
    solarUsedMp: 0,
    solarWastedMp: 0,
    gridMp: 0,
    unmetMp: 0,
  };
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
  /** The most recent settlement's speed bonus (run-lifecycle spec); 0 before any. */
  lastWaveBonusMg: number;
  /**
   * The grid connection: a 0-based index into the level's tier table
   * (energy-infrastructure design D6). Raised one-way by `upgradeGrid`, never
   * lowered, never refunded. Coverage and the bill are DERIVED from this,
   * the structures and the treasury each tick — never stored, never hashed.
   */
  gridTier: number;
  /**
   * The open ledger period (wave-ledger design D1/D2): opened at run start
   * on the starting treasury and at every settlement on the settled balance.
   */
  ledger: WaveLedger;
  /**
   * The most recently closed period — a copy taken at settlement, never an
   * alias. `waveNo === 0` means none has closed yet. Both slots are hashed
   * and walked unconditionally; nothing in the simulation reads either.
   */
  lastLedger: WaveLedger;
}
