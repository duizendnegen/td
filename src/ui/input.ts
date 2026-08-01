// Pointer picking, ghost validation loop, command emission
// See ARCHITECTURE.md §9 and the phase-3 build-ui spec
//
// Responsibilities:
//   - Raycast against the ground plane to get a tile coordinate
//   - Ghost preview runs the REAL validation (sim.previewPlacement),
//     re-evaluated on hovered-tile change or new tick — never per mouse-move
//   - Selecting a tower drives the inspector and its range rings, including
//     the next-level preview while the upgrade action is hovered
//   - Never writes sim state directly — emits commands only
//   - Every invalid click plays the same red flash the sim's rejects use

import * as THREE from 'three';
import type { CommandQueue } from '../sim/commands';
import { footprintFor, structureAt } from '../sim/placement';
import type { Sim } from '../sim/sim';
import { towerStats } from '../sim/tower';
import type { FxRenderer, GhostPreview, GhostTint } from '../render/fx';
import { GROUND_TOP_Y } from '../render/renderer';
import type { InspectorUI } from './inspector';
import { toolStructure, type PaletteUI, type Tool } from './palette';

export class InputController {
  private readonly sim: Sim;
  private readonly commands: CommandQueue;
  private readonly palette: PaletteUI;
  private readonly inspector: InspectorUI;
  private readonly ghost: GhostPreview;
  private readonly fx: FxRenderer;
  private readonly camera: THREE.Camera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  private hovered: { tx: number; ty: number } | null = null;
  /** Ghost re-evaluation keys: last evaluated (tile, tick) pair. */
  private lastEvalTick = -1;
  private lastEvalTile = '';
  private lastVerdictOk = false;

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.Camera,
    sim: Sim,
    commands: CommandQueue,
    palette: PaletteUI,
    inspector: InspectorUI,
    ghost: GhostPreview,
    fx: FxRenderer,
  ) {
    this.sim = sim;
    this.commands = commands;
    this.palette = palette;
    this.inspector = inspector;
    this.ghost = ghost;
    this.fx = fx;
    this.camera = camera;

    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.onClick();
      if (e.button === 2) this.palette.select(null);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    palette.onChange = () => {
      this.inspector.select(null);
      this.forceReevaluate();
    };
  }

  /** Pointer → ground-plane raycast → tile, or null off the board. */
  private pickTile(e: PointerEvent): { tx: number; ty: number } | null {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
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

  private onPointerMove(e: PointerEvent): void {
    this.hovered = this.pickTile(e);
  }

  private onClick(): void {
    const tile = this.hovered;
    if (!tile) return;
    const tool = this.palette.selected;
    const structure = tool !== null ? toolStructure(tool) : null;

    if (structure) {
      // Re-run the real validation at click time; a red ghost or a stale
      // green both end in the same local flash with no command issued
      // when invalid (build-ui spec). A valid verdict may still lose the
      // race at the applying tick — then the sim's own reject event plays
      // the identical flash.
      const verdict = this.sim.previewPlacement(tile.tx, tile.ty);
      if (verdict === 'ok') {
        this.commands.issue({
          kind: 'place',
          structure: structure.kind,
          ...(structure.kind === 'tower' ? { archetype: structure.archetype } : {}),
          tx: tile.tx,
          ty: tile.ty,
        });
      } else {
        this.fx.flashReject(footprintFor(tile.tx, tile.ty), performance.now());
      }
      return;
    }

    if (tool === 'remove') {
      const s = structureAt(this.sim.state.structures, tile.tx, tile.ty);
      if (s && s.removalCompleteTick < 0) {
        this.commands.issue({ kind: 'remove', tx: tile.tx, ty: tile.ty });
      }
      return;
    }

    // No tool: select a tower to inspect it.
    const s = structureAt(this.sim.state.structures, tile.tx, tile.ty);
    this.inspector.select(s?.kind === 'tower' ? s : null);
  }

  private forceReevaluate(): void {
    this.lastEvalTick = -1;
    this.lastEvalTile = '';
  }

  /** The level-1 range for a tower tool's ghost ring; 0 for walls. */
  private toolRangeUnits(tool: Tool): number {
    const structure = toolStructure(tool);
    if (!structure || structure.kind !== 'tower') return 0;
    const id = this.sim.data.towers.findIndex((t) => t.archetype === structure.archetype);
    return this.sim.data.towers[id]!.levels[0]!.rangeUnits;
  }

  /**
   * Per-frame ghost maintenance. The verdict is recomputed only when the
   * hovered tile or the sim tick changed (design D1), so an enemy walking
   * into the footprint flips the tint without any pointer motion.
   */
  update(): void {
    const tool = this.palette.selected;
    const tile = this.hovered;
    const structure = tool !== null ? toolStructure(tool) : null;

    if (structure) {
      if (!tile) {
        this.ghost.hide();
        this.lastEvalTile = '';
        return;
      }
      const tick = this.sim.state.tick;
      const key = `${tool}:${tile.tx},${tile.ty}`;
      if (tick !== this.lastEvalTick || key !== this.lastEvalTile) {
        this.lastEvalTick = tick;
        this.lastEvalTile = key;
        this.lastVerdictOk = this.sim.previewPlacement(tile.tx, tile.ty) === 'ok';
      }
      this.ghost.show(structure.kind, tile.tx, tile.ty, this.tint(tool!), this.toolRangeUnits(tool!));
      this.ghost.showPreviewRingAt(null);
      return;
    }

    // No build tool: the ghost shows at most the inspected tower's rings.
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

  private tint(tool: Tool): GhostTint {
    if (!this.lastVerdictOk) return 'invalid';
    const debt = this.palette.costOf(tool) > this.sim.state.treasuryMg;
    return debt ? 'debt' : 'valid';
  }
}

/** HUD hint line for the phase-3 controls. */
export function buildHintLine(hud: HTMLElement): void {
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;bottom:14px;left:14px;padding:6px 10px;background:#0007;max-width:210px;' +
    'font:11px/1.6 system-ui;border-radius:6px;color:#aab4c4;user-select:none;pointer-events:none';
  el.innerHTML =
    '1 wall · 2-5 towers · 6 remove<br>click tower to inspect · Esc cancels<br>' +
    'F1 fields · F2 waypoints · F3 ranges<br>F4 readout · F8 probe';
  hud.appendChild(el);
}
