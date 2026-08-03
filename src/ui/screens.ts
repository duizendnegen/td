// Win / lose screens with the run summary
// See ARCHITECTURE.md §9 and the aether-ui-redesign build-ui spec
//
// Responsibilities:
//   - One overlay per run end, rendered once when runPhase reaches won/lost
//   - Centred bevel-panel card: emerald/crimson headline, mono ledger —
//     read straight from hashed sim state

import { GOLD } from '../sim/fixed';
import type { SimState } from '../sim/types';

const OVERLAY =
  'pointer-events-auto absolute inset-0 flex items-center justify-center bg-surface-dim/70 p-4';

const CARD =
  'bevel-panel relative min-w-[300px] max-w-full rounded-xl border border-outline/40 ' +
  'bg-surface-container-high px-8 py-7 text-center text-on-surface';

const HEADLINE_WON = 'font-headline text-[26px] font-extrabold uppercase tracking-widest text-tertiary-container';
const HEADLINE_LOST = 'font-headline text-[26px] font-extrabold uppercase tracking-widest text-error';

const LEDGER_ROW = 'flex items-baseline justify-between gap-8';
const LEDGER_LABEL = 'font-mono text-label-caps uppercase text-on-surface-variant';
const LEDGER_VALUE = 'font-mono text-[15px] font-bold text-primary';

const NEXT_LEVEL =
  'btn-mech bevel-panel mt-5 inline-flex items-center gap-2 rounded-xl border-2 ' +
  'border-tertiary-container bg-surface-container-high px-6 py-3 font-headline text-[16px] ' +
  'font-bold uppercase tracking-widest text-tertiary-container ' +
  'shadow-[0_0_20px_rgba(101,242,181,0.15)]';

export class RunScreens {
  private readonly slot: HTMLElement;
  /** URL that starts the successor level (level-progression spec), or null. */
  private readonly nextLevelUrl: string | null;
  private shown = false;

  constructor(slot: HTMLElement, nextLevelUrl: string | null = null) {
    this.slot = slot;
    this.nextLevelUrl = nextLevelUrl;
  }

  /** Per-frame check; builds the overlay once when the run ends. */
  update(state: SimState): void {
    if (this.shown || (state.runPhase !== 'won' && state.runPhase !== 'lost')) return;
    this.shown = true;

    const won = state.runPhase === 'won';
    const overlay = document.createElement('div');
    overlay.className = OVERLAY;
    const card = document.createElement('div');
    card.className = CARD;
    const g = (mg: number): string => `${Math.floor(mg / GOLD)}g`;
    const row = (label: string, value: string): string =>
      `<div class="${LEDGER_ROW}"><span class="${LEDGER_LABEL}">${label}</span>` +
      `<span class="${LEDGER_VALUE}">${value}</span></div>`;
    card.innerHTML =
      '<div class="rivet rivet-tl"></div><div class="rivet rivet-tr"></div>' +
      '<div class="rivet rivet-bl"></div><div class="rivet rivet-br"></div>' +
      `<div class="${won ? HEADLINE_WON : HEADLINE_LOST}">${won ? 'Treasury defended' : 'Run conceded'}</div>` +
      '<div class="mx-auto mt-5 flex w-fit flex-col gap-1 border-t border-surface-bright pt-4">' +
      row('Gold stolen', g(state.stolenMg)) +
      row('Gold escaped', g(state.escapedMg)) +
      row('Enemies killed', `${state.kills}`) +
      row('Final balance', g(state.treasuryMg)) +
      '</div>' +
      '<div class="mt-5 font-mono text-label-caps uppercase text-on-surface-variant/60">Reload to play again</div>';
    // Winning a level with a successor opens the door to it (level-progression
    // spec): navigation reboots the app, so the next run starts fully fresh.
    if (won && this.nextLevelUrl !== null) {
      const next = document.createElement('button');
      next.className = NEXT_LEVEL;
      next.innerHTML =
        '<span class="material-symbols-outlined text-2xl">arrow_forward</span><span>Next level</span>';
      const url = this.nextLevelUrl;
      next.addEventListener('click', () => window.location.assign(url));
      card.appendChild(next);
    }
    overlay.appendChild(card);
    this.slot.appendChild(overlay);
  }
}
