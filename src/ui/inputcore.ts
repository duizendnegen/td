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
//   - The inspector's Move action routes here too: arm the move tool, lift
//     the inspected tower — the same two steps a palette click and a press
//     perform, so both drivers see one lift lifecycle — and disarm the tool
//     again once that one lift ends
//   - Never writes sim state directly — emits commands only
//   - Every invalid commit plays the same red flash the sim's rejects use

import * as THREE from 'three';
import type { CommandQueue } from '../sim/commands';
import { canRemove, footprintFor, moveOpenIn, structureAt } from '../sim/placement';
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
   * The lifted structure — tower or wall — while the move tool carries one
   * (tower-drag-move design D6): its id plus the origin tile the move command
   * will name. Entered only through liftAt — from a driver's press/tap or
   * the inspector's Move action; cleared by tool change/deselect
   * (Esc, palette click, the phase-change deselect in palette.refresh), by
   * cancelLift — which a drop on the origin tile resolves to — and by the
   * per-frame sweep in updateMoveGhost once the structure's tile changed —
   * the move applied; the latter two run through endLift, which also disarms
   * a tool the inspector armed for this lift alone. Deliberately NOT cleared when a drop merely issues the
   * command: a rejection at the applying tick then leaves the structure
   * lifted, so another tile can be tried without re-lifting (build-ui delta).
   */
  lifted: { id: number; tx: number; ty: number } | null = null;

  /**
   * True while the move tool was armed by the inspector's Move action for
   * the current lift alone (design D9): that route is an action on one
   * tower, not a mode the player chose, so the tool disarms when the lift
   * ends — the move applied, or a put-down / cancel — through endLift. A
   * failed drop keeps carrying and keeps the tool, as for any lift. Reset by
   * any tool change, like the lift itself.
   */
  private toolArmedForLift = false;

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
      this.toolArmedForLift = false;
      this.forceReevaluate();
      this.onToolChange?.();
    };
    inspector.onMove = (s) => this.liftInspected(s);
  }

  /** Driver hook, fired on every tool change (touch clears its pending ghost). */
  onToolChange: (() => void) | null = null;

  /**
   * Driver hook, fired with the origin tile when a lift begins outside the
   * driver's own press/tap handling — the inspector's Move action. Touch
   * stages its pending ghost there, exactly as its own tap on the structure
   * would; the pointer driver needs nothing, since a lift with no press
   * standing already is the click-click carry.
   */
  onLift: ((origin: Tile) => void) | null = null;

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
   * Lift the structure at `tile` for the armed move tool — tower or wall
   * alike, in the build phase only (moveOpenIn); an empty tile, or any tile
   * outside the build phase, does nothing at all (build-ui delta). Returns
   * whether a lift began.
   */
  liftAt(tile: Tile): boolean {
    const s = structureAt(this.sim.state.structures, tile.tx, tile.ty);
    if (!s || !moveOpenIn(this.sim.state.runPhase)) return false;
    this.lifted = { id: s.id, tx: s.tx, ty: s.ty };
    this.forceReevaluate();
    return true;
  }

  /**
   * The inspector's Move action: arm the move tool and lift the inspected
   * tower in one step — precisely what selecting the tool and then pressing
   * on the tower does, so the two routes cannot drift (design D9). Arming
   * goes through the palette, so its phase gate, the tool-change fan-out
   * (the inspector deselects, touch drops its pending ghost, an old lift
   * clears), and everything downstream of a lift apply as they would for a
   * palette click; a refused arming — the tool stays unarmed outside the
   * build phase — lifts nothing. The tool is armed for this lift alone: it
   * disarms when the lift ends (see toolArmedForLift). Returns whether a
   * lift began.
   */
  liftInspected(s: Structure): boolean {
    if (this.palette.selected !== 'move') this.palette.select('move');
    if (this.palette.selected !== 'move') return false;
    const origin = { tx: s.tx, ty: s.ty };
    if (!this.liftAt(origin)) return false;
    this.toolArmedForLift = true;
    this.onLift?.(origin);
    return true;
  }

  /**
   * Put the lifted structure down with no command — the touch ✕ affordance's
   * path, and where a drop on the origin tile ends up.
   */
  cancelLift(): void {
    this.endLift();
  }

  /**
   * The one exit for a lift that ran its course — cancelled, applied, or the
   * structure gone. A tool the inspector armed for this lift alone is
   * disarmed here (design D9); that deselect fans out through palette.onChange
   * exactly like an Esc, so both drivers wind down the same way.
   */
  private endLift(): void {
    this.lifted = null;
    this.forceReevaluate();
    if (this.toolArmedForLift) {
      this.toolArmedForLift = false;
      if (this.palette.selected === 'move') this.palette.select(null);
    }
  }

  /**
   * Attempt to drop the lifted structure at `tile` — the one path behind a
   * desktop release/click and a touch confirm. The origin tile is the
   * put-down (design D6): the lift ends with no command and no flash, the
   * structure standing where it always was — a cancel, never a same-tile move
   * command. Anywhere else re-runs the real validation at commit time; a red
   * ghost or a stale green both end in the same local flash with no command
   * issued when invalid, and the structure stays lifted so another tile can
   * be tried without re-lifting (build-ui delta). A valid verdict may still
   * lose the race at the applying tick — the sim's own reject event then
   * plays the identical flash, and the lift survives until the structure
   * actually moves. Returns whether the drop resolved — a command issued, or
   * the structure put down — so a driver knows to dismiss its pending state.
   */
  commitMove(tile: Tile): boolean {
    const lifted = this.lifted;
    if (!lifted) return false;
    if (tile.tx === lifted.tx && tile.ty === lifted.ty) {
      this.cancelLift();
      return true;
    }
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
   * (path-preview delta). A lifted structure gets a move ghost of its kind —
   * tinted by the origin-freed validation, never the debt tint: moves are
   * free — with a tower's own range ring at the candidate tile, and the
   * projected routes, re-evaluated when the candidate tile, the sim tick, or
   * the lifted id changes, so lifting a different structure on the same tile
   * re-projects (design D5). The origin tile reads valid: dropping there is
   * the put-down, so the tint (and the touch confirm class, which reads the
   * same flag) agrees with what the drop will do, while the ribbon shows no
   * projection for it. Speculative only — never touches sim state.
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
      const atOrigin =
        mover !== null && tile !== null && tile.tx === mover.tx && tile.ty === mover.ty;
      this.lastVerdictOk = atOrigin || preview?.verdict === 'ok';
      this.ribbon.update(this.sim.currentLanes(), preview?.lanes ?? null, preview?.orphaned ?? null);
    }
    if (!mover || !tile) {
      this.ghost.hide();
      return;
    }
    this.ghost.show(
      mover.kind,
      tile.tx,
      tile.ty,
      this.lastVerdictOk ? 'valid' : 'invalid',
      mover.kind === 'tower' ? towerStats(mover, this.sim.data).rangeUnits : 0,
    );
    this.ghost.showPreviewRingAt(null);
  }

  /**
   * The lifted structure, live, or null with the lift swept away when it
   * stands on another tile (the move applied) or vanished — the completion
   * end of the lift lifecycle.
   */
  private liftedStructure(): Structure | null {
    const lifted = this.lifted;
    if (!lifted) return null;
    const s = this.sim.state.structures.find((x) => x.id === lifted.id);
    if (!s || s.tx !== lifted.tx || s.ty !== lifted.ty) {
      this.endLift();
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
