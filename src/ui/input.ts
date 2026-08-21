// Pointer (mouse / hover-capable) input driver
// See ARCHITECTURE.md §9 and the aether-ui-redesign design D3
//
// Responsibilities:
//   - Hover drives the ghost; a left click commits immediately (no confirm
//     step). The right button belongs wholesale to MouseCameraController
//     (drag pans; a sub-slop click still cancels the tool via its callback);
//     this driver only suppresses the context menu for it
//   - Move tool (tower-drag-move design D6): a press on a structure — tower
//     or wall — lifts it; release past the drag slop drops at the release
//     tile, a sub-slop release keeps carrying and a second click drops — both
//     drop paths run through InputCore.commitMove, where a drop on the origin
//     tile is the put-down (no command). Slop latching mirrors the
//     MouseCameraController right-drag pattern. The inspector's Move action
//     arms the tool and lifts through the core with no press standing, which
//     is already the click-click carry — nothing here to add
//   - All picking, validation, selection, and command emission live in the
//     shared InputCore; this driver only owns the hovered tile and the
//     press-to-release slop state

import { SLOP_PX } from './gestures';
import type { InputCore, Tile } from './inputcore';
import { TOOL_KEYS, toolStructure } from './palette';

interface MovePress {
  startX: number;
  startY: number;
  /** Latched once past the slop: the release becomes a drag-drop. */
  dragging: boolean;
}

export class PointerDriver {
  private readonly core: InputCore;
  private hovered: Tile | null = null;
  /** The press that started the current lift, until its release. */
  private press: MovePress | null = null;

  constructor(canvas: HTMLCanvasElement, core: InputCore) {
    this.core = core;
    // Touch pointers never reach this driver: on hybrid devices (touch screen
    // + mouse) they belong to the TouchCameraController, and letting them
    // through would insta-place on a tap with no confirm step.
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.hovered = core.pickTile(e.clientX, e.clientY);
      const press = this.press;
      if (
        press &&
        !press.dragging &&
        Math.hypot(e.clientX - press.startX, e.clientY - press.startY) > SLOP_PX
      ) {
        press.dragging = true;
      }
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      if (this.core.palette.selected === 'move') this.onMovePress(e);
      else this.onClick();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      this.onMoveRelease(e);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onClick(): void {
    const tile = this.hovered;
    if (!tile) return;
    const tool = this.core.palette.selected;
    if (tool !== null && toolStructure(tool)) {
      this.core.commitPlace(tile);
    } else if (tool === 'remove') {
      this.core.commitRemove(tile);
    } else {
      this.core.selectAt(tile);
    }
  }

  /**
   * A left press with the move tool armed: nothing lifted, on a structure →
   * lift and start slop tracking; already carrying (a sub-slop click left
   * the lift standing) → this second click attempts the drop here — on the
   * origin, that puts the structure down. Presses on empty tiles with
   * nothing lifted do nothing (build-ui delta).
   */
  private onMovePress(e: { clientX: number; clientY: number }): void {
    this.hovered = this.core.pickTile(e.clientX, e.clientY);
    const tile = this.hovered;
    if (!tile) return;
    if (this.core.lifted) {
      this.core.commitMove(tile);
      return;
    }
    if (this.core.liftAt(tile)) {
      this.press = { startX: e.clientX, startY: e.clientY, dragging: false };
    }
  }

  /**
   * The lifting press's release: past the slop it drops at the release tile
   * (back over the origin, that is the put-down); sub-slop it is a click —
   * the carry continues until the second click.
   */
  private onMoveRelease(e: { clientX: number; clientY: number }): void {
    const press = this.press;
    this.press = null;
    if (!press || !press.dragging || !this.core.lifted) return;
    this.hovered = this.core.pickTile(e.clientX, e.clientY);
    if (this.hovered) this.core.commitMove(this.hovered);
  }

  /** Per-frame ghost maintenance from the hovered tile. */
  update(): void {
    const tool = this.core.palette.selected;
    if (tool !== null && toolStructure(tool)) {
      this.core.updateBuildGhost(this.hovered);
    } else if (tool === 'move') {
      this.core.updateMoveGhost(this.hovered);
    } else {
      this.core.updateIdleRings();
    }
  }
}

/**
 * HUD hint line for the phase-3 controls; desktop-only like the hotkeys. Names
 * the foundation rule — towers go on walls (build-over-walls) — so the rule
 * is discoverable from the interface, not from a field of red ghosts.
 */
export function buildHintLine(hud: HTMLElement): void {
  const el = document.createElement('div');
  el.className =
    'pointer-events-none absolute bottom-4 left-4 hidden max-w-[240px] rounded border ' +
    'border-outline/20 bg-surface-container/80 px-3 py-2 font-mono text-label-xs ' +
    'leading-relaxed text-on-surface-variant desktop:block';
  const k = TOOL_KEYS;
  el.innerHTML =
    `${k.wall} wall · ${k.rapid}-${k.slow} towers · ${k.panel} solar · ${k.battery} battery<br>` +
    `${k.remove} remove · ${k.move} move · towers go on walls<br>` +
    'click tower to inspect · Esc cancels<br>Space start wave / pause<br>hold F to fast-forward<br>' +
    'F2 waypoints · F3 ranges<br>F4 readout · F8 probe';
  hud.appendChild(el);
}
