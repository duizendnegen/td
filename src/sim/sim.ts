// Sim class — the tick entry point
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Owns all state, the RNG, and the tick counter
//   - Fixed 10-step tick order (see ARCHITECTURE.md §7)
//   - Exposes render-only events, which are outside the state hash

import type { GameData } from '../data/schema';
import type { Command } from './commands';
import { canSpend, resolveArrivals, resolveDeaths } from './economy';
import type { RenderEvent } from './events';
import { invalidateCommitments, spawnDueEnemies, stepEnemies } from './enemy';
import type { FlowField } from './flowfield';
import { allocField, buildFieldInto } from './flowfield';
import type { Grid } from './grid';
import { hashState } from './hash';
import { REMOVAL_TICKS } from './fixed';
import type { PlacementVerdict } from './placement';
import { footprintFor, structureAt, tickRemovals, validatePlacement } from './placement';
import { fireTowers } from './tower';
import { Rng } from './rng';
import type { SimState, StructureKind } from './types';

/** Phase-1 debug-timer spawn cadence (1.5 s); Phase 4 replaces it with waves. */
export const DEBUG_SPAWN_INTERVAL_TICKS = 30;

/** The single spawnable enemy type until Phase 3 (model mapping: enemy-ufo-b). */
export const PHASE1_ENEMY = 'runner';

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
  private readonly spawnTypeId: number;
  /** Spare field pair for validation rebuilds; swapped live on accept (D1). */
  private readonly scratch: { inbound: FlowField; returning: FlowField };
  private readonly carryMgByType: number[];
  private readonly bountyMgByType: number[];
  /** Set by any step-2 placement commit; step 3 runs the sweep on it. */
  private maskChanged = false;

  constructor(data: GameData, seed: number) {
    this.rng = new Rng(seed);
    this.data = data;
    this.grid = data.grid;
    this.treasury = { x: data.level.treasury.x, y: data.level.treasury.y };
    // No waves until Phase 4; every wave-1 spawn is active from the start.
    this.activeSpawns = data.level.spawns
      .filter((s) => s.activeFromWave === 1)
      .map((s) => ({ x: s.x, y: s.y }));
    this.spawnTypeId = data.enemyTypes.findIndex((t) => t.key === PHASE1_ENEMY);
    if (this.spawnTypeId < 0) throw new Error(`balance defines no "${PHASE1_ENEMY}" enemy`);
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
    const spawnType = this.data.enemyTypes[this.spawnTypeId]!;
    spawnDueEnemies(s, this.activeSpawns, this.spawnTypeId, spawnType.speed, spawnType.hp, DEBUG_SPAWN_INTERVAL_TICKS);
    // 5. Enemy movement and waypoint re-evaluation
    stepEnemies(s, this.grid, fields);
    // 6. Arrival: treasury grab-and-flip, sack pickup, spawn escape
    resolveArrivals(s, this.treasury, this.activeSpawns, this.carryMgByType);
    // 7. Tower targeting and firing (damage applies this tick)
    fireTowers(s, this.grid, this.inbound, this.data.rapidTower, this.events);
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
  previewPlacement(kind: StructureKind, tx: number, ty: number): PlacementVerdict {
    if (!canSpend(this.state.treasuryMg)) return 'no-funds';
    return validatePlacement(
      this.grid,
      this.state.enemies,
      this.activeSpawns,
      this.treasury,
      footprintFor(kind, tx, ty),
      this.scratch,
    );
  }

  private apply(command: Command): void {
    switch (command.kind) {
      case 'noop':
        break;
      case 'place':
        this.applyPlace(command.structure, command.tx, command.ty);
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

  private applyPlace(kind: StructureKind, tx: number, ty: number): void {
    const s = this.state;
    const footprint = footprintFor(kind, tx, ty);
    const costMg = kind === 'wall' ? this.data.wallCostMg : this.data.rapidTower.costMg;

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
      paidMg: costMg,
      removalCompleteTick: -1,
      nextFireTick: 0,
    });
    s.treasuryMg -= costMg;
    this.maskChanged = true;
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
