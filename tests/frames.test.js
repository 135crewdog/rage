import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionToWorld, vectorToWorld, attitudeToWorld, rotate, METRES_PER_FOOT } from '../src/render/frames.js';
import * as Quat from '../src/sim/quaternion.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const D2R = Math.PI / 180;
// where a mesh-local direction ends up in the world for a given body attitude
const point = (phi, theta, psi, local) => rotate(attitudeToWorld(Quat.fromEuler(phi, theta, psi)), local);

test('position: north is −z, east is +x, up is +y, in metres', () => {
  const [x, y, z] = positionToWorld(1000, 2000, 5000);
  near(x, 2000 * METRES_PER_FOOT, 1e-9); near(y, 5000 * METRES_PER_FOOT, 1e-9); near(z, -1000 * METRES_PER_FOOT, 1e-9);
  assert.deepEqual(vectorToWorld([1, 0, 0]), [0, -0, -1]);
  assert.deepEqual(vectorToWorld([0, 0, 1]), [0, -1, -0]);
});

test('a jet heading north points its nose (local −z) along world −z', () => {
  const nose = point(0, 0, 0, [0, 0, -1]);
  near(nose[0], 0, 1e-12); near(nose[1], 0, 1e-12); near(nose[2], -1, 1e-12);
  const east = point(0, 0, 90 * D2R, [0, 0, -1]);
  near(east[0], 1, 1e-12, 'heading east → +x'); near(east[2], 0, 1e-12);
});

test('a 30° right bank lowers the right wing (local +x)', () => {
  const wing = point(30 * D2R, 0, 0, [1, 0, 0]);
  near(wing[1], -0.5, 1e-12, 'wing tip y');
  near(wing[0], Math.cos(30 * D2R), 1e-12);
});

test('a nose-up pitch raises the nose (local −z end)', () => {
  const nose = point(0, 20 * D2R, 0, [0, 0, -1]);
  near(nose[1], Math.sin(20 * D2R), 1e-12, 'nose y');
  near(nose[2], -Math.cos(20 * D2R), 1e-12);
  // and the canopy (local +y) stays up for a level jet
  const canopy = point(0, 0, 0, [0, 1, 0]);
  near(canopy[1], 1, 1e-12);
});

test('the conversion is a proper rotation: unit quaternion, right-handed', () => {
  const q = attitudeToWorld(Quat.fromEuler(0.3, -0.4, 2.0));
  near(Math.hypot(...q), 1, 1e-12);
  const x = rotate(q, [1, 0, 0]), y = rotate(q, [0, 1, 0]), z = rotate(q, [0, 0, 1]);
  const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  for (let i = 0; i < 3; i++) near(cross[i], z[i], 1e-12, 'x × y = z');
});
