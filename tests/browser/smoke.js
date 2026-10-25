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
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };

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

    // choose a place, then tap Fly: no permission prompt in Chromium, so flight starts at once
    await page.waitForFunction(() => !document.getElementById('fly').disabled);
    await page.click('#place button[data-place="Las Vegas"]');
    assert.equal(await page.evaluate(() => localStorage.getItem('rage.place')), 'Las Vegas', 'the place is remembered');
    await page.click('#fly');
    await page.waitForFunction(() => window.rage.mode === 'flying');
    // the terrain is under the jet: the air start is 5,000 ft above the ground at the chosen place, pointed at the sight
    const start = await page.evaluate(() => ({ agl: window.rage.sim.airdata.altitude - window.rage.ground, heading: window.rage.sim.airdata.heading, alt: window.rage.sim.airdata.altitude }));
    assert.ok(Math.abs(start.agl - 5000) < 60, `air start 5,000 ft above the ground: ${start.agl}`);
    assert.ok(Math.abs(start.heading - 230) < 0.5, `heading 230 over Nellis: ${start.heading}`);
    assert.ok(start.alt > 6500 && start.alt < 7200, `Nellis is about 1,870 ft up: ${start.alt}`);
    // the steerpoint is the next place on the loop, Zion, 118 nm away; the jet's bullseye call is Nellis's
    const nav = await page.evaluate(() => ({ name: window.rage.nav.steer.name, range: window.rage.nav.steer.range, bearing: window.rage.nav.steer.bearing, be: window.rage.nav.bullseye }));
    assert.equal(nav.name, 'Zion');
    assert.ok(Math.abs(nav.range - 118) < 3 && Math.abs(nav.bearing - 58) < 3, `Zion at 058 for 118: ${nav.bearing} for ${nav.range}`);
    assert.ok(Math.abs(nav.be.bearing - 239) < 3 && Math.abs(nav.be.range - 114) < 3, `Nellis is bullseye 239 for 114: ${nav.be.bearing} for ${nav.be.range}`);
    assert.equal(await page.evaluate(() => document.querySelector('#place button[data-place="Bryce"] small').textContent), '058 for 47', 'the start screen gives each place\'s bullseye call');
    // the whole region loaded: five patches, and Las Vegas 194 km west is at its height
    const region = await page.evaluate(() => ({ patches: window.rage.terrain.region.patches.length, vegas: window.rage.terrain.sampler.heightAt(-194066, 120023) }));
    assert.equal(region.patches, 5, 'five patches');
    assert.ok(Math.abs(region.vegas - 656) < 20, `the Strip at 656 m: ${region.vegas}`);
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
    // the control surfaces follow the FCS: a left roll command puts the right flaperon down
    const sf = await page.evaluate(() => ({ el: window.rage.surfaces.el, ail: window.rage.surfaces.ail, rdr: window.rage.surfaces.rdr }));
    assert.ok(Math.abs(sf.ail) > 1, `aileron deflected in the roll: ${sf.ail}`);
    const rolled = await page.evaluate(() => ({ bank: window.rage.sim.airdata.roll, stick: window.rage.stick.roll }));
    assert.ok(Math.abs(rolled.stick) > 0.5, `roll stick moved: ${rolled.stick}`);
    assert.ok(Math.abs(rolled.bank) > 10, `the jet banked: ${rolled.bank}`);
    await shot('roll');

    // afterburner: full throttle, wait for the engine to spool into the burner, the plume shows
    await page.evaluate(() => { window.rage.throttle = 1; });
    await page.waitForFunction(() => window.rage.sim.powerState.label === 'AB' && window.rage.sim.powerState.percent > 50, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.rage.plume.visible), true, 'plume visible in afterburner');
    await shot('burner');
    await page.evaluate(() => { window.rage.throttle = 0.3; });
    await page.waitForFunction(() => window.rage.sim.powerState.label !== 'AB', null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.rage.plume.visible), false, 'plume hidden at dry power');

    // look around: a drag on the view swings the camera; lifting the finger eases it back
    await page.mouse.move(600, 200); await page.mouse.down(); await page.mouse.move(420, 240, { steps: 6 });
    const yaw = await page.evaluate(() => window.rage.look.yaw);
    assert.ok(yaw < -20, `dragging left looks right: yaw ${yaw}`);
    await shot('look');
    await page.mouse.up();
    await page.waitForFunction(() => window.rage.look.yaw === 0 && !window.rage.look.active, null, { timeout: 15000 });

    // pause, settings, theme, resume
    await page.click('#pause');
    await page.waitForFunction(() => window.rage.mode === 'paused');
    await shot('pause');
    // recenter confirms itself once the next tilt reading is in
    await page.click('#recenter');
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 30, gamma: 0 })));
    assert.ok((await page.evaluate(() => document.getElementById('recenter').textContent)).startsWith('Recentered'), 'recenter button confirms');
    await page.waitForFunction(() => document.getElementById('recenter').textContent === 'Recenter controls', null, { timeout: 5000 });
    await page.click('#settings-open');
    await page.click('#theme button[data-theme="dark"]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('rage.theme')), 'dark');
    await shot('settings');
    await page.click('#settings-done');
    await page.click('#resume');
    await page.waitForFunction(() => window.rage.mode === 'flying');

    // portrait: the rotate screen wins over every other screen and nothing flies
    await page.click('#pause');
    await page.waitForFunction(() => window.rage.mode === 'paused');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.getElementById('screen-rotate').hidden);
    assert.equal(await page.evaluate(() => document.getElementById('screen-pause').hidden), true, 'pause screen hidden in portrait');
    await page.evaluate(() => document.getElementById('recenter').click());
    await page.evaluate(() => document.getElementById('fly-again').click());
    await page.evaluate(() => document.getElementById('resume').click());
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.rage.mode), 'paused', 'still paused in portrait');
    assert.equal(await page.evaluate(() => document.getElementById('screen-rotate').hidden), false, 'rotate screen still showing');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => !document.getElementById('screen-pause').hidden);
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
