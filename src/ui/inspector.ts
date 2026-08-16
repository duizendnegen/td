// Selected tower panel
// See ARCHITECTURE.md §9 and the aether-ui-redesign build-ui spec
//
// Responsibilities:
//   - Archetype, level, current stats — rated power among them — and the
//     next level's cost with its rated power (energy-infrastructure delta)
//   - Performance block (tower-damage-stats design D5): the sim's recorded
//     wave damage — labelled "This wave" during a wave, "Last wave" in every
//     other phase, a dash for a tower that has never dealt damage outside a
//     wave — and the total since purchase; omitted for the slow tower
//   - Upgrade action with palette-consistent affordable/debt/blocked states
//     as whole-literal class variants (design D1); maxed state at level 3
//   - Move: arms the move tool and lifts this tower in one step — the
//     inspector's route into the palette tool's lift/carry/drop, wired by
//     InputCore through onMove (tower-drag-move design D9), the tool armed
//     for that one move only; build phase only, naming the wave when locked,
//     like the remove action
//   - Remove, immediate and refunding the amount it actually credits;
//     unavailable while a wave runs only for committed towers — a provisional
//     one stays sellable, framed as the revision window it is. The command
//     names the tile, and the sim peels the tower off its wall (build-over-
//     walls design D3): the tower goes, the wall stands, and this panel
//     closes because its tower's id is gone
//   - Desktop: right bevel panel. Below the breakpoint: bottom sheet that
//     swaps with the build menu (#hud[data-sheet-open] hides #rail)
//   - Emits commands only; reads sim state per frame, never mutates it

import type { GameData, TowerLevelStats } from '../data/schema';
import { ARCHETYPES } from '../data/schema';
import type { CommandQueue } from '../sim/commands';
import { refundMg } from '../sim/economy';
import { GOLD, TICK_HZ, TILE } from '../sim/fixed';
import { canRemove, moveOpenIn } from '../sim/placement';
import { MAX_TOWER_LEVEL } from '../sim/sim';
import { towerStats } from '../sim/tower';
import type { SimState, Structure } from '../sim/types';
import { formatKw } from './powermeter';

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
const REM_LOCKED =
  REM_BASE + 'hazard-stripe cursor-not-allowed border-surface-bright bg-surface/60 text-on-surface-variant opacity-50';
// Provisional: not a discount, a revision window — so it reads in the primary
// accent, not in the destructive language of a dismantle.
const REM_UNDO =
  REM_BASE + 'flex-wrap border-primary-fixed/60 bg-surface-dim text-primary-fixed hover:bg-primary-fixed/10';
const REM_WINDOW_NOTE = 'font-mono text-label-xs uppercase opacity-70';
// Moving is free and keeps the investment — a revision, not a divestment — so
// it shares the provisional undo's primary-accent language, never the
// dismantle's hover-to-red.
const MOVE_IDLE =
  REM_BASE + 'border-primary-fixed/60 bg-surface-dim text-primary-fixed hover:bg-primary-fixed/10';
const MOVE_LOCKED = REM_LOCKED;

/** Milli-gold as a gold figure, keeping the half a 50% refund can leave. */
function goldText(mg: number): string {
  return `${Number((mg / GOLD).toFixed(1))}`;
}

// Condensed on mobile: stats sit side-by-side as label-over-value columns.
const STAT_ROW = 'flex items-baseline justify-between gap-3 mobile:flex-col mobile:items-start mobile:gap-0';
const STAT_LABEL = 'font-mono text-label-caps uppercase text-on-surface-variant';
const STAT_VALUE = 'font-mono text-[15px] font-bold text-primary';

/** The inspector's stat rows for a tower at `stats` — exported for the UI tests. */
export function statRows(data: GameData, s: Structure, stats: TowerLevelStats): [string, string][] {
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
  // Rated draw while engaged (power-grid spec); the meter shows what it costs.
  rows.push(['Power', formatKw(stats.ratedPowerMp)]);
  return rows;
}

/**
 * The performance block's rows (tower-damage-stats design D5), or null for
 * the slow tower, which deals no damage and shows no block. One sim field
 * carries the wave figure: it is this wave's while a wave runs and the last
 * wave's in every other phase, so only the label changes. Outside a wave a
 * tower whose total is still zero shows a dash, not a misleading zero — the
 * UI cannot tell "placed this build phase" from "fought and dealt nothing",
 * and both read correctly as a dash.
 */
function perfRows(state: SimState, s: Structure): [string, string][] | null {
  if (ARCHETYPES[s.archetypeId] === 'slow') return null;
  const inWave = state.runPhase === 'wave';
  const wave = !inWave && s.totalDamage === 0 ? '—' : `${s.waveDamage}`;
  return [
    [inWave ? 'This wave' : 'Last wave', wave],
    ['Total', `${s.totalDamage}`],
  ];
}

function renderRows(rows: [string, string][]): string {
  return rows
    .map(
      ([label, value]) =>
        `<div class="${STAT_ROW}"><span class="${STAT_LABEL}">${label}</span>` +
        `<span class="${STAT_VALUE}">${value}</span></div>`,
    )
    .join('');
}

/** The upgrade action's label: next level, its cost, and its rated power — exported for the UI tests. */
export function upgradeLabel(data: GameData, s: Structure): string {
  const next = data.towers[s.archetypeId]!.levels[s.level]!;
  return `Upgrade → L${s.level + 1} · ${next.costMg / GOLD}g · ${formatKw(next.ratedPowerMp)}`;
}

export class InspectorUI {
  private readonly hudRoot: HTMLElement | null;
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLSpanElement;
  private readonly headerIcon: HTMLSpanElement;
  private readonly stats: HTMLDivElement;
  private readonly perf: HTMLDivElement;
  private readonly upgradeButton: HTMLButtonElement;
  private readonly moveButton: HTMLButtonElement;
  private readonly removeButton: HTMLButtonElement;
  private readonly data: GameData;
  private readonly commands: CommandQueue;

  private selectedId: number | null = null;
  private selected: Structure | null = null;
  private lastContentKey = '';
  /** The removal phase gate, re-read every frame — the sim's own predicate. */
  private removalAllowed = false;
  /** The move phase gate (moveOpenIn), re-read every frame like removal's. */
  private moveAllowed = false;
  /** True while the pointer is over the upgrade action (range preview hook). */
  upgradeHovered = false;
  /**
   * The Move action's hook, fired with the inspected tower while the move
   * gate is open. InputCore wires it to arm the move tool and lift the tower;
   * the inspector itself stays command-only towards the sim.
   */
  onMove: ((s: Structure) => void) | null = null;

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

    // The performance block: the same row/label/value variants under the same
    // rule the header uses, so it reads as the same instrument. Below the
    // breakpoint it is its own flex row — the sheet gains a line, the stat
    // columns do not gain a sixth.
    this.perf = document.createElement('div');
    this.perf.className =
      'flex flex-col gap-1 border-t border-surface-bright pt-2 mobile:flex-row mobile:items-end mobile:justify-between mobile:gap-3';

    this.upgradeButton = document.createElement('button');
    this.upgradeButton.className = UPG_AFFORDABLE;
    this.upgradeButton.addEventListener('click', () => {
      const s = this.selected;
      if (s) this.commands.issue({ kind: 'upgrade', tx: s.tx, ty: s.ty });
    });
    this.upgradeButton.addEventListener('pointerenter', () => (this.upgradeHovered = true));
    this.upgradeButton.addEventListener('pointerleave', () => (this.upgradeHovered = false));

    this.moveButton = document.createElement('button');
    this.moveButton.className = MOVE_IDLE;
    this.moveButton.addEventListener('click', () => {
      const s = this.selected;
      if (s && this.moveAllowed) this.onMove?.(s);
    });

    this.removeButton = document.createElement('button');
    this.removeButton.className = REM_IDLE;
    this.removeButton.addEventListener('click', () => {
      const s = this.selected;
      if (s && this.removalAllowed) {
        this.commands.issue({ kind: 'remove', tx: s.tx, ty: s.ty });
      }
    });

    this.root.append(header, this.stats, this.perf, this.upgradeButton, this.moveButton, this.removeButton);
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
    // Re-resolve by id: a removal or compaction invalidates refs.
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

    this.removalAllowed = canRemove(state.runPhase, s);
    this.moveAllowed = moveOpenIn(state.runPhase);
    const contentKey = [
      s.id,
      s.level,
      state.treasuryMg,
      this.removalAllowed,
      s.provisional,
      state.runPhase,
      // The counters move as hits land, in every phase — including the build
      // phase, where nothing else in this key changes.
      s.waveDamage,
      s.totalDamage,
    ].join(':');
    if (contentKey === this.lastContentKey) return;
    this.lastContentKey = contentKey;

    const archetype = ARCHETYPES[s.archetypeId]!;
    const stats = towerStats(s, this.data);
    this.title.textContent = LABELS[archetype]!;
    this.subtitle.textContent = `LEVEL ${s.level} STRUCTURE`;
    this.headerIcon.textContent = ICONS[archetype]!;
    this.stats.innerHTML = renderRows(statRows(this.data, s, stats));
    const perf = perfRows(state, s);
    this.perf.style.display = perf ? '' : 'none';
    this.perf.innerHTML = perf ? renderRows(perf) : '';

    // Three states, not two (provisional-construction design D6): the revision
    // window, the ordinary between-waves dismantle, and the wave's block —
    // which now names the wave only for construction it has already run
    // against. The figure shown is always what removal actually credits.
    const refund = goldText(refundMg(s, this.data.refundPer1000));
    if (this.removalAllowed && s.provisional) {
      // The window closes on the first advanced tick of a wave — which is the
      // start of the wave from the build phase, and the resumption of time
      // from a stopped one.
      const closes = state.runPhase === 'wave' ? 'until time advances' : 'until the wave starts';
      this.removeButton.className = REM_UNDO;
      this.removeButton.disabled = false;
      this.removeButton.innerHTML =
        `<span>Undo build · ${refund}g back in full</span>` +
        `<span class="${REM_WINDOW_NOTE}">${closes}</span>`;
    } else if (this.removalAllowed) {
      this.removeButton.className = REM_IDLE;
      this.removeButton.disabled = false;
      this.removeButton.textContent = `Dismantle · ${refund}g back (${this.data.refundPer1000 / 10}%)`;
    } else {
      this.removeButton.className = REM_LOCKED;
      this.removeButton.disabled = true;
      this.removeButton.textContent = 'Dismantle locked · wave in progress';
    }

    // Two states: open in the build phase, locked everywhere else — the
    // move gate has no per-structure split (tower-drag-move design D7). Like
    // the remove action, the locked face names the reason.
    if (this.moveAllowed) {
      this.moveButton.className = MOVE_IDLE;
      this.moveButton.disabled = false;
      this.moveButton.textContent = 'Move · free';
    } else {
      this.moveButton.className = MOVE_LOCKED;
      this.moveButton.disabled = true;
      this.moveButton.textContent =
        state.runPhase === 'wave' ? 'Move locked · wave in progress' : 'Move locked · between waves only';
    }

    if (s.level >= MAX_TOWER_LEVEL) {
      this.upgradeButton.textContent = 'Maxed';
      this.upgradeButton.disabled = true;
      this.upgradeButton.className = UPG_MAXED;
      return;
    }

    // Palette-consistent states: affordable / debt-warned / blocked. Lack of
    // power never blocks or warns here — the meter carries that.
    const costMg = this.data.towers[s.archetypeId]!.levels[s.level]!.costMg;
    const blocked = state.treasuryMg < 0;
    const debt = !blocked && costMg > state.treasuryMg;
    this.upgradeButton.textContent = upgradeLabel(this.data, s);
    this.upgradeButton.disabled = blocked;
    this.upgradeButton.className = blocked ? UPG_BLOCKED : debt ? UPG_DEBT : UPG_AFFORDABLE;
  }
}
