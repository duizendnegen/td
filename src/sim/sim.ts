// Sim class — the tick entry point
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Owns all state, the RNG, and the tick counter
//   - Fixed 10-step tick order (see ARCHITECTURE.md §7)
//   - The run state machine: waves in step 4, progression in step 9 (D2)
//   - Exposes render-only events, which are outside the state hash

import type { GameData, TowerArchetype } from '../data/schema';
import { ARCHETYPES } from '../data/schema';
import type { Command } from './commands';
import {
  accrueInterest,
  canSpend,
  resolveArrivals,
  resolveDeaths,
  returnSacks,
  waveBonusMg,
} from './economy';
import type { RenderEvent } from './events';
import { invalidateCommitments, spawnEnemy, stepEnemies } from './enemy';
import type { FlowField } from './flowfield';
import { allocField, buildFieldInto } from './flowfield';
import type { Grid } from './grid';
import { TERRAIN } from './grid';
import { hashState } from './hash';
import type { PlacementVerdict } from './placement';
import {
  canRemove,
  footprintFor,
  removeStructure,
  structureAt,
  validatePlacement,
} from './placement';
import { fireTowers, selectTarget } from './tower';
import { Rng } from './rng';
import { cursorsExhausted, lastSpawnOffset, resolveWaves, stepWaveSpawns, type ResolvedGroup } from './waves';
import type { Enemy, SimState, Structure, StructureKind } from './types';

/** Towers may only upgrade to this level; the level-3 inspector reads maxed. */
export const MAX_TOWER_LEVEL = 3;

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
  /** Every declared spawn — the no-sealing validation set (design D4). */
  private readonly allSpawns: { x: number; y: number }[];
  /** Spawns active at the current waveIndex — field sources and escape targets. */
  private activeSpawns: { x: number; y: number }[];
  /** Authored waves resolved to sim terms once at construction. */
  private readonly waves: ResolvedGroup[][];
  /** Spare field pair for validation rebuilds; swapped live on accept (D1). */
  private readonly scratch: { inbound: FlowField; returning: FlowField };
  private readonly carryMgByType: number[];
  private readonly bountyMgByType: number[];
  /** Set by any step-2 placement commit; step 3 runs the sweep on it. */
  private maskChanged = false;
  /**
   * Set by any step-2 removal that unblocked a tile; step 3 rebuilds the live
   * fields once for the whole tick, however many structures came down (D2).
   */
  private removalUnblocked = false;

  constructor(data: GameData, seed: number) {
    this.rng = new Rng(seed);
    this.data = data;
    this.grid = data.grid;
    this.treasury = { x: data.level.treasury.x, y: data.level.treasury.y };
    this.allSpawns = data.level.spawns.map((s) => ({ x: s.x, y: s.y }));
    this.activeSpawns = data.level.spawns
      .filter((s) => s.activeFromWave === 1)
      .map((s) => ({ x: s.x, y: s.y }));
    this.waves = resolveWaves(data);
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
      runPhase: 'build',
      waveIndex: 0,
      waveStartTick: -1,
      groupCursors: [],
      stolenMg: 0,
      escapedMg: 0,
      kills: 0,
      lastWaveBonusMg: 0,
    };
  }

  /** Total authored wave count, for the HUD's counter and preview. */
  get totalWaves(): number {
    return this.waves.length;
  }

  /**
   * Advance one tick. The 10-step order is fixed; order is part of the contract.
   *
   * This is exactly `commit(commands)` followed by `advance()` — the two halves
   * are separable so a stopped game can absorb player intent without consuming
   * time (time-controls design D2). Every existing caller keeps this entry
   * point and is unaffected by the split.
   */
  tick(commands: readonly Command[]): void {
    this.commit(commands);
    this.advance();
  }

  /**
   * Steps 1–3 — absorb intent. Snapshot, apply commands, rebuild the fields for
   * any mask change and sweep stale commitments. Everything here is reactive to
   * commands; nothing here consumes time.
   *
   * Safe to call any number of times before an `advance()`, with the same result
   * as one commit carrying the concatenated commands in the same order: step 1
   * re-snapshots an unmoved position (a no-op), `validatePlacement` builds its
   * scratch fields from the live mask rather than depending on step 3, and the
   * step-3 sweep is idempotent while nothing has moved.
   */
  commit(commands: readonly Command[]): void {
    const s = this.state;
    // 1. Snapshot prevPos for every entity
    for (const e of s.enemies) {
      e.prevPos.x = e.pos.x;
      e.prevPos.y = e.pos.y;
    }
    // 2. Apply commands (already drained in deterministic order)
    for (const c of commands) this.apply(c);
    // 3. Rebuild the fields once for this tick's removals; sweep stale
    //    commitments after any mask change
    if (this.removalUnblocked) {
      buildFieldInto(this.grid, [this.treasury], this.inbound);
      buildFieldInto(this.grid, this.activeSpawns, this.returning);
      this.removalUnblocked = false;
      this.maskChanged = true;
    }
    if (this.maskChanged) {
      invalidateCommitments(s, this.grid, {
        inbound: this.inbound,
        returning: this.returning,
      });
      this.maskChanged = false;
    }
  }

  /**
   * Steps 4–10 — let time pass. Spawns, movement, arrivals, firing, deaths,
   * progression, compaction and the tick increment.
   *
   * Reads the live fields directly: only a command can swap them, and commands
   * are applied in `commit`, so they are current by construction.
   */
  advance(): void {
    const s = this.state;
    const fields = { inbound: this.inbound, returning: this.returning };
    // 4. Spawning: the active wave's group cursors (design D2)
    if (s.runPhase === 'wave') {
      stepWaveSpawns(s, this.waves[s.waveIndex - 1]!);
    }
    // 5. Enemy movement and waypoint re-evaluation
    stepEnemies(s, this.grid, fields, this.data.slowSpeedPer100);
    // 6. Arrival: treasury grab-and-flip, sack pickup, spawn escape
    resolveArrivals(s, this.treasury, this.activeSpawns, this.carryMgByType, this.events);
    // 7. Tower targeting and firing (damage applies this tick)
    fireTowers(s, this.grid, fields, this.data, this.events);
    // 8. Deaths: bounties, carrier sack drops, tombstones
    resolveDeaths(s, this.bountyMgByType);
    // 9. Run progression (design D2): interest while a wave runs, settlement
    //    when it drains, refund-driven win from the post-final-wave lock
    this.stepProgression();
    // 10. Compact tombstones; increment tick
    if (s.enemies.some((e) => !e.alive)) {
      s.enemies = s.enemies.filter((e) => e.alive);
    }
    s.tick++;
  }

  /**
   * Step 9 — the single progression point (design D2). No interest accrues
   * on the settlement tick: the wave is already over when step 9 sees it
   * drained.
   */
  private stepProgression(): void {
    const s = this.state;
    if (s.runPhase === 'wave') {
      const drained =
        cursorsExhausted(s, this.waves[s.waveIndex - 1]!) && !s.enemies.some((e) => e.alive);
      if (!drained) {
        accrueInterest(s, this.data.interestRatePpm);
        return;
      }
      // Settlement: sack return, then the speed bonus, then the progression
      // judgement on the post-return, post-bonus balance (run-lifecycle spec).
      returnSacks(s);
      s.lastWaveBonusMg = waveBonusMg(
        s.tick - s.waveStartTick,
        lastSpawnOffset(this.waves[s.waveIndex - 1]!),
        this.data.waveBonus,
      );
      s.treasuryMg += s.lastWaveBonusMg;
      s.waveStartTick = -1;
      s.groupCursors = [];
      if (s.waveIndex >= this.waves.length) {
        s.runPhase = s.treasuryMg >= 0 ? 'won' : 'settled-locked';
      } else {
        s.runPhase = 'build';
      }
    } else if (s.runPhase === 'settled-locked' && s.treasuryMg >= 0) {
      // A step-3 refund brought the balance home: the win fires this tick.
      s.runPhase = 'won';
    }
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
      kind,
      this.state.structures,
      this.state.enemies,
      this.allSpawns,
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
      case 'startWave':
        this.applyStartWave();
        break;
      case 'concede':
        this.applyConcede();
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
      case 'remove':
        this.applyRemove(command.tx, command.ty);
        break;
    }
  }

  /**
   * startWave (design D7): valid only in the build phase with balance ≥ 0
   * and waves remaining — the solvency gate. Activation is atomic with the
   * apply: activeSpawns update and the returning field rebuilds here, with
   * no commitment invalidation (no tile changed walkability; enemies re-read
   * at their next waypoint).
   */
  private applyStartWave(): void {
    const s = this.state;
    if (s.runPhase !== 'build' || s.treasuryMg < 0 || s.waveIndex >= this.waves.length) return;
    s.waveIndex++;
    s.runPhase = 'wave';
    s.waveStartTick = s.tick;
    s.groupCursors = this.waves[s.waveIndex - 1]!.map(() => 0);
    const active = this.data.level.spawns
      .filter((sp) => sp.activeFromWave <= s.waveIndex)
      .map((sp) => ({ x: sp.x, y: sp.y }));
    if (active.length !== this.activeSpawns.length) {
      this.activeSpawns = active;
      buildFieldInto(this.grid, this.activeSpawns, this.returning);
    }
  }

  /** concede (run-lifecycle spec): any live phase → lost, immediately. */
  private applyConcede(): void {
    const phase = this.state.runPhase;
    if (phase === 'won' || phase === 'lost') return;
    this.state.runPhase = 'lost';
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
      ? validatePlacement(
          this.grid,
          kind,
          s.structures,
          s.enemies,
          this.allSpawns,
          this.activeSpawns,
          this.treasury,
          footprint,
          this.scratch,
        )
      : 'no-funds';
    if (verdict !== 'ok') {
      this.events.push({ kind: 'placementRejected', tiles: footprint });
      return;
    }

    // Commit. A socket tower never touches the mask or the fields (D6); a
    // dirt structure re-blocks the footprint and swaps in the fields the
    // validation just built for exactly this mask — one rebuild per attempt.
    if (this.grid.terrainAt(tx, ty) !== TERRAIN.socket) {
      for (const t of footprint) this.grid.setBlocked(t.x, t.y, true);
      this.swapScratchFields();
      this.maskChanged = true;
    }
    s.structures.push({
      id: s.nextStructureId++,
      kind,
      tx,
      ty,
      archetypeId,
      level: kind === 'wall' ? 0 : 1,
      paidMg: costMg,
      nextFireTick: 0,
    });
    s.treasuryMg -= costMg;
  }

  /**
   * remove (structure-placement spec): refused while a wave runs and after the
   * run ends (canRemove), and refused on a tile holding no structure — with
   * the same reject event a refused placement emits, and no other effect.
   *
   * An accepted removal completes here, refund included, so the credit is on
   * the books before step 9 judges progression: a liquidation that clears the
   * debt unlocks the next wave, or wins from 'settled-locked', in this tick.
   * The field rebuild is deferred to step 3 (D2).
   */
  private applyRemove(tx: number, ty: number): void {
    const s = this.state;
    const target = canRemove(s.runPhase) ? structureAt(s.structures, tx, ty) : null;
    if (!target) {
      this.events.push({ kind: 'placementRejected', tiles: footprintFor(tx, ty) });
      return;
    }
    if (removeStructure(s, this.grid, target, this.data.refundPer1000)) {
      this.removalUnblocked = true;
    }
  }

  /**
   * Upgrade (tower-upgrades spec): valid only on an existing tower below max
   * level while the balance is ≥ 0. Stats and the charge land in the same
   * tick; any failure leaves state untouched.
   */
  private applyUpgrade(tx: number, ty: number): void {
    const s = this.state;
    const t = structureAt(s.structures, tx, ty);
    const valid =
      t !== null && t.kind === 'tower' && t.level < MAX_TOWER_LEVEL && canSpend(s.treasuryMg);
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
