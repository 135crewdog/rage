import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Q from '../src/sim/quaternion.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('Euler angles round-trip through the quaternion', () => {
  for (const [phi, theta, psi] of [[0, 0, 0], [0.3, -0.5, 2.0], [-1, 1, -1], [2.5, 0.2, -3.0]]) {
    const e = Q.toEuler(Q.fromEuler(phi, theta, psi));
    near(e.phi, phi, 1e-12, 'phi'); near(e.theta, theta, 1e-12, 'theta'); near(e.psi, psi, 1e-12, 'psi');
    near(Math.hypot(...Q.fromEuler(phi, theta, psi)), 1, 1e-12, 'unit');
  }
});

test('body to NED: heading north is +north, heading east is +east, 30° nose up climbs', () => {
  const north = Q.bodyToNed(Q.fromEuler(0, 0, 0), [1, 0, 0]);
  near(north[0], 1, 1e-12); near(north[1], 0, 1e-12); near(north[2], 0, 1e-12);
  const east = Q.bodyToNed(Q.fromEuler(0, 0, Math.PI / 2), [1, 0, 0]);
  near(east[0], 0, 1e-12); near(east[1], 1, 1e-12);
  const up = Q.bodyToNed(Q.fromEuler(0, Math.PI / 6, 0), [1, 0, 0]);
  near(up[2], -0.5, 1e-12, 'down component');
  // a 30° right bank: the right wing (body +y) points down
  const wing = Q.bodyToNed(Q.fromEuler(Math.PI / 6, 0, 0), [0, 1, 0]);
  near(wing[2], 0.5, 1e-12, 'right wing down');
});

test('NED to body is the inverse of body to NED', () => {
  const q = Q.fromEuler(0.4, -0.7, 1.9);
  const v = [3, -2, 5];
  const back = Q.nedToBody(q, Q.bodyToNed(q, v));
  for (let i = 0; i < 3; i++) near(back[i], v[i], 1e-12);
});

test('the quaternion derivative matches the Euler-angle kinematics', () => {
  const phi = 0.3, theta = -0.4, psi = 1.2, p = 0.5, q = -0.2, r = 0.7;
  const q0 = Q.fromEuler(phi, theta, psi);
  const qd = Q.derivative(q0, p, q, r);
  const h = 1e-6;
  const q1 = Q.normalize(q0.map((c, i) => c + h * qd[i]));
  const e0 = Q.toEuler(q0), e1 = Q.toEuler(q1);
  const phidot = p + Math.tan(theta) * (q * Math.sin(phi) + r * Math.cos(phi));
  const thetadot = q * Math.cos(phi) - r * Math.sin(phi);
  const psidot = (q * Math.sin(phi) + r * Math.cos(phi)) / Math.cos(theta);
  near((e1.phi - e0.phi) / h, phidot, 1e-4, 'phidot');
  near((e1.theta - e0.theta) / h, thetadot, 1e-4, 'thetadot');
  near((e1.psi - e0.psi) / h, psidot, 1e-4, 'psidot');
});
