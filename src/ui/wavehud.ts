// Wave counter, upcoming-wave preview, start-wave and concede controls
// See ARCHITECTURE.md §9 and the aether-ui-redesign build-ui spec
//
// Responsibilities:
//   - Wave N/M counter in the top-bar centre, always visible during a run
//   - Build phase: the next wave's composition (type × count per spawn), with
//     a clear signal when that wave activates a new spawn
//   - Start-wave control: large emerald bevel button, bottom-right; enabled
//     build-phase-solvent only; the debt state names the balance and points
//     at selling; hidden during active waves
//   - Concede: quiet bronze top-bar control, with the impossible-recovery
//     notice as an error-container card beneath it (liquidation query, D8)
//   - Reads state, emits commands only

import type { GameData } from '../data/schema';
import type { CommandQueue } from '../sim/commands';
import { liquidationTotalMg } from '../sim/economy';
import { GOLD } from '../sim/fixed';
import type { SimState } from '../sim/types';
import { waveProgress } from './waveprogress';

/** Segment count of the wave progress bar (design D6; density open question). */
const SEGMENTS = 10;

const COUNTER =
  'whitespace-nowrap font-headline text-[14px] font-bold uppercase tracking-wider text-primary desktop:text-[17px]';

const PREVIEW =
  'bevel-panel absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg ' +
  'border border-outline/40 bg-surface-container-high/95 px-4 py-2 text-center font-mono ' +
  'text-label-caps uppercase text-on-surface-variant';

const START_READY =
  'btn-mech bevel-panel pointer-events-auto flex flex-col items-center gap-1 rounded-xl border-2 ' +
  'border-tertiary-container bg-surface-container-high px-6 py-3 text-tertiary-container ' +
  'shadow-[0_0_20px_rgba(101,242,181,0.15)]';
const START_BLOCKED =
  'btn-mech bevel-panel pointer-events-auto flex cursor-not-allowed flex-col items-center gap-1 rounded-xl ' +
  'border-2 border-tertiary-container/40 bg-surface-container-high px-6 py-3 text-tertiary-container opacity-40';

const BAR =
  'recessed-slot mt-1 flex h-2.5 w-44 gap-px rounded-sm border border-surface-bright/60 ' +
  'bg-surface-container-lowest p-px desktop:w-64';
const SEG_EMPTY = 'flex-1 rounded-[1px]';
const SEG_FILLED = 'flex-1 rounded-[1px] bg-tertiary-container shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)]';

const BONUS_TOAST =
  'bevel-panel absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg ' +
  'border border-tertiary-container/60 bg-surface-container-high/95 px-4 py-2 text-center ' +
  'font-mono text-label-caps uppercase text-tertiary-container ' +
  'shadow-[0_0_12px_rgba(101,242,181,0.2)]';

/** How long the settlement bonus toast stays up, in ms (render-side only). */
const BONUS_TOAST_MS = 2500;

const CONCEDE =
  'btn-mech pointer-events-auto whitespace-nowrap rounded border border-outline bg-surface-container ' +
  'px-3 py-1 font-mono text-label-caps uppercase text-secondary-fixed-dim hover:bg-surface-container-high';

const NOTE_CARD =
  'pointer-events-none rounded border border-error/50 bg-error-container/95 px-3 py-2 text-left ' +
  'font-body text-[12px] leading-snug text-on-error-container';

export interface WaveHudSlots {
  topbarLeft: HTMLElement;
  topbarCenter: HTMLElement;
  bottom: HTMLElement;
}

export class WaveHud {
  private readonly counter: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly segments: HTMLDivElement[] = [];
  private lastFilled = -1;
  private readonly preview: HTMLDivElement;
  private readonly bonusToast: HTMLDivElement;
  private bonusToastTimer: number | undefined;
  private lastPhaseWasWave = false;
  private readonly startButton: HTMLButtonElement;
  private readonly debtNote: HTMLDivElement;
  private readonly concedeButton: HTMLButtonElement;
  private readonly deadNote: HTMLDivElement;
  private readonly data: GameData;
  private lastKey = '';

  constructor(slots: WaveHudSlots, data: GameData, commands: CommandQueue) {
    this.data = data;

    this.counter = document.createElement('div');
    this.counter.className = COUNTER;
    this.bar = document.createElement('div');
    this.bar.className = BAR;
    this.bar.style.display = 'none';
    for (let i = 0; i < SEGMENTS; i++) {
      const seg = document.createElement('div');
      seg.className = SEG_EMPTY;
      this.segments.push(seg);
      this.bar.appendChild(seg);
    }
    this.preview = document.createElement('div');
    this.preview.className = PREVIEW;
    this.preview.style.display = 'none';
    this.bonusToast = document.createElement('div');
    this.bonusToast.className = BONUS_TOAST;
    this.bonusToast.style.display = 'none';
    slots.topbarCenter.append(this.counter, this.bar, this.preview, this.bonusToast);

    this.startButton = document.createElement('button');
    this.startButton.className = START_READY;
    this.startButton.innerHTML =
      '<span class="material-symbols-outlined text-3xl">swords</span>' +
      '<span class="font-headline text-[16px] font-bold uppercase tracking-widest desktop:text-headline-sm">Start wave</span>';
    this.startButton.addEventListener('click', () => commands.issue({ kind: 'startWave' }));
    this.debtNote = document.createElement('div');
    this.debtNote.className = NOTE_CARD + ' max-w-[260px]';
    this.debtNote.style.display = 'none';
    slots.bottom.append(this.debtNote, this.startButton);

    this.concedeButton = document.createElement('button');
    this.concedeButton.className = CONCEDE;
    this.concedeButton.textContent = 'Concede';
    this.concedeButton.addEventListener('click', () => commands.issue({ kind: 'concede' }));
    this.deadNote = document.createElement('div');
    this.deadNote.className = NOTE_CARD + ' absolute left-0 top-full mt-3 w-56';
    this.deadNote.textContent = 'Recovery impossible: selling everything cannot clear the debt.';
    this.deadNote.style.display = 'none';
    slots.topbarLeft.append(this.concedeButton, this.deadNote);
  }

  /** The next wave's composition, one line per group: "6× swarm — west". */
  private previewLines(waveIndex: number): string {
    const wave = this.data.level.waves[waveIndex];
    if (!wave) return '';
    const lines = wave.groups.map((g) => `${g.count}× ${g.type} — ${g.spawn}`);
    // Wave-1 spawns were never dormant — only a genuinely new front warns.
    const opening = this.data.level.spawns
      .filter((s) => s.activeFromWave === waveIndex + 1 && s.activeFromWave > 1)
      .map((s) => `<span class="text-error">⚠ new front opens: ${s.id}</span>`);
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

    // Progress bar: per-frame, outside the change-key guard — it fills as the
    // active wave drains (build-ui spec), hidden outside active waves.
    const inWave = state.runPhase === 'wave';
    const barVisible = this.bar.style.display !== 'none';
    if (inWave) {
      const counts = this.data.level.waves[state.waveIndex - 1]?.groups.map((g) => g.count) ?? [];
      const fraction = waveProgress(counts, state.groupCursors, state.enemies.length);
      const filled = Math.round(fraction * SEGMENTS);
      if (filled !== this.lastFilled) {
        this.lastFilled = filled;
        this.segments.forEach((seg, i) => (seg.className = i < filled ? SEG_FILLED : SEG_EMPTY));
      }
      if (!barVisible) this.bar.style.display = 'flex';
    } else if (barVisible) {
      this.bar.style.display = 'none';
      this.lastFilled = -1;
    }

    // Settlement toast: fires on the wave → settled transition when the speed
    // bonus paid out (run-lifecycle spec). Render-side only; auto-hides.
    if (this.lastPhaseWasWave && !inWave && state.runPhase !== 'lost' && state.lastWaveBonusMg > 0) {
      this.bonusToast.textContent = `Wave bonus +${Math.floor(state.lastWaveBonusMg / GOLD)}g`;
      this.bonusToast.style.display = 'block';
      window.clearTimeout(this.bonusToastTimer);
      this.bonusToastTimer = window.setTimeout(() => {
        this.bonusToast.style.display = 'none';
        this.lastKey = ''; // re-render so the wave preview returns to the slot
      }, BONUS_TOAST_MS);
    }
    this.lastPhaseWasWave = inWave;

    const key = [state.runPhase, state.waveIndex, solvent, wavesLeft, dead, state.treasuryMg < 0 ? state.treasuryMg : 0].join(':');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.counter.style.display = runOver ? 'none' : 'block';
    this.concedeButton.style.display = runOver ? 'none' : 'block';
    this.deadNote.style.display = dead ? 'block' : 'none';
    if (runOver) {
      this.preview.style.display = 'none';
      this.startButton.style.display = 'none';
      this.debtNote.style.display = 'none';
      return;
    }

    if (state.runPhase === 'wave') {
      this.counter.textContent = `Wave ${state.waveIndex}/${totalWaves}`;
      this.preview.style.display = 'none';
      this.debtNote.style.display = 'none';
      this.startButton.style.display = 'none';
      return;
    }

    // Build or settled-locked: show what is coming (or that nothing is).
    this.counter.textContent = wavesLeft
      ? `Next: wave ${state.waveIndex + 1}/${totalWaves}`
      : `All ${totalWaves} waves cleared`;
    const previewHtml = wavesLeft ? this.previewLines(state.waveIndex) : '';
    this.preview.innerHTML = previewHtml;
    // The toast borrows the preview's anchor; the preview returns when it hides.
    this.preview.style.display =
      previewHtml && this.bonusToast.style.display === 'none' ? 'block' : 'none';
    this.startButton.style.display = inBuild && wavesLeft ? 'flex' : 'none';
    this.startButton.disabled = !solvent;
    this.startButton.className = solvent ? START_READY : START_BLOCKED;
    const debtText = solvent
      ? ''
      : `In debt ${Math.ceil(-state.treasuryMg / GOLD)}g — sell structures to recover before the next wave.`;
    this.debtNote.textContent = debtText;
    this.debtNote.style.display = debtText ? 'block' : 'none';
  }
}
