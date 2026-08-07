// THROWAWAY feasibility probe for the PR wave preview spike (openspec
// change add-pr-wave-preview, tasks 1.1-1.5). Deleted at task 2.2.
//
// Boots the *built* app (dist/) in headless Chromium and answers, on the
// machine it runs on:
//   1. Does the three.js scene render at all (SwiftShader on CI)?
//   2. Does a manually driven frame (inside a requestAnimationFrame)
//      composite before page.screenshot() returns?
//   3. Do the CDN fonts, in particular Material Symbols ligatures, load?
//   4. Emit a run of numbered frames for the ffmpeg animated-WebP probe.
//
// Usage: node .github/capture/probe.mjs   (after `npm run build`)
// Outputs land in .github/capture/out/: PNGs + report.json. Exit code 0
// only if every check passed.

import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, '.github', 'capture', 'out');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Tiny static file server over dist/ — no deps, throwaway. */
function serveDist() {
  const server = http.createServer(async (req, res) => {
    // The app builds with base /td/ (GitHub Pages project path).
    const urlPath = new URL(req.url, 'http://x').pathname.replace(/^\/td(\/|$)/, '/');
    const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
    const file = path.join(DIST, path.normalize(rel));
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

/**
 * Count distinct colours in a PNG buffer by drawing it onto a 2D canvas
 * inside the page. A blank/solid screenshot has a handful; a rendered
 * isometric scene has thousands.
 */
async function distinctColours(page, pngBuffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4) {
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return seen.size;
  }, pngBuffer.toString('base64'));
}

/** Drive exactly one frame inside a requestAnimationFrame and await it. */
async function driveFrame(page, mutate) {
  await page.evaluate(
    ([mutateSrc]) =>
      new Promise((resolve) => {
        // Use the real RAF captured before the loop was paused.
        window.__rafGate.real((ts) => {
          const td = window.__td;
          // eslint-disable-next-line no-new-func
          new Function('td', 'ts', mutateSrc)(td, ts);
          td.renderer.render(td.camera.camera);
          resolve();
        });
      }),
    [mutate],
  );
}

const report = { checks: {}, env: {} };
let failed = false;

function record(name, ok, detail) {
  report.checks[name] = { ok, detail };
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
  if (!ok) failed = true;
}

await mkdir(OUT, { recursive: true });
const server = await serveDist();
const port = server.address().port;

// channel:'chromium' = the new headless of full Chrome (real compositor),
// which is what the eventual capture driver would use.
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (msg) => console.log(`  [page ${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => console.log(`  [page error] ${err.message}`));
page.on('response', (res) => {
  if (res.status() >= 400) console.log(`  [http ${res.status()}] ${res.url()}`);
});

// Gate requestAnimationFrame so the probe can pause the app's real-time loop
// without touching src/: once paused, the loop's self-reschedule is swallowed
// and the loop halts; the probe then drives frames via the captured real RAF.
await page.addInitScript(() => {
  const real = window.requestAnimationFrame.bind(window);
  window.__rafGate = { paused: false, real, swallowed: 0 };
  window.requestAnimationFrame = (cb) => {
    if (window.__rafGate.paused) {
      window.__rafGate.swallowed += 1;
      return 0;
    }
    return real(cb);
  };
});

// ── Check 1: boot + first render ────────────────────────────────────────────
await page.goto(`http://127.0.0.1:${port}/td/?seed=1`, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.__td), null, { timeout: 30_000 });

report.env.webgl = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { ok: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ok: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
  };
});
console.log(`  webgl: ${JSON.stringify(report.env.webgl)}`);

// Let the real-time loop paint a few frames, then shoot.
await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
const bootShot = await page.screenshot({ path: path.join(OUT, 'boot.png') });
const bootColours = await distinctColours(page, bootShot);
record('scene-renders-not-blank', bootColours > 1000, { distinctColours: bootColours });

// ── Check 2: fonts (task 1.4) ───────────────────────────────────────────────
const fonts = await page.evaluate(async () => {
  const ready = await Promise.race([
    document.fonts.ready.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 10_000)),
  ]);
  const iconFont = document.fonts.check('24px "Material Symbols Outlined"');
  // A loaded icon font renders the ligature 'screen_rotation' as one glyph
  // (~1em wide); an unloaded one falls back to literal ~15-char text.
  const c = document.createElement('canvas').getContext('2d');
  c.font = '24px "Material Symbols Outlined", monospace';
  const ligatureWidth = c.measureText('screen_rotation').width;
  return { ready, iconFont, ligatureWidth };
});
record('fonts-ready-and-icons', fonts.ready && fonts.iconFont && fonts.ligatureWidth < 40, fonts);

// ── Check 3: manual frame compositing (task 1.3) ────────────────────────────
// Pause the loop, render two visibly different states back to back, and
// verify each screenshot reflects the state driven immediately before it.
await page.evaluate(() => {
  window.__rafGate.paused = true;
});
await page.evaluate(() => new Promise((r) => setTimeout(r, 200))); // let the last scheduled frame drain
const swallowed = await page.evaluate(() => window.__rafGate.swallowed);
console.log(`  loop paused (swallowed ${swallowed} reschedules)`);

await driveFrame(page, '');
const shotA = await page.screenshot({ path: path.join(OUT, 'state-a.png') });
await driveFrame(page, 'td.camera.pinch(2.5, 0, 0);'); // zoom to 2.5x — unmistakable
const shotB = await page.screenshot({ path: path.join(OUT, 'state-b.png') });
await driveFrame(page, 'td.camera.pinch(0.0001, 0, 0);'); // clamp back to 1x
const shotC = await page.screenshot({ path: path.join(OUT, 'state-c.png') });

const abDiffer = !shotA.equals(shotB);
const acEqual = shotA.equals(shotC);
record('manual-frame-composites', abDiffer, {
  abDiffer,
  acEqualAfterZoomBack: acEqual, // informational: same state → same pixels?
  bytesA: shotA.length,
  bytesB: shotB.length,
});

// ── Check 4: frames for the ffmpeg/Camo probe (task 1.5) ────────────────────
// A slow zoom-in: 40 frames, visibly animated, HUD included. Enemy motion is
// not needed to test encoding and Camo; the real scenario comes later.
for (let i = 0; i < 40; i += 1) {
  await driveFrame(page, 'td.camera.pinch(1.02, 0.1, 0.05);');
  await page.screenshot({ path: path.join(OUT, `frame-${String(i).padStart(3, '0')}.png`) });
}
record('frames-emitted', true, { count: 40 });

report.env.userAgent = await page.evaluate(() => navigator.userAgent);
await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

await browser.close();
server.close();

console.log(failed ? '\nPROBE FAILED — see report.json' : '\nPROBE PASSED');
process.exit(failed ? 1 : 0);
