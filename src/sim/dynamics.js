// The equations of motion, docs/flight-model.md section 4: rigid body, six
// degrees of freedom, constant mass, flat non-rotating earth, integrated at a
// fixed 120 Hz with fourth-order Runge-Kutta. Pure functions over a flat
// Float64Array state so every step is deterministic.

import { atmosphere } from './atmosphere.js';
import { coefficients } from './aero.js';
import { tgear, pdot, thrust as engineThrust } from './engine.js';
import { surfaceRate, clampSurface } from './actuators.js';
import * as Quat from './quaternion.js';
import { G, RM, S, B, CBAR, XCG, HX, C1, C2, C3, C4, C5, C6, C7, C8, C9, ALPHA_ENVELOPE, BETA_DATA } from './data/aircraft.js';

export const DT = 1 / 120;
const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

// State layout. Velocities ft/s, rates rad/s, position ft, POW %, surfaces deg.
export const IX = Object.freeze({
  U: 0, V: 1, W: 2,
  Q0: 3, Q1: 4, Q2: 5, Q3: 6,
  P: 7, Q: 8, R: 9,
  NORTH: 10, EAST: 11, H: 12,
  POW: 13,
  EL: 14, AIL: 15, RDR: 16,
});
export const N = 17;

// Build a state from flight-style quantities. vt ft/s; alpha, beta, phi,
// theta, psi in radians; the rest as in the state. Anything omitted is zero.
export function makeState({
  vt, alpha = 0, beta = 0, phi = 0, theta = 0, psi = 0,
  p = 0, q = 0, r = 0, north = 0, east = 0, h = 0, pow = 0, el = 0, ail = 0, rdr = 0,
}) {
  const x = new Float64Array(N);
  x[IX.U] = vt * Math.cos(alpha) * Math.cos(beta);
  x[IX.V] = vt * Math.sin(beta);
  x[IX.W] = vt * Math.sin(alpha) * Math.cos(beta);
  const Q = Quat.fromEuler(phi, theta, psi);
  x[IX.Q0] = Q[0]; x[IX.Q1] = Q[1]; x[IX.Q2] = Q[2]; x[IX.Q3] = Q[3];
  x[IX.P] = p; x[IX.Q] = q; x[IX.R] = r;
  x[IX.NORTH] = north; x[IX.EAST] = east; x[IX.H] = h;
  x[IX.POW] = pow; x[IX.EL] = el; x[IX.AIL] = ail; x[IX.RDR] = rdr;
  return x;
}

export function quaternionOf(x) {
  return [x[IX.Q0], x[IX.Q1], x[IX.Q2], x[IX.Q3]];
}

// VT (ft/s), α and β (radians) from u, v, w. VT is guarded against zero.
export function airOf(x) {
  const u = x[IX.U], v = x[IX.V], w = x[IX.W];
  const vt = Math.max(Math.hypot(u, v, w), 1e-6);
  let sb = v / vt;
  if (sb > 1) sb = 1; else if (sb < -1) sb = -1;
  return { vt, alpha: Math.atan2(w, u), beta: Math.asin(sb) };
}

// State derivative. controls = { throttle 0..1, el, ail, rdr commanded deg }.
// Surfaces act from their positions in the state; the commands only drive the
// actuators. Writes into xdot and returns the auxiliary quantities.
export function derivative(x, controls, xdot, xcg = XCG) {
  const u = x[IX.U], v = x[IX.V], w = x[IX.W];
  const p = x[IX.P], q = x[IX.Q], r = x[IX.R];
  const h = x[IX.H], pow = x[IX.POW];
  const el = x[IX.EL], ail = x[IX.AIL], rdr = x[IX.RDR];
  const Q = quaternionOf(x);

  const { vt, alpha, beta } = airOf(x);
  const alphaDeg = alpha * R2D, betaDeg = beta * R2D;
  const atm = atmosphere(vt, h);
  const qbar = atm.qbar, mach = atm.mach;

  const c = coefficients({ alpha: alphaDeg, beta: betaDeg, el, ail, rdr, p, q, r, vt, xcg, mach });
  const thrust = engineThrust(pow, h, mach);

  // Gravity in body axes: the last row of the NED→body rotation times g.
  const gx = G * 2 * (Q[1] * Q[3] - Q[0] * Q[2]);
  const gy = G * 2 * (Q[2] * Q[3] + Q[0] * Q[1]);
  const gz = G * (Q[0] * Q[0] - Q[1] * Q[1] - Q[2] * Q[2] + Q[3] * Q[3]);

  const qs = qbar * S;
  const ax = RM * (qs * c.cx + thrust);
  const ay = RM * qs * c.cy;
  const az = RM * qs * c.cz;

  xdot[IX.U] = r * v - q * w + gx + ax;
  xdot[IX.V] = p * w - r * u + gy + ay;
  xdot[IX.W] = q * u - p * v + gz + az;

  const qsb = qs * B;
  xdot[IX.P] = (C2 * p + C1 * r + C4 * HX) * q + qsb * (C3 * c.cl + C4 * c.cn);
  xdot[IX.Q] = (C5 * p - C7 * HX) * r + C6 * (r * r - p * p) + qs * CBAR * C7 * c.cm;
  xdot[IX.R] = (C8 * p - C2 * r + C9 * HX) * q + qsb * (C4 * c.cl + C9 * c.cn);

  const qd = Quat.derivative(Q, p, q, r);
  xdot[IX.Q0] = qd[0]; xdot[IX.Q1] = qd[1]; xdot[IX.Q2] = qd[2]; xdot[IX.Q3] = qd[3];

  const vned = Quat.bodyToNed(Q, [u, v, w]);
  xdot[IX.NORTH] = vned[0];
  xdot[IX.EAST] = vned[1];
  xdot[IX.H] = -vned[2];

  xdot[IX.POW] = pdot(pow, tgear(controls.throttle));
  xdot[IX.EL] = surfaceRate('el', controls.el, el);
  xdot[IX.AIL] = surfaceRate('ail', controls.ail, ail);
  xdot[IX.RDR] = surfaceRate('rdr', controls.rdr, rdr);

  return {
    vt, alpha, beta, mach, qbar, thrust,
    alphaDeg, betaDeg,
    nz: -qs * c.cz * RM / G,       // accelerometer load factor, +1 in level flight
    ny: qs * c.cy * RM / G,
    ax, ay, az,                     // aerodynamic plus thrust accelerations, body axes
    coefficients: c,
    outOfEnvelope: alphaDeg < ALPHA_ENVELOPE[0] || alphaDeg > ALPHA_ENVELOPE[1]
      || betaDeg < BETA_DATA[0] || betaDeg > BETA_DATA[1],
  };
}

const k1 = new Float64Array(N), k2 = new Float64Array(N), k3 = new Float64Array(N), k4 = new Float64Array(N);
const xt = new Float64Array(N);

// One RK4 step. Returns the new state (a fresh array) and the auxiliary
// quantities evaluated at the start of the step.
export function step(x, controls, dt = DT, xcg = XCG) {
  const aux = derivative(x, controls, k1, xcg);
  for (let i = 0; i < N; i++) xt[i] = x[i] + 0.5 * dt * k1[i];
  derivative(xt, controls, k2, xcg);
  for (let i = 0; i < N; i++) xt[i] = x[i] + 0.5 * dt * k2[i];
  derivative(xt, controls, k3, xcg);
  for (let i = 0; i < N; i++) xt[i] = x[i] + dt * k3[i];
  derivative(xt, controls, k4, xcg);
  const y = new Float64Array(N);
  for (let i = 0; i < N; i++) y[i] = x[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);

  const Q = Quat.normalize(quaternionOf(y));
  y[IX.Q0] = Q[0]; y[IX.Q1] = Q[1]; y[IX.Q2] = Q[2]; y[IX.Q3] = Q[3];
  y[IX.EL] = clampSurface('el', y[IX.EL]);
  y[IX.AIL] = clampSurface('ail', y[IX.AIL]);
  y[IX.RDR] = clampSurface('rdr', y[IX.RDR]);
  if (y[IX.POW] < 0) y[IX.POW] = 0; else if (y[IX.POW] > 100) y[IX.POW] = 100;
  return { state: y, aux };
}

// Below the ground the flight is over.
export function crashed(x) {
  return x[IX.H] <= 0;
}

export { D2R, R2D };
