// The power meter — one readout beside the treasury, with the connection
// upgrade control
// See ARCHITECTURE.md §9 and the energy-infrastructure build-ui delta
//
// Responsibilities:
//   - Live during a wave: the tick's draw against the ceiling (connection
//     capacity + solar), the solar/battery/grid split, the grid cost per
//     second, the tier; reads as a warning the frame coverage drops below 1
//   - Planning between waves: the standing towers' rated total against the
//     same ceiling, cost reading zero — how close a peak would come
//   - The stored-energy line (add-battery build-ui delta): `stored a / b kWh`
//     whenever a battery stands, in both phases, absent otherwise; it stays
//     on mobile, where the split detail does not, since it is one short
//     figure and the reserve is what a mobile player would miss most
//   - The connection-upgrade control: next tier's capacity and cost, the
//     palette's affordable / debt / blocked states, maxed at the last tier,
//     and the wording that the upgrade is final — in the visible label, so
//     touch (no tooltip) reads it too
//   - Recessed top-bar slot like the treasury; mobile compacts to the figures
//   - Reads state per frame, emits the one command, never mutates the sim
//   - Exposes the slot as a disclosure control and an anchor beneath it for
//     the energy balance dropdown (wave-ledger build-ui delta); the
//     rendering here is unchanged by either

import type { GameData } from '../data/schema';
import type { CommandQueue } from '../sim/commands';
import { GOLD } from '../sim/fixed';
import { COVERAGE_SCALE, ratedTotalMp, solarOf } from '../sim/power';
import type { Sim } from '../sim/sim';
import { formatKwh } from './ledger';
import { formatGoldPerSecond, formatKw, meterState, type MeterState } from './powermeter';

// ── Class variants (design D1: literal strings only, whole-variant swaps) ──

const PANEL_OK =
  'recessed-slot pointer-events-auto flex items-center gap-2 rounded-sm border border-surface-bright ' +
  'bg-surface-container-lowest px-2 py-0.5 desktop:px-3 desktop:py-1';
const PANEL_WARN =
  'recessed-slot pointer-events-auto flex items-center gap-2 rounded-sm border border-error ' +
  'bg-error-container/30 px-2 py-0.5 desktop:px-3 desktop:py-1 shadow-[0_0_12px_rgba(255,180,171,0.25)]';

const ICON_OK = 'material-symbols-outlined text-tertiary-fixed-dim';
const ICON_WARN = 'material-symbols-outlined text-error debt-pulse';

const FIGURE_OK = 'font-mono text-[15px] font-bold leading-tight text-tertiary-fixed-dim desktop:text-[17px]';
const FIGURE_WARN = 'font-mono text-[15px] font-bold leading-tight text-error desktop:text-[17px]';

const BAR = 'recessed-slot relative h-1.5 w-20 overflow-hidden rounded-sm bg-surface-dim desktop:w-28';
const FILL_OK = 'absolute inset-y-0 left-0 bg-tertiary-fixed-dim';
const FILL_OVER = 'absolute inset-y-0 left-0 bg-secondary';
const FILL_WARN = 'absolute inset-y-0 left-0 bg-error';

const DETAIL = 'font-mono text-label-xs uppercase leading-tight text-on-surface-variant mobile:hidden';
const STORE = 'font-mono text-label-xs uppercase leading-tight text-tertiary-fixed-dim';

const UPG_BASE = 'btn-mech ml-1 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-label-xs uppercase ';
const UPG_AFFORDABLE = UPG_BASE + 'border-secondary-fixed-dim bg-secondary-container text-on-secondary-container';
const UPG_DEBT = UPG_BASE + 'debt-pulse border-error bg-error-container/40 text-on-error-container';
const UPG_BLOCKED =
  UPG_BASE + 'hazard-stripe cursor-not-allowed border-surface-bright bg-surface/60 text-on-surface-variant opacity-50';
const UPG_MAXED = UPG_BASE + 'cursor-default border-outline-variant bg-surface-container text-on-surface-variant opacity-60';

export class PowerHud {
  /** The meter itself — the disclosure control for the energy balance. */
  readonly control: HTMLDivElement;
  /** A positioned wrapper around the meter; the dropdown anchors under it. */
  readonly anchor: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly icon: HTMLSpanElement;
  private readonly figure: HTMLSpanElement;
  private readonly fill: HTMLDivElement;
  private readonly detail: HTMLSpanElement;
  private readonly store: HTMLSpanElement;
  private readonly upgrade: HTMLButtonElement;
  private readonly sim: Sim;
  private readonly data: GameData;
  private lastKey = '';

  constructor(slot: HTMLElement, sim: Sim, data: GameData, commands: CommandQueue) {
    this.sim = sim;
    this.data = data;
    this.anchor = document.createElement('div');
    this.anchor.className = 'relative';
    this.panel = document.createElement('div');
    this.control = this.panel;
    this.panel.className = PANEL_OK;
    this.icon = document.createElement('span');
    this.icon.className = ICON_OK;
    this.icon.textContent = 'bolt';
    const column = document.createElement('div');
    column.className = 'flex flex-col items-start gap-0.5';
    this.figure = document.createElement('span');
    this.figure.className = FIGURE_OK;
    const bar = document.createElement('div');
    bar.className = BAR;
    this.fill = document.createElement('div');
    this.fill.className = FILL_OK;
    this.fill.style.width = '0%';
    bar.appendChild(this.fill);
    this.detail = document.createElement('span');
    this.detail.className = DETAIL;
    this.store = document.createElement('span');
    this.store.className = STORE;
    this.store.hidden = true;
    column.append(this.figure, bar, this.detail, this.store);
    this.upgrade = document.createElement('button');
    this.upgrade.className = UPG_AFFORDABLE;
    this.upgrade.addEventListener('click', () => {
      // The sim re-validates (gate, last tier); a refused command is inert.
      if (!this.upgrade.disabled) commands.issue({ kind: 'upgradeGrid' });
    });
    this.panel.append(this.icon, column, this.upgrade);
    this.anchor.appendChild(this.panel);
    slot.appendChild(this.anchor);
  }

  /** Per-frame refresh from live sim state — read-only. */
  update(): void {
    const s = this.sim.state;
    const state = meterState({
      runPhase: s.runPhase,
      treasuryMg: s.treasuryMg,
      gridTier: s.gridTier,
      tiers: this.data.gridTiers,
      ratedTotalMp: ratedTotalMp(s.structures, this.data),
      solarMp: solarOf(s.structures, this.data),
      power: this.sim.power,
    });
    const key = [
      state.mode,
      state.loadMp,
      state.ceilingMp,
      state.solarMp,
      state.batteryMp,
      state.gridMp,
      state.billMgPerTick,
      state.coverage,
      state.tier,
      state.upgrade.kind,
      state.store?.storedMpTick ?? -1,
      state.store?.capacityMpTick ?? -1,
    ].join(':');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.render(state);
  }

  private render(m: MeterState): void {
    this.panel.className = m.warning ? PANEL_WARN : PANEL_OK;
    this.icon.className = m.warning ? ICON_WARN : ICON_OK;
    this.icon.textContent = m.warning ? 'power_off' : m.mode === 'live' ? 'bolt' : 'electric_meter';
    this.figure.className = m.warning ? FIGURE_WARN : FIGURE_OK;
    // Live: draw / ceiling, plus the coverage while browning out. Planning:
    // the rated total / ceiling, marked as a plan.
    const load = formatKw(m.loadMp).replace(' kW', '');
    const ceiling = formatKw(m.ceilingMp);
    this.figure.textContent = m.warning
      ? `${load} / ${ceiling} · ${Math.floor((m.coverage * 100) / COVERAGE_SCALE)}%`
      : m.mode === 'live'
        ? `${load} / ${ceiling}`
        : `${load} / ${ceiling} rated`;
    const pct = m.ceilingMp > 0 ? Math.min(100, (m.loadMp * 100) / m.ceilingMp) : 0;
    this.fill.style.width = `${pct.toFixed(1)}%`;
    this.fill.className = m.warning ? FILL_WARN : m.over ? FILL_OVER : FILL_OK;
    // Split, cost, tier — the connection's grid share is a ceiling in
    // planning; the store's share appears in the live split while a battery
    // stands (add-battery build-ui delta).
    const grid = m.mode === 'live' ? formatKw(m.gridMp) : `≤${formatKw(m.capacityMp)}`;
    const battery = m.mode === 'live' && m.store ? ` · battery ${formatKw(m.batteryMp)}` : '';
    this.detail.textContent =
      `T${m.tier}/${m.tierCount} · solar ${formatKw(m.solarMp)}${battery} · grid ${grid} · ${formatGoldPerSecond(m.billMgPerTick)}`;
    // The reserve, in both phases, only while a battery stands.
    this.store.hidden = m.store === null;
    if (m.store) {
      this.store.textContent = `stored ${formatKwh(m.store.storedMpTick)} / ${formatKwh(m.store.capacityMpTick)} kWh`;
    }

    const u = m.upgrade;
    if (u.kind === 'maxed') {
      this.upgrade.className = UPG_MAXED;
      this.upgrade.disabled = true;
      this.upgrade.textContent = 'Grid maxed';
      this.upgrade.title = 'The connection is at its last tier — congestion; solar is what scales from here.';
      return;
    }
    // The finality is in the label, not only the tooltip: touch has no hover.
    const label = `→ T${m.tier + 1} ${formatKw(u.capacityMp)} · ${u.costMg / GOLD}g · final`;
    this.upgrade.textContent = label;
    this.upgrade.title = 'Upgrade the grid connection. Final — no refund, no share of liquidation.';
    this.upgrade.disabled = u.kind === 'blocked';
    this.upgrade.className = u.kind === 'blocked' ? UPG_BLOCKED : u.kind === 'debt' ? UPG_DEBT : UPG_AFFORDABLE;
  }
}
