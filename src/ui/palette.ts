// Build palette
// See ARCHITECTURE.md §9 and the phase-3 build-ui spec
//
// Responsibilities:
//   - Wall + all four tower archetypes with level-1 costs, plus removal
//   - Affordable / debt-warning / blocked states, refreshed per frame
//   - Debt-warned items stay selectable; below 0 everything is blocked

import type { TowerArchetype } from '../data/schema';
import { GOLD } from '../sim/fixed';

export type Tool = 'wall' | TowerArchetype | 'remove';

/** The structure a tool places, or null for the removal tool. */
export function toolStructure(tool: Tool): { kind: 'wall' } | { kind: 'tower'; archetype: TowerArchetype } | null {
  if (tool === 'wall') return { kind: 'wall' };
  if (tool === 'remove') return null;
  return { kind: 'tower', archetype: tool };
}

interface Item {
  tool: Tool;
  label: string;
  key: string;
  costMg: number; // 0 for the removal tool
  button: HTMLButtonElement;
}

const BASE_STYLE =
  'padding:8px 10px;border-radius:8px;border:1px solid #3a4354;background:#1b2230;' +
  'color:#e8eaed;font:600 13px/1.3 system-ui;cursor:pointer;min-width:72px;text-align:center';

export interface PaletteCosts {
  wallMg: number;
  /** Level-1 cost per archetype, in canonical order rapid/sniper/area/slow. */
  towerMg: Record<TowerArchetype, number>;
}

export class PaletteUI {
  private readonly items: Item[] = [];
  private selectedTool: Tool | null = null;
  private blocked = false;
  onChange: ((tool: Tool | null) => void) | null = null;

  constructor(hud: HTMLElement, costs: PaletteCosts) {
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
      'display:flex;gap:8px;user-select:none';
    hud.appendChild(bar);

    const defs: [Tool, string, string, number][] = [
      ['wall', 'Wall', '1', costs.wallMg],
      ['rapid', 'Rapid', '2', costs.towerMg.rapid],
      ['sniper', 'Sniper', '3', costs.towerMg.sniper],
      ['area', 'Area', '4', costs.towerMg.area],
      ['slow', 'Slow', '5', costs.towerMg.slow],
      ['remove', 'Remove', '6', 0],
    ];
    for (const [tool, label, key, costMg] of defs) {
      const button = document.createElement('button');
      button.style.cssText = BASE_STYLE;
      const cost = costMg > 0 ? `${costMg / GOLD}g` : '50% back';
      button.innerHTML = `${label}<br><span style="font-weight:400;opacity:.75">${cost} · [${key}]</span>`;
      button.addEventListener('click', () => this.select(tool));
      bar.appendChild(button);
      this.items.push({ tool, label, key, costMg, button });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.select(null);
      const item = this.items.find((i) => i.key === e.key);
      if (item) this.select(item.tool);
    });
  }

  get selected(): Tool | null {
    return this.selectedTool;
  }

  /** The selected tool's cost, for the ghost's debt tint. */
  costOf(tool: Tool): number {
    return this.items.find((i) => i.tool === tool)?.costMg ?? 0;
  }

  select(tool: Tool | null): void {
    // Toggle off on reselect; ignore build tools while spending is blocked.
    const next = tool !== null && tool === this.selectedTool ? null : tool;
    if (next !== null && next !== 'remove' && this.blocked) return;
    this.selectedTool = next;
    this.onChange?.(next);
    // refresh() runs every frame and repaints the buttons.
  }

  /** Per-frame state refresh from the treasury balance. */
  refresh(treasuryMg: number): void {
    this.blocked = treasuryMg < 0;
    if (this.blocked && this.selectedTool !== null && this.selectedTool !== 'remove') {
      this.select(null);
    }
    for (const item of this.items) {
      const debt = !this.blocked && item.costMg > 0 && item.costMg > treasuryMg;
      const blocked = this.blocked && item.tool !== 'remove';
      const border = item.tool === this.selectedTool ? '#7fd0ff' : debt ? '#ffa02e' : '#3a4354';
      item.button.style.border = `1px solid ${border}`;
      item.button.style.opacity = blocked ? '0.35' : '1';
      item.button.style.cursor = blocked ? 'not-allowed' : 'pointer';
      item.button.style.background =
        item.tool === this.selectedTool ? '#27405c' : debt ? '#33261b' : '#1b2230';
    }
  }
}
