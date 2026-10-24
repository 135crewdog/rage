// Finite-difference linearisation of the closed loop (airframe, actuators,
// engine and FCS) about a trimmed flight condition, and the eigenvalues of the
// result, so the short-period, roll and dutch-roll modes can be read off.
// Test tooling only; the game never needs it.

import { Simulation, DT } from '../../src/sim/simulation.js';
import { IX } from '../../src/sim/dynamics.js';

const FCS_KEYS = ['ncmd', 'I', 'alphaFilt', 'qWash', 'pcmd', 'rollI', 'rWash'];

// Longitudinal and lateral subsets of the closed-loop state. In wings-level
// flight the two decouple, which keeps the spurious quaternion-norm direction
// and the position integrators out of the way.
export const LONGITUDINAL = {
  dyn: { u: IX.U, w: IX.W, q: IX.Q, q0: IX.Q0, q2: IX.Q2, el: IX.EL },
  fcs: ['ncmd', 'I', 'alphaFilt', 'qWash'],
};
export const LATERAL = {
  dyn: { v: IX.V, p: IX.P, r: IX.R, q1: IX.Q1, q3: IX.Q3, ail: IX.AIL, rdr: IX.RDR },
  fcs: ['pcmd', 'rollI', 'rWash'],
};

function pack(sim, subset) {
  const z = [];
  for (const k of Object.keys(subset.dyn)) z.push(sim.state[subset.dyn[k]]);
  for (const k of subset.fcs) z.push(sim.fcs[k]);
  return z;
}

function unpack(sim, subset, z) {
  let i = 0;
  for (const k of Object.keys(subset.dyn)) sim.state[subset.dyn[k]] = z[i++];
  for (const k of subset.fcs) sim.fcs[k] = z[i++];
}

// One closed-loop step from a perturbed state, returning the packed result.
function stepFrom(trim, subset, z) {
  const sim = new Simulation({ h: trim.h, kcas: trim.kcas });
  sim.state = Float64Array.from(trim.state);
  Object.assign(sim.fcs, trim.fcs);
  unpack(sim, subset, z);
  // refresh aux for the perturbed state so the FCS measures it
  sim.aux = sim.auxFor(sim.state, sim.controls);
  sim.step(trim.stick, trim.throttle);
  return pack(sim, subset);
}

// Discrete-time Jacobian of the one-step map by central differences, then the
// continuous-time equivalent A = log(Ad)/dt is not formed; eigenvalues are
// mapped with s = ln(λ)/dt instead.
export function linearize(h, kcas, subset) {
  const sim = new Simulation({ h, kcas });
  const trim = { h, kcas, state: Float64Array.from(sim.state), fcs: { ...sim.fcs }, stick: sim.trimStick, throttle: sim.trimThrottle };
  const z0 = pack(sim, subset);
  const n = z0.length;
  const names = [...Object.keys(subset.dyn), ...subset.fcs];
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const eps = 1e-5 * Math.max(1, Math.abs(z0[j]));
    const zp = z0.slice(); zp[j] += eps;
    const zm = z0.slice(); zm[j] -= eps;
    const fp = stepFrom(trim, subset, zp), fm = stepFrom(trim, subset, zm);
    for (let i = 0; i < n; i++) A[i][j] = (fp[i] - fm[i]) / (2 * eps);
  }
  const eig = eigenvalues(A).map(({ re, im }) => {
    // s = ln(λ)/dt for the discrete eigenvalue λ
    const mag = Math.hypot(re, im), ang = Math.atan2(im, re);
    return { re: Math.log(Math.max(mag, 1e-300)) / DT, im: ang / DT };
  });
  return { names, A, eig };
}

// Typical size of each state, so eigenvector components can be compared:
// velocities as fractions of VT (so they read as angles), surfaces and FCS
// angles in radians, rates in rad/s.
function scales(names, vt) {
  return names.map((n) => {
    if (n === 'u' || n === 'v' || n === 'w') return vt;
    if (n === 'el' || n === 'ail' || n === 'rdr' || n === 'I' || n === 'alphaFilt' || n === 'pcmd' || n === 'rollI') return 57.3;
    return 1;
  });
}

// Participation of each state in a mode (0..1): the scaled eigenvector from
// inverse iteration on the discrete Jacobian at the discrete eigenvalue
// λ = exp(s·dt); the 2n real form handles a complex λ.
export function participation(A, s, names, vt) {
  const n = A.length;
  const sc = scales(names, vt);
  const As = A.map((row, i) => row.map((v, j) => v * sc[j] / sc[i]));
  const mag = Math.exp(s.re * DT), lam = { re: mag * Math.cos(s.im * DT), im: mag * Math.sin(s.im * DT) };
  const shift = 1e-7;
  let x;
  if (Math.abs(lam.im) < 1e-12) {
    const M = As.map((row, i) => row.map((v, j) => v - (i === j ? lam.re + shift : 0)));
    x = solve(M, new Array(n).fill(1)).map(Math.abs);
  } else {
    const M = Array.from({ length: 2 * n }, () => new Array(2 * n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = As[i][j] - (i === j ? lam.re + shift : 0);
      M[i][j] = a; M[i + n][j + n] = a;
      if (i === j) { M[i][j + n] = lam.im; M[i + n][j] = -lam.im; }
    }
    const y = solve(M, new Array(2 * n).fill(1));
    x = y.slice(0, n).map((v, i) => Math.hypot(v, y[i + n]));
  }
  const m = Math.max(...x);
  return x.map((v) => v / m);
}

// Fly a +1 g stick step from trim and measure the n_z response: time to 90 %,
// overshoot, and an equivalent second-order fit (ω, ζ) by least squares.
export function gStep(h, kcas, T = 3) {
  const sim = new Simulation({ h, kcas });
  const x = Math.pow(0.1, 1 / 1.6);          // dn = 10·x^1.6 = 1 g
  const nz0 = sim.aux.nz;
  const t = [], y = [];
  while (sim.time < T && !sim.crashed) {
    sim.step({ pitch: sim.trimStick.pitch + x, roll: 0 }, sim.trimThrottle);
    t.push(sim.time); y.push(sim.aux.nz - nz0);
  }
  const final = 1;                            // the command is +1 g
  const t90 = t[y.findIndex((v) => v >= 0.9 * final)] ?? Infinity;
  const peak = Math.max(...y);
  const overshoot = Math.max(0, (peak - final) / final) * 100;
  // grid search for the best second-order step response fit
  let best = { err: Infinity };
  for (let wn = 1; wn <= 12; wn += 0.1) for (let z = 0.3; z <= 1.5; z += 0.02) {
    let err = 0;
    for (let i = 0; i < t.length; i += 4) {
      const m = secondOrderStep(wn, z, t[i]);
      err += (m - y[i]) ** 2;
    }
    if (err < best.err) best = { err, wn, zeta: z };
  }
  return { t90, overshoot, wn: best.wn, zeta: best.zeta, rms: Math.sqrt(best.err / (t.length / 4)) };
}

function secondOrderStep(wn, z, t) {
  if (z < 1) {
    const wd = wn * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
  }
  const s1 = -wn * (z - Math.sqrt(z * z - 1)), s2 = -wn * (z + Math.sqrt(z * z - 1));
  if (Math.abs(s1 - s2) < 1e-9) return 1 - (1 - s1 * t) * Math.exp(s1 * t);
  return 1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1);
}

function solve(M, b) {
  const n = b.length;
  const A = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c] === 0 ? 1e-300 : A[c][c];
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const f = A[i][c] / d;
      if (f !== 0) for (let j = c; j <= n; j++) A[i][j] -= f * A[c][j];
    }
  }
  return A.map((row, i) => row[n] / (row[i] === 0 ? 1e-300 : row[i]));
}

// Mode descriptors for a list of eigenvalues: natural frequency, damping, time constant.
export function describe(e) {
  if (Math.abs(e.im) < 1e-6) return { kind: 'real', tau: -1 / e.re, re: e.re, im: 0 };
  const wn = Math.hypot(e.re, e.im);
  return { kind: 'pair', wn, zeta: -e.re / wn, re: e.re, im: Math.abs(e.im) };
}

// ---- eigenvalues of a real general matrix: Hessenberg reduction then shifted QR ----

export function eigenvalues(matrix) {
  const n = matrix.length;
  // 1-indexed working copy
  const a = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) a[i][j] = matrix[i - 1][j - 1];
  elmhes(a, n);
  const wr = new Array(n + 1).fill(0), wi = new Array(n + 1).fill(0);
  hqr(a, n, wr, wi);
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ re: wr[i], im: wi[i] });
  return out;
}

function elmhes(a, n) {
  for (let m = 2; m < n; m++) {
    let x = 0, i = m;
    for (let j = m; j <= n; j++) {
      if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
    }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; }
      for (let j = 1; j <= n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; }
    }
    if (x !== 0) {
      for (i = m + 1; i <= n; i++) {
        let y = a[i][m - 1];
        if (y !== 0) {
          y /= x;
          a[i][m - 1] = y;
          for (let j = m; j <= n; j++) a[i][j] -= y * a[m][j];
          for (let j = 1; j <= n; j++) a[j][m] += y * a[j][i];
        }
      }
    }
  }
}

const sign = (a, b) => (b >= 0 ? Math.abs(a) : -Math.abs(a));

function hqr(a, n, wr, wi) {
  let nn, m, l, k, j, its, i, mmin;
  let z = 0, y, x, w, v, u, t, s, r = 0, q = 0, p = 0, anorm = 0;
  for (i = 1; i <= n; i++) for (j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
  nn = n;
  t = 0;
  while (nn >= 1) {
    its = 0;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; }
      }
      x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t; wi[nn--] = 0;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('too many iterations in hqr');
          if (its === 10 || its === 20) {
            t += x;
            for (i = 1; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s; q /= s; r /= s;
            if (m === l) break;
            u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) { p /= x; q /= x; r /= x; }
            }
            s = sign(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else {
                a[k][k - 1] = -s * x;
              }
              p += s;
              x = p / s; y = q / s; z = r / s;
              q /= p; r /= p;
              for (j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              mmin = nn < k + 3 ? nn : k + 3;
              for (i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
}
