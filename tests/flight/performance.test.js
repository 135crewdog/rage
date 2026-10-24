// docs/flight-model.md 12.3: the model's performance next to the real F-16's
// published bands. Static: the trim solver plus the limiter schedule, not a
// closed-loop flight. Clean jet, model weight, xcg 0.35.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimSustainedTurn, trimTurnAtLoad, trimLevelAtThrottle, trimLevelAtAlpha } from '../../src/sim/trim.js';
import { calibratedAirspeed, FT_PER_S_PER_KNOT } from '../../src/sim/airdata.js';
import { atmosphere } from '../../src/sim/atmosphere.js';

const R2D = 180 / Math.PI;
const kcas = (vt, h) => calibratedAirspeed(vt, h) / FT_PER_S_PER_KNOT;

// The AoA/g limiter schedule of docs/flight-model.md 8.2, static form: the
// most g full aft stick gives at this AoA. 9 g to 15°, 7.3 g at 20°, 1 g at 25°.
// Milestone 1b moves this into the FCS module and the test imports it from there.
function limiterLoad(alphaDeg) {
  return 9 - 0.34 * Math.max(0, alphaDeg - 15) - 0.92 * Math.max(0, alphaDeg - 20);
}

// The most g the limiter allows at this speed: the n where n = min(9, limiter(α(n))).
function maxLoad(vt, h) {
  let lo = 1, hi = 9, best = null;
  let guess = {};
  for (let i = 0; i < 40; i++) {
    const n = 0.5 * (lo + hi);
    const t = trimTurnAtLoad(vt, h, n, guess);
    if (!t.ok) { hi = n; continue; }
    guess = { alpha: t.alpha, el: t.el, phi: t.phi, psidot: t.psidot };
    if (n <= limiterLoad(t.alpha)) { lo = n; best = t; } else hi = n;
  }
  return best;
}

// The turn rate the jet can hold at full afterburner, capped by the limiter.
function sustainedRate(vt, h, guess) {
  const t = trimSustainedTurn(vt, h, 1, guess);
  if (!t.ok) return null;
  const allowed = Math.min(9, limiterLoad(t.alpha));
  if (t.aux.nz <= allowed) return { rate: t.psidot * R2D, nz: t.aux.nz, alpha: t.alpha, t, limited: false };
  const lim = maxLoad(vt, h);
  return lim ? { rate: lim.psidot * R2D, nz: lim.aux.nz, alpha: lim.alpha, t: lim, limited: true } : null;
}

function bestOver(speeds, f) {
  let best = null;
  for (const vt of speeds) {
    const r = f(vt);
    if (r && (!best || r.rate > best.rate)) best = { ...r, vt };
  }
  return best;
}

const range = (a, b, step) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step);

const rows = [];
function record(check, band, value, text, pass) {
  rows.push({ check, band, text, pass });
  assert.ok(pass, `${check}: ${text}, band ${band}`);
}

test('max sustained turn, sea level, max afterburner: 19–22.5 °/s', () => {
  let guess = {};
  const best = bestOver(range(500, 1000, 10), (vt) => {
    const r = sustainedRate(vt, 0, guess);
    if (r && !r.limited) guess = { alpha: r.t.alpha, el: r.t.el, phi: r.t.phi, psidot: r.t.psidot };
    return r;
  });
  const mach = atmosphere(best.vt, 0).mach;
  record('Max sustained turn, sea level, max AB', '19–22.5 °/s',
    best.rate, `${best.rate.toFixed(1)} °/s at Mach ${mach.toFixed(2)} (${kcas(best.vt, 0).toFixed(0)} KCAS, ${best.nz.toFixed(1)} g, α ${best.alpha.toFixed(1)}°)`,
    best.rate >= 19 && best.rate <= 22.5);
});

test('max sustained turn, 15,000 ft: 12.5–15.5 °/s', () => {
  let guess = {};
  const best = bestOver(range(500, 1000, 10), (vt) => {
    const r = sustainedRate(vt, 15000, guess);
    if (r && !r.limited) guess = { alpha: r.t.alpha, el: r.t.el, phi: r.t.phi, psidot: r.t.psidot };
    return r;
  });
  const mach = atmosphere(best.vt, 15000).mach;
  record('Max sustained turn, 15,000 ft', '12.5–15.5 °/s',
    best.rate, `${best.rate.toFixed(1)} °/s at Mach ${mach.toFixed(2)} (${kcas(best.vt, 15000).toFixed(0)} KCAS, ${best.nz.toFixed(1)} g, α ${best.alpha.toFixed(1)}°)`,
    best.rate >= 12.5 && best.rate <= 15.5);
});

// The slowest speed at which the limiter still allows 9 g.
function cornerSpeed(h) {
  let lo = 300, hi = 1100, t = null;
  for (let i = 0; i < 30; i++) {
    const vt = 0.5 * (lo + hi);
    const c = maxLoad(vt, h);
    if (c && c.aux.nz >= 8.99) { hi = vt; t = c; } else lo = vt;
  }
  return { vt: hi, rate: t.psidot * R2D };
}

// The best turn the limiter allows at any speed, speed free to bleed.
function instantaneous(h) {
  const best = bestOver(range(300, 1000, 10), (vt) => {
    const t = maxLoad(vt, h);
    return t ? { rate: t.psidot * R2D, nz: t.aux.nz, alpha: t.alpha } : null;
  });
  const corner = cornerSpeed(h);
  return { ...best, text: `${best.rate.toFixed(1)} °/s at ${kcas(best.vt, h).toFixed(0)} KCAS (${best.nz.toFixed(1)} g, α ${best.alpha.toFixed(1)}°); at the 9 g corner ${corner.rate.toFixed(1)} °/s at ${kcas(corner.vt, h).toFixed(0)} KCAS` };
}

test('max instantaneous turn, 15,000 ft: 17–21 °/s', () => {
  const best = instantaneous(15000);
  record('Max instantaneous turn, 15,000 ft', '17–21 °/s', best.rate, best.text, best.rate >= 17 && best.rate <= 21);
});

test('max instantaneous turn, sea level: 23–27 °/s', () => {
  const best = instantaneous(0);
  record('Max instantaneous turn, sea level', '23–27 °/s', best.rate, best.text, best.rate >= 23 && best.rate <= 27);
});

test('corner speed: 330–450 KCAS', () => {
  const sl = cornerSpeed(0), up = cornerSpeed(15000);
  const v = kcas(sl.vt, 0);
  record('Corner speed', '330–450 KCAS', v,
    `${v.toFixed(0)} KCAS at sea level, ${kcas(up.vt, 15000).toFixed(0)} KCAS at 15,000 ft`,
    v >= 330 && v <= 450);
});

test('max level speed, sea level: Mach 1.15–1.25', () => {
  const t = trimLevelAtThrottle(0, 1, { vt: 1300 });
  assert.ok(t.ok, `residual ${t.residual}`);
  const m = atmosphere(t.vt, 0).mach;
  record('Max level speed, sea level', 'Mach 1.15–1.25', m,
    `Mach ${m.toFixed(2)} (${kcas(t.vt, 0).toFixed(0)} KCAS, thrust ${t.aux.thrust.toFixed(0)} lb)`,
    m >= 1.15 && m <= 1.25);
});

test('max level speed, 40,000 ft: Mach 1.9–2.1', () => {
  const t = trimLevelAtThrottle(40000, 1, { vt: 1900 });
  assert.ok(t.ok, `residual ${t.residual}`);
  const m = atmosphere(t.vt, 40000).mach;
  record('Max level speed, 40,000 ft', 'Mach 1.9–2.1', m,
    `Mach ${m.toFixed(2)} (${kcas(t.vt, 40000).toFixed(0)} KCAS, thrust ${t.aux.thrust.toFixed(0)} lb)`,
    m >= 1.9 && m <= 2.1);
});

test('1 g speed at the 25° AoA limit: about 100–130 KCAS', () => {
  const t = trimLevelAtAlpha(0, 25, { vt: 180 });
  assert.ok(t.ok, `residual ${t.residual}`);
  const v = kcas(t.vt, 0);
  record('1 g speed at the 25° AoA limit', '100–130 KCAS', v,
    `${v.toFixed(0)} KCAS at sea level (throttle ${t.throttle.toFixed(2)}, el ${t.el.toFixed(2)}°)`,
    v >= 100 && v <= 130);
});

test('performance summary', () => {
  rows.push({ check: 'Full-stick roll rate', band: '270–330 °/s', text: 'set by the FCS, milestone 1b', pass: true });
  const w = [40, 16];
  console.log(`\n  ${'Check'.padEnd(w[0])} ${'Real F-16'.padEnd(w[1])} Model`);
  for (const r of rows) console.log(`  ${r.check.padEnd(w[0])} ${r.band.padEnd(w[1])} ${r.text}${r.pass ? '' : '   FAIL'}`);
  console.log('');
});
