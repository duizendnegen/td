// Selected tower panel
// See ARCHITECTURE.md §9 and the aether-ui-redesign build-ui spec
//
// Responsibilities:
//   - Archetype, level, current stats, next-level cost
//   - Upgrade action with palette-consistent affordable/debt/blocked states
//     as whole-literal class variants (design D1); blocked under a removal
//     countdown; maxed state at level 3
//   - Remove, with the standard removal-delay countdown
//   - Desktop: right bevel panel. Below the breakpoint: bottom sheet that
//     swaps with the build menu (#hud[data-sheet-open] hides #rail)
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

const ICONS: Record<string, string> = {
  rapid: 'bolt',
  sniper: 'my_location',
  area: 'flare',
  slow: 'ac_unit',
};

// ── Class variants (design D1: literal strings only, whole-variant swaps) ──

const PANEL =
  'pointer-events-auto bevel-panel relative flex-col gap-3 bg-surface-container-high text-on-surface ' +
  'mobile:w-full mobile:gap-2 mobile:rounded-t-xl mobile:border-t-2 mobile:border-outline mobile:px-4 mobile:pb-2 mobile:pt-2 ' +
  'desktop:rounded-xl desktop:border desktop:border-outline/30 desktop:p-panel-padding';

const UPG_BASE =
  'btn-mech bevel-panel flex w-full items-center justify-center gap-2 rounded border-2 py-2 mobile:py-1.5 ' +
  'font-headline text-[15px] font-bold uppercase tracking-wider ';
const UPG_AFFORDABLE = UPG_BASE + 'border-secondary-fixed-dim bg-secondary-container text-on-secondary-container';
const UPG_DEBT = UPG_BASE + 'debt-pulse border-error bg-error-container/40 text-on-error-container';
const UPG_BLOCKED =
  UPG_BASE + 'hazard-stripe cursor-not-allowed border-surface-bright bg-surface/60 text-on-surface-variant opacity-50';
const UPG_MAXED = UPG_BASE + 'cursor-default border-outline-variant bg-surface-container text-on-surface-variant opacity-60';

const REM_BASE =
  'btn-mech flex w-full items-center justify-center gap-2 rounded border py-1.5 mobile:py-1 font-mono text-label-caps uppercase ';
const REM_IDLE = REM_BASE + 'border-surface-bright bg-surface-dim text-on-surface hover:border-error hover:bg-error-container/20';
const REM_COUNTDOWN = REM_BASE + 'cursor-default border-error/60 bg-error-container/30 text-error';

// Condensed on mobile: stats sit side-by-side as label-over-value columns.
const STAT_ROW = 'flex items-baseline justify-between gap-3 mobile:flex-col mobile:items-start mobile:gap-0';
const STAT_LABEL = 'font-mono text-label-caps uppercase text-on-surface-variant';
const STAT_VALUE = 'font-mono text-[15px] font-bold text-primary';

function statRows(data: GameData, s: Structure, stats: TowerLevelStats): [string, string][] {
  const archetype = ARCHETYPES[s.archetypeId]!;
  const rows: [string, string][] = [['Range', `${(stats.rangeUnits / TILE).toFixed(2)} tiles`]];
  if (archetype !== 'slow') {
    rows.push(['Damage', `${stats.damage}`]);
  }
  rows.push(['Rate', `${(TICK_HZ / stats.fireIntervalTicks).toFixed(1)}/s`]);
  if (archetype === 'area') {
    rows.push(['Burst', `r ${(data.towers[s.archetypeId]!.burstRadiusUnits / TILE).toFixed(1)} tiles`]);
  }
  if (archetype === 'slow') {
    rows.push(['Slow', `to ${data.slowSpeedPer100}% · ${(stats.slowDurationTicks / TICK_HZ).toFixed(1)}s`]);
  }
  return rows;
}

export class InspectorUI {
  private readonly hudRoot: HTMLElement | null;
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLSpanElement;
  private readonly headerIcon: HTMLSpanElement;
  private readonly stats: HTMLDivElement;
  private readonly upgradeButton: HTMLButtonElement;
  private readonly removeButton: HTMLButtonElement;
  private readonly data: GameData;
  private readonly commands: CommandQueue;

  private selectedId: number | null = null;
  private selected: Structure | null = null;
  private lastContentKey = '';
  /** True while the pointer is over the upgrade action (range preview hook). */
  upgradeHovered = false;

  constructor(slot: HTMLElement, data: GameData, commands: CommandQueue) {
    this.data = data;
    this.commands = commands;
    this.hudRoot = slot.closest('#hud');

    this.root = document.createElement('div');
    this.root.className = PANEL;
    this.root.style.display = 'none';
    this.root.innerHTML =
      '<div class="rivet rivet-tl"></div><div class="rivet rivet-tr"></div>' +
      '<div class="rivet rivet-bl mobile:hidden"></div><div class="rivet rivet-br mobile:hidden"></div>';
    slot.appendChild(this.root);

    // Header: name + level, archetype glyph, sheet dismiss affordance.
    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-2 border-b border-surface-bright pb-2';
    const heading = document.createElement('div');
    heading.className = 'min-w-0';
    this.title = document.createElement('h2');
    this.title.className = 'font-headline text-[17px] font-bold uppercase tracking-wider text-primary';
    this.subtitle = document.createElement('span');
    this.subtitle.className = 'font-mono text-label-caps uppercase text-secondary-fixed-dim';
    heading.append(this.title, this.subtitle);

    const headerSide = document.createElement('div');
    headerSide.className = 'flex items-center gap-2';
    this.headerIcon = document.createElement('span');
    this.headerIcon.className =
      'recessed-slot material-symbols-outlined rounded border border-surface-bright bg-surface-dim p-1.5 text-secondary-fixed-dim';
    // The Material Symbols class is unlayered CDN CSS and would out-cascade
    // Tailwind's layered `desktop:hidden` — keep it on an inner span only.
    const close = document.createElement('button');
    close.className =
      'btn-mech rounded border border-surface-bright bg-surface-dim px-1 text-on-surface-variant desktop:hidden';
    close.innerHTML = '<span class="material-symbols-outlined block">close</span>';
    close.addEventListener('click', () => this.select(null));
    headerSide.append(this.headerIcon, close);
    header.append(heading, headerSide);

    this.stats = document.createElement('div');
    this.stats.className = 'flex flex-col gap-1 mobile:flex-row mobile:items-end mobile:justify-between mobile:gap-3';

    this.upgradeButton = document.createElement('button');
    this.upgradeButton.className = UPG_AFFORDABLE;
    this.upgradeButton.addEventListener('click', () => {
      const s = this.selected;
      if (s) this.commands.issue({ kind: 'upgrade', tx: s.tx, ty: s.ty });
    });
    this.upgradeButton.addEventListener('pointerenter', () => (this.upgradeHovered = true));
    this.upgradeButton.addEventListener('pointerleave', () => (this.upgradeHovered = false));

    this.removeButton = document.createElement('button');
    this.removeButton.className = REM_IDLE;
    this.removeButton.addEventListener('click', () => {
      const s = this.selected;
      if (s && s.removalCompleteTick < 0) {
        this.commands.issue({ kind: 'remove', tx: s.tx, ty: s.ty });
      }
    });

    this.root.append(header, this.stats, this.upgradeButton, this.removeButton);
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
      if (this.root.style.display !== 'none') {
        this.root.style.display = 'none';
        this.hudRoot?.removeAttribute('data-sheet-open');
        this.lastContentKey = '';
      }
      this.upgradeHovered = false;
      return;
    }
    if (this.root.style.display !== 'flex') {
      this.root.style.display = 'flex';
      // The bottom sheet swaps with the build menu below the breakpoint.
      this.hudRoot?.setAttribute('data-sheet-open', '');
    }

    const underRemoval = s.removalCompleteTick >= 0;
    const countdown = underRemoval ? Math.max(0, s.removalCompleteTick - state.tick) / TICK_HZ : 0;
    const contentKey = [s.id, s.level, state.treasuryMg, underRemoval, countdown.toFixed(1)].join(':');
    if (contentKey === this.lastContentKey) return;
    this.lastContentKey = contentKey;

    const archetype = ARCHETYPES[s.archetypeId]!;
    const stats = towerStats(s, this.data);
    this.title.textContent = LABELS[archetype]!;
    this.subtitle.textContent = `LEVEL ${s.level} STRUCTURE`;
    this.headerIcon.textContent = ICONS[archetype]!;
    this.stats.innerHTML = statRows(this.data, s, stats)
      .map(
        ([label, value]) =>
          `<div class="${STAT_ROW}"><span class="${STAT_LABEL}">${label}</span>` +
          `<span class="${STAT_VALUE}">${value}</span></div>`,
      )
      .join('');

    if (underRemoval) {
      this.removeButton.className = REM_COUNTDOWN;
      this.removeButton.textContent = `Removing… ${countdown.toFixed(1)}s`;
    } else {
      this.removeButton.className = REM_IDLE;
      this.removeButton.textContent = `Dismantle · 50% of ${s.paidMg / GOLD}g back`;
    }

    if (s.level >= MAX_TOWER_LEVEL) {
      this.upgradeButton.textContent = 'Maxed';
      this.upgradeButton.disabled = true;
      this.upgradeButton.className = UPG_MAXED;
      return;
    }

    // Palette-consistent states: affordable / debt-warned / blocked.
    const costMg = this.data.towers[s.archetypeId]!.levels[s.level]!.costMg;
    const blocked = state.treasuryMg < 0 || underRemoval;
    const debt = !blocked && costMg > state.treasuryMg;
    this.upgradeButton.textContent = `Upgrade → L${s.level + 1} · ${costMg / GOLD}g`;
    this.upgradeButton.disabled = blocked;
    this.upgradeButton.className = blocked ? UPG_BLOCKED : debt ? UPG_DEBT : UPG_AFFORDABLE;
  }
}
