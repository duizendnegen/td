// Boot: load data, build sim, start the loop
// See ARCHITECTURE.md §3
//
// ?capture=1 suppresses the real-time loop: the game is fully built, but the
// simulation only advances and frames only render when an external driver
// asks via the __td seam (debug-tooling spec: headless capture mode).

import './ui/hud.css';
import { buildGame } from './app/game';
import { startLoop } from './app/loop';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing #game canvas');

const captureMode = new URLSearchParams(window.location.search).get('capture') === '1';

buildGame(canvas)
  .then(({ tick, render }) => {
    if (captureMode) {
      console.log('capture mode: real-time loop suppressed (?capture=1)');
      return;
    }
    startLoop({ tick, render: (alpha) => render(performance.now(), alpha) });
  })
  .catch((err: unknown) => {
    console.error('boot failed:', err);
    const hud = document.getElementById('hud');
    if (hud) {
      const box = document.createElement('pre');
      box.style.cssText = 'margin:2rem;padding:1rem;background:#3a1d1d;border-radius:8px';
      box.textContent = `Boot failed:\n${err instanceof Error ? err.message : String(err)}`;
      hud.appendChild(box);
    }
  });
