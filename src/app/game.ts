// Wiring: sim + render + ui + data
// See ARCHITECTURE.md §3
//
// Responsibilities:
//   - The layer a networked command source would later replace

import levelJson from '../data/levels/level_01.json';
import { Assets } from '../render/assets';
import { CameraRig } from '../render/cameras';
import { buildGround } from '../render/ground';
import { GROUND_TOP_Y, Renderer, tileToWorld } from '../render/renderer';

// The ~18-model kit subset grows as phases land; Phase 1 uses these.
const MODELS = ['tile', 'tile-rock', 'tile-spawn', 'enemy-ufo-b', 'detail-crystal-large'] as const;

// Interim shape until data/schema.ts lands (task 3.4) and this import goes
// through zod validation.
interface LevelFile {
  grid: { width: number; height: number };
  treasury: { x: number; y: number };
  spawns: { id: string; x: number; y: number }[];
  terrain: { blocked: { x: number; y: number }[] };
}

export async function startGame(canvas: HTMLCanvasElement): Promise<void> {
  const level = levelJson as unknown as LevelFile;
  const assets = await Assets.load(MODELS);
  const renderer = new Renderer(canvas);

  const blocked = new Set(level.terrain.blocked.map((t) => `${t.x},${t.y}`));
  renderer.scene.add(
    buildGround(assets, {
      width: level.grid.width,
      height: level.grid.height,
      isBlocked: (tx, ty) => blocked.has(`${tx},${ty}`),
      spawns: level.spawns,
    }),
  );

  const treasuryWorld = tileToWorld(level.treasury.x, level.treasury.y);
  const treasuryMarker = assets.instance('detail-crystal-large');
  treasuryMarker.position.set(treasuryWorld.x, GROUND_TOP_Y, treasuryWorld.z);
  renderer.scene.add(treasuryMarker);

  const cameras = new CameraRig(renderer.aspect, level.grid, treasuryWorld);
  renderer.onResize((aspect) => cameras.frame(aspect));

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      cameras.toggle();
    }
  });

  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', () => (dragging = false));
  canvas.addEventListener('pointermove', (e) => {
    if (dragging && cameras.activeView === 'commander') cameras.orbitBy(e.movementX * -0.005);
  });

  // Exposed for console debugging and automated exploration; render-side only,
  // never a path into sim state.
  (window as unknown as Record<string, unknown>).__td = { renderer, cameras };

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = now - last;
    last = now;
    cameras.update(dt);
    renderer.render(cameras.activeCamera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
