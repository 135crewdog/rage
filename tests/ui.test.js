import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throttleFromPosition, positionFromThrottle } from '../src/ui/throttle.js';
import { MIL_THROTTLE } from '../src/sim/engine.js';
import { apexFor } from '../src/hud/hud.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('the throttle has a detent at MIL: a band below the mark and a gap above it both read MIL', () => {
  assert.equal(throttleFromPosition(0), 0);
  near(throttleFromPosition(MIL_THROTTLE), MIL_THROTTLE, 1e-12);
  near(throttleFromPosition(MIL_THROTTLE - 0.05), MIL_THROTTLE, 1e-12);   // a little under the mark: snapped to MIL
  near(throttleFromPosition(MIL_THROTTLE + 0.08), MIL_THROTTLE, 1e-12);   // inside the gap: still MIL
  assert.ok(throttleFromPosition(MIL_THROTTLE - 0.07) < MIL_THROTTLE - 0.01, 'below the band: dry power');
  assert.ok(throttleFromPosition(MIL_THROTTLE + 0.13) > MIL_THROTTLE, 'past the gap: afterburner');
  near(throttleFromPosition(1), 1, 1e-12);
  // the dry range is stretched over the track below the band, so every setting is reachable and the mapping is continuous
  near(throttleFromPosition(0.5), 0.5 * MIL_THROTTLE / (MIL_THROTTLE - 0.06), 1e-12);
  near(throttleFromPosition(MIL_THROTTLE - 0.06), MIL_THROTTLE, 1e-12);
  for (const t of [0, 0.3, 0.76, MIL_THROTTLE, 0.8, 0.95, 1]) near(throttleFromPosition(positionFromThrottle(t)), t, 1e-12);
  // at MIL the thumb sits on the mark, which is at MIL's own height on the track
  near(positionFromThrottle(MIL_THROTTLE), MIL_THROTTLE, 1e-12);
  assert.ok(positionFromThrottle(MIL_THROTTLE - 1e-9) < MIL_THROTTLE - 0.05, 'just under MIL the thumb is below the band');
});

test('the ladder shows the zenith and nadir symbols once its window reaches straight up or down', () => {
  assert.equal(apexFor(0), null);
  assert.equal(apexFor(77), null);          // 85° bar in view, 90° not yet
  assert.equal(apexFor(78), 'zenith');      // within 12.5° of straight up
  assert.equal(apexFor(90), 'zenith');
  assert.equal(apexFor(-77), null);
  assert.equal(apexFor(-78), 'nadir');
  assert.equal(apexFor(-90), 'nadir');
});

test('the tadpole points at the steerpoint on the screen, or left or right when it is behind', async () => {
  const { cueDirection, relativeBearing } = await import('../src/hud/hud.js');
  const from = { x: 400, y: 200 };
  const u = cueDirection({ x: 700, y: 600, visible: true }, from, 0);
  assert.ok(Math.abs(u.x - 0.6) < 1e-9 && Math.abs(u.y - 0.8) < 1e-9, `toward the point: ${u.x}, ${u.y}`);
  assert.deepEqual(cueDirection({ x: 100, y: 100, visible: false }, from, -120), { x: -1, y: 0 }, 'behind and left: left');
  assert.deepEqual(cueDirection(null, from, 150), { x: 1, y: 0 }, 'behind and right: right');
  assert.equal(relativeBearing(350, 10), 20);
  assert.equal(relativeBearing(10, 350), -20);
  assert.equal(relativeBearing(90, 270), 180);
});
