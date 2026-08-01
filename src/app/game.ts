// Wiring: sim + render + ui + data
// See ARCHITECTURE.md §3
//
// Responsibilities:
//   - The layer a networked command source would later replace

import balanceJson from '../data/balance.json';
import levelJson from '../data/levels/level_01.json';
import { loadGameData } from '../data/schema';
import { CommandQueue } from '../sim/commands';
import { Sim } from '../sim/sim';
import { formatHash } from '../sim/hash';
import { Assets } from '../render/assets';
import { IsometricCamera } from '../render/cameras';
import { DebugOverlay } from '../render/debug';
import { EnemyRenderer, SackRenderer } from '../render/enemies';
import { FxRenderer, GhostPreview } from '../render/fx';
import { buildGround } from '../render/ground';
import { GROUND_TOP_Y, Renderer, tileToWorld } from '../render/renderer';
import { StructureRenderer } from '../render/towers';
import { TreasuryHud } from '../ui/hud';
import { buildHintLine, InputController } from '../ui/input';
import { PaletteUI } from '../ui/palette';
import { startLoop } from './loop';

// The ~18-model kit subset grows as phases land; Phase 2 adds the tower kit.
const MODELS = [
  'tile',
  'tile-rock',
  'tile-spawn',
  'enemy-ufo-b',
  'detail-crystal-large',
  'tower-square-bottom-a',
  'tower-square-top-a',
  'weapon-turret',
] as const;

/** Default seed; overridable via ?seed= so any seed is testable on the live link. */
export const DEFAULT_SEED = 0xc0ffee;

/** The fast-forward probe's tick count matches the gate check (design D-P1-3). */
export const PROBE_TICKS = 2000;

function seedFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return DEFAULT_SEED;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.warn(`ignoring invalid ?seed=${raw}; using default`);
    return DEFAULT_SEED;
  }
  return parsed;
}

export async function startGame(canvas: HTMLCanvasElement): Promise<void> {
  // Load + validate data — a bad level stops the boot here, before rendering.
  const data = loadGameData(levelJson, balanceJson);
  const assets = await Assets.load(MODELS);

  // Sim: the seed flows only through Sim construction.
  const seed = seedFromUrl();
  const sim = new Sim(data, seed);
  const commands = new CommandQueue();
  console.log(`seed ${seed}${seed === DEFAULT_SEED ? ' (default)' : ' (from ?seed=)'}`);

  // Render.
  const renderer = new Renderer(canvas);
  renderer.scene.add(
    buildGround(assets, {
      width: data.level.grid.width,
      height: data.level.grid.height,
      isBlocked: (tx, ty) => data.grid.isBlocked(tx, ty),
      spawns: data.level.spawns,
    }),
  );
  const treasuryWorld = tileToWorld(data.level.treasury.x, data.level.treasury.y);
  const treasuryMarker = assets.instance('detail-crystal-large');
  treasuryMarker.position.set(treasuryWorld.x, GROUND_TOP_Y, treasuryWorld.z);
  renderer.scene.add(treasuryMarker);

  const enemies = new EnemyRenderer(renderer.scene, assets);
  const structures = new StructureRenderer(renderer.scene, assets);
  const sacks = new SackRenderer(renderer.scene);
  const fx = new FxRenderer(renderer.scene);
  const ghost = new GhostPreview(renderer.scene, data.rapidTower.rangeUnits);
  const camera = new IsometricCamera(renderer.aspect, data.level.grid);
  renderer.onResize((aspect) => camera.frame(aspect));

  // UI: reads sim state, emits commands — never mutates state directly.
  const hud = document.getElementById('hud');
  if (!hud) throw new Error('missing #hud element');
  const treasuryHud = new TreasuryHud(hud);
  const palette = new PaletteUI(hud, {
    wallMg: data.wallCostMg,
    towerMg: data.rapidTower.costMg,
  });
  const input = new InputController(canvas, camera.camera, sim, commands, palette, ghost, fx);
  buildHintLine(hud);

  // App-side instrumentation for the F4 readout; the sim never reads the clock.
  const stats = { lastTickMs: 0 };
  const tickOnce = (): void => {
    const start = performance.now();
    sim.tick(commands.drain());
    stats.lastTickMs = performance.now() - start;
  };

  const debug = new DebugOverlay(renderer.scene, sim, hud);

  // Fast-forward determinism probe (design D-P1-3): the same tick path as
  // real-time running, just driven synchronously. It runs TO the next
  // multiple of PROBE_TICKS — an absolute checkpoint — so two machines that
  // press it at different moments still log the same tick number and hash.
  const probe = (): void => {
    const target = (Math.floor(sim.state.tick / PROBE_TICKS) + 1) * PROBE_TICKS;
    const ran = target - sim.state.tick;
    const start = performance.now();
    while (sim.state.tick < target) tickOnce();
    const elapsed = performance.now() - start;
    console.log(
      `[probe] tick=${sim.state.tick} hash=${formatHash(sim.hash())} ` +
        `(${ran} ticks in ${elapsed.toFixed(0)} ms, ` +
        `${(elapsed / ran).toFixed(3)} ms/tick, ${sim.state.enemies.length} enemies)`,
    );
  };

  // Input.
  window.addEventListener('keydown', (e) => {
    const action = {
      F1: () => debug.toggleFields(),
      F2: () => debug.toggleWaypoints(),
      F4: () => debug.toggleReadout(),
      F8: () => probe(),
    }[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  });

  // Exposed for console debugging and automated exploration; read-only use.
  (window as unknown as Record<string, unknown>).__td = {
    renderer,
    camera,
    sim,
    stats,
    probe,
    commands,
    palette,
  };

  startLoop({
    tick: tickOnce,
    render: (alpha) => {
      const now = performance.now();
      enemies.sync(sim.state.enemies, alpha, now);
      structures.sync(sim.state.structures, sim.state.tick);
      sacks.sync(sim.state.sacks, now);
      fx.drain(sim.events, now);
      fx.update(now);
      input.update();
      treasuryHud.update(sim.state.treasuryMg);
      palette.refresh(sim.state.treasuryMg);
      debug.update(stats.lastTickMs);
      renderer.render(camera.camera);
    },
  });
}
