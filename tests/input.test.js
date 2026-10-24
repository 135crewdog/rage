import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upInScreen, tiltOf, stickFrom, shape, wrap, smooth, MAPPING } from '../src/input/tilt.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// A device attitude built from rotations, the way the W3C spec defines it:
// R = Rz(alpha)·Rx(beta)·Ry(gamma). The sensor reports beta and gamma; the
// test derives them from a chosen "up" vector in device axes, which is the
// last row of R: up = (−cos β sin γ, sin β, cos β cos γ).
function sensorFromUp([x, y, z]) {
  const beta = Math.asin(y) * R2D;
  const gamma = Math.atan2(-x, z) * R2D;
  return { beta, gamma };
}
// Rotate a device-axes vector about the device z axis (a steering-wheel turn) by θ degrees.
function wheel([x, y, z], theta) {
  const c = Math.cos(theta * D2R), s = Math.sin(theta * D2R);
  return [c * x - s * y, s * x + c * y, z];
}
// Rotate about the device x axis (tilting the top edge toward or away) by θ degrees.
function tiltBack([x, y, z], theta) {
  const c = Math.cos(theta * D2R), s = Math.sin(theta * D2R);
  return [x, c * y - s * z, s * y + c * z];
}
function tiltFrom(up, screenAngle) {
  const { beta, gamma } = sensorFromUp(up);
  return tiltOf(upInScreen(beta, gamma, screenAngle));
}

test('a 20° steering-wheel turn reads 20° of roll at any neutral tilt, in either landscape', () => {
  for (const screenAngle of [90, 270]) {
    for (const back of [0, 20, 45, 70]) {
      // portrait-upright device, tilted back, then held in landscape by the screen angle
      const neutralUp = tiltBack([0, 1, 0], back);
      const n = tiltFrom(neutralUp, screenAngle);
      const turned = tiltFrom(wheel(neutralUp, 20), screenAngle);
      near(Math.abs(wrap(turned.roll - n.roll)), 20, 1e-9, `screen ${screenAngle} back ${back}`);
      near(turned.pitch, n.pitch, 1e-9, 'pitch unchanged by a wheel turn');
    }
  }
});

test('tilt is continuous through upright', () => {
  // sweep the device from leaning back through vertical to leaning forward
  let prev = null;
  for (let back = -30; back <= 30; back += 1) {
    const t = tiltFrom(tiltBack([0, 1, 0], back), 90);
    if (prev) {
      assert.ok(Math.abs(t.pitch - prev.pitch) < 1.5, `pitch jump at ${back}: ${prev.pitch} → ${t.pitch}`);
      assert.ok(Math.abs(wrap(t.roll - prev.roll)) < 1.5, `roll jump at ${back}`);
    }
    prev = t;
  }
});

test('turning in a chair (alpha) causes no input', () => {
  // upInScreen never sees alpha; the same beta and gamma give the same tilt
  const a = tiltOf(upInScreen(40, -10, 90));
  const b = tiltOf(upInScreen(40, -10, 90));
  assert.deepEqual(a, b);
});

test('confidence falls to zero when the screen faces the sky or the floor', () => {
  near(tiltFrom([0, 0, 1], 90).confidence, 0, 1e-12);
  near(tiltFrom([0, 0, -1], 90).confidence, 0, 1e-12);
  near(tiltFrom([0, 1, 0], 90).confidence, 1, 1e-12);
  near(tiltFrom(tiltBack([0, 1, 0], 60), 90).confidence, Math.cos(60 * D2R), 1e-12);
});

test('deadband, then linear to full force', () => {
  assert.equal(shape(1, 2, 25), 0);
  assert.equal(shape(-1.9, 2, 25), 0);
  near(shape(2 + 11.5, 2, 25), 0.5, 1e-12);
  assert.equal(shape(25, 2, 25), 1);
  assert.equal(shape(40, 2, 25), 1);
  assert.equal(shape(-30, 1.5, 30), -1);
});

test('stick from tilt against the neutral, with roll fading on low confidence', () => {
  const neutral = { pitch: 30, roll: -5, confidence: 0.9 };
  const pull = stickFrom({ pitch: 30 + 25, roll: -5, confidence: 0.9 }, neutral);
  near(pull.pitch, MAPPING.pitchSign * 1, 1e-12);
  near(pull.roll, 0, 1e-12);
  const right = stickFrom({ pitch: 30, roll: -5 + 30, confidence: 0.9 }, neutral);
  near(right.roll, MAPPING.rollSign * 1, 1e-12);
  const faded = stickFrom({ pitch: 30, roll: -5 + 30, confidence: 0.15 }, neutral);
  near(faded.roll, MAPPING.rollSign * 0.5, 1e-12);
  // roll wraps: neutral at 170°, now at −170° is a 20° turn, not −340°
  const w = stickFrom({ pitch: 30, roll: -170, confidence: 1 }, { pitch: 30, roll: 170, confidence: 1 });
  near(w.dRoll, 20, 1e-12);
});

test('the smoothing filter has a 20 ms time constant and tolerates a bad dt', () => {
  const y = smooth(0, 1, 0.020);
  near(y, 1 - Math.exp(-1), 1e-12);
  assert.equal(smooth(0.3, 1, 0), 1);
  assert.equal(smooth(0.3, 1, NaN), 1);
});
