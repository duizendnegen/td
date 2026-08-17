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
import type { FlowField, TileXY } from './flowfield';
import { UNREACHABLE, allocField, buildFieldInto, tracePath } from './flowfield';
import type { Grid } from './grid';
import { TERRAIN } from './grid';
import { hashState } from './hash';
import type { PlacementVerdict } from './placement';
import {
  canRemove,
  footprintFor,
  moveOpenIn,
  removeStructure,
  structureAt,
  validateMove,
  validatePlacement,
} from './placement';
import { fireTowers, selectTarget } from './tower';
import { Rng } from './rng';
import { cursorsExhausted, lastSpawnOffset, resolveWaves, stepWaveSpawns, type ResolvedGroup } from './waves';
import type { Enemy, SimState, Structure, StructureKind } from './types';

/** Towers may only upgrade to this level; the level-3 inspector reads maxed. */
export const MAX_TOWER_LEVEL = 3;

/**
 * A placement verdict together with the routing it would produce
 * (path-preview design D3). Every array is freshly copied out of the sim's
 * buffers, so holding one across later evaluations or a confirmed placement
 * is safe.
 */
export interface PlacementRoutes {
  verdict: PlacementVerdict;
  /**
   * Projected lanes in the same order as `currentLanes` — one per active
   * spawn, then the return lane. `null` when the verdict was reached before
   * any post-placement routing existed; an individual lane is `[]` when its
   * start tile would have no route at all.
   */
  lanes: TileXY[][] | null;
  /** Walkable tiles the projected routing cuts off. Non-null on 'seals-spawn' only. */
  orphaned: TileXY[] | null;
}

/**
 * A traced route from `from`, or an empty lane where `from` has no route —
 * a lane with nothing to draw rather than a one-tile stub.
 */
function laneFrom(field: FlowField, grid: Grid, from: TileXY): TileXY[] {
  if (field.cost[grid.idx(from.x, from.y)]! < 0) return [];
  return tracePath(field, grid, from);
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
    // The commit point (provisional-construction design D1/D2): a tick
    // advancing under a live wave settles everything standing, BEFORE this
    // tick's spawning and combat — so a wave always runs against committed
    // construction. The rule reads only "an advance happened while a wave was
    // live"; pause is an absence of advances and never enters the simulation.
    if (s.runPhase === 'wave') {
      for (const structure of s.structures) structure.provisional = false;
    }
    // 4. Spawning: the active wave's group cursors (design D2)
    if (s.runPhase === 'wave') {
      stepWaveSpawns(s, this.waves[s.waveIndex - 1]!);
    }
    // 5. Enemy movement and waypoint re-evaluation
    stepEnemies(s, this.grid, fields, this.data.carrierSpeedPer100, this.data.slowSpeedPer100);
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
      returnSacks(s, this.data.sackRecoveryPer1000);
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
   * Speculative twin of applyMove's validation (the move analogue of
   * previewPlacement): the verdict a move command issued now would get, with
   * no observable mutation. 'not-buildable' doubles as "nothing movable at
   * the origin" — a bare tile, or a phase that refuses moves — the verdict
   * vocabulary is reused, not extended (design D4).
   */
  previewMove(fromTx: number, fromTy: number, toTx: number, toTy: number): PlacementVerdict {
    const s = structureAt(this.state.structures, fromTx, fromTy);
    if (!s || !moveOpenIn(this.state.runPhase)) return 'not-buildable';
    return validateMove(
      this.grid,
      s,
      toTx,
      toTy,
      this.state.structures,
      this.state.enemies,
      this.allSpawns,
      this.activeSpawns,
      this.treasury,
      this.scratch,
    );
  }

  /**
   * The routes traffic takes right now (path-preview spec): one lane per
   * active spawn through the inbound field, then one from the treasury
   * through the returning field. Read-only and freshly allocated.
   */
  currentLanes(): TileXY[][] {
    return this.traceLanes(this.inbound, this.returning);
  }

  /**
   * previewPlacement plus the routing the placement would produce (design
   * D3). The trace happens here, immediately after validation, so the caller
   * never holds a reference into `scratch` — which the next evaluation
   * overwrites and an accepted placement swaps into live state.
   *
   * `lanes` is null for every verdict reached before `scratch` was rebuilt:
   * no-funds, out-of-bounds, not-buildable, occupied, enemy-in-footprint,
   * and the socket 'ok' path, which never touches the mask or the fields.
   */
  previewRoutes(kind: StructureKind, tx: number, ty: number): PlacementRoutes {
    if (!canSpend(this.state.treasuryMg)) {
      return { verdict: 'no-funds', lanes: null, orphaned: null };
    }
    const footprint = footprintFor(tx, ty);
    const verdict = validatePlacement(
      this.grid,
      kind,
      this.state.structures,
      this.state.enemies,
      this.allSpawns,
      this.activeSpawns,
      this.treasury,
      footprint,
      this.scratch,
    );
    // A socket 'ok' short-circuits before the rebuild, so the buffers still
    // hold the previous evaluation's fields — never readable as this one's.
    const socket =
      this.grid.inBounds(tx, ty) && this.grid.terrainAt(tx, ty) === TERRAIN.socket;
    const rebuilt =
      verdict === 'seals-spawn' || verdict === 'strands-enemy' || (verdict === 'ok' && !socket);
    if (!rebuilt) return { verdict, lanes: null, orphaned: null };
    return {
      verdict,
      lanes: this.traceLanes(this.scratch.inbound, this.scratch.returning),
      orphaned: verdict === 'seals-spawn' ? this.orphanedBy(footprint) : null,
    };
  }

  /**
   * previewMove plus the routing the move would produce — the origin-freed
   * variant of previewRoutes (design D5), returning the same PlacementRoutes
   * shape. `lanes` is null for every verdict reached before the scratch
   * fields were rebuilt: nothing movable at the origin, the same-tile move,
   * out-of-bounds, not-buildable, occupied, enemy-in-footprint, and the
   * socket→socket move, which never touches the mask.
   */
  previewMoveRoutes(fromTx: number, fromTy: number, toTx: number, toTy: number): PlacementRoutes {
    const mover = structureAt(this.state.structures, fromTx, fromTy);
    if (!mover || !moveOpenIn(this.state.runPhase)) {
      return { verdict: 'not-buildable', lanes: null, orphaned: null };
    }
    const verdict = validateMove(
      this.grid,
      mover,
      toTx,
      toTy,
      this.state.structures,
      this.state.enemies,
      this.allSpawns,
      this.activeSpawns,
      this.treasury,
      this.scratch,
    );
    // Unlike placement, an origin-freeing move rebuilds even for a socket
    // destination; only the socket→socket 'ok' leaves `scratch` stale.
    const socketFrom = this.grid.terrainAt(fromTx, fromTy) === TERRAIN.socket;
    const socketTo =
      this.grid.inBounds(toTx, toTy) && this.grid.terrainAt(toTx, toTy) === TERRAIN.socket;
    const rebuilt =
      verdict === 'seals-spawn' ||
      verdict === 'strands-enemy' ||
      (verdict === 'ok' && !(socketFrom && socketTo));
    if (!rebuilt) return { verdict, lanes: null, orphaned: null };
    return {
      verdict,
      lanes: this.traceLanes(this.scratch.inbound, this.scratch.returning),
      orphaned:
        verdict === 'seals-spawn'
          ? this.orphanedBy(
              footprintFor(toTx, toTy),
              // The freed origin is walkable post-move even though the live
              // mask still blocks it, so it is eligible for the orphan set.
              socketFrom ? undefined : { x: fromTx, y: fromTy },
            )
          : null,
    };
  }

  /** One inbound lane per active spawn, then the treasury's return lane. */
  private traceLanes(inbound: FlowField, returning: FlowField): TileXY[][] {
    const lanes = this.activeSpawns.map((s) => laneFrom(inbound, this.grid, s));
    lanes.push(laneFrom(returning, this.grid, this.treasury));
    return lanes;
  }

  /**
   * Walkable tiles the projected inbound field marks unreachable (design D6)
   * — exactly the array 'seals-spawn' is derived from. The footprint itself
   * is excluded: it is the cause, not part of the cut-off region, and
   * validation has already restored it to walkable. A move preview passes
   * its freed origin as `alsoWalkable` — walkable in the projection while
   * the live mask still blocks it.
   */
  private orphanedBy(
    footprint: readonly { x: number; y: number }[],
    alsoWalkable?: { x: number; y: number },
  ): TileXY[] {
    const out: TileXY[] = [];
    const { cost } = this.scratch.inbound;
    for (let ty = 0; ty < this.grid.height; ty++) {
      for (let tx = 0; tx < this.grid.width; tx++) {
        const freed = alsoWalkable !== undefined && alsoWalkable.x === tx && alsoWalkable.y === ty;
        if (!freed && !this.grid.isWalkable(tx, ty)) continue;
        if (cost[this.grid.idx(tx, ty)] !== UNREACHABLE) continue;
        if (footprint.some((t) => t.x === tx && t.y === ty)) continue;
        out.push({ x: tx, y: ty });
      }
    }
    return out;
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
      case 'move':
        this.applyMove(command.tx, command.ty, command.toTx, command.toTy);
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
      // Uncommitted until a wave tick runs over it (design D1).
      provisional: true,
    });
    s.treasuryMg -= costMg;
  }

  /**
   * move (structure-placement delta): relocate a structure — tower or wall —
   * free of charge and identity-preserving — id, kind, paidMg, level and
   * provisional all survive because the existing structure mutates in place.
   * Refused outside the build phase, for bare origin tiles, and for any
   * destination validateMove rejects — with the same reject event a refused placement
   * emits on the DESTINATION footprint, and no other effect (atomicity).
   *
   * An accepted move applies both mask edits and swaps in the fields the
   * validation just built for exactly this mask — one rebuild per attempt,
   * mirroring applyPlace. A socket→socket move changed no mask and swaps
   * nothing (D6).
   */
  private applyMove(tx: number, ty: number, toTx: number, toTy: number): void {
    const s = this.state;
    const found = structureAt(s.structures, tx, ty);
    const target = found !== null && moveOpenIn(s.runPhase) ? found : null;
    const verdict = target
      ? validateMove(
          this.grid,
          target,
          toTx,
          toTy,
          s.structures,
          s.enemies,
          this.allSpawns,
          this.activeSpawns,
          this.treasury,
          this.scratch,
        )
      : 'occupied';
    if (!target || verdict !== 'ok') {
      this.events.push({ kind: 'placementRejected', tiles: footprintFor(toTx, toTy) });
      return;
    }

    const originFrees = this.grid.terrainAt(target.tx, target.ty) !== TERRAIN.socket;
    const destBlocks = this.grid.terrainAt(toTx, toTy) !== TERRAIN.socket;
    if (originFrees) this.grid.setBlocked(target.tx, target.ty, false);
    if (destBlocks) this.grid.setBlocked(toTx, toTy, true);
    if (originFrees || destBlocks) {
      this.swapScratchFields();
      this.maskChanged = true;
    }
    target.tx = toTx;
    target.ty = toTy;
  }

  /**
   * remove (structure-placement spec): refused after the run ends, refused
   * mid-wave for construction the wave has already run against (canRemove),
   * and refused on a tile holding no structure — with the same reject event a
   * refused placement emits, and no other effect.
   *
   * An accepted removal completes here, refund included, so the credit is on
   * the books before step 9 judges progression: a liquidation that clears the
   * debt unlocks the next wave, or wins from 'settled-locked', in this tick.
   * The field rebuild is deferred to step 3 (D2).
   */
  private applyRemove(tx: number, ty: number): void {
    const s = this.state;
    const found = structureAt(s.structures, tx, ty);
    const target = found !== null && canRemove(s.runPhase, found) ? found : null;
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
