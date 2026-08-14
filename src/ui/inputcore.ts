// Shared interaction core: tile picking, ghost verdict loop, selection,
// command emission
// See ARCHITECTURE.md §9 and the aether-ui-redesign design D3
//
// Responsibilities:
//   - One validation and command path for both input drivers: pointer
//     (hover ghost, click commits) and touch (pending ghost, ✓/✕ commits)
//     are thin front-ends over this core
//   - Raycast against the ground plane to get a tile coordinate
//   - Ghost preview runs the REAL validation (sim.previewRoutes),
//     re-evaluated on ghost-tile change or new tick — never per move event
//   - The same trigger drives the lane ribbon, so the ghost tint and the
//     projected routes come from one validation and cannot disagree
//   - Never writes sim state directly — emits commands only
//   - Every invalid commit plays the same red flash the sim's rejects use

import * as THREE from 'three';
import type { CommandQueue } from '../sim/commands';
import { canMove, canRemove, footprintFor, structureAt } from '../sim/placement';
import type { Sim } from '../sim/sim';
import { towerStats } from '../sim/tower';
import type { FxRenderer, GhostPreview, GhostTint } from '../render/fx';
import { GROUND_TOP_Y } from '../render/renderer';
import type { LaneRibbon } from '../render/ribbon';
import type { Structure } from '../sim/types';
import type { InspectorUI } from './inspector';
import { toolStructure, type PaletteUI, type Tool } from './palette';

export interface Tile {
  tx: number;
  ty: number;
}

export class InputCore {
  readonly sim: Sim;
  readonly commands: CommandQueue;
  readonly palette: PaletteUI;
  readonly inspector: InspectorUI;
  private readonly ghost: GhostPreview;
  private readonly ribbon: LaneRibbon;
  private readonly fx: FxRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.Camera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  /** Ghost re-evaluation keys: last evaluated (tile, tick) pair. */
  private lastEvalTick = -1;
  private lastEvalTile = '';
  private lastVerdictOk = false;

  /**
   * The lifted tower while the move tool carries one (tower-drag-move design
   * D6): its id plus the origin tile the move command will name. Entered only
   * through liftAt; cleared by tool change/deselect (Esc, palette click, the
   * phase-change deselect in palette.refresh), by cancelLift, and by the
   * per-frame sweep in updateMoveGhost once the tower's tile changed — the
   * move applied. Deliberately NOT cleared when a drop merely issues the
   * command: a rejection at the applying tick then leaves the tower lifted,
   * so another tile can be tried without re-lifting (build-ui delta).
   */
  lifted: { id: number; tx: number; ty: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.Camera,
    sim: Sim,
    commands: CommandQueue,
    palette: PaletteUI,
    inspector: InspectorUI,
    ghost: GhostPreview,
    ribbon: LaneRibbon,
    fx: FxRenderer,
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.sim = sim;
    this.commands = commands;
    this.palette = palette;
    this.inspector = inspector;
    this.ghost = ghost;
    this.ribbon = ribbon;
    this.fx = fx;

    palette.onChange = () => {
      this.inspector.select(null);
      // Any tool change — arming, switching, Esc, the phase-change deselect —
      // cancels a lift unconditionally, with no command (design D6).
      this.lifted = null;
      this.forceReevaluate();
      this.onToolChange?.();
    };
  }

  /** Driver hook, fired on every tool change (touch clears its pending ghost). */
  onToolChange: (() => void) | null = null;

  /** Screen point → ground-plane raycast → tile, or null off the board. */
  pickTile(clientX: number, clientY: number): Tile | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    if (direction.y === 0) return null;
    const t = (GROUND_TOP_Y - origin.y) / direction.y;
    if (t < 0) return null;
    const x = origin.x + direction.x * t;
    const z = origin.z + direction.z * t;
    const tx = Math.floor(x);
    const ty = Math.floor(z);
    if (!this.sim.grid.inBounds(tx, ty)) return null;
    return { tx, ty };
  }

  /** Tile world centre → screen-space CSS pixels (confirm-affordance anchor). */
  projectTile(tile: Tile): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector3(tile.tx + 0.5, GROUND_TOP_Y, tile.ty + 0.5).project(this.camera);
    return {
      x: rect.left + ((p.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - p.y) / 2) * rect.height,
    };
  }

  forceReevaluate(): void {
    this.lastEvalTick = -1;
    this.lastEvalTile = '';
  }

  /**
   * Commit a placement of the current build tool at `tile` — the one path
   * behind both a desktop click and a touch confirm. Re-runs the real
   * validation at commit time; a red ghost or a stale green both end in the
   * same local flash with no command issued when invalid (build-ui spec).
   * A valid verdict may still lose the race at the applying tick — then the
   * sim's own reject event plays the identical flash. Returns whether a
   * command was issued.
   */
  commitPlace(tile: Tile): boolean {
    const tool = this.palette.selected;
    const structure = tool !== null ? toolStructure(tool) : null;
    if (!structure) return false;
    const verdict = this.sim.previewPlacement(structure.kind, tile.tx, tile.ty);
    if (verdict === 'ok') {
      this.commands.issue({
        kind: 'place',
        structure: structure.kind,
        ...(structure.kind === 'tower' ? { archetype: structure.archetype } : {}),
        tx: tile.tx,
        ty: tile.ty,
      });
      return true;
    }
    this.fx.flashReject(footprintFor(tile.tx, tile.ty), performance.now());
    return false;
  }

  /**
   * Issue a removal for the structure at `tile` — refused, with the same red
   * flash any invalid commit gets, when the tile is bare or the gate refuses
   * that structure (a wave blocks committed construction only). The sim
   * re-checks the gate authoritatively at the applying tick.
   */
  commitRemove(tile: Tile): void {
    const found = structureAt(this.sim.state.structures, tile.tx, tile.ty);
    const s = found !== null && canRemove(this.sim.state.runPhase, found) ? found : null;
    if (!s) {
      this.fx.flashReject(footprintFor(tile.tx, tile.ty), performance.now());
      return;
    }
    this.commands.issue({ kind: 'remove', tx: tile.tx, ty: tile.ty });
  }

  /** Select the tower at `tile` for inspection, or deselect on empty board. */
  selectAt(tile: Tile): void {
    const s = structureAt(this.sim.state.structures, tile.tx, tile.ty);
    this.inspector.select(s?.kind === 'tower' ? s : null);
  }

  /**
   * Lift the tower at `tile` for the armed move tool. Only a movable tower
   * takes the lift (canMove: build phase, towers only); a wall or an empty
   * tile does nothing at all (build-ui delta). Returns whether a lift began.
   */
  liftAt(tile: Tile): boolean {
    const s = structureAt(this.sim.state.structures, tile.tx, tile.ty);
    if (!s || !canMove(this.sim.state.runPhase, s)) return false;
    this.lifted = { id: s.id, tx: s.tx, ty: s.ty };
    this.forceReevaluate();
    return true;
  }

  /** Cancel a lift with no command — the touch ✕ affordance's path. */
  cancelLift(): void {
    this.lifted = null;
    this.forceReevaluate();
  }

  /**
   * Attempt to drop the lifted tower at `tile` — the one path behind a
   * desktop release/click and a touch confirm. Re-runs the real validation at
   * commit time; a red ghost or a stale green both end in the same local
   * flash with no command issued when invalid, and the tower stays lifted so
   * another tile can be tried without re-lifting (build-ui delta). A valid
   * verdict may still lose the race at the applying tick — the sim's own
   * reject event then plays the identical flash, and the lift survives until
   * the tower actually moves. Returns whether a command was issued.
   */
  commitMove(tile: Tile): boolean {
    const lifted = this.lifted;
    if (!lifted) return false;
    const verdict = this.sim.previewMove(lifted.tx, lifted.ty, tile.tx, tile.ty);
    if (verdict === 'ok') {
      this.commands.issue({
        kind: 'move',
        tx: lifted.tx,
        ty: lifted.ty,
        toTx: tile.tx,
        toTy: tile.ty,
      });
      return true;
    }
    this.fx.flashReject(footprintFor(tile.tx, tile.ty), performance.now());
    return false;
  }

  /**
   * Per-frame ghost maintenance for a build ghost at `tile` (hovered or
   * pending). The verdict and the lane ribbon are recomputed only when the
   * tile or the sim tick changed, so an enemy walking into the footprint
   * flips the tint without any input event. Speculative only — never touches
   * sim state.
   *
   * With a tool armed and no ghost tile (cursor off the board), the ribbon
   * still shows the current lanes; `off` is a stable key, so that costs one
   * evaluation, not one per frame.
   */
  updateBuildGhost(tile: Tile | null): void {
    const tool = this.palette.selected;
    const structure = tool !== null ? toolStructure(tool) : null;
    if (!structure) {
      this.ghost.hide();
      this.ribbon.hide();
      this.lastEvalTile = '';
      return;
    }
    const tick = this.sim.state.tick;
    const key = tile ? `${tool}:${tile.tx},${tile.ty}` : `${tool}:off`;
    if (tick !== this.lastEvalTick || key !== this.lastEvalTile) {
      this.lastEvalTick = tick;
      this.lastEvalTile = key;
      const preview = tile ? this.sim.previewRoutes(structure.kind, tile.tx, tile.ty) : null;
      this.lastVerdictOk = preview?.verdict === 'ok';
      this.ribbon.update(this.sim.currentLanes(), preview?.lanes ?? null, preview?.orphaned ?? null);
    }
    if (!tile) {
      this.ghost.hide();
      return;
    }
    this.ghost.show(structure.kind, tile.tx, tile.ty, this.tint(tool!), this.toolRangeUnits(tool!));
    this.ghost.showPreviewRingAt(null);
  }

  /** The ghost's current verdict (as last evaluated). */
  get verdictOk(): boolean {
    return this.lastVerdictOk;
  }

  /**
   * Per-frame ghost and ribbon maintenance for the armed move tool. With
   * nothing lifted the ribbon shows the current lanes and no projection
   * (path-preview delta). A lifted tower gets the move ghost — tinted by the
   * origin-freed validation, never the debt tint: moves are free — with its
   * own range ring at the candidate tile, and the projected routes,
   * re-evaluated when the candidate tile, the sim tick, or the lifted id
   * changes, so lifting a different tower on the same tile re-projects
   * (design D5). Speculative only — never touches sim state.
   */
  updateMoveGhost(tile: Tile | null): void {
    const mover = this.liftedStructure();
    const tick = this.sim.state.tick;
    const key =
      mover === null
        ? 'move:none'
        : tile
          ? `move:${mover.id}:${tile.tx},${tile.ty}`
          : `move:${mover.id}:off`;
    if (tick !== this.lastEvalTick || key !== this.lastEvalTile) {
      this.lastEvalTick = tick;
      this.lastEvalTile = key;
      const preview =
        mover && tile ? this.sim.previewMoveRoutes(mover.tx, mover.ty, tile.tx, tile.ty) : null;
      this.lastVerdictOk = preview?.verdict === 'ok';
      this.ribbon.update(this.sim.currentLanes(), preview?.lanes ?? null, preview?.orphaned ?? null);
    }
    if (!mover || !tile) {
      this.ghost.hide();
      return;
    }
    this.ghost.show(
      'tower',
      tile.tx,
      tile.ty,
      this.lastVerdictOk ? 'valid' : 'invalid',
      towerStats(mover, this.sim.data).rangeUnits,
    );
    this.ghost.showPreviewRingAt(null);
  }

  /**
   * The lifted tower's live structure, or null with the lift swept away when
   * the tower stands on another tile (the move applied) or vanished — the
   * completion end of the lift lifecycle.
   */
  private liftedStructure(): Structure | null {
    const lifted = this.lifted;
    if (!lifted) return null;
    const s = this.sim.state.structures.find((x) => x.id === lifted.id);
    if (!s || s.tx !== lifted.tx || s.ty !== lifted.ty) {
      this.lifted = null;
      this.forceReevaluate();
      return null;
    }
    return s;
  }

  /**
   * Per-frame rings when no build tool is active: the inspected tower's
   * range ring, plus the next-level preview while the upgrade is hovered.
   * Nothing is armed here, so the lane ribbon goes away — including when a
   * placed tower is selected for inspection (path-preview spec).
   */
  updateIdleRings(): void {
    this.ribbon.hide();
    const sel = this.inspector.current;
    if (sel) {
      const centre = { x: sel.tx + 0.5, z: sel.ty + 0.5 };
      this.ghost.hide();
      this.ghost.showRingAt(centre, towerStats(sel, this.sim.data).rangeUnits);
      // Next-level ring while the upgrade action is hovered (build-ui spec);
      // identical radii (non-range archetypes) draw nothing extra visible.
      this.ghost.showPreviewRingAt(centre, this.inspector.previewStats?.rangeUnits ?? 0);
    } else {
      this.ghost.hide();
    }
  }

  /** The level-1 range for a tower tool's ghost ring; 0 for walls. */
  private toolRangeUnits(tool: Tool): number {
    const structure = toolStructure(tool);
    if (!structure || structure.kind !== 'tower') return 0;
    const id = this.sim.data.towers.findIndex((t) => t.archetype === structure.archetype);
    return this.sim.data.towers[id]!.levels[0]!.rangeUnits;
  }

  private tint(tool: Tool): GhostTint {
    if (!this.lastVerdictOk) return 'invalid';
    const debt = this.palette.costOf(tool) > this.sim.state.treasuryMg;
    return debt ? 'debt' : 'valid';
  }
}
