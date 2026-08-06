// Wiring: sim + render + ui + data
// See ARCHITECTURE.md §3
//
// Responsibilities:
//   - The layer a networked command source would later replace
//   - App-side spawn scheduling: burst presets expand into ordinary spawn
//     commands here, never inside the sim (design D8)

import balanceJson from '../data/balance.json';
import { loadGameData } from '../data/schema';
import { levelForParam, nextLevelUrl } from './levels';
import { CommandQueue } from '../sim/commands';
import { removalOpenIn } from '../sim/placement';
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
import { buildHintLine, PointerDriver } from '../ui/input';
import { InputCore } from '../ui/inputcore';
import { TouchCameraController, TouchDriver } from '../ui/touch';
import { InspectorUI } from '../ui/inspector';
import { PaletteUI } from '../ui/palette';
import { RunScreens } from '../ui/screens';
import { SpawnPanelUI } from '../ui/spawnpanel';
import { TimeHud } from '../ui/timehud';
import { WaveHud } from '../ui/wavehud';
import { startLoop } from './loop';
import { SpawnScheduler } from './presets';
import { FF_SPEED, TimeControl } from './time';

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

/**
 * Fast-forward multiplier override (time-controls design D5). Retuning this is
 * a playtesting question, so it is answerable on the deployed link without a
 * rebuild. Purely render-loop: no value here can change a state hash.
 */
function ffSpeedFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('ff');
  if (raw === null) return FF_SPEED;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 1) {
    console.warn(`ignoring invalid ?ff=${raw}; using default`);
    return FF_SPEED;
  }
  return parsed;
}

export async function startGame(canvas: HTMLCanvasElement): Promise<void> {
  // Load + validate data — a bad level stops the boot here, before rendering.
  const levelEntry = levelForParam(new URLSearchParams(window.location.search).get('level'));
  const data = loadGameData(levelEntry.json, balanceJson);
  const assets = await Assets.load(MODELS);

  // Sim: the seed flows only through Sim construction.
  const seed = seedFromUrl();
  const sim = new Sim(data, seed);
  const commands = new CommandQueue();
  const scheduler = new SpawnScheduler();
  // Time controls: the rate the loop drives ticks at. Never simulation state —
  // the sim has no way to observe pause or speed (design D1).
  const time = new TimeControl(ffSpeedFromUrl());
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
  // Components mount into the index.html slot skeleton (design D2).
  const hud = document.getElementById('hud');
  if (!hud) throw new Error('missing #hud element');
  const slot = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id} slot`);
    return el;
  };
  const treasuryHud = new TreasuryHud(slot('topbar-right'));
  const palette = new PaletteUI(slot('rail'), {
    wallMg: data.wallCostMg,
    towerMg: {
      rapid: data.towers[0]!.levels[0]!.costMg,
      sniper: data.towers[1]!.levels[0]!.costMg,
      area: data.towers[2]!.levels[0]!.costMg,
      slow: data.towers[3]!.levels[0]!.costMg,
    },
  });
  const inspector = new InspectorUI(slot('inspector'), data, commands);
  const inputCore = new InputCore(canvas, camera.camera, sim, commands, palette, inspector, ghost, fx);
  // Interaction model splits on capability, not user agent (design D3): hover
  // + fine pointer → the one-click pointer model; anything else → touch.
  const pointerCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const input = pointerCapable
    ? new PointerDriver(canvas, inputCore)
    : new TouchDriver(canvas, inputCore, camera, hud);
  // Hybrid (touch screen alongside the fine pointer): touch still drives the
  // camera (isometric-camera spec) while the mouse keeps the one-click model.
  if (pointerCapable && navigator.maxTouchPoints > 0) {
    new TouchCameraController(canvas, camera);
  }
  new SpawnPanelUI(hud, data, sim, commands, scheduler);
  const waveHud = new WaveHud(
    { topbarLeft: slot('topbar-left'), topbarCenter: slot('topbar-center'), bottom: slot('bottom') },
    data,
    commands,
  );
  const timeHud = new TimeHud(slot('bottom'), time);
  const screens = new RunScreens(
    slot('overlay'),
    nextLevelUrl(levelEntry.next, window.location.search, window.location.pathname),
  );
  buildHintLine(hud);

  // Pause releases on any run-phase change (design D7) — one rule covering
  // startWave, concede and settlement, so time can never be left stopped in a
  // phase whose controls cannot restart it. Observed from here, never from the
  // sim: `startWave` and `concede` are commands, so they flip the phase during
  // a commit while time is still stopped.
  let lastPhase = sim.state.runPhase;
  const releasePauseOnPhaseChange = (): void => {
    if (sim.state.runPhase === lastPhase) return;
    lastPhase = sim.state.runPhase;
    time.setPaused(false);
  };

  // App-side instrumentation for the F4 readout; the sim never reads the clock.
  // `pendingCommit` marks a state that has absorbed intent but not yet advanced
  // — the reason its hash can move while the tick counter stands still.
  const stats = { lastTickMs: 0, pendingCommit: false };
  let lastFrozen = false;
  const tickOnce = (): void => {
    const start = performance.now();
    // Scheduled preset spawns join the queue at their tick boundary, then
    // drain with everything else — replays never need the scheduler.
    scheduler.flushDue(sim.state.tick, commands);
    sim.tick(commands.drain());
    stats.lastTickMs = performance.now() - start;
    stats.pendingCommit = false; // the advance consumed it
    releasePauseOnPhaseChange();
  };

  // Frozen-frame intent: the same command path, absorbed without advancing.
  // The scheduler is deliberately not flushed here — preset spawns are due at a
  // tick boundary, and no boundary passes while time is stopped.
  const commitOnce = (): void => {
    const drained = commands.drain();
    // An empty commit changes nothing observable, so only real intent marks the
    // state as pending.
    if (drained.length > 0) stats.pendingCommit = true;
    sim.commit(drained);
    releasePauseOnPhaseChange();
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

  // Time-control keys (design D6): live in EVERY phase, unlike the buttons —
  // the debug spawn panel is not phase-gated, so a build phase can hold moving
  // enemies. Space is preventDefault-ed because a focused button would
  // otherwise re-activate on it.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) time.togglePaused();
      return;
    }
    // Auto-repeat would re-engage a hold the release paths just cleared.
    if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
      e.preventDefault();
      time.setFastForward(true, 'key');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'f' || e.key === 'F') time.setFastForward(false, 'key');
  });

  // Every remaining release path (design D10). A pointer hold survives neither
  // losing the window nor the button unmounting when a wave settles, so the
  // pointer release is bound to the window rather than to any control.
  window.addEventListener('pointerup', () => time.setFastForward(false, 'pointer'));
  window.addEventListener('pointercancel', () => time.setFastForward(false, 'pointer'));
  window.addEventListener('blur', () => time.releaseFastForward());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) time.releaseFastForward();
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
    // Time control: the handle a playtest retunes `speed` through, and the one
    // Playwright drives instead of simulating a sustained physical hold.
    time,
  };

  startLoop(time, {
    tick: tickOnce,
    commit: commitOnce,
    render: (alpha) => {
      const now = performance.now();
      enemies.sync(sim.state.enemies, alpha, now, sim.state.tick);
      structures.sync(sim.state.structures, (s) => sim.currentTarget(s), now);
      sacks.sync(sim.state.sacks, now);
      fx.drain(sim.events, now);
      fx.update(now);
      input.update();
      treasuryHud.update(sim.state.treasuryMg);
      palette.refresh(sim.state.treasuryMg, removalOpenIn(sim.state.runPhase));
      waveHud.update(sim.state, sim.totalWaves);
      timeHud.update(sim.state);
      // Paused presentation (design D9): a stopped board must not read as a
      // hang. CSS keys off the attribute; the HUD stays untouched.
      const frozen = time.frozen;
      if (frozen !== lastFrozen) {
        lastFrozen = frozen;
        canvas.toggleAttribute('data-frozen', frozen);
      }
      screens.update(sim.state);
      inspector.refresh(sim.state);
      debug.update(stats.lastTickMs, stats.pendingCommit);
      renderer.render(camera.camera);
    },
  });
}
