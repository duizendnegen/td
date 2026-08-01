// Treasury readout
// See ARCHITECTURE.md §9
//
// Responsibilities:
//   - Renders balance from milli-gold, every frame
//   - Read-only view of sim state

import { GOLD } from '../sim/fixed';

export class TreasuryHud {
  private readonly el: HTMLDivElement;
  private lastText = '';

  constructor(hud: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;top:10px;right:12px;padding:8px 16px;background:#000a;' +
      'font:600 22px/1.2 monospace;border-radius:8px;user-select:none';
    hud.appendChild(this.el);
  }

  update(treasuryMg: number): void {
    const gold = Math.floor(treasuryMg / GOLD);
    const text = `⛁ ${gold}`;
    if (text !== this.lastText) {
      this.lastText = text;
      this.el.textContent = text;
      this.el.style.color = treasuryMg < 0 ? '#ff5d52' : '#ffd75e';
    }
  }
}
