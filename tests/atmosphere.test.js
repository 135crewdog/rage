import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atmosphere, P0, A0, RHO0 } from '../src/sim/atmosphere.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('sea level matches the book constants', () => {
  const s = atmosphere(500, 0);
  assert.equal(s.temp, 519);
  assert.equal(s.rho, 2.377e-3);
  near(s.a, Math.sqrt(1.4 * 1716.3 * 519), 1e-9);
  near(s.pressure, 1715 * 2.377e-3 * 519, 1e-9);
  near(s.qbar, 0.5 * 2.377e-3 * 500 * 500, 1e-9);
  near(s.mach, 500 / s.a, 1e-12);
  assert.equal(P0, s.pressure);
  assert.equal(A0, s.a);
  assert.equal(RHO0, s.rho);
});

test('10,000 ft follows the power-law fit', () => {
  const s = atmosphere(600, 10000);
  const tfac = 1 - 0.703e-5 * 10000;
  near(s.temp, 519 * tfac, 1e-9);
  near(s.rho, 2.377e-3 * Math.pow(tfac, 4.14), 1e-12);
});

test('temperature freezes at 390 °R from 35,000 ft while density keeps falling', () => {
  const a = atmosphere(800, 35000);
  const b = atmosphere(800, 45000);
  assert.equal(a.temp, 390);
  assert.equal(b.temp, 390);
  assert.ok(b.rho < a.rho);
  assert.equal(a.a, b.a);
  near(a.rho, 2.377e-3 * Math.pow(1 - 0.703e-5 * 35000, 4.14), 1e-12);
});
