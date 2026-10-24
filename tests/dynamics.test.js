import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, derivative, step, airOf, quaternionOf, crashed, IX, N, DT } from '../src/sim/dynamics.js';
import * as Quat from '../src/sim/quaternion.js';
import { tgear } from '../src/sim/engine.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg ?? ''} got ${a}, book ${b}, rel err ${Math.abs(a - b) / Math.abs(b)}`);

// Book check case, docs/f16-data.md section 6, Table 3.5-2.
test('book check case: all 13 derivatives within 1e-5 relative', () => {
  const x = makeState({
    vt: 500, alpha: 0.5, beta: -0.2, phi: -1, theta: 1, psi: -1,
    p: 0.7, q: -0.8, r: 0.9, north: 1000, east: 900, h: 10000, pow: 90,
    el: 20, ail: -15, rdr: -20,
  });
  const xdot = new Float64Array(N);
  derivative(x, { throttle: 0.9, el: 20, ail: -15, rdr: -20 }, xdot, 0.4);

  const u = x[IX.U], v = x[IX.V], w = x[IX.W];
  const ud = xdot[IX.U], vd = xdot[IX.V], wd = xdot[IX.W];
  const { vt, beta } = airOf(x);
  const vtdot = (u * ud + v * vd + w * wd) / vt;
  const alphadot = (u * wd - w * ud) / (u * u + w * w);
  const betadot = (vt * vd - v * vtdot) * Math.cos(beta) / (u * u + w * w);

  const p = x[IX.P], q = x[IX.Q], r = x[IX.R];
  const phi = -1, theta = 1;
  const phidot = p + Math.tan(theta) * (q * Math.sin(phi) + r * Math.cos(phi));
  const thetadot = q * Math.cos(phi) - r * Math.sin(phi);
  const psidot = (q * Math.sin(phi) + r * Math.cos(phi)) / Math.cos(theta);

  const got = {
    VTdot: vtdot, alphadot, betadot, phidot, thetadot, psidot,
    pdot: xdot[IX.P], qdot: xdot[IX.Q], rdot: xdot[IX.R],
    pndot: xdot[IX.NORTH], pedot: xdot[IX.EAST], hdot: xdot[IX.H], POWdot: xdot[IX.POW],
  };
  const book = {
    VTdot: -75.23724, alphadot: -0.8813491, betadot: -0.4759990,
    phidot: 2.505734, thetadot: 0.3250820, psidot: 2.145926,
    pdot: 12.62679, qdot: 0.9649671, rdot: 0.5809759,
    pndot: 342.4439, pedot: -266.7707, hdot: 248.1241, POWdot: -58.68999,
  };
  console.log('  book check case (model | book):');
  for (const k of Object.keys(book)) {
    console.log(`    ${k.padEnd(9)} ${got[k].toFixed(6).padStart(12)} | ${book[k]}`);
    rel(got[k], book[k], 1e-5, k);
  }
});

// Sign tests of docs/flight-model.md section 2.3, open loop at 500 ft/s, 10,000 ft.
function trimmedish(over = {}) {
  return makeState({ vt: 500, alpha: 2 * Math.PI / 180, theta: 2 * Math.PI / 180, h: 10000, pow: 30, ...over });
}
function deriv(x, controls) {
  const xdot = new Float64Array(N);
  const aux = derivative(x, { throttle: 0.3, el: 0, ail: 0, rdr: 0, ...controls }, xdot);
  return { xdot, aux };
}

test('+el (trailing edge down) pitches nose down', () => {
  const a = deriv(trimmedish({ el: 0 }));
  const b = deriv(trimmedish({ el: 5 }));
  assert.ok(b.xdot[IX.Q] < a.xdot[IX.Q], `qdot ${b.xdot[IX.Q]} should be below ${a.xdot[IX.Q]}`);
  assert.ok(b.aux.coefficients.cm < a.aux.coefficients.cm);
});

test('+ail rolls left (Cl < 0, pdot < 0)', () => {
  const a = deriv(trimmedish({ ail: 0 }));
  const b = deriv(trimmedish({ ail: 5 }));
  assert.ok(b.xdot[IX.P] < a.xdot[IX.P]);
  assert.ok(b.aux.coefficients.cl < a.aux.coefficients.cl);
});

test('+rdr yaws nose left (Cn < 0, rdot < 0) with side force +y', () => {
  const a = deriv(trimmedish({ rdr: 0 }));
  const b = deriv(trimmedish({ rdr: 5 }));
  assert.ok(b.xdot[IX.R] < a.xdot[IX.R]);
  assert.ok(b.xdot[IX.V] > a.xdot[IX.V]);
  assert.ok(b.aux.ny > a.aux.ny);
});

test('positive α gives positive n_z and the drag-like CX; +β gives n_y < 0', () => {
  const a = deriv(trimmedish({ alpha: 5 * Math.PI / 180 }));
  assert.ok(a.aux.nz > 0);
  assert.ok(a.aux.coefficients.cx < 0);
  const b = deriv(trimmedish({ beta: 5 * Math.PI / 180 }));
  assert.ok(b.aux.ny < 0);
});

test('gravity in body axes matches the book\'s Euler form', () => {
  const x = makeState({ vt: 500, phi: 0.5, theta: -0.3, psi: 2, h: 5000 });
  const xdot = new Float64Array(N);
  derivative(x, { throttle: 0, el: 0, ail: 0, rdr: 0 }, xdot);
  const g = 32.17;
  // Remove the aero and kinematic terms by re-deriving with the aux accelerations.
  const { aux } = deriv(x);
  const u = x[IX.U], v = x[IX.V], w = x[IX.W], p = x[IX.P], q = x[IX.Q], r = x[IX.R];
  near(xdot[IX.U] - (r * v - q * w) - aux.ax, -g * Math.sin(-0.3), 1e-9, 'gx');
  near(xdot[IX.V] - (p * w - r * u) - aux.ay, g * Math.cos(-0.3) * Math.sin(0.5), 1e-9, 'gy');
  near(xdot[IX.W] - (q * u - p * v) - aux.az, g * Math.cos(-0.3) * Math.cos(0.5), 1e-9, 'gz');
});

// Integration.
const controls = { throttle: 0.5, el: -1, ail: 0, rdr: 0 };

test('the engine state follows the analytic exponential', () => {
  // Above 50 % both sides, POWdot = 5·(P1 − P3): an exponential with τ = 0.2 s.
  let x = makeState({ vt: 500, h: 10000, pow: 60 });
  const c = { throttle: 0.9, el: 0, ail: 0, rdr: 0 };
  const p1 = tgear(0.9);
  for (let i = 0; i < 120; i++) x = step(x, c).state;
  near(x[IX.POW], p1 + (60 - p1) * Math.exp(-5), 1e-6);
});

test('actuators: small commands follow the 0.0495 s lag, large ones the rate limit', () => {
  let x = makeState({ vt: 500, h: 10000 });
  const small = { throttle: 0.3, el: 1, ail: 0, rdr: 0 };
  const n = Math.round(0.0495 / DT);
  for (let i = 0; i < n; i++) x = step(x, small).state;
  near(x[IX.EL], 1 - Math.exp(-n * DT / 0.0495), 1e-5, 'lag');

  x = makeState({ vt: 500, h: 10000 });
  const big = { throttle: 0.3, el: 20, ail: 20, rdr: 30 };
  for (let i = 0; i < 12; i++) x = step(x, big).state;   // 0.1 s
  near(x[IX.EL], 6, 1e-9, 'el 60°/s');
  near(x[IX.AIL], 8, 1e-9, 'ail 80°/s');
  near(x[IX.RDR], 12, 1e-9, 'rdr 120°/s');

  x = makeState({ vt: 500, h: 10000 });
  const over = { throttle: 0.3, el: 40, ail: -40, rdr: 50 };
  for (let i = 0; i < 240; i++) x = step(x, over).state;
  near(x[IX.EL], 25, 1e-6, 'el limit');
  near(x[IX.AIL], -21.5, 1e-6, 'ail limit');
  near(x[IX.RDR], 30, 1e-6, 'rdr limit');
});

test('the step is fourth order: halving dt cuts the error by about 16', () => {
  const x0 = makeState({ vt: 500, alpha: 0.05, theta: 0.05, h: 10000, pow: 30, p: 0.3, q: 0.1, r: -0.2 });
  const run = (dt, t) => {
    let x = x0;
    const n = Math.round(t / dt);
    for (let i = 0; i < n; i++) x = step(x, controls, dt).state;
    return x;
  };
  const T = 0.5;
  const ref = run(T / 2000, T);
  const err = (dt) => {
    const x = run(dt, T);
    let e = 0;
    for (const i of [IX.U, IX.V, IX.W, IX.P, IX.Q, IX.R]) e = Math.max(e, Math.abs(x[i] - ref[i]));
    return e;
  };
  const e1 = err(T / 25), e2 = err(T / 50);
  const ratio = e1 / e2;
  console.log(`  RK4 error ratio for halved dt: ${ratio.toFixed(1)} (16 is fourth order)`);
  assert.ok(ratio > 10 && ratio < 24, `ratio ${ratio}`);
});

test('the quaternion stays normalised and the Euler angles stay sane through a loop-like pitch', () => {
  let x = makeState({ vt: 600, h: 10000, pow: 50, q: 0.6 });
  for (let i = 0; i < 600; i++) {
    x = step(x, { throttle: 0.77, el: -5, ail: 0, rdr: 0 }).state;
    near(Math.hypot(...quaternionOf(x)), 1, 1e-12);
    const e = Quat.toEuler(quaternionOf(x));
    assert.ok(Number.isFinite(e.theta));
  }
});

test('determinism: two identical runs agree bit for bit', () => {
  const run = () => {
    let x = makeState({ vt: 500, alpha: 0.03, theta: 0.03, h: 10000, pow: 40 });
    const out = [];
    for (let i = 0; i < 600; i++) {
      const el = -2 * Math.sin(i / 50), ail = 3 * Math.cos(i / 70);
      x = step(x, { throttle: 0.6 + 0.3 * Math.sin(i / 90), el, ail, rdr: 0 }).state;
      out.push(x);
    }
    return out;
  };
  const a = run(), b = run();
  for (let i = 0; i < a.length; i++) {
    for (let k = 0; k < N; k++) assert.equal(a[i][k], b[i][k]);
  }
});

test('far outside the data: no NaN, and outOfEnvelope is flagged', () => {
  // Flying backwards and sideways with wild rates.
  let x = makeState({ vt: 300, alpha: 170 * Math.PI / 180, beta: 40 * Math.PI / 180, h: 20000, pow: 100, p: 5, q: 4, r: -3 });
  let flagged = false;
  for (let i = 0; i < 1200; i++) {
    const s = step(x, { throttle: 1, el: 25, ail: -21.5, rdr: 30 });
    x = s.state;
    if (s.aux.outOfEnvelope) flagged = true;
    for (let k = 0; k < N; k++) assert.ok(Number.isFinite(x[k]), `state ${k} at step ${i}`);
  }
  assert.ok(flagged);
  // and the ordinary envelope does not trip it
  const ok = step(makeState({ vt: 500, alpha: 0.2, h: 10000 }), controls).aux;
  assert.equal(ok.outOfEnvelope, false);
  const low = step(makeState({ vt: 500, alpha: -0.3, h: 10000 }), controls).aux;   // −17°
  assert.equal(low.outOfEnvelope, true);
});

test('below the ground the flight is over', () => {
  let x = makeState({ vt: 500, theta: -0.3, alpha: 0.02, h: 50, pow: 30 });
  let t = 0;
  while (!crashed(x) && t < 5) { x = step(x, controls).state; t += DT; }
  assert.ok(crashed(x));
  assert.ok(t < 1);
});
