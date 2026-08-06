// Transport controls — play/pause and hold-to-fast-forward
// See the time-controls change (design D4, D6, D10)
//
// Responsibilities:
//   - Classic tape transport in the bottom slot, shown while a wave runs —
//     the phase in which the start-wave control is already hidden, so the two
//     share one footprint and the layout never shifts
//   - Play/pause toggles; fast-forward is MOMENTARY, held only
//   - No multiplier is shown and no speed is offered: the rate is configuration
//   - Every release path funnels to one place, so a hold can never strand the
//     game at speed
//   - Reads state, drives the time control only — never touches the sim

import type { TimeControl } from '../app/time';
import type { SimState } from '../sim/types';

const ROW = 'pointer-events-auto flex items-center gap-2 [touch-action:none]';

// Whole-literal class variants (aether-ui-redesign design D1): Tailwind's
// scanner must see every class verbatim, so these are swapped, never built.
const BTN =
  'btn-mech bevel-panel relative flex h-14 w-14 items-center justify-center rounded-xl border-2 ' +
  'border-outline bg-surface-container-high text-on-surface-variant hover:bg-surface-bright ' +
  '[touch-action:none] desktop:h-16 desktop:w-16';
const BTN_ACTIVE =
  'btn-mech bevel-panel relative flex h-14 w-14 translate-y-[2px] items-center justify-center rounded-xl ' +
  'border-2 border-primary-fixed bg-surface-dim text-primary-fixed shadow-[0_0_15px_rgba(255,215,0,0.3)] ' +
  '[touch-action:none] desktop:h-16 desktop:w-16';

const KEY_HINT =
  'pointer-events-none absolute left-1 top-0.5 font-mono text-label-xs text-on-surface-variant/60 mobile:hidden';

const ICON = 'material-symbols-outlined text-3xl';

export class TimeHud {
  private readonly row: HTMLDivElement;
  private readonly playButton: HTMLButtonElement;
  private readonly playIcon: HTMLSpanElement;
  private readonly ffButton: HTMLButtonElement;
  private readonly time: TimeControl;
  private lastKey = '';

  constructor(slot: HTMLElement, time: TimeControl) {
    this.time = time;

    this.row = document.createElement('div');
    this.row.className = ROW;
    this.row.style.display = 'none';

    this.playButton = document.createElement('button');
    this.playButton.className = BTN;
    this.playIcon = document.createElement('span');
    this.playIcon.className = ICON;
    this.playIcon.textContent = 'pause';
    this.playButton.append(this.playIcon, hint('Space'));
    this.playButton.addEventListener('click', () => {
      time.togglePaused();
      // Drop focus, or the Space binding would re-activate this button as well
      // as running the handler — a double toggle that presents as a dead key.
      this.playButton.blur();
    });

    this.ffButton = document.createElement('button');
    this.ffButton.className = BTN;
    const ffIcon = document.createElement('span');
    ffIcon.className = ICON;
    ffIcon.textContent = 'fast_forward';
    this.ffButton.append(ffIcon, hint('F'));
    // Momentary: engage on press, and release on every path out (design D10).
    // Pointer capture keeps the release ours even if the pointer leaves.
    this.ffButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.ffButton.setPointerCapture(e.pointerId);
      time.setFastForward(true, 'pointer');
    });
    const release = (): void => time.setFastForward(false, 'pointer');
    this.ffButton.addEventListener('pointerup', release);
    this.ffButton.addEventListener('pointercancel', release);
    this.ffButton.addEventListener('pointerleave', release);
    // A long press on touch would otherwise raise the context menu.
    this.ffButton.addEventListener('contextmenu', (e) => e.preventDefault());

    this.row.append(this.playButton, this.ffButton);
    slot.appendChild(this.row);
  }

  /** Per-frame refresh; DOM writes only on change. */
  update(state: SimState): void {
    const visible = state.runPhase === 'wave';
    const key = `${visible}:${this.time.paused}:${this.time.ffHeld}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.row.style.display = visible ? 'flex' : 'none';
    if (!visible) return;

    this.playIcon.textContent = this.time.paused ? 'play_arrow' : 'pause';
    this.playButton.className = this.time.paused ? BTN_ACTIVE : BTN;
    this.ffButton.className = this.time.ffHeld ? BTN_ACTIVE : BTN;
  }
}

function hint(label: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = KEY_HINT;
  el.textContent = label;
  return el;
}
