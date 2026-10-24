import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coefficients, dragRise } from '../src/sim/aero.js';
import * as T from '../src/sim/data/aero.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const still = { p: 0, q: 0, r: 0, vt: 500, xcg: 0.35, mach: 0.3 };

test('grid points return the table cells', () => {
  for (let i = 0; i < T.ALPHA.length; i++) {
    for (let j = 0; j < T.EL.length; j++) {
      const c = coefficients({ ...still, alpha: T.ALPHA[i], beta: 0, el: T.EL[j], ail: 0, rdr: 0 });
      near(c.cx, T.CX[j][i], 1e-12, 'CX');
      near(c.cm, T.CM[j][i], 1e-12, 'CM');
      near(c.cz, T.CZ0[i] - 0.19 * T.EL[j] / 25, 1e-12, 'CZ');
    }
    for (let k = 0; k < T.BETA_ABS.length; k++) {
      const c = coefficients({ ...still, alpha: T.ALPHA[i], beta: T.BETA_ABS[k], el: 0, ail: 0, rdr: 0 });
      near(c.cl, T.CL[k][i], 1e-12, 'CL');
      near(c.cn, T.CN[k][i], 1e-12, 'CN');
    }
  }
});

test('Cl and Cn flip sign with β; CY is linear in β', () => {
  const pos = coefficients({ ...still, alpha: 12, beta: 8, el: 0, ail: 0, rdr: 0 });
  const neg = coefficients({ ...still, alpha: 12, beta: -8, el: 0, ail: 0, rdr: 0 });
  near(pos.cl, -neg.cl, 1e-12);
  near(pos.cn, -neg.cn, 1e-12);
  near(pos.cy, -0.02 * 8, 1e-12);
  near(neg.cy, 0.02 * 8, 1e-12);
});

test('control tables use signed β and the book normalisations (ail/20, rdr/30)', () => {
  const base = coefficients({ ...still, alpha: 10, beta: -20, el: 0, ail: 0, rdr: 0 });
  const a = coefficients({ ...still, alpha: 10, beta: -20, el: 0, ail: 20, rdr: 0 });
  const r = coefficients({ ...still, alpha: 10, beta: -20, el: 0, ail: 0, rdr: 30 });
  // β = -20 is row 1 of the signed tables, α = 10 is column 4
  near(a.cl - base.cl, T.DLDA[1][4], 1e-12, 'DLDA');
  near(a.cn - base.cn, T.DNDA[1][4], 1e-12, 'DNDA');
  near(a.cy - base.cy, 0.021, 1e-12, 'CY ail');
  near(r.cl - base.cl, T.DLDR[1][4], 1e-12, 'DLDR');
  near(r.cn - base.cn, T.DNDR[1][4], 1e-12, 'DNDR');
  near(r.cy - base.cy, 0.086, 1e-12, 'CY rdr');
});

test('CG transfer uses the damped CZ and CY', () => {
  const q = 0.5, vt = 400;
  const c = coefficients({ alpha: 5, beta: 5, el: 0, ail: 0, rdr: 0, p: 0, q, r: 0.2, vt, xcg: 0.30, mach: 0.3 });
  const c0 = coefficients({ alpha: 5, beta: 5, el: 0, ail: 0, rdr: 0, p: 0, q, r: 0.2, vt, xcg: 0.35, mach: 0.3 });
  // moving the CG forward adds (xcgr - xcg) * damped cz to cm
  near(c.cm - c0.cm, c.cz * 0.05, 1e-12);
  near(c.cn - c0.cn, -c.cy * 0.05 * 11.32 / 30, 1e-12);
  // and the damped cz includes the CZq term: cz - cz_static = CZq * cbar*q/(2 VT)
  const cs = coefficients({ ...still, alpha: 5, beta: 5, el: 0, ail: 0, rdr: 0 });
  near(c.cz - cs.cz, -31.4 * 11.32 * q * 0.5 / vt, 1e-12);
});

test('drag rise is zero below Mach 0.85, 0.029 above 1.05, smooth between', () => {
  assert.equal(dragRise(0), 0);
  assert.equal(dragRise(0.85), 0);
  near(dragRise(0.95), 0.0145, 1e-12);
  assert.equal(dragRise(1.05), 0.029);
  assert.equal(dragRise(2.0), 0.029);
  // monotone and C1 at the ends
  let prev = 0;
  for (let m = 0.85; m <= 1.05; m += 0.01) { const d = dragRise(m); assert.ok(d >= prev); prev = d; }
  near(dragRise(0.851) - dragRise(0.85), 0, 1e-5);
  near(dragRise(1.05) - dragRise(1.049), 0, 1e-5);
});

test('drag rise points along the velocity vector', () => {
  const slow = { ...still, mach: 0.5 };
  const fast = { ...still, mach: 1.5 };
  const a0 = coefficients({ ...slow, alpha: 0, beta: 0, el: 0, ail: 0, rdr: 0 });
  const a1 = coefficients({ ...fast, alpha: 0, beta: 0, el: 0, ail: 0, rdr: 0 });
  near(a1.cx - a0.cx, -0.029, 1e-12);
  near(a1.cz - a0.cz, 0, 1e-12);
  const b0 = coefficients({ ...slow, alpha: 10, beta: 5, el: 0, ail: 0, rdr: 0 });
  const b1 = coefficients({ ...fast, alpha: 10, beta: 5, el: 0, ail: 0, rdr: 0 });
  const D2R = Math.PI / 180;
  near(b1.cx - b0.cx, -0.029 * Math.cos(10 * D2R) * Math.cos(5 * D2R), 1e-12);
  near(b1.cy - b0.cy, -0.029 * Math.sin(5 * D2R), 1e-12);
  near(b1.cz - b0.cz, -0.029 * Math.sin(10 * D2R) * Math.cos(5 * D2R), 1e-12);
  // the extra force has the magnitude of ΔCD
  const d = [b1.cx - b0.cx, b1.cy - b0.cy, b1.cz - b0.cz];
  near(Math.hypot(...d), 0.029, 1e-12);
});
