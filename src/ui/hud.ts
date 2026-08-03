// Treasury readout
// See ARCHITECTURE.md §9 and the aether-ui-redesign build-ui spec
//
// Responsibilities:
//   - Renders balance from milli-gold, every frame
//   - Recessed top-bar slot: JetBrains Mono, gold; crimson while in debt
//   - Read-only view of sim state

import { GOLD } from '../sim/fixed';

const VALUE_OK = 'font-mono text-number-treasury text-primary-fixed-dim';
const VALUE_DEBT = 'font-mono text-number-treasury text-error';

export class TreasuryHud {
  private readonly value: HTMLSpanElement;
  private lastText = '';
  private lastDebt = false;

  constructor(slot: HTMLElement) {
    const panel = document.createElement('div');
    panel.className =
      'recessed-slot flex items-center gap-2 rounded-sm border border-surface-bright ' +
      'bg-surface-container-lowest px-3 py-0.5 desktop:px-5 desktop:py-1.5';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined text-primary-fixed';
    icon.textContent = 'monetization_on';
    this.value = document.createElement('span');
    this.value.className = VALUE_OK;
    const label = document.createElement('span');
    label.className = 'font-mono text-label-caps uppercase text-on-surface-variant mobile:hidden';
    label.textContent = 'TREASURY';
    panel.append(icon, this.value, label);
    slot.appendChild(panel);
  }

  update(treasuryMg: number): void {
    const gold = Math.floor(treasuryMg / GOLD);
    const text = gold.toLocaleString('en-US');
    const debt = treasuryMg < 0;
    if (text !== this.lastText) {
      this.lastText = text;
      this.value.textContent = text;
    }
    if (debt !== this.lastDebt) {
      this.lastDebt = debt;
      this.value.className = debt ? VALUE_DEBT : VALUE_OK;
    }
  }
}
