#!/usr/bin/env node
// Makes the user guide's pictures from the app itself, so they can never go
// stale: serves the repo, loads the app in headless Chromium at an
// iPhone-sized landscape viewport, flies the air start, and writes to
// guide/img/ a screenshot of the start screen, the rotate screen and
// Settings, the flight view with its controls labelled, the HUD with every
// symbol labelled (the HUD reports where it drew each one), a map of the
// region drawn from the real heightmaps and the places file, and the phone
// itself rendered in three.js with that flight on its screen and arrows
// wrapping round it for pitch and for roll. Then it loads
// the guide and checks that it reads the app's version, places and credits
// and that every picture is there. The pictures always go to guide/img/,
// because that is where the guide looks for them; they are never checked
// in, and the Pages workflow runs this before publishing. Playwright and
// Chromium must be installed as developer tools.
//
//   node tests/browser/guide.js

import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { serve, sensor, ROOT } from './harness.js';

const require = createRequire(import.meta.url);
const PICTURES = ['start', 'rotate', 'settings', 'screen', 'hud', 'map', 'hold-pitch', 'hold-roll'];

// Draws leader lines and labels over the page, on a canvas of its own, for
// the labelled pictures; items are { text, x, y, lx, ly, align } in CSS
// pixels, x and y the point labelled (or none for a free label), lx and ly
// where the text goes. Runs in the page.
function drawLabels(items) {
  let c = document.getElementById('guide-labels');
  if (!c) {
    c = document.createElement('canvas'); c.id = 'guide-labels';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
    document.body.append(c);
  }
  const dpr = devicePixelRatio; c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.font = '600 15px -apple-system, BlinkMacSystemFont, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const twice = (draw) => { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; draw(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; draw(); };
  for (const it of items) {
    if (it.x !== undefined) {
      ctx.textAlign = it.align;
      const width = ctx.measureText(it.text).width;
      const ex = it.align === 'left' ? it.lx - 5 : it.align === 'right' ? it.lx + 5 : it.lx + (it.x > it.lx ? width / 2 + 5 : -width / 2 - 5);
      twice(() => { ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(ex, it.ly); ctx.stroke(); });
      ctx.beginPath(); ctx.arc(it.x, it.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fill(); ctx.beginPath(); ctx.arc(it.x, it.y, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    }
    ctx.textAlign = it.align;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(it.text, it.lx, it.ly);
    ctx.fillStyle = '#fff'; ctx.fillText(it.text, it.lx, it.ly);
  }
}
function clearLabels() { document.getElementById('guide-labels')?.remove(); }

// The map, drawn in the page from the loaded terrain: shaded relief of the
// whole region in the terrain's own colours, the fine patches outlined, the
// steerpoint loop, each air start as the app icon's silhouette pointed on
// its heading, and the bullseye. Returns a PNG data URL.
async function drawMap(width, dpr = 2) {
  const { createProjection } = await import('./src/render/heightmap.js');
  const { PLACES, LOOP, BULLSEYE, placeNamed } = await import('./src/places.js');
  const { region, sampler } = window.rage.terrain;
  const proj = createProjection(region);
  const b = region.base;
  const W = (b.w - 1) * b.post, H = (b.h - 1) * b.post;
  let k = width * dpr / W, height = Math.round(H * k);
  width *= dpr;
  const px = (lat, lon) => { const w = proj.toWorld(lat, lon); return { x: (w.x - b.x0) * k, y: (w.z - b.z0) * k }; };   // k is per CSS pixel once the overlay starts

  // heights at every pixel, then the terrain's colour bands lit from the same sun as the world
  const hs = new Float32Array(width * height);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) hs[j * width + i] = sampler.heightAt(b.x0 + (i + 0.5) / k, b.z0 + (j + 0.5) / k);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const metre = 1 / k;
  const sun = [-0.5, 0.7071, 0.5];
  const mix = (a, c, t) => a.map((v, n) => v + (c[n] - v) * t);
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const desert = [0.70, 0.60, 0.46], valley = [0.34, 0.44, 0.26], sandstone = [0.66, 0.40, 0.29], plateau = [0.74, 0.64, 0.50], rock = [0.48, 0.42, 0.40], water = [0.10, 0.28, 0.40];
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const h = hs[j * width + i];
    const dx = (hs[j * width + Math.min(width - 1, i + 1)] - hs[j * width + Math.max(0, i - 1)]) / (2 * metre);
    const dz = (hs[Math.min(height - 1, j + 1) * width + i] - hs[Math.max(0, j - 1) * width + i]) / (2 * metre);
    const slope = Math.hypot(dx, dz);
    let c = mix(desert, valley, smooth(950, 1150, h));
    c = mix(c, sandstone, smooth(1150, 1850, h));
    c = mix(c, plateau, smooth(2150, 2950, h));
    c = mix(c, rock, smooth(0.20, 0.55, slope));
    const x = b.x0 + (i + 0.5) / k, z = b.z0 + (j + 0.5) / k;
    for (const lake of region.lakes) {
      if (x > lake.x0 && x < lake.x1 && z > lake.z0 && z < lake.z1 && Math.abs(h - lake.level) < 2.5 && slope < 0.01) c = water;
    }
    const n = [-dx, 1, -dz], len = Math.hypot(...n);
    const shade = Math.max(0, (n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]) / len);
    const light = 0.55 + 0.6 * shade;
    const o = (j * width + i) * 4;
    img.data[o] = Math.min(255, c[0] * light * 255); img.data[o + 1] = Math.min(255, c[1] * light * 255); img.data[o + 2] = Math.min(255, c[2] * light * 255); img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.scale(dpr, dpr); k /= dpr; width /= dpr; height /= dpr;   // the overlay in CSS pixels

  const GREEN = '#7cff4f';
  const twice = (draw, colour = '#fff', w = 2) => { ctx.lineWidth = w + 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; draw(); ctx.lineWidth = w; ctx.strokeStyle = colour; draw(); };
  const label = (s, x, y, colour = '#fff', size = 14, align = 'left') => {
    ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(s, x, y); ctx.fillStyle = colour; ctx.fillText(s, x, y);
  };
  // the fine patches: where the ground is from the 30 m survey
  for (const p of region.patches) {
    const side = (p.size - 1) * p.post * k, x = (p.x0 - b.x0) * k, y = (p.z0 - b.z0) * k;
    twice(() => ctx.strokeRect(x, y, side, side));
    label(p.name, x + 8, y + 12);
  }
  // the loop between the steerpoints, with an arrowhead on each leg
  const sights = LOOP.map((name) => { const p = placeNamed(name); return px(p.sight.lat, p.sight.lon); });
  ctx.setLineDash([10, 7]);
  twice(() => { ctx.beginPath(); sights.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y))); ctx.closePath(); ctx.stroke(); }, GREEN, 2.5);
  ctx.setLineDash([]);
  sights.forEach((s, i) => {
    const t = sights[(i + 1) % sights.length];
    const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2, a = Math.atan2(t.y - s.y, t.x - s.x);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
    twice(() => { ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(6, 0); ctx.lineTo(-7, 6); ctx.stroke(); }, GREEN, 2.5);
    ctx.restore();
  });
  // the steerpoints: the HUD's diamond and name
  for (const place of PLACES) {
    const s = px(place.sight.lat, place.sight.lon);
    twice(() => { ctx.beginPath(); ctx.moveTo(s.x, s.y - 9); ctx.lineTo(s.x + 9, s.y); ctx.lineTo(s.x, s.y + 9); ctx.lineTo(s.x - 9, s.y); ctx.closePath(); ctx.stroke(); }, GREEN, 2.5);
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    const fits = s.x + 14 + ctx.measureText(place.hud).width < width - 4;   // else the name goes on the left
    label(place.hud, fits ? s.x + 14 : s.x - 14, s.y - 14, GREEN, 13, fits ? 'left' : 'right');
  }
  // the bullseye
  const be = px(BULLSEYE.lat, BULLSEYE.lon);
  twice(() => { ctx.beginPath(); ctx.arc(be.x, be.y, 16, 0, Math.PI * 2); ctx.moveTo(be.x + 8, be.y); ctx.arc(be.x, be.y, 8, 0, Math.PI * 2); ctx.stroke(); });
  label('bullseye', be.x - 20, be.y + 2, '#fff', 13, 'right');
  // the air starts: the app icon's F-16, pointed on each heading
  const svg = await (await fetch('./icons/icon.svg')).text();
  const pts = svg.match(/points="([^"]+)"/)[1].trim().split(/\s+/).map((p) => p.split(',').map(Number));
  for (const place of PLACES) {
    const s = px(place.start.lat, place.start.lon);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(place.start.heading * Math.PI / 180); ctx.scale(0.34, 0.34);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x - 50, y - 50) : ctx.moveTo(x - 50, y - 50))); ctx.closePath();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = GREEN; ctx.fill();
    ctx.restore();
  }
  // a scale bar
  const bar = 50000 * k, bx = 24, by = height - 24;
  twice(() => { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bar, by); ctx.moveTo(bx, by - 6); ctx.lineTo(bx, by + 6); ctx.moveTo(bx + bar, by - 6); ctx.lineTo(bx + bar, by + 6); ctx.stroke(); });
  label('50 km', bx + bar / 2, by - 14, '#fff', 13, 'center');
  return canvas.toDataURL('image/png');
}

// The phone, held in landscape with the flight on its screen, rendered in
// three.js inside the app page (which has the import map), with HUD-green
// arrows wrapping round it: for 'pitch', over the top edge toward you and
// away from you; for 'roll', round the phone clockwise and anticlockwise.
// Millimetres; a real phone's proportions. Returns a PNG data URL, 2x.
async function drawHold({ kind, shot }) {
  const THREE = await import('three');
  const W = 1100, H = 720;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, W / H, 1, 2000);
  if (kind === 'pitch') { camera.position.set(0, 104, 260); camera.lookAt(0, 16, 0); } else { camera.position.set(0, 26, 380); camera.lookAt(0, -6, 0); }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-80, 120, 160); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(60, 40, -120); scene.add(rim);
  const rounded = (w, h, r) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2);
    sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return sh;
  };
  const PW = 148, PH = 72, PD = 7.8, BEVEL = 1.2;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(rounded(PW, PH, 11), { depth: PD - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 6, curveSegments: 24 }),
    new THREE.MeshStandardMaterial({ color: 0x202024, roughness: 0.4, metalness: 0.35 }),
  );
  body.geometry.translate(0, 0, -(PD - 2 * BEVEL) / 2);
  scene.add(body);
  const tex = await new THREE.TextureLoader().loadAsync(shot);
  tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(1 / 140, 1 / 64); tex.offset.set(0.5, 0.5);   // ShapeGeometry's uvs are its millimetres
  const screen = new THREE.Mesh(new THREE.ShapeGeometry(rounded(140, 64, 8), 24), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.z = PD / 2 + 0.05;
  scene.add(screen);
  const green = new THREE.MeshStandardMaterial({ color: 0x7cff4f, emissive: 0x2f7a1c, roughness: 0.5 });
  const arrow = (points) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const tangent = curve.getTangent(1), end = points[points.length - 1];
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 11, 16), green);
    cone.position.copy(end).addScaledVector(tangent, 5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 1.7, 12), green), cone);
  };
  const D2R = Math.PI / 180;
  const arc = (at, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => at((a0 + (a1 - a0) * i / n) * D2R));
  const at = {};   // where each label goes, in the scene
  if (kind === 'pitch') {
    // round the long axis, over the top edge: toward you (+z) is nose up; the labels above each arc
    const R = 56;
    arrow(arc((t) => new THREE.Vector3(40, R * Math.cos(t), R * Math.sin(t)), -50, 50));
    arrow(arc((t) => new THREE.Vector3(-40, R * Math.cos(t), R * Math.sin(t)), 50, -50));
    at.up = new THREE.Vector3(40, R, 0); at.down = new THREE.Vector3(-40, R, 0);
  } else {
    // round the screen's own axis, beside each end of the phone and clear of it: down the right side is clockwise, roll right; down the left, roll left
    const R = 94;
    arrow(arc((t) => new THREE.Vector3(R * Math.cos(t), R * Math.sin(t), 0), 42, -42));
    arrow(arc((t) => new THREE.Vector3(R * Math.cos(t), R * Math.sin(t), 0), 138, 222));
    at.right = new THREE.Vector3(R * Math.cos(-42 * D2R), R * Math.sin(-42 * D2R), 0); at.left = new THREE.Vector3(R * Math.cos(222 * D2R), R * Math.sin(222 * D2R), 0);
  }
  renderer.render(scene, camera);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d'); ctx.drawImage(renderer.domElement, 0, 0);
  renderer.dispose();
  const project = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; };
  ctx.font = '600 34px -apple-system, BlinkMacSystemFont, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const label = (text, v, dx, dy, align) => {
    const a = project(v);
    ctx.textAlign = align;
    ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(text, a.x + dx, a.y + dy); ctx.fillStyle = '#fff'; ctx.fillText(text, a.x + dx, a.y + dy);
  };
  if (kind === 'pitch') {
    label('toward you: nose up', at.up, 0, -48, 'center');
    label('away: nose down', at.down, 0, -48, 'center');
  } else {
    label('roll right', at.right, 0, 64, 'center');
    label('roll left', at.left, 0, 64, 'center');
  }
  return out.toDataURL('image/png');
}

async function main() {
  const out = join(ROOT, 'guide', 'img');
  await mkdir(out, { recursive: true });
  const { chromium } = require('playwright');
  const { server, url } = await serve();
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await context.grantPermissions(['accelerometer', 'gyroscope', 'magnetometer']);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    const shot = (name) => page.screenshot({ path: join(out, `${name}.png`), timeout: 120000, animations: 'disabled' });

    await page.goto(url + 'index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.rage && window.rage.version);
    await page.waitForFunction(() => !document.getElementById('fly').disabled);
    await page.click('#place button[data-place="Zion National Park"]');
    await shot('start');

    // fly the Zion air start: neutral tilt captured, then held, so the jet is where the start leaves it
    await page.click('#fly');
    await page.waitForFunction(() => window.rage.mode === 'flying');
    const feed = async (seconds) => {
      const s = sensor(30, 0);
      const t0 = await page.evaluate(() => window.rage.sim.time);
      const deadline = Date.now() + 120000;
      while ((await page.evaluate(() => window.rage.sim.time)) < t0 + seconds) {
        if (Date.now() > deadline) throw new Error(`the simulation did not advance ${seconds} s in 120 s`);
        await page.evaluate((o) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', o)), s);
        await page.waitForTimeout(16);
      }
    };
    await feed(0.6);
    await page.waitForFunction(() => window.rage.draws > 0 && window.rage.hud.fpm && window.rage.hud.horizon);

    // the screen: the controls labelled
    const box = (sel) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
    const thumb = await box('#throttle .thumb'), mil = await box('#throttle .mil'), stick = await box('#stick'), pause = await box('#pause');
    const flight = (await page.screenshot({ timeout: 120000, animations: 'disabled' })).toString('base64');   // the plain view, for the phone's screen
    const a = await page.evaluate(() => window.rage.hud);
    console.log('HUD anchors:', Object.keys(a).join(', '));
    await page.evaluate(drawLabels, [
      { text: 'throttle: slide with your left thumb', x: thumb.x + thumb.w, y: thumb.y + thumb.h / 2, lx: thumb.x + thumb.w + 28, ly: thumb.y + thumb.h / 2, align: 'left' },
      { text: 'MIL: cross the gap above for afterburner', x: mil.x + mil.w, y: mil.y + 1, lx: mil.x + mil.w + 28, ly: mil.y + 1, align: 'left' },
      { text: 'stick indicator: where your tilt is', x: stick.x, y: stick.y + stick.h / 2, lx: stick.x - 14, ly: stick.y + stick.h / 2, align: 'right' },
      { text: 'pause', x: pause.x, y: pause.y + pause.h / 2, lx: pause.x - 14, ly: pause.y + pause.h / 2, align: 'right' },
      { text: 'the HUD', x: a.heading.x + 18, y: a.heading.y, lx: a.heading.x + 60, ly: a.heading.y, align: 'left' },
      { text: 'drag anywhere on the view to look around', lx: 422, ly: 300, align: 'center' },
    ]);
    await shot('screen');

    // the HUD: every symbol labelled where the HUD drew it
    await page.evaluate(drawLabels, [
      { text: 'heading, degrees true', x: a.heading.x + 18, y: a.heading.y, lx: a.heading.x + 60, ly: a.heading.y, align: 'left' },
      { text: 'airspeed, knots', x: a.airspeed.x - 4, y: a.airspeed.y - 12, lx: a.airspeed.x + 46, ly: a.airspeed.y - 40, align: 'right' },
      { text: 'altitude, ft', x: a.altitude.x, y: a.altitude.y + 10, lx: a.altitude.x - 46, ly: a.altitude.y + 56, align: 'left' },
      { text: 'pitch ladder, every 5°', x: a.ladder.x, y: a.ladder.y, lx: a.ladder.x - 24, ly: a.ladder.y, align: 'right' },
      { text: 'horizon', x: a.horizon.x, y: a.horizon.y, lx: a.horizon.x + 14, ly: a.horizon.y, align: 'left' },
      { text: 'waterline: where the nose points', x: a.waterline.x, y: a.waterline.y, lx: a.waterline.x + 30, ly: a.waterline.y - 22, align: 'left' },
      { text: 'flight path marker: where the jet is going', x: a.fpm.x, y: a.fpm.y, lx: a.fpm.x - 30, ly: a.fpm.y + 24, align: 'right' },
      ...(a.steerpoint ? [a.steerpoint.kind === 'diamond'
        ? { text: 'steerpoint', x: a.steerpoint.x, y: a.steerpoint.y, lx: a.steerpoint.x + 24, ly: a.steerpoint.y + 18, align: 'left' }
        : { text: 'steerpoint cue: turn this way', x: a.steerpoint.x, y: a.steerpoint.y, lx: a.steerpoint.x + 98, ly: a.steerpoint.y - 16, align: 'left' }] : []),
      { text: 'g', x: a.g.x + 64, y: a.g.y, lx: a.g.x + 100, ly: a.g.y, align: 'left' },
      { text: 'angle of attack, degrees', x: a.alpha.x + 64, y: a.alpha.y, lx: a.alpha.x + 100, ly: a.alpha.y, align: 'left' },
      { text: 'Mach', x: a.mach.x + 64, y: a.mach.y, lx: a.mach.x + 100, ly: a.mach.y, align: 'left' },
      { text: 'engine: IDLE, MIL, or AB and its %', x: a.power.x + 64, y: a.power.y, lx: a.power.x + 100, ly: a.power.y, align: 'left' },
      { text: 'your bearing and range from the bullseye', x: a.bullseye.x + 76, y: a.bullseye.y, lx: a.bullseye.x + 100, ly: a.bullseye.y, align: 'left' },
      { text: 'steerpoint: range in nm, and its name', x: a.range.x - 90, y: a.range.y - 8, lx: a.range.x - 100, ly: a.range.y - 44, align: 'right' },
    ]);
    await shot('hud');
    await page.evaluate(clearLabels);

    // the map, from the loaded terrain
    const map = await page.evaluate(drawMap, 640);
    await writeFile(join(out, 'map.png'), Buffer.from(map.split(',')[1], 'base64'));

    // the phone in the hand, with that flight on its screen and the arrows round it
    for (const kind of ['pitch', 'roll']) {
      const png = await page.evaluate(drawHold, { kind, shot: `data:image/png;base64,${flight}` });
      await writeFile(join(out, `hold-${kind}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }

    // pause, settings, and the rotate screen
    await page.click('#pause');
    await page.waitForFunction(() => window.rage.mode === 'paused');
    await page.click('#settings-open');
    await shot('settings');
    await page.click('#settings-done');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.getElementById('screen-rotate').hidden);
    await shot('rotate');
    await page.setViewportSize({ width: 844, height: 390 });

    // the guide itself: the app's version, places and credits, and every picture
    const version = await page.evaluate(() => window.rage.version);
    const guide = await context.newPage();
    guide.on('pageerror', (e) => errors.push(`guide pageerror: ${e.message}`));
    await guide.goto(url + 'guide/', { waitUntil: 'load' });
    await guide.waitForFunction(() => document.querySelectorAll('#credits h3').length > 0);
    assert.equal(await guide.evaluate(() => document.getElementById('version').textContent), version, 'the guide shows the app\'s version');
    assert.equal(await guide.evaluate(() => document.querySelectorAll('#places li').length), 5, 'the five places');
    assert.equal(await guide.evaluate(() => document.querySelectorAll('#credits h3').length), 6, 'the app\'s six credits');
    assert.ok((await guide.evaluate(() => document.getElementById('feedback').href)).includes(encodeURIComponent(`Rage ${version} feedback`)), 'feedback carries the version');
    await guide.waitForFunction(() => [...document.images].every((i) => i.complete));
    const images = await guide.evaluate(() => [...document.images].map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0 })));
    for (const name of PICTURES) {
      const img = images.find((i) => i.src === `./img/${name}.png`);
      assert.ok(img && img.ok, `the guide shows ${name}.png`);
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log(`guide pictures written to ${out}: ${PICTURES.join(', ')}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
