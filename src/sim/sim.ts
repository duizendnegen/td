// Sim class — the tick entry point
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - Owns all state, the RNG, and the tick counter
//   - Fixed 10-step tick order (see ARCHITECTURE.md §7)
//   - The run state machine: waves in step 4, progression in step 9 (D2)
//   - The power step inside step 7 (energy-infrastructure design D2/D4/D5):
//     target pre-pass → draw → supply resolution → coverage → firing; the
//     bill computed there is debited in step 9 before interest
//   - Exposes render-only events, which are outside the state hash, and the
//     tick's derived power figures, likewise unhashed

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
import { hashState } from './hash';
import type { FootprintTile, PlacementVerdict } from './placement';
import {
  canRemove,
  footprintFor,
  isFoundation,
  moveOpenIn,
  removeStructure,
  stackAt,
  topAt,
  towerAt,
  validateMove,
  validatePlacement,
} from './placement';
import { COVERAGE_SCALE, resolvePower, solarOf, tierCapacityMp } from './power';
import { fireTowers, preTargetTowers, selectTarget } from './tower';
import { Rng } from './rng';
import { cursorsExhausted, lastSpawnOffset, resolveWaves, stepWaveSpawns, type ResolvedGroup } from './waves';
import { openLedger, type Enemy, type SimState, type Structure, type StructureKind } from './types';

/** Towers may only upgrade to this level; the level-3 inspector reads maxed. */
export const MAX_TOWER_LEVEL = 3;

/**
 * The tick's power figures (energy-infrastructure design D2/D9): DERIVED once
 * per wave tick from hashed state — structures, gridTier, treasury — and
 * exposed for the frame (meter, tower tint, F4). Never stored across ticks,
 * never hashed, never written by anything but the sim. Idle outside a wave:
 * nothing draws, coverage reads full, nothing is billed.
 */
export interface PowerReadout {
  drawMp: number;
  solarMp: number;
  gridSupplyMp: number;
  /** In COVERAGE_SCALE; below full is a brownout. */
  coverage: number;
  /** The bill step 9 debits this tick (0 on the settlement tick and outside waves). */
  billMg: number;
}

const IDLE_POWER: Readonly<PowerReadout> = {
  drawMp: 0,
  solarMp: 0,
  gridSupplyMp: 0,
  coverage: COVERAGE_SCALE,
  billMg: 0,
};

/**
 * A placement verdict together with the routing it would produce
 * (path-preview design D3). Every array is freshly copied out of the sim's
 * buffers, so holding one across later evaluations or a confirmed placement
 * is safe.
 */
export interface PlacementRoutes {
  verdict: PlacementVerdict;
  /**
   * Projected lanes in the same order as `currentLanes` — one inbound lane
   * per active spawn, then one return lane per active spawn (the styling
   * split is the index threshold at the active-spawn count). `null` when the
   * verdict was reached before any post-placement routing existed; an
   * individual lane is `[]` when its start tile would have no route at all.
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
  /** All fields are always built and displayable (spec: flowfield-pathfinding). */
  inbound: FlowField;
  /** One returning field per DECLARED spawn — dormant included (design D1). */
  returning: FlowField[];
  /**
   * Render-only event queue (design D8): appended during ticks, drained by
   * the renderer, never read back, excluded from the hash.
   */
  readonly events: RenderEvent[] = [];
  /**
   * The most recent tick's power resolution — read-only for render and
   * tests. Overwritten every advance; the step-9 debit reads `billMg` from
   * here within the same tick, which is the only sim read of it.
   */
  power: Readonly<PowerReadout> = IDLE_POWER;

  private readonly rng: Rng;
  private readonly treasury: { x: number; y: number };
  /** Every declared spawn — field keying, no-transit set, no-sealing set. */
  private readonly allSpawns: { x: number; y: number }[];
  /** Declared-spawn indices active at the current waveIndex — lane and debug-spawn gating. */
  private activeSpawnIds: number[];
  /** Authored waves resolved to sim terms once at construction. */
  private readonly waves: ResolvedGroup[][];
  /** Spare field set for validation rebuilds; swapped live on accept (D1). */
  private readonly scratch: { inbound: FlowField; returning: FlowField[] };
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
    this.activeSpawnIds = data.level.spawns
      .map((s, i) => (s.activeFromWave === 1 ? i : -1))
      .filter((i) => i >= 0);
    this.waves = resolveWaves(data);
    this.carryMgByType = data.enemyTypes.map((t) => t.carryMg);
    this.bountyMgByType = data.enemyTypes.map((t) => t.bountyMg);

    // 1 + N live fields and a scratch set of the same shape — every declared
    // spawn's returning field is built now, dormant ones included, so spawn
    // activation is a pure source-set event with no field work at all (D1).
    this.inbound = allocField(this.grid);
    this.returning = this.allSpawns.map(() => allocField(this.grid));
    this.scratch = {
      inbound: allocField(this.grid),
      returning: this.allSpawns.map(() => allocField(this.grid)),
    };
    this.buildFields({ inbound: this.inbound, returning: this.returning });

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
      gridTier: 0,
      // The run's first period opens on the starting treasury; the closed
      // slot reads empty (waveNo 0) until the first settlement (design D2).
      ledger: openLedger(data.startingTreasuryMg),
      lastLedger: openLedger(0),
    };
  }

  /** Total authored wave count, for the HUD's counter and preview. */
  get totalWaves(): number {
    return this.waves.length;
  }

  /** Declared-spawn indices active right now — read-only, for the F3 overlay. */
  get activeSpawnIndices(): readonly number[] {
    return this.activeSpawnIds;
  }

  /**
   * Rebuild every field in `target` from the current mask: the inbound field
   * plus one returning field per declared spawn, all with the declared spawn
   * set as no-transit tiles (design D1/D2). The one field-build routine the
   * constructor, the removal rebuild and placement validation share.
   */
  private buildFields(target: { inbound: FlowField; returning: FlowField[] }): void {
    buildFieldInto(this.grid, [this.treasury], target.inbound, this.allSpawns);
    this.allSpawns.forEach((s, i) => {
      buildFieldInto(this.grid, [s], target.returning[i]!, this.allSpawns);
    });
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
      this.buildFields({ inbound: this.inbound, returning: this.returning });
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
    stepEnemies(s, this.grid, fields, this.data.slowSpeedPer100);
    // 6. Arrival: treasury grab-and-flip, sack pickup, spawn escape
    resolveArrivals(s, this.treasury, this.allSpawns, this.carryMgByType, this.events);
    // 7. Tower targeting and firing (damage applies this tick): the target
    //    pre-pass, then — during a wave — the power resolution that yields
    //    the tick's coverage, then the firing pass at that coverage
    //    (energy-infrastructure design D2/D4). Nothing draws outside a wave:
    //    the build phase fires at full coverage and bills nothing.
    const pre = preTargetTowers(s, this.grid, fields, this.data);
    if (s.runPhase === 'wave') {
      const solarMp = solarOf(s.structures, this.data);
      const r = resolvePower(
        pre.drawMp,
        solarMp,
        tierCapacityMp(this.data, s.gridTier),
        s.treasuryMg,
        this.data.tariffMgPer1000,
      );
      this.power = {
        drawMp: pre.drawMp,
        solarMp,
        gridSupplyMp: r.gridSupplyMp,
        coverage: r.coverage,
        billMg: r.billMg,
      };
    } else {
      this.power = IDLE_POWER;
    }
    fireTowers(s, this.grid, fields, this.data, this.events, this.power.coverage, pre);
    // 8. Deaths: bounties, carrier sack drops, tombstones
    resolveDeaths(s, this.bountyMgByType);
    // 9. Run progression (design D2): the grid bill, then interest while a
    //    wave runs; settlement when it drains, refund-driven win from the
    //    post-final-wave lock
    this.stepProgression();
    // 10. Compact tombstones; increment tick
    if (s.enemies.some((e) => !e.alive)) {
      s.enemies = s.enemies.filter((e) => e.alive);
    }
    s.tick++;
  }

  /**
   * Step 9 — the single progression point (design D2). Bill, then interest
   * on the post-bill balance (energy-infrastructure design D5) — neither on
   * the settlement tick: the wave is already over when step 9 sees it
   * drained. The bill was bounded in step 7 by what the positive balance
   * could pay, and step 8 only raises the balance, so the debit lands at ≥ 0.
   */
  private stepProgression(): void {
    const s = this.state;
    if (s.runPhase === 'wave') {
      const drained =
        cursorsExhausted(s, this.waves[s.waveIndex - 1]!) && !s.enemies.some((e) => e.alive);
      if (!drained) {
        s.treasuryMg -= this.power.billMg;
        accrueInterest(s, this.data.interestRatePpm);
        return;
      }
      // Settlement: no bill (the readout reads idle from here, since the
      // build phase that follows charges nothing), sack return, then the
      // speed bonus, then the progression judgement on the post-return,
      // post-bonus balance (run-lifecycle spec).
      this.power = IDLE_POWER;
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
   * observable mutation — hovering never changes the hash. `withWall` asks
   * for the verdict of a tower placement that lays its own wall
   * (build-over-walls design D6).
   */
  previewPlacement(kind: StructureKind, tx: number, ty: number, withWall = false): PlacementVerdict {
    return this.placementVerdict(kind, footprintFor(tx, ty), withWall);
  }

  /**
   * The one verdict behind previewPlacement, previewRoutes and applyPlace:
   * the spending gate, then the validation pipeline. A tower placed with its
   * wall validates as the wall placement it contains — terrain, occupancy,
   * enemies, paths — and is gated on both purchases: the wall at the current
   * balance and the tower at the balance the wall leaves, so a compound is
   * never half-affordable and never half-applied (design D6). `scratch`
   * holds the post-placement fields afterwards exactly when a ground
   * structure's routing-dependent verdict rebuilt them — see laysGround.
   */
  private placementVerdict(
    kind: StructureKind,
    footprint: readonly FootprintTile[],
    withWall: boolean,
  ): PlacementVerdict {
    const treasuryMg = this.state.treasuryMg;
    if (!canSpend(treasuryMg)) return 'no-funds';
    const compound = kind === 'tower' && withWall;
    if (compound && !canSpend(treasuryMg - this.data.wallCostMg)) return 'no-funds';
    return validatePlacement(
      this.grid,
      compound ? 'wall' : kind,
      this.state.structures,
      this.state.enemies,
      this.allSpawns,
      this.treasury,
      footprint,
      this.scratch,
    );
  }

  /**
   * Whether a placement of `kind` (with or without its wall) lays a ground
   * structure — a wall, or a panel (energy-infrastructure design D7) — and
   * so owns mask and fields.
   */
  private static laysGround(kind: StructureKind, withWall: boolean): boolean {
    return kind !== 'tower' || withWall;
  }

  /**
   * Speculative twin of applyMove's validation (the move analogue of
   * previewPlacement): the verdict a move command issued now would get, with
   * no observable mutation. 'not-buildable' doubles as "nothing movable at
   * the origin" — a bare tile, or a phase that refuses moves — the verdict
   * vocabulary is reused, not extended (design D4).
   */
  previewMove(fromTx: number, fromTy: number, toTx: number, toTy: number): PlacementVerdict {
    const stack = stackAt(this.state.structures, fromTx, fromTy);
    if ((!stack.ground && !stack.tower) || !moveOpenIn(this.state.runPhase)) return 'not-buildable';
    return validateMove(
      this.grid,
      stack,
      toTx,
      toTy,
      this.state.structures,
      this.state.enemies,
      this.allSpawns,
      this.treasury,
      this.scratch,
    );
  }

  /**
   * The routes traffic takes right now (path-preview spec): one lane per
   * active spawn through the inbound field, then one return lane per active
   * spawn from the treasury through that spawn's own returning field.
   * Read-only and freshly allocated.
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
   * and every tower placement on an existing foundation, whatever its
   * verdict — such a tower never touches the mask or the fields
   * (build-over-walls design D2). A tower placed with its wall projects
   * exactly as the wall placement it contains (design D6).
   */
  previewRoutes(kind: StructureKind, tx: number, ty: number, withWall = false): PlacementRoutes {
    const footprint = footprintFor(tx, ty);
    const verdict = this.placementVerdict(kind, footprint, withWall);
    // A foundation-only tower placement short-circuits before the rebuild,
    // so the buffers still hold the previous evaluation's fields — never
    // readable as this one's. Only a ground structure's routing-dependent
    // verdicts rebuilt them.
    const rebuilt =
      Sim.laysGround(kind, withWall) &&
      (verdict === 'ok' || verdict === 'seals-spawn' || verdict === 'strands-enemy');
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
   * out-of-bounds, not-buildable, occupied, needs-wall, enemy-in-footprint,
   * and every transfer onto a foundation, which never touches the mask
   * (build-over-walls design D4) — only a relocate onto bare dirt projects.
   */
  previewMoveRoutes(fromTx: number, fromTy: number, toTx: number, toTy: number): PlacementRoutes {
    const stack = stackAt(this.state.structures, fromTx, fromTy);
    if ((!stack.ground && !stack.tower) || !moveOpenIn(this.state.runPhase)) {
      return { verdict: 'not-buildable', lanes: null, orphaned: null };
    }
    const verdict = validateMove(
      this.grid,
      stack,
      toTx,
      toTy,
      this.state.structures,
      this.state.enemies,
      this.allSpawns,
      this.treasury,
      this.scratch,
    );
    // A transfer's 'ok' short-circuits before the rebuild, so `scratch` still
    // holds the previous evaluation's fields; seal and strand verdicts only
    // ever come out of the relocate branch.
    const transfer = isFoundation(this.grid, this.state.structures, toTx, toTy);
    const rebuilt =
      verdict === 'seals-spawn' || verdict === 'strands-enemy' || (verdict === 'ok' && !transfer);
    if (!rebuilt) return { verdict, lanes: null, orphaned: null };
    return {
      verdict,
      lanes: this.traceLanes(this.scratch.inbound, this.scratch.returning),
      orphaned:
        verdict === 'seals-spawn'
          ? // The freed origin is walkable post-move even though the live
            // mask still blocks it, so it is eligible for the orphan set.
            this.orphanedBy(footprintFor(toTx, toTy), { x: fromTx, y: fromTy })
          : null,
    };
  }

  /**
   * One inbound lane per active spawn, then one return lane per active spawn
   * — inbound lanes first (design D6), so a consumer splitting styles does it
   * at the index threshold `activeSpawnIds.length`.
   */
  private traceLanes(inbound: FlowField, returning: readonly FlowField[]): TileXY[][] {
    const lanes = this.activeSpawnIds.map((i) => laneFrom(inbound, this.grid, this.allSpawns[i]!));
    for (const i of this.activeSpawnIds) {
      lanes.push(laneFrom(returning[i]!, this.grid, this.treasury));
    }
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
    return selectTarget(
      t,
      this.state,
      this.grid,
      { inbound: this.inbound, returning: this.returning },
      this.data,
    );
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
        this.applyPlace(
          command.structure,
          command.archetype ?? 'rapid',
          command.tx,
          command.ty,
          command.withWall ?? false,
        );
        break;
      case 'move':
        this.applyMove(command.tx, command.ty, command.toTx, command.toTy);
        break;
      case 'upgrade':
        this.applyUpgrade(command.tx, command.ty);
        break;
      case 'upgradeGrid':
        this.applyUpgradeGrid();
        break;
      case 'remove':
        this.applyRemove(command.tx, command.ty);
        break;
    }
  }

  /**
   * startWave (design D7): valid only in the build phase with balance ≥ 0
   * and waves remaining — the solvency gate. Spawn activation is a pure
   * source-set event (return-to-origin-spawn design D1): every declared
   * spawn's field was built at construction, so waking one updates only the
   * active id list — no field changes, no waypoint re-read.
   */
  private applyStartWave(): void {
    const s = this.state;
    if (s.runPhase !== 'build' || s.treasuryMg < 0 || s.waveIndex >= this.waves.length) return;
    s.waveIndex++;
    s.runPhase = 'wave';
    s.waveStartTick = s.tick;
    s.groupCursors = this.waves[s.waveIndex - 1]!.map(() => 0);
    // The wave damage counter's only reset point (tower-damage-stats design
    // D3): from here until the next start it is this wave's figure.
    for (const structure of s.structures) structure.waveDamage = 0;
    this.activeSpawnIds = this.data.level.spawns
      .map((sp, i) => (sp.activeFromWave <= s.waveIndex ? i : -1))
      .filter((i) => i >= 0);
  }

  /** concede (run-lifecycle spec): any live phase → lost, immediately. */
  private applyConcede(): void {
    const phase = this.state.runPhase;
    if (phase === 'won' || phase === 'lost') return;
    this.state.runPhase = 'lost';
  }

  /**
   * Typed spawn (enemy-variety spec): ordinary command, ordinary queue.
   * `spawnIndex` is a DECLARED-spawn index (design D3) — stable across
   * activations; a dormant or out-of-range index is rejected silently.
   */
  private applySpawn(type: string, spawnIndex: number): void {
    const typeId = this.data.enemyTypes.findIndex((t) => t.key === type);
    if (typeId < 0 || !this.activeSpawnIds.includes(spawnIndex)) return;
    const stats = this.data.enemyTypes[typeId]!;
    spawnEnemy(this.state, this.allSpawns[spawnIndex]!, spawnIndex, typeId, stats.speed, stats.hp);
  }

  /**
   * place: one structure, or — a tower `withWall` — the wall and the tower
   * on it in one command (build-over-walls design D6). The compound is
   * atomic: the wall placement's verdict is the verdict, and on 'ok' the
   * wall lands first and the tower on it, each its own structure with its
   * own cost, exactly the state two consecutive place commands would leave.
   */
  private applyPlace(
    kind: StructureKind,
    archetype: TowerArchetype,
    tx: number,
    ty: number,
    withWall: boolean,
  ): void {
    const footprint = footprintFor(tx, ty);
    const laysGround = Sim.laysGround(kind, withWall);

    const verdict = this.placementVerdict(kind, footprint, withWall);
    if (verdict !== 'ok') {
      this.events.push({ kind: 'placementRejected', tiles: footprint });
      return;
    }

    // Commit. A tower stands on a foundation whose tile is already blocked,
    // so it never touches the mask or the fields (build-over-walls design
    // D2); a ground structure re-blocks the footprint and swaps in the
    // fields the validation just built for exactly this mask — one rebuild
    // per attempt. A panel is a wall with an output (energy-infrastructure
    // design D7): it takes the wall's branch here, at its own price.
    if (laysGround) {
      for (const t of footprint) this.grid.setBlocked(t.x, t.y, true);
      this.swapScratchFields();
      this.maskChanged = true;
      if (kind === 'panel') this.pushStructure('panel', -1, tx, ty, this.data.panelCostMg);
      else this.pushStructure('wall', -1, tx, ty, this.data.wallCostMg);
    }
    if (kind === 'tower') {
      const archetypeId = ARCHETYPES.indexOf(archetype);
      this.pushStructure(kind, archetypeId, tx, ty, this.data.towers[archetypeId]!.levels[0]!.costMg);
    }
  }

  /** Append a freshly bought structure and charge it — provisional until a wave tick runs over it (design D1). */
  private pushStructure(
    kind: StructureKind,
    archetypeId: number,
    tx: number,
    ty: number,
    costMg: number,
  ): void {
    const s = this.state;
    s.structures.push({
      id: s.nextStructureId++,
      kind,
      tx,
      ty,
      archetypeId,
      level: kind === 'tower' ? 1 : 0,
      paidMg: costMg,
      nextFireTick: 0,
      provisional: true,
      // Damage counters start empty; walls and panels carry them at zero like nextFireTick.
      waveDamage: 0,
      totalDamage: 0,
    });
    s.treasuryMg -= costMg;
  }

  /**
   * move (structure-placement delta): move what stands on a tile — the
   * stack — free of charge and identity-preserving: id, kind, paidMg, level
   * and provisional all survive because the existing structures mutate in
   * place. The destination decides what lands (build-over-walls design D4):
   * bare dirt takes the ground structure — a wall together with its tower,
   * or a panel (energy-infrastructure design D7) — both mask edits apply
   * and the fields the validation just built for exactly this mask swap in,
   * one rebuild per attempt, mirroring applyPlace — while a foundation (a
   * bare wall, an empty socket) takes the tower alone, with no mask edit and
   * no swap. Refused outside the build phase, for bare origin tiles, and for
   * any destination validateMove rejects — with the same reject event a
   * refused placement emits on the DESTINATION footprint, and no other effect
   * (atomicity).
   */
  private applyMove(tx: number, ty: number, toTx: number, toTy: number): void {
    const s = this.state;
    const stack = stackAt(s.structures, tx, ty);
    const movable = (stack.ground !== null || stack.tower !== null) && moveOpenIn(s.runPhase);
    const verdict = movable
      ? validateMove(
          this.grid,
          stack,
          toTx,
          toTy,
          s.structures,
          s.enemies,
          this.allSpawns,
          this.treasury,
          this.scratch,
        )
      : 'occupied';
    if (!movable || verdict !== 'ok') {
      this.events.push({ kind: 'placementRejected', tiles: footprintFor(toTx, toTy) });
      return;
    }

    if (isFoundation(this.grid, s.structures, toTx, toTy)) {
      // Transfer: validateMove guaranteed a tower in the stack.
      const tower = stack.tower!;
      tower.tx = toTx;
      tower.ty = toTy;
      return;
    }
    // Relocate: validateMove guaranteed a ground structure in the stack.
    const ground = stack.ground!;
    this.grid.setBlocked(ground.tx, ground.ty, false);
    this.grid.setBlocked(toTx, toTy, true);
    this.swapScratchFields();
    this.maskChanged = true;
    ground.tx = toTx;
    ground.ty = toTy;
    if (stack.tower) {
      stack.tower.tx = toTx;
      stack.tower.ty = toTy;
    }
  }

  /**
   * remove (structure-placement spec): peels the tile top-down — the tower
   * if one stands there, else the wall or panel (build-over-walls design D3), each
   * judged by the gate for the structure it actually targets. Refused after
   * the run ends, refused mid-wave for construction the wave has already run
   * against (canRemove), and refused on a tile holding no structure — with
   * the same reject event a refused placement emits, and no other effect.
   *
   * An accepted removal completes here, refund included, so the credit is on
   * the books before step 9 judges progression: a liquidation that clears the
   * debt unlocks the next wave, or wins from 'settled-locked', in this tick.
   * The field rebuild is deferred to step 3 (D2).
   */
  private applyRemove(tx: number, ty: number): void {
    const s = this.state;
    const found = topAt(s.structures, tx, ty);
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
    const t = towerAt(s.structures, tx, ty);
    const valid = t !== null && t.level < MAX_TOWER_LEVEL && canSpend(s.treasuryMg);
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

  /**
   * upgradeGrid (power-grid spec, design D6): buy the next connection tier.
   * Valid in any live phase — a wave included, since a mid-wave "we need more
   * power" is a legitimate rescue — under the spending gate (balance ≥ 0, may
   * go into debt like any purchase) and below the last tier. The tier is
   * hashed state; the charge and the capacity land in the same tick. One-way:
   * no provisional flag, no refund, no share of the liquidation total. A
   * refusal is silent, like startWave's — there is no tile to flash.
   */
  private applyUpgradeGrid(): void {
    const s = this.state;
    if (s.runPhase === 'won' || s.runPhase === 'lost') return;
    const next = this.data.gridTiers[s.gridTier + 1];
    if (!next || !canSpend(s.treasuryMg)) return;
    s.treasuryMg -= next.costMg;
    s.gridTier++;
  }

  /** Swap the live and scratch field sets wholesale — arrays included (D4). */
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
