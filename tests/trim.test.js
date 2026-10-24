import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimLevel, trimSustainedTurn, trimTurnAtLoad } from '../src/sim/trim.js';
import { airdata } from '../src/sim/airdata.js';
import { step } from '../src/sim/dynamics.js';

// Table 3.6-2: VT (ft/s), throttle, α (deg), el (deg). Sea level, xcg 0.35.
const BOOK = [
  [130, .816, 45.6, 20.1], [140, .736, 40.3, -1.36], [150, .619, 34.6, .173], [170, .464, 27.2, .621],
  [200, .287, 19.7, .723], [260, .148, 11.6, -.090], [300, .122, 8.49, -.591], [350, .107, 5.87, -.539],
  [400, .108, 4.16, -.591], [440, .113, 3.19, -.671], [500, .137, 2.14, -.756], [540, .160, 1.63, -.798],
  [600, .200, 1.04, -.846], [640, .230, .742, -.871], [700, .282, .382, -.900], [800, .378, -.045, -.943],
];

test('level-flight trims match Table 3.6-2 at all 16 speeds', () => {
  console.log('  VT    throttle (book)   alpha (book)     el (book)');
  const failures = [];
  // Work from fast to slow, seeding each solve with the previous answer.
  let guess = {};
  const rows = [];
  for (const [vt, thtl, alpha, el] of [...BOOK].reverse()) {
    const t = trimLevel(vt, 0, guess);
    guess = { throttle: t.throttle, alpha: t.alpha, el: t.el };
    rows.unshift([vt, thtl, alpha, el, t]);
  }
  for (const [vt, thtl, alpha, el, t] of rows) {
    const slow = vt < 200;
    const tolA = slow ? 0.15 : 0.02, tolE = slow ? 0.05 : 0.01;
    const line = `  ${String(vt).padEnd(5)} ${t.throttle.toFixed(4)} (${thtl.toFixed(3)})   ${t.alpha.toFixed(3).padStart(7)} (${alpha})   ${t.el.toFixed(3).padStart(7)} (${el})`;
    console.log(line);
    if (!t.ok) failures.push(`${vt}: solver did not converge`);
    if (Math.abs(t.throttle - thtl) > 0.001) failures.push(`${vt}: throttle ${t.throttle} vs ${thtl}`);
    if (Math.abs(t.alpha - alpha) > tolA) failures.push(`${vt}: alpha ${t.alpha} vs ${alpha}`);
    if (Math.abs(t.el - el) > tolE) failures.push(`${vt}: el ${t.el} vs ${el}`);
    // an accelerometer in level flight reads cos θ, with θ = α
    assert.ok(Math.abs(t.aux.nz - Math.cos(t.alpha * Math.PI / 180)) < 1e-9, `n_z ${t.aux.nz} at ${vt}`);
  }
  assert.deepEqual(failures, []);
});

test('trimmed level flight reads 1 g, and a turn at 1 g is level flight', () => {
  const level = trimLevel(500, 10000);
  assert.ok(level.ok);
  const ad = airdata(level.state, level.aux);
  assert.ok(Math.abs(ad.nz - Math.cos(level.alpha * Math.PI / 180)) < 1e-9);
  assert.ok(Math.abs(ad.nz - 1) < 0.01);
  assert.ok(Math.abs(ad.gamma) < 1e-6, `gamma ${ad.gamma}`);
  const turn = trimTurnAtLoad(500, 10000, level.aux.nz + 1e-6);
  assert.ok(turn.ok);
  assert.ok(Math.abs(turn.alpha - level.alpha) < 1e-3);
  assert.ok(Math.abs(turn.el - level.el) < 1e-3);
  assert.ok(Math.abs(turn.psidot) < 1e-2);
});

test('a sustained turn at full throttle holds speed and height with the ball centred', () => {
  const t = trimSustainedTurn(700, 0);
  assert.ok(t.ok, `residual ${t.residual}`);
  assert.ok(t.aux.nz > 3, `n_z ${t.aux.nz}`);
  assert.ok(Math.abs(t.aux.beta) < 1e-9);
  // flown forward for 3 s with the surfaces held, it keeps speed and height and turns at ψ̇
  let x = t.state;
  const dt = 1 / 120;
  for (let i = 0; i < 360; i++) x = step(x, t.controls, dt).state;
  const a0 = airdata(t.state, t.aux), a1 = airdata(x);
  assert.ok(Math.abs(a1.ktas - a0.ktas) < 0.5, `speed ${a0.ktas} → ${a1.ktas}`);
  assert.ok(Math.abs(a1.altitude - a0.altitude) < 5, `height ${a0.altitude} → ${a1.altitude}`);
  assert.ok(Math.abs(a1.roll - a0.roll) < 1, `bank ${a0.roll} → ${a1.roll}`);
  const turned = ((a1.heading - a0.heading) % 360 + 360) % 360;
  assert.ok(Math.abs(turned - t.psidot * 3 * 180 / Math.PI) < 1, `turned ${turned}`);
  console.log(`  sustained at 700 ft/s SL: ${(t.psidot * 180 / Math.PI).toFixed(2)} °/s, ${t.aux.nz.toFixed(2)} g, α ${t.alpha.toFixed(2)}°, bank ${(t.phi * 180 / Math.PI).toFixed(1)}°`);
});
