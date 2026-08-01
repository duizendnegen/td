// Sim class — the tick entry point
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Owns all state, the RNG, and the tick counter
//   - Fixed 10-step tick order (see ARCHITECTURE.md §7)
//   - Exposes render-only events, which are outside the state hash

import type { GameData, TowerArchetype } from '../data/schema';
import { ARCHETYPES } from '../data/schema';
import type { Command } from './commands';
import { canSpend, resolveArrivals, resolveDeaths } from './economy';
import type { RenderEvent } from './events';
import { invalidateCommitments, spawnDueEnemies, spawnEnemy, stepEnemies } from './enemy';
import type { FlowField } from './flowfield';
import { allocField, buildFieldInto } from './flowfield';
import type { Grid } from './grid';
import { hashState } from './hash';
import { REMOVAL_TICKS } from './fixed';
import type { PlacementVerdict } from './placement';
import { footprintFor, structureAt, tickRemovals, validatePlacement } from './placement';
import { fireTowers, selectTarget } from './tower';
import { Rng } from './rng';
import type { Enemy, SimState, Structure, StructureKind } from './types';

/** Debug-timer spawn cadence (1.5 s); Phase 4 replaces it with waves. */
export const DEBUG_SPAWN_INTERVAL_TICKS = 30;

/** The type the debug timer spawns (model mapping: enemy-ufo-b). */
export const TIMER_ENEMY = 'runner';

/** Towers may only upgrade to this level; the level-3 inspector reads maxed. */
export const MAX_TOWER_LEVEL = 3;

export interface SimOptions {
  /**
   * Debug-timer spawning on/off (default on). The leak-rate harness turns it
   * off so authored bursts are the only pressure; like the seed, this is
   * fixed at construction and part of a run's replay setup.
   */
  timerSpawns?: boolean;
}

export class Sim {
  readonly state: SimState;
  readonly grid: Grid;
  readonly data: GameData;
  /** Both fields are always built and displayable (spec: flowfield-pathfinding). */
  inbound: FlowField;
  returning: FlowField;
  /**
   * Render-only event queue (design D8): appended during ticks, drained by
   * the renderer, never read back, excluded from the hash.
   */
  readonly events: RenderEvent[] = [];

  private readonly rng: Rng;
  private readonly treasury: { x: number; y: number };
  private readonly activeSpawns: { x: number; y: number }[];
  private readonly timerTypeId: number;
  private readonly timerSpawns: boolean;
  /** Spare field pair for validation rebuilds; swapped live on accept (D1). */
  private readonly scratch: { inbound: FlowField; returning: FlowField };
  private readonly carryMgByType: number[];
  private readonly bountyMgByType: number[];
  /** Set by any step-2 placement commit; step 3 runs the sweep on it. */
  private maskChanged = false;

  constructor(data: GameData, seed: number, options: SimOptions = {}) {
    this.rng = new Rng(seed);
    this.data = data;
    this.grid = data.grid;
    this.treasury = { x: data.level.treasury.x, y: data.level.treasury.y };
    // No waves until Phase 4; every wave-1 spawn is active from the start.
    this.activeSpawns = data.level.spawns
      .filter((s) => s.activeFromWave === 1)
      .map((s) => ({ x: s.x, y: s.y }));
    this.timerTypeId = data.enemyTypes.findIndex((t) => t.key === TIMER_ENEMY);
    if (this.timerTypeId < 0) throw new Error(`balance defines no "${TIMER_ENEMY}" enemy`);
    this.timerSpawns = options.timerSpawns ?? true;
    this.carryMgByType = data.enemyTypes.map((t) => t.carryMg);
    this.bountyMgByType = data.enemyTypes.map((t) => t.bountyMg);

    this.inbound = allocField(this.grid);
    this.returning = allocField(this.grid);
    buildFieldInto(this.grid, [this.treasury], this.inbound);
    buildFieldInto(this.grid, this.activeSpawns, this.returning);
    this.scratch = { inbound: allocField(this.grid), returning: allocField(this.grid) };

    this.state = {
      tick: 0,
      treasuryMg: data.startingTreasuryMg,
      enemies: [],
      nextEnemyId: 0,
      structures: [],
      nextStructureId: 0,
      sacks: [],
      nextSackId: 0,
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
    // 3. Removal timers; sweep stale commitments after any mask change
    if (tickRemovals(s, this.grid, this.data.refundPer1000)) {
      buildFieldInto(this.grid, [this.treasury], this.inbound);
      buildFieldInto(this.grid, this.activeSpawns, this.returning);
      this.maskChanged = true;
    }
    const fields = { inbound: this.inbound, returning: this.returning };
    if (this.maskChanged) {
      invalidateCommitments(s, this.grid, fields);
      this.maskChanged = false;
    }
    // 4. Spawning (debug timer stands in for the Phase-4 wave scheduler)
    if (this.timerSpawns) {
      const spawnType = this.data.enemyTypes[this.timerTypeId]!;
      spawnDueEnemies(s, this.activeSpawns, this.timerTypeId, spawnType.speed, spawnType.hp, DEBUG_SPAWN_INTERVAL_TICKS);
    }
    // 5. Enemy movement and waypoint re-evaluation
    stepEnemies(s, this.grid, fields, this.data.slowSpeedPer100);
    // 6. Arrival: treasury grab-and-flip, sack pickup, spawn escape
    resolveArrivals(s, this.treasury, this.activeSpawns, this.carryMgByType, this.events);
    // 7. Tower targeting and firing (damage applies this tick)
    fireTowers(s, this.grid, fields, this.data, this.events);
    // 8. Deaths: bounties, carrier sack drops, tombstones
    resolveDeaths(s, this.bountyMgByType);
    // 9. Economy: interest and bankruptcy are Phase 4
    // 10. Compact tombstones; increment tick
    if (s.enemies.some((e) => !e.alive)) {
      s.enemies = s.enemies.filter((e) => e.alive);
    }
    s.tick++;
  }

  /**
   * Speculative validation for the ghost preview (design D1): the same
   * pipeline the authoritative apply runs, against live state, with no
   * observable mutation — hovering never changes the hash.
   */
  previewPlacement(tx: number, ty: number): PlacementVerdict {
    if (!canSpend(this.state.treasuryMg)) return 'no-funds';
    return validatePlacement(
      this.grid,
      this.state.enemies,
      this.activeSpawns,
      this.treasury,
      footprintFor(tx, ty),
      this.scratch,
    );
  }

  /**
   * The tower's current target, re-derived from live state — read-only, for
   * the F3 overlay and the weapon-head yaw. Matches the firing selection
   * exactly because it IS the firing selection.
   */
  currentTarget(t: Structure): Enemy | null {
    if (t.kind !== 'tower') return null;
    return selectTarget(t, this.state, this.grid, { inbound: this.inbound, returning: this.returning }, this.data);
  }

  private apply(command: Command): void {
    switch (command.kind) {
      case 'noop':
        break;
      case 'spawn':
        this.applySpawn(command.type, command.spawn);
        break;
      case 'place':
        this.applyPlace(command.structure, command.archetype ?? 'rapid', command.tx, command.ty);
        break;
      case 'upgrade':
        this.applyUpgrade(command.tx, command.ty);
        break;
      case 'remove': {
        const s = structureAt(this.state.structures, command.tx, command.ty);
        if (s && s.removalCompleteTick < 0) {
          s.removalCompleteTick = this.state.tick + REMOVAL_TICKS;
        }
        break;
      }
    }
  }

  /** Typed spawn (enemy-variety spec): ordinary command, ordinary queue. */
  private applySpawn(type: string, spawnIndex: number): void {
    const typeId = this.data.enemyTypes.findIndex((t) => t.key === type);
    const spawn = this.activeSpawns[spawnIndex];
    if (typeId < 0 || !spawn) return; // unknown type or spawn: reject silently
    const stats = this.data.enemyTypes[typeId]!;
    spawnEnemy(this.state, spawn, typeId, stats.speed, stats.hp);
  }

  private applyPlace(kind: StructureKind, archetype: TowerArchetype, tx: number, ty: number): void {
    const s = this.state;
    const footprint = footprintFor(tx, ty);
    const archetypeId = kind === 'wall' ? -1 : ARCHETYPES.indexOf(archetype);
    const costMg =
      kind === 'wall' ? this.data.wallCostMg : this.data.towers[archetypeId]!.levels[0]!.costMg;

    const verdict = canSpend(s.treasuryMg)
      ? validatePlacement(this.grid, s.enemies, this.activeSpawns, this.treasury, footprint, this.scratch)
      : 'no-funds';
    if (verdict !== 'ok') {
      this.events.push({ kind: 'placementRejected', tiles: footprint });
      return;
    }

    // Commit: re-block the footprint and swap in the fields the validation
    // just built for exactly this mask — one rebuild per attempt (D1).
    for (const t of footprint) this.grid.setBlocked(t.x, t.y, true);
    this.swapScratchFields();
    s.structures.push({
      id: s.nextStructureId++,
      kind,
      tx,
      ty,
      archetypeId,
      level: kind === 'wall' ? 0 : 1,
      paidMg: costMg,
      removalCompleteTick: -1,
      nextFireTick: 0,
    });
    s.treasuryMg -= costMg;
    this.maskChanged = true;
  }

  /**
   * Upgrade (tower-upgrades spec): valid only on an existing tower below max
   * level with no removal countdown while the balance is ≥ 0. Stats and the
   * charge land in the same tick; any failure leaves state untouched.
   */
  private applyUpgrade(tx: number, ty: number): void {
    const s = this.state;
    const t = structureAt(s.structures, tx, ty);
    const valid =
      t !== null &&
      t.kind === 'tower' &&
      t.level < MAX_TOWER_LEVEL &&
      t.removalCompleteTick < 0 &&
      canSpend(s.treasuryMg);
    if (!valid) {
      this.events.push({ kind: 'placementRejected', tiles: footprintFor(tx, ty) });
      return;
    }
    // levels[] is 0-based: the next level's row is levels[t.level].
    const costMg = this.data.towers[t.archetypeId]!.levels[t.level]!.costMg;
    s.treasuryMg -= costMg;
    t.paidMg += costMg;
    t.level++;
  }

  private swapScratchFields(): void {
    const { inbound, returning } = this;
    this.inbound = this.scratch.inbound;
    this.returning = this.scratch.returning;
    this.scratch.inbound = inbound;
    this.scratch.returning = returning;
  }

  /** Canonical FNV-1a over all sim state. Computed on demand, not per tick. */
  hash(): number {
    return hashState(this.state, this.rng.state());
  }
}
