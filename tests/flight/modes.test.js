// docs/flight-model.md 8.7: the closed loop linearised across the envelope.
// Prints the pitch response and the lateral modes at each point next to the
// tuning targets. Asserts what the tuned system meets everywhere; the pitch
// targets it does not meet at the slow end are printed, not asserted, and the
// pull request says why.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearize, participation, describe, gStep, LONGITUDINAL, LATERAL } from './linearize.js';
import { flyManoeuvre } from './manoeuvres.js';
import { trueAirspeedFromKcas } from '../../src/sim/airdata.js';

const GRID = [];
for (const h of [50, 15000, 30000]) for (const kcas of [200, 300, 400, 500, 600]) GRID.push([h, kcas]);

// The pair with the most participation in `states` net of `against`, among
// pairs with wnMin < wn < wnMax; null if no pair scores above zero.
function pick(lin, vt, states, against, wnMin, wnMax) {
  let best = null;
  for (const e of lin.eig) {
    if (e.im <= 1e-6 || e.re < -200) continue;
    const d = describe(e);
    if (d.wn > wnMax || d.wn < wnMin) continue;
    const part = participation(lin.A, e, lin.names, vt);
    const score = states.reduce((s, n) => s + part[lin.names.indexOf(n)], 0)
      - against.reduce((s, n) => s + part[lin.names.indexOf(n)], 0);
    if (score > 0 && (!best || score > best.score)) best = { ...d, score };
  }
  return best;
}

test('pitch: g-step response and equivalent short period across the envelope', () => {
  console.log('  target: 90 % in 0.5–1.0 s, overshoot < 10 %, equivalent short period 4–6 rad/s at ζ 0.6–0.8');
  console.log('  h      KCAS   t90     over   wn    zeta   stable');
  const rows = [];
  for (const [h, kcas] of GRID) {
    const g = gStep(h, kcas);
    const lin = linearize(h, kcas, LONGITUDINAL);
    const unstable = lin.eig.filter((e) => e.re > 0.05);
    rows.push({ h, kcas, ...g, stable: unstable.length === 0 });
    console.log(`  ${String(h).padEnd(6)} ${String(kcas).padEnd(6)} ${Number.isFinite(g.t90) ? g.t90.toFixed(2) + ' s' : '> 3 s '} ${g.overshoot.toFixed(0).padStart(4)} %  ${g.wn.toFixed(1).padStart(4)}  ${g.zeta.toFixed(2)}   ${unstable.length === 0 ? 'yes' : 'NO ' + unstable.map((e) => e.re.toFixed(2)).join(',')}`);
  }
  for (const r of rows) assert.ok(r.stable, `unstable pitch mode at ${r.h} ft ${r.kcas} KCAS`);
  // A regression guard at what the tuned loop does (not the 8.7 target): overshoot under 20 %
  // everywhere, 90 % inside 1.4 s from 400 KCAS up and inside 1.0 s at 600 KCAS.
  for (const r of rows) {
    assert.ok(r.overshoot < 20, `overshoot ${r.overshoot} % at ${r.h} ft ${r.kcas} KCAS`);
    if (r.kcas >= 400) assert.ok(r.t90 <= 1.4, `t90 ${r.t90} s at ${r.h} ft ${r.kcas} KCAS`);
    if (r.kcas >= 600) assert.ok(r.t90 <= 1.0, `t90 ${r.t90} s at ${r.h} ft ${r.kcas} KCAS`);
  }
});

test('lateral: roll response, dutch roll and the roll loop across the envelope', () => {
  console.log('  target: roll-mode time constant 0.3–0.5 s at mid speed (full-stick response), dutch roll damped');
  console.log('  h      KCAS   roll τ   dutch roll        roll loop         stable');
  const rows = [];
  for (const [h, kcas] of GRID) {
    const vt = trueAirspeedFromKcas(kcas, h);
    const lin = linearize(h, kcas, LATERAL);
    const unstable = lin.eig.filter((e) => e.re > 0.05);
    // the dutch roll sits between the slow washout mode and the actuator modes; it scales with √q̄
    const dr = pick(lin, vt, ['r', 'v', 'rdr'], ['p', 'ail'], 3, 40);
    const rl = pick(lin, vt, ['p', 'ail'], ['r', 'v'], 10, 60);
    // effective roll-mode time constant: time for the stability-axis roll rate to reach 63 % of its peak
    const { rows: fl } = flyManoeuvre('roll', { h: Math.max(h, 500), kcas, t: 3 });
    const peak = Math.max(...fl.map((r) => Math.abs(r.ps)));
    const t63 = fl.find((r) => Math.abs(r.ps) >= 0.63 * peak).t - 0.5;
    rows.push({ h, kcas, t63, dr, rl, stable: unstable.length === 0, peak });
    console.log(`  ${String(h).padEnd(6)} ${String(kcas).padEnd(6)} ${t63.toFixed(2)} s   ${dr ? `${dr.wn.toFixed(1).padStart(4)} rad/s ζ ${dr.zeta.toFixed(2)}` : 'overdamped      '}   ${rl ? `${rl.wn.toFixed(1).padStart(4)} rad/s ζ ${rl.zeta.toFixed(2)}` : 'overdamped      '}   ${unstable.length === 0 ? 'yes' : 'NO'}   (peak ${peak.toFixed(0)} °/s)`);
  }
  for (const r of rows) {
    assert.ok(r.stable, `unstable lateral mode at ${r.h} ft ${r.kcas} KCAS`);
    // at mid speed the 0.1 s prefilter and the 80 °/s aileron rate limit set the roll response
    if (r.kcas >= 300 && r.kcas <= 400) assert.ok(r.t63 >= 0.3 && r.t63 <= 0.5, `roll time constant ${r.t63} s at ${r.h} ft ${r.kcas} KCAS`);
    if (r.kcas >= 300 && r.kcas <= 400) assert.ok(r.peak >= 270 && r.peak <= 330, `full-stick rate ${r.peak} °/s at ${r.h} ft ${r.kcas} KCAS`);
    if (r.dr) assert.ok(r.dr.zeta >= 0.2, `dutch roll ζ ${r.dr.zeta} at ${r.h} ft ${r.kcas} KCAS`);
  }
});
