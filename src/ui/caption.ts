// Ghost caption: names both purchases when one click places two structures
// See the build-over-walls build-ui delta and design D6
//
// Responsibilities:
//   - While a tower tool's ghost sits on bare dirt — where the click lays
//     the wall and mounts the tower in one command — a small label beside
//     the ghost reads "wall 20 + rapid 50", so the two structures and the
//     two costs are named where the player is looking, not only in the rail
//   - Hidden for every single-structure ghost and whenever no build ghost
//     shows; re-anchored every frame just right of the ghost tile's
//     screen-right corner, so it clears the ghost at any zoom and the touch
//     ✓/✕ pair above it
//   - Read-only view of the input core's per-frame state

import { GOLD } from '../sim/fixed';
import type { InputCore } from './inputcore';

const CAPTION =
  'pointer-events-none absolute z-10 whitespace-nowrap rounded border border-outline/30 ' +
  'bg-surface-container/90 px-1.5 py-0.5 font-mono text-label-xs text-on-surface-variant';
/** Gap between the tile's screen-right corner and the caption, in CSS pixels. */
const GAP_PX = 8;

export class GhostCaption {
  private readonly el: HTMLDivElement;
  private lastText = '';
  private shown = false;

  constructor(hud: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = CAPTION;
    this.el.style.display = 'none';
    hud.appendChild(this.el);
  }

  /** Per frame, after the driver's ghost maintenance ran. */
  update(core: InputCore): void {
    const compound = core.compound;
    if (!compound) {
      if (this.shown) {
        this.shown = false;
        this.el.style.display = 'none';
      }
      return;
    }
    const text = `wall ${compound.wallMg / GOLD} + ${compound.tool} ${compound.towerMg / GOLD}`;
    if (text !== this.lastText) {
      this.lastText = text;
      this.el.textContent = text;
    }
    // The camera looks from the south-east, so the tile corner at (max x,
    // min z) is its screen-right extreme.
    const p = core.projectGround(compound.tile.tx + 1, compound.tile.ty);
    this.el.style.left = `${p.x + GAP_PX}px`;
    this.el.style.top = `${p.y - this.el.offsetHeight / 2}px`;
    if (!this.shown) {
      this.shown = true;
      this.el.style.display = 'block';
    }
  }
}
