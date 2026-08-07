// PR-preview capture driver (openspec add-pr-wave-preview, design D3-D5, D11).
// Review tooling: lives CI-side, the application knows nothing about it.
//
// Boots the built app (dist/) headless with ?capture=1, plays scenario.json
// through the __td seam, fast-forwards off-camera until the board is built,
// then photographs ~120 frames (every 2nd tick → 10 fps at true speed) and
// encodes them to an animated WebP.
//
// Usage: node .github/capture/capture.mjs   (after `npm run build`; needs
// ffmpeg on PATH). Output: .github/capture/out/preview.webp

import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, '.github', 'capture', 'out');
const SCENARIO = path.join(ROOT, '.github', 'capture', 'scenario.json');

const FRAMES = 120;
const TICKS_PER_FRAME = 2; // 20 Hz sim, every 2nd tick → 10 fps at true speed
const FPS = 10;
/** Loud upper bound for warm-up stepping (design D11: never loop forever). */
const WARMUP_TICK_CEILING = 4000;
/** Encoded clip must stay reviewer-friendly. */
const SIZE_CEILING_BYTES = 8 * 1024 * 1024;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function fail(reason) {
  console.error(`CAPTURE FAILED: ${reason}`);
  process.exit(1);
}

/** Tiny static server over dist/; the app builds with base /td/. */
function serveDist() {
  const server = http.createServer(async (req, res) => {
    const urlPath = new URL(req.url, 'http://x').pathname.replace(/^\/td(\/|$)/, '/');
    const file = path.join(DIST, path.normalize(urlPath === '/' ? 'index.html' : urlPath.slice(1)));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** Read {tick, runPhase, waveIndex, structures, towers, treasuryMg} from the page. */
async function simState(page) {
  return page.evaluate(() => {
    const s = window.__td.sim.state;
    return {
      tick: s.tick,
      runPhase: s.runPhase,
      waveIndex: s.waveIndex,
      structures: s.structures.length,
      towers: s.structures.filter((x) => x.kind === 'tower').length,
      enemies: s.enemies.length,
      treasuryMg: s.treasuryMg,
    };
  });
}

/**
 * Step until `predicate(state)` holds, in `chunk`-tick batches, or fail
 * loudly when the tick ceiling is hit (state-driven, never a hardcoded
 * total — design D11).
 */
async function stepUntil(page, predicate, chunk, label) {
  for (;;) {
    const state = await simState(page);
    if (predicate(state)) return state;
    if (state.runPhase === 'lost') fail(`run lost at tick ${state.tick} while ${label}`);
    if (state.tick >= WARMUP_TICK_CEILING) {
      fail(
        `tick ceiling ${WARMUP_TICK_CEILING} hit while ${label} — ` +
          `state: ${JSON.stringify(state)}`,
      );
    }
    await page.evaluate((n) => window.__td.step(n), chunk);
  }
}

const scenario = JSON.parse(await readFile(SCENARIO, 'utf8'));
const expectedStructures = scenario.commands.filter((c) => c.body.kind === 'place').length;
const expectedTowers = scenario.commands.filter(
  (c) => c.body.kind === 'place' && c.body.structure === 'tower',
).length;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const server = await serveDist();
const port = server.address().port;

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (err) => console.log(`  [page error] ${err.message}`));

// 5.1 — boot in capture mode with the scenario's pinned seed.
await page.goto(`http://127.0.0.1:${port}/td/?capture=1&seed=${scenario.seed}`, {
  waitUntil: 'load',
});
await page.waitForFunction(() => Boolean(window.__td), null, { timeout: 60_000 });
const fontsReady = await page.evaluate(() =>
  Promise.race([
    document.fonts.ready.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 10_000)),
  ]),
);
if (!fontsReady) console.warn('  fonts.ready timed out — capturing with fallback fonts');

// 5.2 — feed the scenario through the existing scheduler.
await page.evaluate((commands) => window.__td.scheduler.add(commands), scenario.commands);

// 5.3 — state-driven warm-up: three waves cleared, back in build phase.
console.log('warm-up: stepping to build phase after wave 3...');
const afterWarmup = await stepUntil(
  page,
  (s) => s.runPhase === 'build' && s.waveIndex === 3,
  25,
  'warming up to post-wave-3 build phase',
);
console.log(`  reached tick ${afterWarmup.tick}: ${JSON.stringify(afterWarmup)}`);

// Then creep tick-by-tick onto the exact wave-4 start so the camera window
// opens on the startWave moment.
const atWindow = await stepUntil(
  page,
  (s) => s.runPhase === 'wave' && s.waveIndex === 4,
  1,
  'advancing to the wave-4 camera window',
);

// 5.4 — the scripted build must actually exist; name what is missing.
if (atWindow.structures !== expectedStructures || atWindow.towers !== expectedTowers) {
  fail(
    `board incomplete at camera-on (tick ${atWindow.tick}): ` +
      `${atWindow.towers}/${expectedTowers} towers, ` +
      `${atWindow.structures}/${expectedStructures} structures — ` +
      `a placement was likely rejected (funds or occupancy); treasury ${atWindow.treasuryMg}mg`,
  );
}
// Staging (task 5.7): collapse the debug spawn panel (a click any player
// could make — no capture-specific chrome involved), roll forward to just
// before the wave's first spawns so the clip opens on action, and drop the
// render events that accumulated while warm-up ran without any frames — the
// normal loop drains them continuously; dumping ~1500 ticks' worth into
// frame 1 would open the clip on a phantom fireworks burst.
await page.getByText('Debug spawns').click();
await page.evaluate((n) => window.__td.step(n), 30);
await page.evaluate(() => {
  window.__td.sim.events.length = 0;
});
const atCamera = await simState(page);
console.log(`camera on at tick ${atCamera.tick}: ${JSON.stringify(atCamera)}`);

// 5.5 — photograph every 2nd tick; the clock is the tick, not the wall.
for (let i = 0; i < FRAMES; i += 1) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const td = window.__td;
        td.step(n);
        requestAnimationFrame(() => {
          td.renderFrame(td.sim.state.tick * td.tickMs);
          resolve();
        });
      }),
    TICKS_PER_FRAME,
  );
  await page.screenshot({ path: path.join(OUT, `frame-${String(i).padStart(3, '0')}.png`) });
}
const atEnd = await simState(page);
console.log(`camera off at tick ${atEnd.tick}: ${JSON.stringify(atEnd)}`);
if (atEnd.runPhase === 'lost') fail('run lost during the capture window');

await browser.close();
server.close();

// 5.6 — encode; animated WebP confirmed by the spike (no GIF fallback needed).
const webp = path.join(OUT, 'preview.webp');
const ffmpeg = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(OUT, 'frame-%03d.png'),
    '-c:v', 'libwebp',
    '-lossless', '0',
    '-q:v', '80',
    '-loop', '0',
    webp,
  ],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);
if (ffmpeg.status !== 0) fail(`ffmpeg exited ${ffmpeg.status}`);
const { size } = await stat(webp);
console.log(`encoded ${webp}: ${(size / 1024 / 1024).toFixed(2)} MB`);
if (size > SIZE_CEILING_BYTES) {
  fail(`clip is ${size} bytes, over the ${SIZE_CEILING_BYTES}-byte ceiling — lower -q:v`);
}
console.log('CAPTURE OK');
