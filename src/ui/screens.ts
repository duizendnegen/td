// Win / lose screens with the run summary
// See ARCHITECTURE.md §9 and the phase-4 build-ui spec
//
// Responsibilities:
//   - One overlay per run end, rendered once when runPhase reaches won/lost
//   - The run summary: gold stolen, gold escaped, kills, final balance —
//     read straight from hashed sim state

import { GOLD } from '../sim/fixed';
import type { SimState } from '../sim/types';

const OVERLAY_STYLE =
  'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
  'background:#0009;user-select:none';

const CARD_STYLE =
  'min-width:280px;padding:26px 34px;background:#141a26f2;border:1px solid #3a4354;' +
  'border-radius:14px;color:#e8eaed;font:14px/1.7 system-ui;text-align:center';

export class RunScreens {
  private readonly hud: HTMLElement;
  private shown = false;

  constructor(hud: HTMLElement) {
    this.hud = hud;
  }

  /** Per-frame check; builds the overlay once when the run ends. */
  update(state: SimState): void {
    if (this.shown || (state.runPhase !== 'won' && state.runPhase !== 'lost')) return;
    this.shown = true;

    const won = state.runPhase === 'won';
    const overlay = document.createElement('div');
    overlay.style.cssText = OVERLAY_STYLE;
    const card = document.createElement('div');
    card.style.cssText = CARD_STYLE;
    const g = (mg: number): string => `${Math.floor(mg / GOLD)}g`;
    card.innerHTML =
      `<div style="font-size:26px;font-weight:800;color:${won ? '#7fd0a0' : '#ff8a7e'}">` +
      `${won ? 'Treasury defended' : 'Run conceded'}</div>` +
      `<div style="margin-top:14px;text-align:left;display:inline-block">` +
      `Gold stolen: <b>${g(state.stolenMg)}</b><br>` +
      `Gold escaped: <b>${g(state.escapedMg)}</b><br>` +
      `Enemies killed: <b>${state.kills}</b><br>` +
      `Final balance: <b>${g(state.treasuryMg)}</b></div>` +
      `<div style="margin-top:14px;opacity:.6">Reload to play again.</div>`;
    overlay.appendChild(card);
    this.hud.appendChild(overlay);
  }
}
