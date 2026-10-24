#!/usr/bin/env node
// Browser smoke test: serves the repo, loads the app in headless Chromium at
// an iPhone-sized landscape viewport, taps Fly, feeds simulated tilt and
// checks that it renders and the jet responds. Playwright and Chromium must
// be installed as developer tools; they are not an app dependency.
//
//   node tests/browser/smoke.js [screenshot-dir]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(join(ROOT, path));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      await stat(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

// beta and gamma for a phone held in landscape with the given tilt-back angle
// and steering-wheel turn, assuming screen angle 0 (as headless reports).
function sensor(back, turn) {
  // up vector in device axes: start upright (0,1,0), tilt back about x, turn about z
  const D2R = Math.PI / 180;
  let [x, y, z] = [0, Math.cos(back * D2R), Math.sin(back * D2R)];
  const c = Math.cos(turn * D2R), s = Math.sin(turn * D2R);
  [x, y] = [c * x - s * y, s * x + c * y];
  return { beta: Math.asin(y) / D2R, gamma: Math.atan2(-x, z) / D2R, alpha: 0 };
}

async function main() {
  const shots = process.argv[2];
  const { chromium } = require('playwright');
  const { server, url } = await serve();
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const errors = [];
  try {
    // device scale 1: the software renderer in CI is slow at 2, and the test checks behaviour, not pixels
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    // Chromium gates DeviceOrientationEvent.requestPermission on the sensor permissions; grant them as the pilot would
    await context.grantPermissions(['accelerometer', 'gyroscope', 'magnetometer']);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    // screenshots are a developer aid, not an assertion: a slow software renderer may not deliver one in time
    const shot = async (name) => {
      if (!shots) return;
      try { await page.screenshot({ path: join(shots, `${name}.png`), timeout: 10000, animations: 'disabled' }); }
      catch (e) { console.warn(`screenshot ${name} skipped: ${e.message.split('\n')[0]}`); }
    };

    await page.goto(url + 'index.html?debug=1', { waitUntil: 'load' });
    await page.waitForFunction(() => window.rage && window.rage.version);
    assert.equal(await page.evaluate(() => window.rage.mode), 'start');
    assert.equal(await page.evaluate(() => document.getElementById('screen-start').hidden), false);
    await shot('start');

    // tap Fly: no permission prompt in Chromium, so flight starts at once
    await page.click('#fly');
    await page.waitForFunction(() => window.rage.mode === 'flying');
    assert.equal(await page.evaluate(() => document.getElementById('controls').hidden), false);

    // feed tilt until the simulation has flown `seconds` of its own time. The
    // loop drops wall time it cannot simulate (at most 8 steps a frame), and a
    // software renderer in CI may manage only a few frames a second, so wall
    // time is no measure of flight time. A neutral attitude first, then hold it.
    const simTime = () => page.evaluate(() => window.rage.sim.time);
    const feed = async (back, turn, seconds) => {
      const s = sensor(back, turn);
      const t0 = await simTime();
      const deadline = Date.now() + 120000;
      while ((await simTime()) < t0 + seconds) {
        if (Date.now() > deadline) throw new Error(`the simulation did not advance ${seconds} s in 120 s of wall time`);
        await page.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', o)), s);
        await page.waitForTimeout(16);
      }
    };
    await feed(30, 0, 0.4);
    assert.ok(await page.evaluate(() => window.rage.neutral !== null), 'neutral captured');
    const level = await page.evaluate(() => ({ nz: window.rage.sim.aux.nz, bank: window.rage.sim.airdata.roll, t: window.rage.sim.time }));
    assert.ok(level.t > 0.2, `simulation advancing: t ${level.t}`);
    assert.ok(Math.abs(level.nz - 1) < 0.1, `level at ${level.nz} g`);
    assert.ok(await page.evaluate(() => window.rage.draws > 0), 'the renderer drew something');
    await shot('level');

    // pull: tilt the top edge 20° toward the pilot
    await feed(50, 0, 1.5);
    const pulled = await page.evaluate(() => ({ nz: window.rage.sim.aux.nz, stick: window.rage.stick.pitch, pitch: window.rage.sim.airdata.pitch }));
    assert.ok(Math.abs(pulled.stick) > 0.5, `pitch stick moved: ${pulled.stick}`);
    assert.ok(pulled.nz > 1.5 || pulled.nz < 0.5, `the jet responded in g: ${pulled.nz}`);
    await shot('pull');

    // roll: turn the wheel 25° to the right
    await feed(30, -25, 1.5);
    const rolled = await page.evaluate(() => ({ bank: window.rage.sim.airdata.roll, stick: window.rage.stick.roll }));
    assert.ok(Math.abs(rolled.stick) > 0.5, `roll stick moved: ${rolled.stick}`);
    assert.ok(Math.abs(rolled.bank) > 10, `the jet banked: ${rolled.bank}`);
    await shot('roll');

    // pause, settings, theme, resume
    await page.click('#pause');
    await page.waitForFunction(() => window.rage.mode === 'paused');
    await shot('pause');
    await page.click('#settings-open');
    await page.click('#theme button[data-theme="dark"]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('rage.theme')), 'dark');
    await shot('settings');
    await page.click('#settings-done');
    await page.click('#resume');
    await page.waitForFunction(() => window.rage.mode === 'flying');

    // the service worker registers and caches under a rage- prefix
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.getRegistrations().then((r) => r.length > 0), null, { timeout: 15000 }).catch(() => {});
    const caches = await page.evaluate(async () => { await navigator.serviceWorker.ready; return (await window.caches.keys()); });
    assert.ok(caches.some((k) => k.startsWith('rage-')), `caches: ${caches}`);
    assert.ok(caches.every((k) => k.startsWith('rage-')), 'only rage- caches touched');

    // the HUD canvas has pixels
    const hudPixels = await page.evaluate(() => {
      const c = document.getElementById('hud'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++; return n;
    });
    assert.ok(hudPixels > 50, `HUD drawn: ${hudPixels}`);

    assert.deepEqual(errors, []);
    console.log('browser smoke test passed');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
