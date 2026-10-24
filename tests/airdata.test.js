import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibratedAirspeed, airdata, FT_PER_S_PER_KNOT } from '../src/sim/airdata.js';
import { atmosphere, A0 } from '../src/sim/atmosphere.js';
import { makeState } from '../src/sim/dynamics.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('calibrated equals true airspeed at sea level, subsonic and supersonic', () => {
  for (const vt of [100, 500, 1000, 1300, 1800]) near(calibratedAirspeed(vt, 0), vt, 1e-6, `vt ${vt}`);
});

test('calibrated airspeed falls below true airspeed at altitude', () => {
  const vt = 800;
  const vc = calibratedAirspeed(vt, 30000);
  assert.ok(vc < vt);
  // above the equivalent airspeed by the compressibility correction, a few percent at Mach 0.8
  const veas = vt * Math.sqrt(atmosphere(vt, 30000).rho / atmosphere(0, 0).rho);
  assert.ok(vc > veas && (vc - veas) / veas < 0.08, `${vc} vs EAS ${veas}`);
});

test('the supersonic branch joins the subsonic one continuously at Mach 1', () => {
  const a = atmosphere(0, 20000).a;
  const below = calibratedAirspeed(a * 0.9999, 20000);
  const above = calibratedAirspeed(a * 1.0001, 20000);
  near(above, below, 0.5);
  // and the calibrated speed crosses a0 smoothly
  const h = 10000;
  let prev = 0;
  for (let vt = 900; vt < 1500; vt += 10) {
    const vc = calibratedAirspeed(vt, h);
    assert.ok(vc > prev, `monotone at ${vt}`);
    prev = vc;
  }
  assert.ok(prev > A0);
});

test('heading wraps to 0..360 and the HUD numbers come out in HUD units', () => {
  const west = makeState({ vt: 1.68781 * 350, psi: -Math.PI / 2, h: 5000 });
  const ad = airdata(west);
  near(ad.heading, 270, 1e-9);
  near(ad.ktas, 350, 1e-9);
  assert.ok(ad.kcas < 350 && ad.kcas > 300);
  near(ad.altitude, 5000, 0);
  const north = airdata(makeState({ vt: 500, psi: 0, theta: 0.1, phi: -0.2 }));
  near(north.heading, 0, 1e-9);
  near(north.pitch, 0.1 * 180 / Math.PI, 1e-9);
  near(north.roll, -0.2 * 180 / Math.PI, 1e-9);
  near(north.gamma, north.pitch, 1e-9);   // α = 0, so the flight path is the nose
  assert.equal(FT_PER_S_PER_KNOT, 1.68781);
});
