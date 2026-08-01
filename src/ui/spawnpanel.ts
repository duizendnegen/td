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

const BUTTON_STYLE =
  'display:block;width:100%;margin-top:4px;padding:5px 8px;border-radius:6px;' +
  'border:1px solid #3a4354;background:#1b2230;color:#e8eaed;' +
  'font:600 12px system-ui;cursor:pointer;text-align:left';

export class SpawnPanelUI {
  constructor(
    hud: HTMLElement,
    data: GameData,
    sim: Sim,
    commands: CommandQueue,
    scheduler: SpawnScheduler,
  ) {
    const panel = document.createElement('div');
    panel.style.cssText =
      'position:absolute;top:140px;left:12px;width:150px;padding:8px 10px;background:#141a26cc;' +
      'border:1px solid #3a4354;border-radius:10px;color:#e8eaed;font:12px/1.4 system-ui;user-select:none';
    hud.appendChild(panel);

    const header = document.createElement('div');
    header.style.cssText = 'font-weight:700;cursor:pointer';
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
      el.style.cssText = 'margin-top:8px;opacity:.65;font-weight:600';
      el.textContent = label;
      body.appendChild(el);
    };
    const button = (label: string, onClick: () => void): void => {
      const el = document.createElement('button');
      el.style.cssText = BUTTON_STYLE;
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
