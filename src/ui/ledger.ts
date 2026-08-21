// The ledger panels' derivation — pure, so it is testable without a DOM
// See the wave-ledger build-ui delta ("Both panels show the period that
// belongs to the latest wave start", "The gold ledger reconciles to the
// treasury readout", "The energy balance shows usage against sources in kWh")
// and design D5–D7, D9
//
// Responsibilities:
//   - Which period the panels show (D5): one rule over the two ledger slots
//   - The gold blocks: opening, signed rows, closing — reconciled by
//     largest-remainder rounding so the displayed rows sum exactly to the
//     displayed delta (D6); the opening, closing and balance lines are the
//     readout's own floor arithmetic and are never adjusted
//   - The energy columns: usage against sources, each reconciled to the same
//     displayed total, in kWh to one decimal under the convention that one
//     real second of wave time is one game hour (D7) — so the authored tariff
//     reads unchanged as gold per kWh in the header
//   - Unit formatting only; nothing here is sim state, nothing is stored

import { GOLD, POWER, TICK_HZ } from '../sim/fixed';
import type { WaveLedger } from '../sim/types';

// ── Period selection (D5) ─────────────────────────────────────────────────

export interface ShownPeriods {
  /** The period with the latest wave start — live or frozen — or null before wave 1. */
  period: WaveLedger | null;
  /** The open period while it has no wave yet: the build-phase block. */
  preparing: WaveLedger | null;
}

/**
 * Once a wave has started in the open period, that period; until then the
 * closed one, with the open period as the "preparing" block beneath. Serves
 * every phase, the terminal ones included: a run that ended at a final
 * settlement shows the closed final wave; one conceded mid-wave shows the
 * open period, frozen.
 */
export function shown(ledger: WaveLedger, lastLedger: WaveLedger): ShownPeriods {
  if (ledger.waveNo > 0) return { period: ledger, preparing: null };
  if (lastLedger.waveNo > 0) return { period: lastLedger, preparing: ledger };
  return { period: null, preparing: ledger };
}

// ── Reconciling rounding (D6) ─────────────────────────────────────────────

/**
 * `parts` (raw units, signed) scaled to display units so that the results
 * sum exactly to `totalUnits` — largest-remainder: every part is its floor or
 * its floor plus one, the extra units going to the parts whose fractional
 * remainders are largest (earlier part wins a tie). `totalUnits` must lie in
 * [Σ floor, Σ floor + parts.length], which holds whenever it is the floored
 * or rounded delta the parts actually sum to — the callers below.
 */
export function reconcile(parts: readonly number[], totalUnits: number, scale: number): number[] {
  // `+ 0` folds a −0 (a negated zero row) into 0.
  const floors = parts.map((p) => Math.floor(p / scale) + 0);
  const remainders = parts.map((p, i) => p / scale - floors[i]!);
  let deficit = totalUnits - floors.reduce((a, b) => a + b, 0);
  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.i);
  const out = [...floors];
  for (const i of order) {
    if (deficit <= 0) break;
    out[i]!++;
    deficit--;
  }
  return out;
}

// ── Units (D7) ────────────────────────────────────────────────────────────

/**
 * One mp·tick in kWh under the presentation fiction: kW·s relabelled as kWh
 * (a second of wave time shown as an hour). Harness waves land at roughly
 * 11–72 kWh — figures that read at one decimal; the physical ÷3600 would
 * show 0.0 on every row.
 */
export const KWH_PER_MP_TICK = 1 / (POWER * TICK_HZ);

/** mp·tick per displayed tenth of a kWh — the energy columns' display unit. */
const MP_TICK_PER_TENTH = (POWER * TICK_HZ) / 10;

/** An mp·tick sum as whole tenths of a kWh, rounded. */
export function kwhTenths(mpTicks: number): number {
  return Math.round(mpTicks / MP_TICK_PER_TENTH);
}

/** Tenths as a one-decimal figure: 108 → "10.8", 3 → "0.3". Integer arithmetic only. */
export function formatTenths(tenths: number): string {
  const sign = tenths < 0 ? '−' : '';
  const abs = Math.abs(tenths);
  return `${sign}${Math.trunc(abs / 10)}.${abs % 10}`;
}

/** mp·tick → kWh to one decimal, e.g. 215 100 → "10.8". */
export function formatKwh(mpTicks: number): string {
  return formatTenths(kwhTenths(mpTicks));
}

/**
 * The level's tariff as gold per kWh: `tariffMgPer1000 × TICK_HZ / GOLD`,
 * two decimals — the authored figure unchanged (12 mg per kW-tick → "0.24").
 */
export function formatTariff(tariffMgPer1000: number): string {
  const hundredths = Math.round((tariffMgPer1000 * TICK_HZ * 100) / GOLD);
  return `${Math.trunc(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}

/** Milli-gold as the readout's whole gold: the same floor as TreasuryHud. */
export function wholeGold(mg: number): number {
  return Math.floor(mg / GOLD);
}

// ── Gold blocks (D9) ──────────────────────────────────────────────────────

/** The gold identity's left-hand side: what the period's books say the balance is. */
export function closingMg(l: WaveLedger): number {
  return (
    l.openingMg + l.bountiesMg + l.bonusMg + l.interestMg - l.constructionMg - l.billMg - l.stolenMg + l.recoveredMg
  );
}

export interface GoldRow {
  label: string;
  /** Signed, in whole gold after reconciliation: the figure a reader adds up. */
  amount: number;
}

export interface GoldBlock {
  /** `WAVE n`, `PREPARING WAVE n`, or `AFTER WAVE n` once no wave remains. */
  title: string;
  /** Whole gold, the readout's floor. */
  opening: number;
  rows: GoldRow[];
  /** `Closing` when another block follows; `Balance` on the last, which equals the readout. */
  closingLabel: 'Closing' | 'Balance';
  /** Whole gold, the readout's floor. */
  closing: number;
}

/** The seven cash flows as signed raw amounts, in the panel's order. */
const GOLD_FLOWS: readonly { label: string; signed: (l: WaveLedger) => number }[] = [
  { label: 'Bounties', signed: (l) => l.bountiesMg },
  { label: 'Wave bonus', signed: (l) => l.bonusMg },
  { label: 'Interest', signed: (l) => l.interestMg },
  { label: 'Construction', signed: (l) => -l.constructionMg },
  { label: 'Energy', signed: (l) => -l.billMg },
  { label: 'Stolen', signed: (l) => -l.stolenMg },
  { label: 'Recovered', signed: (l) => l.recoveredMg },
];

/**
 * One block: the rows reconciled against `floor(closing) − floor(opening)`,
 * so summing the displayed rows from the displayed opening lands exactly on
 * the displayed closing. `onlyNonzero` is the preparing block's shape —
 * construction always, and any other row only if something moved it (a
 * build phase is wave-gated for every other flow; a debug spawn's bounty is
 * the exception, and the chain must still add up).
 */
function goldBlock(
  l: WaveLedger,
  title: string,
  closingLabel: GoldBlock['closingLabel'],
  onlyNonzero: boolean,
): GoldBlock {
  const flows = onlyNonzero
    ? GOLD_FLOWS.filter((f) => f.label === 'Construction' || f.signed(l) !== 0)
    : GOLD_FLOWS;
  const opening = wholeGold(l.openingMg);
  const closing = wholeGold(closingMg(l));
  const amounts = reconcile(
    flows.map((f) => f.signed(l)),
    closing - opening,
    GOLD,
  );
  return {
    title,
    opening,
    rows: flows.map((f, i) => ({ label: f.label, amount: amounts[i]! })),
    closingLabel,
    closing,
  };
}

/**
 * The gold ledger's blocks for what is shown: the wave's block (closing on a
 * `Closing` line when the preparing block follows, a `Balance` line
 * otherwise), then the preparing block — `PREPARING WAVE n+1` while a wave
 * remains, `AFTER WAVE n` once the final one has settled — whose balance is
 * the readout. Before wave 1 it is the preparing block alone.
 */
export function goldBlocks(s: ShownPeriods, totalWaves: number): GoldBlock[] {
  const blocks: GoldBlock[] = [];
  if (s.period) {
    blocks.push(goldBlock(s.period, `WAVE ${s.period.waveNo}`, s.preparing ? 'Closing' : 'Balance', false));
  }
  if (s.preparing) {
    const last = s.period?.waveNo ?? 0;
    const title = last < totalWaves ? `PREPARING WAVE ${last + 1}` : `AFTER WAVE ${last}`;
    blocks.push(goldBlock(s.preparing, title, 'Balance', true));
  }
  return blocks;
}

// ── Energy columns (D9) ───────────────────────────────────────────────────

export interface EnergyRow {
  label: string;
  /** Tenths of a kWh after reconciliation. */
  tenths: number;
  /** The grid row: this energy was paid for — the one row with a gold side. */
  billed?: true;
}

export interface EnergyColumn {
  title: 'USAGE' | 'SOURCES';
  rows: EnergyRow[];
  /** Tenths of a kWh; the same figure on both columns. */
  totalTenths: number;
}

export interface EnergyBalance {
  /** `WAVE n`. */
  title: string;
  /** `0.24 g/kWh`. */
  tariff: string;
  usage: EnergyColumn;
  sources: EnergyColumn;
}

/**
 * The shown period's energy, usage against sources in merit order, both
 * reconciled to the same rounded total — equal by the tick identity, so one
 * figure closes both columns. The solar source row is the panels' whole
 * output, used and wasted: what was wasted sits on the usage side, and the
 * two columns balance because of it.
 */
export function energyBalance(period: WaveLedger, tariffMgPer1000: number): EnergyBalance {
  const total = period.engagedMp + period.standbyMp + period.solarWastedMp;
  const totalTenths = kwhTenths(total);
  const usageRaw = [period.engagedMp, period.standbyMp, period.solarWastedMp];
  const sourceRaw = [period.solarUsedMp + period.solarWastedMp, period.gridMp, period.unmetMp];
  const u = reconcile(usageRaw, totalTenths, MP_TICK_PER_TENTH);
  const src = reconcile(sourceRaw, totalTenths, MP_TICK_PER_TENTH);
  return {
    title: `WAVE ${period.waveNo}`,
    tariff: `${formatTariff(tariffMgPer1000)} g/kWh`,
    usage: {
      title: 'USAGE',
      rows: [
        { label: 'Engaged', tenths: u[0]! },
        { label: 'Standby', tenths: u[1]! },
        { label: 'Wasted', tenths: u[2]! },
      ],
      totalTenths,
    },
    sources: {
      title: 'SOURCES',
      rows: [
        { label: 'Solar', tenths: src[0]! },
        { label: 'Grid', tenths: src[1]!, billed: true },
        { label: 'Unmet', tenths: src[2]! },
      ],
      totalTenths,
    },
  };
}
