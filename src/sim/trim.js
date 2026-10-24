// Trim solver: steady flight states found by a damped Newton iteration on the
// equations of motion. Used by the tests (docs/flight-model.md 12.1 and 12.3)
// and by the air start. Degrees in and out for angles the caller sets; the
// state itself is in radians.

import { makeState, derivative, IX, N, D2R } from './dynamics.js';
import { tgear } from './engine.js';
import { XCG } from './data/aircraft.js';

// A steady, level (γ = 0), zero-sideslip flight condition turning at psidot
// (rad/s). Returns the state, the controls, the derivative and the aux values.
// Surfaces are set directly in the state; the actuators are not in the loop.
export function steadyFlight({ vt, h, alpha, el, ail = 0, rdr = 0, phi = 0, psidot = 0, throttle, xcg = XCG }) {
  const a = alpha * D2R;
  const theta = Math.atan(Math.cos(phi) * Math.tan(a));     // γ = 0 with β = 0
  const x = makeState({
    vt, alpha: a, phi, theta, h,
    p: -psidot * Math.sin(theta),
    q: psidot * Math.cos(theta) * Math.sin(phi),
    r: psidot * Math.cos(theta) * Math.cos(phi),
    pow: tgear(throttle), el, ail, rdr,
  });
  const controls = { throttle, el, ail, rdr };
  const xdot = new Float64Array(N);
  const aux = derivative(x, controls, xdot, xcg);
  return { x, controls, xdot, aux };
}

// Damped Newton with finite-difference Jacobian. f maps an array of unknowns
// to an array of residuals of the same length. Returns { x, residual, ok }.
export function newton(f, x0, { tol = 1e-9, maxIter = 60, fdStep = 1e-6 } = {}) {
  let x = x0.slice();
  let r = f(x);
  const n = x.length;
  const norm = (v) => Math.max(...v.map(Math.abs));
  let rn = norm(r);
  for (let iter = 0; iter < maxIter && rn > tol; iter++) {
    // Jacobian by forward differences
    const J = [];
    for (let j = 0; j < n; j++) {
      const xp = x.slice();
      const hj = fdStep * Math.max(1, Math.abs(x[j]));
      xp[j] += hj;
      const rp = f(xp);
      J.push(rp.map((v, i) => (v - r[i]) / hj));   // column j
    }
    const dx = solveLinear(J, r.map((v) => -v), n);
    if (!dx) break;
    // backtracking line search on the residual norm
    let lambda = 1;
    let accepted = false;
    for (let k = 0; k < 12; k++) {
      const xn = x.map((v, i) => v + lambda * dx[i]);
      const rNew = f(xn);
      const rnNew = norm(rNew);
      if (Number.isFinite(rnNew) && rnNew < rn) {
        x = xn; r = rNew; rn = rnNew; accepted = true;
        break;
      }
      lambda *= 0.5;
    }
    if (!accepted) break;
  }
  return { x, residual: r, ok: rn <= tol };
}

// Solve A·dx = b where A is given by columns. Gaussian elimination with pivoting.
function solveLinear(cols, b, n) {
  const A = [];
  for (let i = 0; i < n; i++) {
    A.push([]);
    for (let j = 0; j < n; j++) A[i].push(cols[j][i]);
    A[i].push(b[i]);
  }
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
    if (Math.abs(A[piv][c]) < 1e-14) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const m = A[i][c] / A[c][c];
      for (let j = c; j <= n; j++) A[i][j] -= m * A[c][j];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

// Generic steady-flight trim. `fixed` holds the known quantities (vt, h,
// throttle, alpha, el, ail, rdr, phi, psidot, nz, xcg); `free` names the
// unknowns with starting guesses; `zero` lists the residuals to drive to zero,
// from: udot vdot wdot pdot qdot rdot, nz (n_z − fixed.nz), and normal (the
// acceleration normal to the flight path in the plane of symmetry,
// ẇ·cosα − u̇·sinα, which is zero when α holds steady while speed may bleed).
export function trim(fixed, free, zero) {
  const names = Object.keys(free);
  const key = { udot: IX.U, vdot: IX.V, wdot: IX.W, pdot: IX.P, qdot: IX.Q, rdot: IX.R };
  const build = (vals) => {
    const c = { ...fixed };
    names.forEach((k, i) => { c[k] = vals[i]; });
    return steadyFlight(c);
  };
  const f = (vals) => {
    const { xdot, aux } = build(vals);
    return zero.map((z) => {
      if (z === 'nz') return aux.nz - fixed.nz;
      if (z === 'normal') return xdot[IX.W] * Math.cos(aux.alpha) - xdot[IX.U] * Math.sin(aux.alpha);
      return xdot[key[z]];
    });
  };
  const sol = newton(f, names.map((k) => free[k]));
  const out = { ...fixed };
  names.forEach((k, i) => { out[k] = sol.x[i]; });
  const flight = build(sol.x);
  return { ...out, ok: sol.ok, residual: sol.residual, state: flight.x, controls: flight.controls, aux: flight.aux };
}

// Wings-level 1 g flight at a given speed and height: throttle, α (deg), el (deg).
export function trimLevel(vt, h, guess = {}) {
  const alpha0 = guess.alpha ?? Math.min(20, Math.max(0, 1.4e5 / (vt * vt)));
  return trim(
    { vt, h, xcg: guess.xcg ?? XCG },
    { throttle: guess.throttle ?? 0.3, alpha: alpha0, el: guess.el ?? 0 },
    ['udot', 'wdot', 'qdot'],
  );
}

// A steady level turn at full (or given) throttle: the turn rate the jet can
// sustain with thrust equal to drag. Unknowns α, el, φ, ail, rdr, ψ̇.
export function trimSustainedTurn(vt, h, throttle = 1, guess = {}) {
  return trim(
    { vt, h, throttle },
    { alpha: guess.alpha ?? 8, el: guess.el ?? -2, phi: guess.phi ?? 1.0, ail: 0, rdr: 0, psidot: guess.psidot ?? 0.2 },
    ['udot', 'vdot', 'wdot', 'pdot', 'qdot', 'rdot'],
  );
}

// A level turn at a given load factor with speed free to bleed: the
// instantaneous turn. Along the flight path the jet may decelerate; normal to
// it, and in every rotation, it is steady. Unknowns α, el, φ, ail, rdr, ψ̇.
export function trimTurnAtLoad(vt, h, nz, guess = {}) {
  const phi0 = Math.acos(Math.min(1, 1 / Math.max(nz, 1)));
  return trim(
    { vt, h, throttle: guess.throttle ?? 1, nz },
    { alpha: guess.alpha ?? 8, el: guess.el ?? -2, phi: guess.phi ?? phi0, ail: 0, rdr: 0, psidot: guess.psidot ?? 0.2 },
    ['vdot', 'normal', 'pdot', 'qdot', 'rdot', 'nz'],
  );
}

// Level 1 g flight at a fixed throttle: the speed the jet settles at.
export function trimLevelAtThrottle(h, throttle, guess = {}) {
  return trim(
    { h, throttle },
    { vt: guess.vt ?? 1200, alpha: guess.alpha ?? 2, el: guess.el ?? -1 },
    ['udot', 'wdot', 'qdot'],
  );
}

// Level 1 g flight at a fixed angle of attack: the speed that needs it.
export function trimLevelAtAlpha(h, alpha, guess = {}) {
  return trim(
    { h, alpha },
    { vt: guess.vt ?? 200, throttle: guess.throttle ?? 0.5, el: guess.el ?? 0 },
    ['udot', 'wdot', 'qdot'],
  );
}
