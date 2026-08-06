// Pointer (mouse / hover-capable) input driver
// See ARCHITECTURE.md §9 and the aether-ui-redesign design D3
//
// Responsibilities:
//   - Hover drives the ghost; a left click commits immediately (no confirm
//     step); right click cancels the tool — behavior unchanged from the
//     phase-3 controller
//   - All picking, validation, selection, and command emission live in the
//     shared InputCore; this driver only owns the hovered tile

import type { InputCore, Tile } from './inputcore';
import { toolStructure } from './palette';

export class PointerDriver {
  private readonly core: InputCore;
  private hovered: Tile | null = null;

  constructor(canvas: HTMLCanvasElement, core: InputCore) {
    this.core = core;
    // Touch pointers never reach this driver: on hybrid devices (touch screen
    // + mouse) they belong to the TouchCameraController, and letting them
    // through would insta-place on a tap with no confirm step.
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.hovered = core.pickTile(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.onClick();
      if (e.button === 2) core.palette.select(null);
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

  /** Per-frame ghost maintenance from the hovered tile. */
  update(): void {
    const tool = this.core.palette.selected;
    if (tool !== null && toolStructure(tool)) {
      this.core.updateBuildGhost(this.hovered);
    } else {
      this.core.updateIdleRings();
    }
  }
}

/** HUD hint line for the phase-3 controls; desktop-only like the hotkeys. */
export function buildHintLine(hud: HTMLElement): void {
  const el = document.createElement('div');
  el.className =
    'pointer-events-none absolute bottom-4 left-4 hidden max-w-[240px] rounded border ' +
    'border-outline/20 bg-surface-container/80 px-3 py-2 font-mono text-label-xs ' +
    'leading-relaxed text-on-surface-variant desktop:block';
  el.innerHTML =
    '1 wall · 2-5 towers · 6 remove<br>click tower to inspect · Esc cancels<br>' +
    'Space pause · hold F to fast-forward<br>' +
    'F1 fields · F2 waypoints · F3 ranges<br>F4 readout · F8 probe';
  hud.appendChild(el);
}
