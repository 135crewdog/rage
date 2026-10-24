import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemory, initFromTrim, fcsStep, balancingStick,
  limiterLoad, limiterSubtraction, pitchRequest, negativeLimit, pseudoAlpha, pitchGain,
  rollRequest, rollRateLimit, ariGain, yawGain,
} from '../src/sim/fcs.js';
import { PITCH } from '../src/sim/data/fcs.js';
import { Simulation } from '../src/sim/simulation.js';
import { IX } from '../src/sim/dynamics.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const DT = 1 / 120;

// A trimmed, level measurement set at 350 KCAS, 10,000 ft, with overrides.
function level(over = {}) {
  return { alphaDeg: 2, p: 0, q: 0, r: 0, nz: 1, ny: 0, qbar: 400, mach: 0.6, el: -1, ...over };
}
// Run the law from a trim-initialised memory for a few steps with one
// measurement set. By default the memory starts at the measurement's own AoA,
// so the α-rate estimate starts at zero; pass init to start elsewhere.
function respond(stick, meas, steps = 3, init = { ...level(), alphaDeg: meas.alphaDeg }) {
  const mem = initFromTrim(createMemory(), init, -1, 0);
  let out;
  for (let i = 0; i < steps; i++) out = fcsStep(mem, stick, meas, DT);
  return out;
}

test('the limiter schedule: 9 g to 15° AoA, 7.3 g at 20°, 1 g at 25°', () => {
  assert.equal(limiterLoad(0), 9);
  assert.equal(limiterLoad(15), 9);
  near(limiterLoad(20), 7.3, 1e-12);
  near(limiterLoad(25), 1.0, 1e-12);
  assert.equal(limiterSubtraction(10), 0);
});

test('stick to g request: shaping, range and the −4..+8 clamp', () => {
  assert.equal(pitchRequest(0), 0);
  near(pitchRequest(1), 8, 1e-12);          // 10·1 clamped to +8
  near(pitchRequest(-1), -4, 1e-12);
  near(pitchRequest(0.5), 10 * Math.pow(0.5, 1.6), 1e-12);
  near(pitchRequest(-0.5), -4 * Math.pow(0.5, 1.6), 1e-12);
  assert.ok(pitchRequest(0.3) < pitchRequest(0.6) / 2, 'pull shaping is progressive');
});

test('negative-g limit: 0 g when slow, −3 g above about 250 KCAS', () => {
  assert.equal(negativeLimit(40), 0);
  assert.equal(negativeLimit(60), 0);
  near(negativeLimit(135), -1.5, 1e-12);
  assert.equal(negativeLimit(210), -3);
  assert.equal(negativeLimit(900), -3);
});

test('pseudo-AoA from roll rate: 0 below 20°/s, 5.4° at 56°/s and beyond', () => {
  assert.equal(pseudoAlpha(0), 0);
  assert.equal(pseudoAlpha(20), 0);
  near(pseudoAlpha(38), 2.7, 1e-12);
  near(pseudoAlpha(-56), 5.4, 1e-12);
  near(pseudoAlpha(200), 5.4, 1e-12);
});

test('pitch gain schedule 300/q̄, clamped 0.25..2 with a 40 psf floor', () => {
  near(pitchGain(300), 1, 1e-12);
  near(pitchGain(600), 0.5, 1e-12);
  assert.equal(pitchGain(2000), 0.25);
  assert.equal(pitchGain(10), 2);
});

test('roll-rate request follows the sidestick force bands', () => {
  near(rollRequest(2 / 16), 10, 1e-9);           // 2 lb → 10 °/s
  near(rollRequest(8 / 16), 100, 1e-9);          // 8 lb → 100 °/s
  near(rollRequest(1), 340, 1e-9);               // 16 lb, before the limiter
  near(rollRequest(-8 / 16), -100, 1e-9);
  assert.equal(rollRequest(0), 0);
});

test('roll-rate limiter: 279 °/s at α 5°, q̄ 167; 168 at α 25°, q̄ 38.5; 88 with el +25°', () => {
  near(rollRateLimit(5, 167, 0), 279, 1);
  near(rollRateLimit(25, 38.5, 0), 168, 1);
  near(rollRateLimit(25, 38.5, 25), 88, 1);
  assert.equal(rollRateLimit(45, 10, 25), 80);   // the floor
  assert.equal(rollRateLimit(0, 1000, -10), 308);
});

test('interconnect rises with AoA, fades with Mach, off above 35°', () => {
  assert.equal(ariGain(0, 0.3), 0);
  assert.ok(ariGain(10, 0.3) < ariGain(20, 0.3));
  assert.ok(ariGain(20, 0.3) < ariGain(30, 0.3));
  assert.ok(ariGain(20, 0.9) < ariGain(20, 0.3));
  assert.equal(ariGain(20, 1.5), 0);
  assert.equal(ariGain(36, 0.3), 0);
  near(yawGain(300), 1, 1e-12);
  assert.equal(yawGain(3000), 0.2);
});

// Signs, docs/flight-model.md 2.3 and 8.
test('a pull commands nose-up (negative) stabilator; a push nose-down', () => {
  const rest = respond({ pitch: 0, roll: 0 }, level());
  const pull = respond({ pitch: 1, roll: 0 }, level());
  const push = respond({ pitch: -1, roll: 0 }, level());
  assert.ok(pull.el < rest.el, `pull ${pull.el} vs rest ${rest.el}`);
  assert.ok(push.el > rest.el, `push ${push.el} vs rest ${rest.el}`);
});

test('more g than commanded gives nose-down; nose-up pitch rate and AoA give nose-down (damping, stability)', () => {
  const rest = respond({ pitch: 0, roll: 0 }, level());
  assert.ok(respond({ pitch: 0, roll: 0 }, level({ nz: 1.5 })).el > rest.el, 'excess g');
  assert.ok(respond({ pitch: 0, roll: 0 }, level({ q: 0.1 })).el > rest.el, 'pitch rate');
  // trimmed at 2° AoA, then measured at 6°: once the α filter settles the stabilator sits nose-down of trim
  assert.ok(respond({ pitch: 0, roll: 0 }, level({ alphaDeg: 6 }), 60, level()).el > rest.el, 'AoA');
});

test('the limiter takes g away above 15° AoA and the backstop gives full nose-down above 30°', () => {
  const pullLow = respond({ pitch: 1, roll: 0 }, level({ alphaDeg: 10 }));
  const pullHigh = respond({ pitch: 1, roll: 0 }, level({ alphaDeg: 22 }));
  assert.ok(pullHigh.el > pullLow.el, 'less nose-up with AoA near the limit');
  const mem = initFromTrim(createMemory(), level(), -1, 0);
  const out = fcsStep(mem, { pitch: 1, roll: 0 }, level({ alphaDeg: 31 }), DT);
  assert.equal(out.el, 25);
  assert.equal(mem.backstop, true);
  // stays on at 27°, releases below 25° with the law matched to the surface
  assert.equal(fcsStep(mem, { pitch: 1, roll: 0 }, level({ alphaDeg: 27 }), DT).el, 25);
  const release = fcsStep(mem, { pitch: 0, roll: 0 }, level({ alphaDeg: 24, el: 12 }), DT);
  assert.equal(mem.backstop, false);
  near(release.el, 12, 1e-9);
});

test('right stick commands negative aileron and negative rudder (interconnect) at AoA', () => {
  const right = respond({ pitch: 0, roll: 1 }, level({ alphaDeg: 15 }), 12);
  const left = respond({ pitch: 0, roll: -1 }, level({ alphaDeg: 15 }), 12);
  assert.ok(right.ail < 0 && left.ail > 0, `ail ${right.ail} ${left.ail}`);
  assert.ok(right.rdr < 0 && left.rdr > 0, `rdr ${right.rdr} ${left.rdr}`);
  // and an established right roll rate with no stick is opposed
  const rolling = respond({ pitch: 0, roll: 0 }, level({ p: 1 }));
  assert.ok(rolling.ail > 0);
});

test('yaw damper opposes yaw rate; lateral acceleration feedback centres the ball', () => {
  const rest = respond({ pitch: 0, roll: 0 }, level());
  const yawingRight = respond({ pitch: 0, roll: 0 }, level({ r: 0.2 }));
  assert.ok(yawingRight.rdr > rest.rdr, 'nose right → rudder yaws left');
  // β > 0 (air from the right) gives n_y < 0; the fix is nose right, negative rudder
  const slipping = respond({ pitch: 0, roll: 0 }, level({ ny: -0.1 }));
  assert.ok(slipping.rdr < rest.rdr, 'n_y < 0 → negative rudder');
});

test('the balancing stick is centred below 15° AoA and aft above it', () => {
  assert.equal(balancingStick(2, 1), 0);
  assert.equal(balancingStick(15, 1), 0);
  const x20 = balancingStick(20, 1);
  assert.ok(x20 > 0 && x20 < 1);
  near(1 + pitchRequest(x20), 1 + limiterSubtraction(20), 1e-9);
  assert.ok(balancingStick(25, 1) > x20);
});

test('an air start has no jolt: the law outputs the trim stabilator and the jet holds 1 g', () => {
  for (const [h, kcas] of [[5000, 350], [10000, 450], [500, 120], [30000, 250]]) {
    const sim = new Simulation({ h, kcas });
    const el0 = sim.state[IX.EL];
    const nz0 = sim.aux.nz;
    sim.step(sim.trimStick, sim.trimThrottle);
    near(sim.controls.el, el0, 0.02, `first command at ${kcas} KCAS`);
    for (let i = 0; i < 240; i++) sim.step(sim.trimStick, sim.trimThrottle);
    near(sim.aux.nz, nz0, 0.02, `n_z after 2 s at ${kcas} KCAS`);
    near(sim.airdata.altitude, h, 15, `height after 2 s at ${kcas} KCAS`);
  }
});

test('an air start the engine cannot hold is refused', () => {
  // 110 KCAS at 50,000 ft balances only with 166 % throttle
  assert.throws(() => new Simulation({ h: 50000, kcas: 110 }), /throttle 1\.66/);
  // and the ordinary one is fine
  assert.ok(new Simulation({ h: 5000, kcas: 350 }).trimThrottle < 1);
});

test('the power state reads the engine, not the slider', () => {
  const sim = new Simulation({ h: 5000, kcas: 350 });
  assert.equal(sim.powerState.label, 'IDLE');
  for (let i = 0; i < 120; i++) sim.step({ pitch: 0, roll: 0 }, 1);
  assert.equal(sim.powerState.label, 'IDLE');   // still spooling toward 60 %
  for (let i = 0; i < 1200; i++) sim.step({ pitch: 0, roll: 0 }, 1);
  assert.equal(sim.powerState.label, 'AB');
  assert.ok(sim.powerState.percent > 90);
});
