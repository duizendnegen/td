// Build palette
// See ARCHITECTURE.md §9 and the phase-2 build-ui spec
//
// Responsibilities:
//   - Wall + rapid tower with costs, plus the removal tool
//   - Affordable / debt-warning / blocked states, refreshed per frame
//   - Debt-warned items stay selectable; below 0 everything is blocked

import { GOLD } from '../sim/fixed';
import type { StructureKind } from '../sim/types';

export type Tool = StructureKind | 'remove';

interface Item {
  tool: Tool;
  label: string;
  key: string;
  costMg: number; // 0 for the removal tool
  button: HTMLButtonElement;
}

const BASE_STYLE =
  'padding:10px 14px;border-radius:8px;border:1px solid #3a4354;background:#1b2230;' +
  'color:#e8eaed;font:600 14px/1.3 system-ui;cursor:pointer;min-width:86px;text-align:center';

export class PaletteUI {
  private readonly items: Item[] = [];
  private selectedTool: Tool | null = null;
  private blocked = false;
  onChange: ((tool: Tool | null) => void) | null = null;

  constructor(hud: HTMLElement, costs: { wallMg: number; towerMg: number }) {
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
      'display:flex;gap:10px;user-select:none';
    hud.appendChild(bar);

    const defs: [Tool, string, string, number][] = [
      ['wall', 'Wall', '1', costs.wallMg],
      ['tower', 'Tower', '2', costs.towerMg],
      ['remove', 'Remove', '3', 0],
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
