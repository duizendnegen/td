// Wiring: sim + render + ui + data
// See ARCHITECTURE.md §3
//
// Responsibilities:
//   - The layer a networked command source would later replace
//   - App-side spawn scheduling: burst presets expand into ordinary spawn
//     commands here, never inside the sim (design D8)

import balanceJson from '../data/balance.json';
import level01Json from '../data/levels/level_01.json';
import level02Json from '../data/levels/level_02.json';
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
import { InspectorUI } from '../ui/inspector';
import { PaletteUI } from '../ui/palette';
import { RunScreens } from '../ui/screens';
import { SpawnPanelUI } from '../ui/spawnpanel';
import { WaveHud } from '../ui/wavehud';
import { startLoop } from './loop';
import { SpawnScheduler } from './presets';

// The kit subset grows as phases land; Phase 4 adds the terrain palette
// tiles and the socket base.
const MODELS = [
  'tile',
  'tile-dirt',
  'tile-rock',
  'tile-spawn',
  'tower-square-bottom-b',
  'enemy-ufo-a',
  'enemy-ufo-b',
  'enemy-ufo-c',
  'enemy-ufo-d',
  'detail-crystal-large',
  'tower-square-bottom-a',
  'tower-square-middle-a',
  'tower-square-middle-b',
  'tower-round-bottom-a',
  'tower-round-middle-a',
  'tower-round-crystals',
  'weapon-turret',
  'weapon-ballista',
  'weapon-catapult',
] as const;

/** Default seed; overridable via ?seed= so any seed is testable on the live link. */
export const DEFAULT_SEED = 0xc0ffee;

/** The fast-forward probe's tick count matches the gate check (design D-P1-3). */
export const PROBE_TICKS = 2000;

/** ?level=2 plays level_02; anything else (or nothing) plays level_01. */
function levelFromUrl(): unknown {
  return new URLSearchParams(window.location.search).get('level') === '2'
    ? level02Json
    : level01Json;
}

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
  const data = loadGameData(levelFromUrl(), balanceJson);
  const assets = await Assets.load(MODELS);

  // Sim: the seed flows only through Sim construction.
  const seed = seedFromUrl();
  const sim = new Sim(data, seed);
  const commands = new CommandQueue();
  const scheduler = new SpawnScheduler();
  console.log(`seed ${seed}${seed === DEFAULT_SEED ? ' (default)' : ' (from ?seed=)'}`);

  // Render.
  const renderer = new Renderer(canvas);
  renderer.scene.add(
    buildGround(assets, {
      width: data.level.grid.width,
      height: data.level.grid.height,
      kindAt: (tx, ty) => data.grid.terrainAt(tx, ty),
      spawns: data.level.spawns,
    }),
  );
  const treasuryWorld = tileToWorld(data.level.treasury.x, data.level.treasury.y);
  const treasuryMarker = assets.instance('detail-crystal-large');
  treasuryMarker.position.set(treasuryWorld.x, GROUND_TOP_Y, treasuryWorld.z);
  renderer.scene.add(treasuryMarker);

  const enemies = new EnemyRenderer(renderer.scene, assets, data.enemyTypes.map((t) => t.key));
  const structures = new StructureRenderer(renderer.scene, assets);
  const sacks = new SackRenderer(renderer.scene);
  const fx = new FxRenderer(renderer.scene);
  const ghost = new GhostPreview(renderer.scene);
  const camera = new IsometricCamera(renderer.aspect, data.level.grid);
  renderer.onResize((aspect) => camera.frame(aspect));

  // UI: reads sim state, emits commands — never mutates state directly.
  const hud = document.getElementById('hud');
  if (!hud) throw new Error('missing #hud element');
  const treasuryHud = new TreasuryHud(hud);
  const palette = new PaletteUI(hud, {
    wallMg: data.wallCostMg,
    towerMg: {
      rapid: data.towers[0]!.levels[0]!.costMg,
      sniper: data.towers[1]!.levels[0]!.costMg,
      area: data.towers[2]!.levels[0]!.costMg,
      slow: data.towers[3]!.levels[0]!.costMg,
    },
  });
  const inspector = new InspectorUI(hud, data, commands);
  const input = new InputController(canvas, camera.camera, sim, commands, palette, inspector, ghost, fx);
  new SpawnPanelUI(hud, data, sim, commands, scheduler);
  const waveHud = new WaveHud(hud, data, commands);
  const screens = new RunScreens(hud);
  buildHintLine(hud);

  // App-side instrumentation for the F4 readout; the sim never reads the clock.
  const stats = { lastTickMs: 0 };
  const tickOnce = (): void => {
    const start = performance.now();
    // Scheduled preset spawns join the queue at their tick boundary, then
    // drain with everything else — replays never need the scheduler.
    scheduler.flushDue(sim.state.tick, commands);
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
      F3: () => debug.toggleCombat(),
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
    scheduler,
    palette,
    inspector,
  };

  startLoop({
    tick: tickOnce,
    render: (alpha) => {
      const now = performance.now();
      enemies.sync(sim.state.enemies, alpha, now, sim.state.tick);
      structures.sync(sim.state.structures, sim.state.tick, (s) => sim.currentTarget(s));
      sacks.sync(sim.state.sacks, now);
      fx.drain(sim.events, now);
      fx.update(now);
      input.update();
      treasuryHud.update(sim.state.treasuryMg);
      palette.refresh(sim.state.treasuryMg);
      waveHud.update(sim.state, sim.totalWaves);
      screens.update(sim.state);
      inspector.refresh(sim.state);
      debug.update(stats.lastTickMs);
      renderer.render(camera.camera);
    },
  });
}
