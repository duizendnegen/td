// Boot: load data, build sim, start the loop
// See ARCHITECTURE.md §3

import './ui/hud.css';
import { startGame } from './app/game';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing #game canvas');

startGame(canvas).catch((err: unknown) => {
  console.error('boot failed:', err);
  const hud = document.getElementById('hud');
  if (hud) {
    const box = document.createElement('pre');
    box.style.cssText = 'margin:2rem;padding:1rem;background:#3a1d1d;border-radius:8px';
    box.textContent = `Boot failed:\n${err instanceof Error ? err.message : String(err)}`;
    hud.appendChild(box);
  }
});
