import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tgear, rtau, pdot, thrust } from '../src/sim/engine.js';
import { MACH, ALT, IDLE, MIL, MAX } from '../src/sim/data/engine.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('throttle gearing: 0.77 is MIL (50 %), 1.0 is max afterburner (100 %)', () => {
  assert.equal(tgear(0), 0);
  near(tgear(0.77), 50, 0.01);
  near(tgear(1), 100, 1e-9);
  near(tgear(0.9), 78.262, 1e-9);
});

test('RTAU breakpoints', () => {
  assert.equal(rtau(10), 1);
  assert.equal(rtau(25), 1);
  near(rtau(30), 0.82, 1e-12);
  assert.equal(rtau(50), 0.1);
  assert.equal(rtau(80), 0.1);
});

test('power lag matches the book for hand-picked cases', () => {
  // The check case: throttle 0.9 (78.262 %) with the engine at 90 %
  near(pdot(90, tgear(0.9)), -58.68999, 1e-4, 'check case');
  // idle to MIL: first heads for 60 % with the slow RTAU
  near(pdot(0, 50), rtau(60) * 60, 1e-12, 'idle→MIL');
  near(pdot(0, 50), 6, 1e-12);
  // MIL to idle: heads for 40 % at rate 5
  near(pdot(50, 0), 5 * (40 - 50), 1e-12, 'MIL→idle');
  // both below 50: direct, rate by RTAU
  near(pdot(10, 40), rtau(30) * 30, 1e-12);
  near(pdot(20, 30), 1 * 10, 1e-12);
  // both above 50: direct, rate 5
  near(pdot(60, 100), 5 * 40, 1e-12);
});

test('thrust is exact at the table grid points', () => {
  for (let i = 0; i < MACH.length; i++) {
    for (let j = 0; j < ALT.length; j++) {
      near(thrust(0, ALT[j], MACH[i]), IDLE[i][j], 1e-9, 'idle');
      near(thrust(50, ALT[j], MACH[i]), MIL[i][j], 1e-9, 'mil');
      near(thrust(100, ALT[j], MACH[i]), MAX[i][j], 1e-9, 'max');
      near(thrust(25, ALT[j], MACH[i]), 0.5 * (IDLE[i][j] + MIL[i][j]), 1e-9, 'half dry');
      near(thrust(75, ALT[j], MACH[i]), 0.5 * (MIL[i][j] + MAX[i][j]), 1e-9, 'half AB');
    }
  }
});

test('thrust extrapolates linearly in Mach to 2.2 and clamps altitude', () => {
  near(thrust(100, 40000, 2.0), 8642 + 5 * (8642 - 6860), 1e-9);   // about 17,500 lb
  assert.equal(thrust(100, 40000, 2.5), thrust(100, 40000, 2.2));
  assert.equal(thrust(100, 60000, 0.5), thrust(100, 50000, 0.5));
  assert.equal(thrust(100, -100, 0.5), thrust(100, 0, 0.5));
  assert.equal(thrust(100, 0, -0.1), thrust(100, 0, 0));
});
