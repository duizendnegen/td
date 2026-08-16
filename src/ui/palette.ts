// Build palette
// See ARCHITECTURE.md §9 and the aether-ui-redesign build-ui spec
//
// Responsibilities:
//   - Wall + all four tower archetypes with level-1 costs, plus removal
//   - Affordable / debt-warning / blocked / selected states as whole-literal
//     class variants (design D1), refreshed per frame
//   - Debt-warned items stay selectable; below 0 everything is blocked
//   - The remove tool stays usable while a wave runs — provisional structures
//     are still sellable, so the per-structure verdict lands at the click
//     (build-ui spec) — and is unaffected by the treasury
//   - Desktop: left rail. Below the breakpoint: bottom build menu — same
//     items and states, placement is pure CSS

import type { TowerArchetype } from '../data/schema';
import { GOLD } from '../sim/fixed';

export type Tool = 'wall' | TowerArchetype | 'remove' | 'move';

/** The structure a tool places, or null for the removal and move tools. */
export function toolStructure(tool: Tool): { kind: 'wall' } | { kind: 'tower'; archetype: TowerArchetype } | null {
  if (tool === 'wall') return { kind: 'wall' };
  if (tool === 'remove' || tool === 'move') return null;
  return { kind: 'tower', archetype: tool };
}

// ── Class variants (design D1: literal strings only, whole-variant swaps) ──

const PANEL =
  'pointer-events-auto bevel-panel relative flex gap-unit bg-surface-container-high ' +
  'mobile:w-full mobile:flex-row mobile:items-stretch mobile:justify-evenly mobile:rounded-t-xl ' +
  'mobile:border-t-2 mobile:border-outline mobile:px-2 mobile:pb-2 mobile:pt-2 ' +
  'desktop:w-24 desktop:flex-col desktop:items-center desktop:rounded-lg desktop:border desktop:border-outline/30 desktop:p-unit';

const BTN_BASE =
  'btn-mech relative flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded ';
const BTN_AFFORDABLE =
  BTN_BASE + 'border border-surface-bright bg-surface text-on-surface-variant hover:bg-surface-bright';
const BTN_SELECTED =
  BTN_BASE +
  'translate-y-[2px] border-2 border-primary-fixed bg-surface-dim text-primary-fixed shadow-[0_0_15px_rgba(255,215,0,0.3)]';
const BTN_DEBT = BTN_BASE + 'debt-pulse border border-error bg-error-container/25 text-error';
const BTN_BLOCKED =
  BTN_BASE +
  'hazard-stripe cursor-not-allowed border border-surface-bright/50 bg-surface/50 text-on-surface-variant opacity-50';
// The removal tool reads as destructive: hazard stripes even when idle.
const BTN_REMOVE =
  BTN_BASE + 'hazard-stripe border border-error/60 bg-surface text-error hover:bg-error-container/30';
const BTN_REMOVE_SELECTED =
  BTN_BASE +
  'hazard-stripe translate-y-[2px] border-2 border-error bg-error-container/40 text-error shadow-[0_0_15px_rgba(255,180,171,0.3)]';

const BADGE_OK =
  'pointer-events-none absolute -bottom-1.5 -right-1.5 z-10 rounded border border-surface-bright ' +
  'bg-surface-container px-1 font-mono text-label-xs text-primary-fixed';
const BADGE_DEBT =
  'pointer-events-none absolute -bottom-1.5 -right-1.5 z-10 rounded border border-error ' +
  'bg-error-container px-1 font-mono text-label-xs text-on-error-container';

const KEY_HINT =
  'pointer-events-none absolute left-1 top-0.5 font-mono text-label-xs text-on-surface-variant/60 mobile:hidden';

const ICONS: Record<Tool, string> = {
  wall: 'foundation',
  rapid: 'bolt',
  sniper: 'my_location',
  area: 'flare',
  slow: 'ac_unit',
  remove: 'delete',
  move: 'open_with',
};

/** Badge text for the free tools; cost-bearing tools show their price. */
const FREE_BADGES: Partial<Record<Tool, string>> = { remove: '50%', move: 'free' };

interface Item {
  tool: Tool;
  label: string;
  key: string;
  costMg: number; // 0 for the removal tool
  button: HTMLButtonElement;
  badge: HTMLDivElement;
  lastButtonClass: string;
  lastBadgeClass: string;
}

export interface PaletteCosts {
  wallMg: number;
  /** Level-1 cost per archetype, in canonical order rapid/sniper/area/slow. */
  towerMg: Record<TowerArchetype, number>;
}

export class PaletteUI {
  private readonly items: Item[] = [];
  private selectedTool: Tool | null = null;
  private blocked = false;
  /** The removal phase gate: false only once the run has ended (removalOpenIn). */
  private removalAllowed = false;
  /** The move phase gate: true in the build phase only (moveOpenIn). */
  private moveAllowed = false;
  onChange: ((tool: Tool | null) => void) | null = null;

  constructor(slot: HTMLElement, costs: PaletteCosts) {
    const panel = document.createElement('div');
    panel.className = PANEL;
    panel.innerHTML =
      '<div class="rivet rivet-tl"></div><div class="rivet rivet-tr"></div>' +
      '<div class="hidden w-full border-b border-surface-bright/50 pb-1 text-center desktop:block">' +
      '<span class="font-mono text-label-xs uppercase text-on-surface-variant">BUILD</span></div>';
    slot.appendChild(panel);

    const defs: [Tool, string, string, number][] = [
      ['wall', 'Wall', '1', costs.wallMg],
      ['rapid', 'Rapid', '2', costs.towerMg.rapid],
      ['sniper', 'Sniper', '3', costs.towerMg.sniper],
      ['area', 'Area', '4', costs.towerMg.area],
      ['slow', 'Slow', '5', costs.towerMg.slow],
      ['remove', 'Remove', '6', 0],
      ['move', 'Move', '7', 0],
    ];
    for (const [tool, label, key, costMg] of defs) {
      const button = document.createElement('button');
      const initial = tool === 'remove' ? BTN_REMOVE : BTN_AFFORDABLE;
      button.className = initial;

      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined text-2xl';
      icon.textContent = ICONS[tool];
      const name = document.createElement('span');
      name.className = 'font-mono text-label-xs uppercase';
      name.textContent = label;
      const badge = document.createElement('div');
      badge.className = BADGE_OK;
      badge.textContent = costMg > 0 ? `${costMg / GOLD}` : FREE_BADGES[tool]!;
      const hint = document.createElement('div');
      hint.className = KEY_HINT;
      hint.textContent = key;
      button.append(icon, name, badge, hint);

      button.addEventListener('click', () => this.select(tool));
      panel.appendChild(button);
      this.items.push({
        tool,
        label,
        key,
        costMg,
        button,
        badge,
        lastButtonClass: initial,
        lastBadgeClass: BADGE_OK,
      });
    }
    panel.insertAdjacentHTML(
      'beforeend',
      '<div class="rivet rivet-bl mobile:hidden"></div><div class="rivet rivet-br mobile:hidden"></div>',
    );

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

  /** Whether `tool`'s own gate refuses arming it right now. */
  private gated(tool: Tool): boolean {
    if (tool === 'remove') return !this.removalAllowed;
    // The move tool is free like removal, so the treasury never gates it —
    // only the phase does (build-ui delta).
    if (tool === 'move') return !this.moveAllowed;
    return this.blocked;
  }

  select(tool: Tool | null): void {
    // Toggle off on reselect; ignore build tools while spending is blocked,
    // the remove tool while a wave gates selling, and the move tool outside
    // the build phase.
    const next = tool !== null && tool === this.selectedTool ? null : tool;
    if (next !== null && this.gated(next)) return;
    this.selectedTool = next;
    this.onChange?.(next);
    // refresh() runs every frame and repaints the buttons.
  }

  /**
   * Per-frame state refresh from the treasury balance and the two phase gates
   * (the sim's own removalOpenIn / moveOpenIn). The start of a wave no longer
   * drops a selected remove tool — provisional structures stay sellable, so a
   * player mid-revision must not be interrupted (build-ui spec); a click on
   * committed construction gets the ordinary reject feedback instead. The
   * tool is still dropped once the run ends and nothing can be sold at all.
   * The move tool IS dropped the moment a wave starts — nothing can legally
   * move until the build phase resumes, and deselecting here is what
   * force-cancels a lift in flight (tower-drag-move design D6).
   */
  refresh(treasuryMg: number, removalAllowed: boolean, moveAllowed: boolean): void {
    this.blocked = treasuryMg < 0;
    this.removalAllowed = removalAllowed;
    this.moveAllowed = moveAllowed;
    if (this.selectedTool !== null && this.gated(this.selectedTool)) this.select(null);
    for (const item of this.items) {
      const selected = item.tool === this.selectedTool;
      const debt = !this.blocked && item.costMg > 0 && item.costMg > treasuryMg;
      const blocked = this.gated(item.tool);

      let buttonClass: string;
      if (item.tool === 'remove') {
        buttonClass = blocked ? BTN_BLOCKED : selected ? BTN_REMOVE_SELECTED : BTN_REMOVE;
      } else if (blocked) {
        buttonClass = BTN_BLOCKED;
      } else if (selected) {
        buttonClass = BTN_SELECTED;
      } else if (debt) {
        buttonClass = BTN_DEBT;
      } else {
        buttonClass = BTN_AFFORDABLE;
      }
      if (buttonClass !== item.lastButtonClass) {
        item.lastButtonClass = buttonClass;
        item.button.className = buttonClass;
      }

      const badgeClass = debt || blocked ? BADGE_DEBT : BADGE_OK;
      if (badgeClass !== item.lastBadgeClass) {
        item.lastBadgeClass = badgeClass;
        item.badge.className = badgeClass;
      }
    }
  }
}
