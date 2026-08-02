// Wave counter, upcoming-wave preview, start-wave and concede controls
// See ARCHITECTURE.md §9 and the phase-4 build-ui spec
//
// Responsibilities:
//   - Wave N/M counter, always visible during a run
//   - Build phase: the next wave's composition (type × count per spawn), with
//     a clear signal when that wave activates a new spawn
//   - Start-wave control: enabled build-phase-solvent only; the debt state
//     names the balance and points at selling; hidden during active waves
//   - Concede control with the impossible-recovery notice, driven by the
//     liquidation-total query (design D8) — reads state, emits commands only

import type { GameData } from '../data/schema';
import type { CommandQueue } from '../sim/commands';
import { liquidationTotalMg } from '../sim/economy';
import { GOLD } from '../sim/fixed';
import type { SimState } from '../sim/types';

const PANEL_STYLE =
  'position:absolute;top:10px;left:50%;transform:translateX(-50%);min-width:230px;' +
  'padding:10px 14px;background:#141a26cc;border:1px solid #3a4354;border-radius:10px;' +
  'color:#e8eaed;font:13px/1.5 system-ui;user-select:none;text-align:center';

const START_STYLE =
  'margin-top:8px;padding:8px 18px;border-radius:8px;border:1px solid #3a7a54;' +
  'background:#1d3a2a;color:#c9f0d6;font:700 14px system-ui;cursor:pointer';

const CONCEDE_STYLE =
  'position:absolute;top:10px;left:12px;padding:6px 12px;border-radius:8px;' +
  'border:1px solid #5a3a3a;background:#2a1d1d;color:#f0c9c9;' +
  'font:600 12px system-ui;cursor:pointer;user-select:none';

export class WaveHud {
  private readonly panel: HTMLDivElement;
  private readonly counter: HTMLDivElement;
  private readonly preview: HTMLDivElement;
  private readonly startButton: HTMLButtonElement;
  private readonly debtNote: HTMLDivElement;
  private readonly concedeButton: HTMLButtonElement;
  private readonly deadNote: HTMLDivElement;
  private readonly data: GameData;
  private lastKey = '';

  constructor(hud: HTMLElement, data: GameData, commands: CommandQueue) {
    this.data = data;
    this.panel = document.createElement('div');
    this.panel.style.cssText = PANEL_STYLE;
    hud.appendChild(this.panel);

    this.counter = document.createElement('div');
    this.counter.style.cssText = 'font-weight:700;font-size:15px';
    this.preview = document.createElement('div');
    this.preview.style.cssText = 'margin-top:4px;opacity:.85';
    this.debtNote = document.createElement('div');
    this.debtNote.style.cssText = 'margin-top:6px;color:#ffa02e';
    this.startButton = document.createElement('button');
    this.startButton.style.cssText = START_STYLE;
    this.startButton.textContent = 'Start wave';
    this.startButton.addEventListener('click', () => commands.issue({ kind: 'startWave' }));
    this.panel.append(this.counter, this.preview, this.debtNote, this.startButton);

    this.concedeButton = document.createElement('button');
    this.concedeButton.style.cssText = CONCEDE_STYLE;
    this.concedeButton.textContent = 'Concede';
    this.concedeButton.addEventListener('click', () => commands.issue({ kind: 'concede' }));
    hud.appendChild(this.concedeButton);
    this.deadNote = document.createElement('div');
    this.deadNote.style.cssText =
      'position:absolute;top:44px;left:12px;max-width:180px;padding:6px 10px;' +
      'background:#2a1d1dcc;border-radius:6px;color:#ff8a7e;font:600 11px/1.4 system-ui;' +
      'user-select:none;display:none';
    this.deadNote.textContent = 'Recovery impossible: selling everything cannot clear the debt.';
    hud.appendChild(this.deadNote);
  }

  /** The next wave's composition, one line per group: "6× swarm — west". */
  private previewLines(waveIndex: number): string {
    const wave = this.data.level.waves[waveIndex];
    if (!wave) return '';
    const lines = wave.groups.map((g) => `${g.count}× ${g.type} — ${g.spawn}`);
    // Wave-1 spawns were never dormant — only a genuinely new front warns.
    const opening = this.data.level.spawns
      .filter((s) => s.activeFromWave === waveIndex + 1 && s.activeFromWave > 1)
      .map((s) => `⚠ new front opens: ${s.id}`);
    return [...opening, ...lines].join('<br>');
  }

  /** Per-frame refresh from sim state; DOM writes only on change. */
  update(state: SimState, totalWaves: number): void {
    const runOver = state.runPhase === 'won' || state.runPhase === 'lost';
    const inBuild = state.runPhase === 'build';
    const solvent = state.treasuryMg >= 0;
    const wavesLeft = state.waveIndex < totalWaves;
    const liquidation = liquidationTotalMg(state.structures, this.data.refundPer1000);
    const dead = !runOver && !solvent && state.treasuryMg + liquidation < 0;

    const key = [state.runPhase, state.waveIndex, solvent, wavesLeft, dead, state.treasuryMg < 0 ? state.treasuryMg : 0].join(':');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.panel.style.display = runOver ? 'none' : 'block';
    this.concedeButton.style.display = runOver ? 'none' : 'block';
    this.deadNote.style.display = dead ? 'block' : 'none';
    if (runOver) return;

    if (state.runPhase === 'wave') {
      this.counter.textContent = `Wave ${state.waveIndex}/${totalWaves}`;
      this.preview.innerHTML = '';
      this.debtNote.textContent = '';
      this.startButton.style.display = 'none';
      return;
    }

    // Build or settled-locked: show what is coming (or that nothing is).
    this.counter.textContent = wavesLeft
      ? `Next: wave ${state.waveIndex + 1}/${totalWaves}`
      : `All ${totalWaves} waves cleared`;
    this.preview.innerHTML = wavesLeft ? this.previewLines(state.waveIndex) : '';
    this.startButton.style.display = inBuild && wavesLeft ? 'inline-block' : 'none';
    this.startButton.disabled = !solvent;
    this.startButton.style.opacity = solvent ? '1' : '0.4';
    this.startButton.style.cursor = solvent ? 'pointer' : 'not-allowed';
    this.debtNote.textContent = solvent
      ? ''
      : `In debt ${Math.ceil(-state.treasuryMg / GOLD)}g — sell structures to recover before the next wave.`;
  }
}
