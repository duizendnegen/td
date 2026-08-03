// Debug spawn panel
// See the phase-3 debug-tooling spec
//
// Responsibilities:
//   - Per-type single spawns and the authored burst presets
//   - Everything flows through the ordinary command queue: single spawns are
//     issued now, presets are expanded app-side into future-tick spawn
//     commands (design D8) — the panel itself holds no sim influence

import type { GameData } from '../data/schema';
import { expandPreset, PRESETS, type SpawnScheduler } from '../app/presets';
import type { CommandQueue } from '../sim/commands';
import type { Sim } from '../sim/sim';

// Dev-only surface: surface-container reskin, hidden below the breakpoint.
const PANEL =
  'pointer-events-auto absolute left-32 top-28 hidden w-40 rounded-lg border border-outline/30 ' +
  'bg-surface-container/95 px-3 py-2 text-on-surface desktop:block';

const BUTTON =
  'btn-mech mt-1 block w-full rounded border border-surface-bright bg-surface-container-high ' +
  'px-2 py-1 text-left font-mono text-label-xs uppercase text-on-surface hover:bg-surface-bright';

export class SpawnPanelUI {
  constructor(
    hud: HTMLElement,
    data: GameData,
    sim: Sim,
    commands: CommandQueue,
    scheduler: SpawnScheduler,
  ) {
    const panel = document.createElement('div');
    panel.className = PANEL;
    hud.appendChild(panel);

    const header = document.createElement('div');
    header.className = 'cursor-pointer font-mono text-label-caps uppercase text-on-surface-variant';
    const body = document.createElement('div');
    let open = true;
    const setOpen = (v: boolean): void => {
      open = v;
      header.textContent = `${open ? '▾' : '▸'} Debug spawns`;
      body.style.display = open ? 'block' : 'none';
    };
    header.addEventListener('click', () => setOpen(!open));
    panel.append(header, body);

    const section = (label: string): void => {
      const el = document.createElement('div');
      el.className = 'mt-2 font-mono text-label-xs uppercase text-on-surface-variant/70';
      el.textContent = label;
      body.appendChild(el);
    };
    const button = (label: string, onClick: () => void): void => {
      const el = document.createElement('button');
      el.className = BUTTON;
      el.textContent = label;
      el.addEventListener('click', onClick);
      body.appendChild(el);
    };

    section('Single');
    for (const type of data.enemyTypes) {
      button(type.key, () => commands.issue({ kind: 'spawn', type: type.key, spawn: 0 }));
    }

    section('Bursts');
    for (const preset of PRESETS) {
      // Expanded from the next tick boundary; the scheduler feeds the queue.
      button(preset.label, () => scheduler.add(expandPreset(preset, sim.state.tick + 1)));
    }

    setOpen(true);
  }
}
