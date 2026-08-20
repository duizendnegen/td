// Ghost badges: the price of each box the build ghost draws
// See the build-over-walls build-ui delta and design D6
//
// Responsibilities:
//   - A small cost badge floats at the middle of the tower ghost and another
//     low on the wall ghost, each where its box stands on screen, so a tower
//     tool over bare dirt — where one click lays the wall and mounts the
//     tower — shows two prices on two boxes, and a plain wall or tower ghost
//     shows its one
//   - Hidden whenever no build ghost shows (the move ghost is free and
//     carries none); re-anchored every frame through the core's projection
//   - Read-only view of the input core's per-frame state

import { TOWER_GHOST_HEIGHT, WALL_GHOST_HEIGHT } from '../render/fx';
import { GROUND_TOP_Y } from '../render/renderer';
import { GOLD } from '../sim/fixed';
import type { InputCore } from './inputcore';

const BADGE =
  'pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded border ' +
  'border-surface-bright bg-surface-container px-1 font-mono text-label-xs leading-4 text-primary-fixed';

/** The tower badge sits mid-way up the part of the tower box above the wall box. */
const TOWER_BADGE_Y = GROUND_TOP_Y + (WALL_GHOST_HEIGHT + TOWER_GHOST_HEIGHT) / 2;
const WALL_BADGE_Y = GROUND_TOP_Y + WALL_GHOST_HEIGHT / 2;

class Badge {
  private readonly el: HTMLDivElement;
  private lastText = '';
  private shown = false;

  constructor(hud: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = BADGE;
    this.el.style.display = 'none';
    hud.appendChild(this.el);
  }

  show(text: string, at: { x: number; y: number }): void {
    if (text !== this.lastText) {
      this.lastText = text;
      this.el.textContent = text;
    }
    this.el.style.left = `${at.x}px`;
    this.el.style.top = `${at.y}px`;
    if (!this.shown) {
      this.shown = true;
      this.el.style.display = 'block';
    }
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.el.style.display = 'none';
  }
}

export class GhostBadges {
  private readonly tower: Badge;
  private readonly wall: Badge;

  constructor(hud: HTMLElement) {
    this.tower = new Badge(hud);
    this.wall = new Badge(hud);
  }

  /** Per frame, after the driver's ghost maintenance ran. */
  update(core: InputCore): void {
    const costs = core.ghostCosts;
    if (!costs) {
      this.tower.hide();
      this.wall.hide();
      return;
    }
    const { tx, ty } = costs.tile;
    if (costs.towerMg !== null) {
      this.tower.show(`${costs.towerMg / GOLD}`, core.projectPoint(tx + 0.5, TOWER_BADGE_Y, ty + 0.5));
    } else {
      this.tower.hide();
    }
    if (costs.wallMg !== null) {
      this.wall.show(`${costs.wallMg / GOLD}`, core.projectPoint(tx + 0.5, WALL_BADGE_Y, ty + 0.5));
    } else {
      this.wall.hide();
    }
  }
}
