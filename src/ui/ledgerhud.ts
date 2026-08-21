// The gold ledger and the energy balance — the two dropdown panels
// See ARCHITECTURE.md §9 and the wave-ledger build-ui delta ("The gold
// ledger reconciles to the treasury readout", "The energy balance shows
// usage against sources in kWh"), design D8/D9
//
// Responsibilities:
//   - The gold ledger under the treasury readout: per block a header
//     (`WAVE n` / `PREPARING WAVE n`), Opening, the signed rows, a rule,
//     Closing or Balance — the last block's balance IS the readout's figure
//   - The energy balance under the power meter: `WAVE n · 0.24 g/kWh`, then
//     USAGE (engaged, standby, wasted) against SOURCES (solar, grid marked
//     billed, unmet), each column closing on the same total; "No wave has
//     run yet" before wave 1
//   - Every figure comes from the pure module (ledger.ts): which period,
//     the reconciled rounding, kWh and the tariff
//   - Per frame: derive, build a content key, write the DOM only when the
//     key changes and only for the panel that is open (the inspector's
//     pattern); a closed panel costs nothing
//   - Desktop: anchored under its control, right-aligned to the slot. Below
//     the breakpoint: a full-width strip under the compact top bar. Never
//     pauses the game, never touches sim state

import type { GameData } from '../data/schema';
import type { SimState } from '../sim/types';
import type { Disclosure, DisclosurePair } from './disclosure';
import {
  energyBalance,
  formatTenths,
  goldBlocks,
  shown,
  type EnergyBalance,
  type EnergyColumn,
  type GoldBlock,
} from './ledger';

// ── Class vocabulary (whole literals; the recessed-slot / mono-figure / caps-label look) ──

const PANEL_BASE =
  'pointer-events-auto bevel-panel z-50 flex flex-col gap-2 border border-outline/30 bg-surface-container-high ' +
  'p-3 text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.6)] ' +
  'desktop:absolute desktop:right-0 desktop:top-full desktop:mt-2 desktop:rounded-md ' +
  'mobile:fixed mobile:inset-x-0 mobile:top-14 mobile:rounded-b-md mobile:border-t-0';
const GOLD_PANEL = `${PANEL_BASE} desktop:w-64`;
const ENERGY_PANEL = `${PANEL_BASE} desktop:w-80`;

const BLOCK = 'flex flex-col gap-0.5';
const BLOCK_TITLE = 'font-headline text-[13px] font-bold uppercase tracking-wider text-primary';
const ROW = 'flex items-baseline justify-between gap-4';
const LABEL = 'font-mono text-label-xs uppercase text-on-surface-variant';
const FIGURE = 'font-mono text-[13px] font-bold tabular-nums text-primary-fixed-dim';
const FIGURE_MUTED = 'font-mono text-[13px] font-bold tabular-nums text-on-surface-variant/60';
const FIGURE_DEBT = 'font-mono text-[13px] font-bold tabular-nums text-error';
const TOTAL = 'font-mono text-[15px] font-bold tabular-nums text-primary-fixed';
const TOTAL_DEBT = 'font-mono text-[15px] font-bold tabular-nums text-error';
const RULE = 'my-1 border-t border-surface-bright';
const ENERGY_FIGURE = 'font-mono text-[13px] font-bold tabular-nums text-tertiary-fixed-dim';
const ENERGY_TOTAL = 'font-mono text-[15px] font-bold tabular-nums text-tertiary-fixed';
const TAG = 'ml-1 font-mono text-[9px] uppercase tracking-wider text-secondary-fixed-dim';
const NOTE = 'font-mono text-label-caps uppercase text-on-surface-variant';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(label: string, figure: HTMLElement, labelSuffix?: HTMLElement): HTMLDivElement {
  const r = el('div', ROW);
  const l = el('span', LABEL, label);
  if (labelSuffix) l.appendChild(labelSuffix);
  r.append(l, figure);
  return r;
}

/** A signed whole-gold row figure: `+ 180`, `− 140`, or a muted `0`. */
function signed(amount: number): HTMLSpanElement {
  if (amount === 0) return el('span', FIGURE_MUTED, '0');
  const glyph = amount > 0 ? '+' : '−';
  return el('span', FIGURE, `${glyph} ${Math.abs(amount).toLocaleString('en-US')}`);
}

/** A whole-gold line figure — the readout's own formatting, crimson in debt. */
function gold(amount: number, total = false): HTMLSpanElement {
  const debt = amount < 0;
  const cls = total ? (debt ? TOTAL_DEBT : TOTAL) : debt ? FIGURE_DEBT : FIGURE;
  return el('span', cls, amount.toLocaleString('en-US'));
}

function goldBlockNode(b: GoldBlock): HTMLDivElement {
  const node = el('div', BLOCK);
  node.appendChild(el('div', BLOCK_TITLE, b.title));
  node.appendChild(row('Opening', gold(b.opening)));
  for (const r of b.rows) node.appendChild(row(r.label, signed(r.amount)));
  node.appendChild(el('div', RULE));
  node.appendChild(row(b.closingLabel, gold(b.closing, true)));
  return node;
}

function energyColumnNode(c: EnergyColumn): HTMLDivElement {
  const node = el('div', BLOCK);
  const head = el('div', ROW);
  head.append(el('span', BLOCK_TITLE, c.title), el('span', LABEL, 'kWh'));
  node.appendChild(head);
  for (const r of c.rows) {
    const tag = r.billed ? el('span', TAG, 'billed') : undefined;
    node.appendChild(row(r.label, el('span', ENERGY_FIGURE, formatTenths(r.tenths)), tag));
  }
  node.appendChild(el('div', RULE));
  node.appendChild(row('Total', el('span', ENERGY_TOTAL, formatTenths(c.totalTenths))));
  return node;
}

export class LedgerHud {
  private readonly disclosure: Disclosure;
  private readonly gold: DisclosurePair;
  private readonly energy: DisclosurePair;
  private readonly goldPanel: HTMLDivElement;
  private readonly energyPanel: HTMLDivElement;
  private readonly data: GameData;
  private readonly totalWaves: number;
  private lastGoldKey = '';
  private lastEnergyKey = '';

  constructor(
    disclosure: Disclosure,
    treasury: { control: HTMLElement; anchor: HTMLElement },
    power: { control: HTMLElement; anchor: HTMLElement },
    data: GameData,
    totalWaves: number,
  ) {
    this.disclosure = disclosure;
    this.data = data;
    this.totalWaves = totalWaves;
    this.goldPanel = document.createElement('div');
    this.goldPanel.id = 'gold-ledger';
    this.goldPanel.setAttribute('aria-label', 'Gold ledger');
    treasury.anchor.appendChild(this.goldPanel);
    this.energyPanel = document.createElement('div');
    this.energyPanel.id = 'energy-balance';
    this.energyPanel.setAttribute('aria-label', 'Energy balance');
    power.anchor.appendChild(this.energyPanel);
    this.gold = disclosure.register(treasury.control, this.goldPanel, GOLD_PANEL);
    this.energy = disclosure.register(power.control, this.energyPanel, ENERGY_PANEL);
  }

  /** Per-frame refresh from live sim state — read-only, and only for the open panel. */
  update(state: SimState): void {
    const goldOpen = this.disclosure.isOpen(this.gold);
    const energyOpen = this.disclosure.isOpen(this.energy);
    if (!goldOpen && !energyOpen) return;
    const s = shown(state.ledger, state.lastLedger);
    if (goldOpen) this.refreshGold(goldBlocks(s, this.totalWaves));
    if (energyOpen) this.refreshEnergy(s.period ? energyBalance(s.period, this.data.tariffMgPer1000) : null);
  }

  private refreshGold(blocks: GoldBlock[]): void {
    const key = blocks
      .map((b) => [b.title, b.opening, ...b.rows.map((r) => r.amount), b.closingLabel, b.closing].join(','))
      .join('|');
    if (key === this.lastGoldKey) return;
    this.lastGoldKey = key;
    this.goldPanel.replaceChildren(...blocks.map(goldBlockNode));
  }

  private refreshEnergy(b: EnergyBalance | null): void {
    const key = b
      ? [b.title, b.tariff, ...b.usage.rows.map((r) => r.tenths), ...b.sources.rows.map((r) => r.tenths), b.usage.totalTenths].join(',')
      : 'none';
    if (key === this.lastEnergyKey) return;
    this.lastEnergyKey = key;
    if (!b) {
      this.energyPanel.replaceChildren(el('div', NOTE, 'No wave has run yet'));
      return;
    }
    const head = el('div', ROW);
    head.append(el('span', BLOCK_TITLE, b.title), el('span', LABEL, b.tariff));
    const columns = el('div', 'grid grid-cols-2 gap-4');
    columns.append(energyColumnNode(b.usage), energyColumnNode(b.sources));
    this.energyPanel.replaceChildren(head, columns);
  }
}
