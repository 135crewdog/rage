import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { decodeHeights, createSampler, createProjection } from '../src/render/heightmap.js';
import { altitudeDisplay, RADAR_BELOW_FT } from '../src/hud/hud.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

// An RGBA buffer whose 16-bit red-green values are the given heights.
function rgbaOf(values) {
  const rgba = new Uint8ClampedArray(values.length * 4);
  values.forEach((v, i) => { rgba[i * 4] = v >> 8; rgba[i * 4 + 1] = v & 255; rgba[i * 4 + 3] = 255; });
  return rgba;
}

// A small region, heights stored raw (min 0, max 65535): a 5 × 4 base of
// 1,000 m posts a kilometre apart, world x −2..2 km and z −1.5..1.5 km, a
// flat edge height of 100 m and a 500 m fade; two 3 × 3 patches of 100 m
// posts in a 6 × 3 atlas, A at 2,000 m over −100..100 and B at 3,000 m over
// 50..250 in x, both −100..100 in z, blending over 100 m.
function region(baseHeights = new Array(20).fill(1000)) {
  const meta = {
    origin: [37.19, -112.99], mLat: 111132, mLon: 89020.896, blend: 100, fade: 500,
    base: { w: 5, h: 4, post: 1000, x0: -2000, z0: -1500, min: 0, max: 65535, flat: 100 },
    atlas: { w: 6, h: 3, min: 0, max: 65535 },
    patches: [
      { name: 'A', px: 0, py: 0, size: 3, post: 100, x0: -100, z0: -100 },
      { name: 'B', px: 3, py: 0, size: 3, post: 100, x0: 50, z0: -100 },
    ],
  };
  const atlas = [];
  for (let j = 0; j < 3; j++) atlas.push(2000, 2000, 2000, 3000, 3000, 3000);
  return { meta, heights: { base: decodeHeights(rgbaOf(baseHeights), 20), atlas: decodeHeights(rgbaOf(atlas), 18) } };
}

test('heightmap: 16-bit heights decode from red and green', () => {
  const h = decodeHeights(rgbaOf([0, 258, 65535]), 3);
  assert.deepEqual([...h], [0, 258, 65535]);
});

test('heightmap: each patch laid over the base in turn, blended in across its edge band', () => {
  const { meta, heights } = region();
  const s = createSampler(meta, heights);
  near(s.heightAt(0, 0), 2000, 0.01, 'deep inside A');
  near(s.heightAt(-100, 0), 1000, 0.01, 'on A\'s edge: the base');
  near(s.heightAt(-50, 0), 1500, 0.01, 'halfway through A\'s band');
  near(s.heightAt(0, 50), 1500, 0.01, 'the band runs round every side');
  near(s.heightAt(150, 0), 3000, 0.01, 'deep inside B');
  near(s.heightAt(80, 0), 1740, 0.01, 'where A and B overlap, A over the base at 0.2, then B over that at 0.3');
  near(s.heightAt(75, 0), 1687.5, 0.01, 'and no step where their weights cross');
  near(s.heightAt(-1000, 1000), 1000, 0.01, 'outside every patch: the base');
  assert.equal(s.post, 100, 'the finest post spacing');
});

test('heightmap: the base is bilinear between its posts and eases to one flat height at its edge', () => {
  const grad = []; for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) grad.push(1000 + i * 100 + j * 10);
  const s = createSampler(region(grad).meta, region(grad).heights);
  near(s.heightAt(-1500, -1000), 1055, 0.01, 'between four posts');
  near(s.heightAt(-1250, -1000), 1080, 0.01, 'a quarter of the way across a cell');
  const flat = createSampler(region().meta, region().heights);
  near(flat.heightAt(1900, 0), 280, 0.01, 'a fifth of the way into the fade: 100 + 0.2 × 900');
  near(flat.heightAt(0, -1400), 280, 0.01, 'the fade runs round every side');
  near(flat.heightAt(5000, 0), 100, 0.01, 'beyond the edge: the flat height');
  near(flat.heightAt(-9000, 9000), 100, 0.01, 'far beyond a corner: the flat height');
});

test('heightmap: the projection puts the origin at the origin and metres where they belong', () => {
  const p = createProjection(region().meta);
  const o = p.toWorld(37.19, -112.99); near(o.x, 0, 1e-9); near(o.z, 0, 1e-9);
  const v = p.toWorld(36.19, -111.99);
  near(v.x, 89020.896, 0.01, 'one degree east'); near(v.z, 111132, 0.01, 'one degree south');
  const back = p.toLatLon(v.x, v.z);
  near(back.lat, 36.19, 1e-9); near(back.lon, -111.99, 1e-9);
});

// The PNGs make-heightmap.py writes: 8-bit RGB, every row unfiltered, one IDAT.
function readHeightPng(path) {
  const png = readFileSync(path);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  let pos = 8; const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos), type = png.toString('latin1', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (w * 3 + 1)], 0, 'unfiltered row');
    for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; out[y * w + x] = raw[i] * 256 + raw[i + 1]; }
  }
  return { w, h, heights: out };
}

test('the real region: known places are at their heights', () => {
  const meta = JSON.parse(readFileSync(new URL('../terrain/region.json', import.meta.url)));
  const base = readHeightPng(new URL('../terrain/base.png', import.meta.url));
  const atlas = readHeightPng(new URL('../terrain/places.png', import.meta.url));
  assert.deepEqual([base.w, base.h, atlas.w, atlas.h], [meta.base.w, meta.base.h, meta.atlas.w, meta.atlas.h]);
  assert.equal(meta.patches.length, 5);
  const s = createSampler(meta, { base: base.heights, atlas: atlas.heights });
  const p = createProjection(meta);
  const at = (lat, lon) => { const { x, z } = p.toWorld(lat, lon); return s.heightAt(x, z); };
  // heights read straight from the source GeoTIFFs at these points, so this checks the conversion and the projection
  const places = [
    ['Springdale, the air start', 37.19, -112.99, 1246, 30],
    ['Angels Landing', 37.269, -112.948, 1580, 40],
    ['Bryce Point', 37.604, -112.157, 2536, 30],
    ['Brian Head Peak', 37.675, -112.828, 3272, 30],
    ['Phantom Ranch, the canyon floor', 36.106, -112.094, 832, 40],
    ['Grand Canyon Village, the South Rim', 36.054, -112.138, 2108, 30],
    ['Glen Canyon Dam, the lake behind it', 36.95, -111.47, 1124, 20],
    ['Las Vegas, the Strip', 36.11, -115.17, 656, 20],
    ['Lake Mead at Hoover Dam', 36.02, -114.73, 372, 20],
    ['Cedar City, in the base only', 37.68, -113.06, 1782, 30],
  ];
  for (const [name, lat, lon, h, tol] of places) {
    const got = at(lat, lon);
    console.log(`  ${name}: ${got.toFixed(0)} m (expected about ${h})`);
    near(got, h, tol, name);
  }
  near(s.heightAt(0, 0), 1246, 30, 'the world origin is Springdale');
  // where Zion and Bryce overlap the finer Zion shows, and the ground is continuous: no step anywhere along a line through the overlap
  let worst = 0;
  for (let x = 20000; x <= 40000; x += 1) { const d = Math.abs(s.heightAt(x + 0.002, -14540) - s.heightAt(x, -14540)); if (d > worst) worst = d; }
  console.log(`  largest change over 2 mm through the Zion–Bryce overlap: ${(worst * 1000).toFixed(2)} mm`);
  assert.ok(worst < 0.05, `continuous through the overlap: ${worst} m over 2 mm`);
  near(s.heightAt(-400000, 0), meta.base.flat, 0.01, 'far outside the base: the flat edge height');
});

test('the altitude window: barometric above 1,500 ft AGL, radar with an R below it', () => {
  assert.deepEqual(altitudeDisplay(9000, 4000), { radar: false, value: 9000 });
  assert.deepEqual(altitudeDisplay(5234, 4000), { radar: true, value: 1230 });
  assert.deepEqual(altitudeDisplay(4000 + RADAR_BELOW_FT, 4000), { radar: false, value: 5500 });
  assert.deepEqual(altitudeDisplay(3990, 4000), { radar: true, value: 0 }, 'never negative');
  assert.deepEqual(altitudeDisplay(5000.4, undefined), { radar: false, value: 5000 }, 'no ground known: barometric');
});
