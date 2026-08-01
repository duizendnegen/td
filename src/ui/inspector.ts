// Selected tower panel
// See ARCHITECTURE.md §9 and the phase-3 build-ui spec
//
// Responsibilities:
//   - Archetype, level, current stats, next-level cost
//   - Upgrade action with palette-consistent affordable/debt/blocked states;
//     blocked under a removal countdown; maxed state at level 3
//   - Remove, with the standard removal-delay countdown
//   - Emits commands only; reads sim state per frame, never mutates it

import type { GameData, TowerLevelStats } from '../data/schema';
import { ARCHETYPES } from '../data/schema';
import type { CommandQueue } from '../sim/commands';
import { GOLD, TICK_HZ, TILE } from '../sim/fixed';
import { MAX_TOWER_LEVEL } from '../sim/sim';
import { towerStats } from '../sim/tower';
import type { SimState, Structure } from '../sim/types';

const LABELS: Record<string, string> = {
  rapid: 'Rapid tower',
  sniper: 'Sniper tower',
  area: 'Area tower',
  slow: 'Slow tower',
};

function statLines(data: GameData, s: Structure, stats: TowerLevelStats): string[] {
  const archetype = ARCHETYPES[s.archetypeId]!;
  const lines = [`range ${(stats.rangeUnits / TILE).toFixed(2)} tiles`];
  if (archetype !== 'slow') {
    lines.push(`damage ${stats.damage}`);
  }
  lines.push(`rate ${(TICK_HZ / stats.fireIntervalTicks).toFixed(1)}/s`);
  if (archetype === 'area') {
    lines.push(`burst r ${(data.towers[s.archetypeId]!.burstRadiusUnits / TILE).toFixed(1)} tiles`);
  }
  if (archetype === 'slow') {
    lines.push(`slow to ${data.slowSpeedPer100}% for ${(stats.slowDurationTicks / TICK_HZ).toFixed(1)} s`);
  }
  return lines;
}

export class InspectorUI {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly upgradeButton: HTMLButtonElement;
  private readonly removeButton: HTMLButtonElement;
  private readonly data: GameData;
  private readonly commands: CommandQueue;

  private selectedId: number | null = null;
  private selected: Structure | null = null;
  /** True while the pointer is over the upgrade action (range preview hook). */
  upgradeHovered = false;

  constructor(hud: HTMLElement, data: GameData, commands: CommandQueue) {
    this.data = data;
    this.commands = commands;

    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:absolute;right:12px;bottom:14px;width:190px;padding:12px;background:#141a26ee;' +
      'border:1px solid #3a4354;border-radius:10px;color:#e8eaed;' +
      'font:13px/1.5 system-ui;user-select:none;display:none';
    hud.appendChild(this.root);

    this.title = document.createElement('div');
    this.title.style.cssText = 'font-weight:700;margin-bottom:6px';
    this.stats = document.createElement('div');
    this.stats.style.cssText = 'opacity:.85;white-space:pre-line;margin-bottom:8px';

    this.upgradeButton = document.createElement('button');
    this.upgradeButton.style.cssText =
      'display:block;width:100%;margin-bottom:6px;padding:8px;border-radius:8px;' +
      'border:1px solid #3a4354;background:#1b2230;color:#e8eaed;font:600 13px system-ui;cursor:pointer';
    this.upgradeButton.addEventListener('click', () => {
      const s = this.selected;
      if (s) this.commands.issue({ kind: 'upgrade', tx: s.tx, ty: s.ty });
    });
    this.upgradeButton.addEventListener('pointerenter', () => (this.upgradeHovered = true));
    this.upgradeButton.addEventListener('pointerleave', () => (this.upgradeHovered = false));

    this.removeButton = document.createElement('button');
    this.removeButton.style.cssText =
      'display:block;width:100%;padding:6px;border-radius:8px;border:1px solid #3a4354;' +
      'background:#2a1b1b;color:#ffb4ad;font:600 12px system-ui;cursor:pointer';
    this.removeButton.addEventListener('click', () => {
      const s = this.selected;
      if (s && s.removalCompleteTick < 0) {
        this.commands.issue({ kind: 'remove', tx: s.tx, ty: s.ty });
      }
    });

    this.root.append(this.title, this.stats, this.upgradeButton, this.removeButton);
  }

  /** The inspected tower, or null; the id survives re-selection checks. */
  select(s: Structure | null): void {
    this.selected = s;
    this.selectedId = s?.id ?? null;
    this.upgradeHovered = false;
  }

  get current(): Structure | null {
    return this.selected;
  }

  /**
   * The next level's stats while the upgrade action is hovered on an
   * upgradeable tower — the input for the range-ring preview (build-ui spec).
   */
  get previewStats(): TowerLevelStats | null {
    const s = this.selected;
    if (!s || !this.upgradeHovered || s.level >= MAX_TOWER_LEVEL) return null;
    return this.data.towers[s.archetypeId]!.levels[s.level]!;
  }

  /** Per-frame refresh; drops the selection when the tower disappears. */
  refresh(state: SimState): void {
    // Re-resolve by id: removal completion or compaction invalidates refs.
    if (this.selectedId !== null) {
      this.selected = state.structures.find((s) => s.id === this.selectedId) ?? null;
      if (!this.selected) this.selectedId = null;
    }
    const s = this.selected;
    if (!s) {
      this.root.style.display = 'none';
      this.upgradeHovered = false;
      return;
    }
    this.root.style.display = 'block';

    const stats = towerStats(s, this.data);
    this.title.textContent = `${LABELS[ARCHETYPES[s.archetypeId]!]} · L${s.level}`;
    this.stats.textContent = statLines(this.data, s, stats).join('\n');

    const underRemoval = s.removalCompleteTick >= 0;
    if (underRemoval) {
      const seconds = Math.max(0, s.removalCompleteTick - state.tick) / TICK_HZ;
      this.removeButton.textContent = `Removing… ${seconds.toFixed(1)}s`;
      this.removeButton.style.cursor = 'default';
    } else {
      this.removeButton.textContent = `Remove (50% of ${s.paidMg / GOLD}g back)`;
      this.removeButton.style.cursor = 'pointer';
    }

    if (s.level >= MAX_TOWER_LEVEL) {
      this.upgradeButton.textContent = 'Maxed';
      this.upgradeButton.disabled = true;
      this.upgradeButton.style.opacity = '0.5';
      this.upgradeButton.style.border = '1px solid #3a4354';
      this.upgradeButton.style.background = '#1b2230';
      return;
    }

    // Palette-consistent states: affordable / debt-warned / blocked.
    const costMg = this.data.towers[s.archetypeId]!.levels[s.level]!.costMg;
    const blocked = state.treasuryMg < 0 || underRemoval;
    const debt = !blocked && costMg > state.treasuryMg;
    this.upgradeButton.textContent = `Upgrade → L${s.level + 1} (${costMg / GOLD}g)`;
    this.upgradeButton.disabled = blocked;
    this.upgradeButton.style.opacity = blocked ? '0.35' : '1';
    this.upgradeButton.style.cursor = blocked ? 'not-allowed' : 'pointer';
    this.upgradeButton.style.border = `1px solid ${debt ? '#ffa02e' : '#3a4354'}`;
    this.upgradeButton.style.background = debt ? '#33261b' : '#1b2230';
  }
}
