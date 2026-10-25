import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeHeights, createSampler } from '../src/render/heightmap.js';
import { altitudeDisplay, RADAR_BELOW_FT } from '../src/hud/hud.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

// A 3 × 3 tile, 200 m on a side (100 m posts), heights 1000..2000 m,
// rising to the east and to the south; the world origin on the centre post.
function tile() {
  const size = 3, meta = { size, metres: 200, min: 1000, max: 2000, start: [1, 1] };
  const values = [0, 0.25, 0.5, 0.25, 0.5, 0.75, 0.5, 0.75, 1.0].map((t) => Math.round(t * 65535));
  const rgba = new Uint8ClampedArray(size * size * 4);
  values.forEach((v, i) => { rgba[i * 4] = v >> 8; rgba[i * 4 + 1] = v & 255; rgba[i * 4 + 3] = 255; });
  return { heights: decodeHeights(rgba, size), meta };
}

test('heightmap: 16-bit heights decode from red and green, and the sampler lands on the posts', () => {
  const { heights, meta } = tile();
  assert.equal(heights[0], 0); assert.equal(heights[8], 65535);
  const s = createSampler(heights, meta);
  near(s.heightAt(0, 0), 1500, 0.1, 'centre post');
  near(s.heightAt(-100, -100), 1000, 0.1, 'north-west post');
  near(s.heightAt(100, 100), 2000, 0.1, 'south-east post');
  near(s.heightAt(100, -100), 1500, 0.1, 'north-east post');
});

test('heightmap: bilinear between posts, and flat beyond the edge', () => {
  const { heights, meta } = tile();
  const s = createSampler(heights, meta);
  near(s.heightAt(50, 0), 1625, 0.1, 'halfway east of centre');
  near(s.heightAt(-50, 50), 1500, 0.1, 'between four posts');
  near(s.heightAt(1000, 1000), 2000, 0.1, 'far beyond the south-east corner: the corner height');
  near(s.heightAt(-1000, 0), 1250, 0.1, 'beyond the west edge: the edge height there');
  assert.equal(s.post, 100);
});

test('the altitude window: barometric above 1,500 ft AGL, radar with an R below it', () => {
  assert.deepEqual(altitudeDisplay(9000, 4000), { radar: false, value: 9000 });
  assert.deepEqual(altitudeDisplay(5234, 4000), { radar: true, value: 1230 });
  assert.deepEqual(altitudeDisplay(4000 + RADAR_BELOW_FT, 4000), { radar: false, value: 5500 });
  assert.deepEqual(altitudeDisplay(3990, 4000), { radar: true, value: 0 }, 'never negative');
  assert.deepEqual(altitudeDisplay(5000.4, undefined), { radar: false, value: 5000 }, 'no ground known: barometric');
});
