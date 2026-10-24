// Scripted manoeuvres flown with the full simulation. Shared by the headless
// flight script and the section 12.2 tests. Each manoeuvre is a function of
// time (and the sim) returning the stick and throttle for that step.

import { Simulation, DT } from '../../src/sim/simulation.js';
import { IX } from '../../src/sim/dynamics.js';

const R2D = 180 / Math.PI;

// A simple deterministic random generator so test 10 is repeatable.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A scripted test pilot who holds altitude with the pitch stick (test 4).
export function altitudeHold(h0) {
  let integ = 0;
  return (sim, dt) => {
    const a = sim.airdata;
    const err = h0 - a.altitude;                       // ft
    integ += err * dt;
    integ = Math.max(-2000, Math.min(2000, integ));
    const x = 0.004 * err - 0.02 * a.verticalSpeed + 0.0002 * integ;
    return Math.max(-1, Math.min(1, x));
  };
}

export const MANOEUVRES = {
  // 1: wings level, stick released
  level: { h: 10000, kcas: 350, t: 10, script: () => ({ pitch: 0, roll: 0 }) },
  // 2: throttle from MIL to idle, stick released
  idle: { h: 10000, kcas: 350, t: 20, throttle: 0, script: () => ({ pitch: 0, roll: 0 }) },
  // 3 and 5: full aft stick from t = 0.5 s
  pull: { h: 10000, kcas: 450, t: 6, script: (t) => ({ pitch: t >= 0.5 ? 1 : 0, roll: 0 }) },
  // 6: full forward stick from t = 0.5 s
  push: { h: 10000, kcas: 450, t: 6, script: (t) => ({ pitch: t >= 0.5 ? -1 : 0, roll: 0 }) },
  // 7 and 8: full right stick from t = 0.5 s, pitch stick held where the trim needs it
  roll: { h: 10000, kcas: 350, t: 5, script: (t, sim) => ({ pitch: sim.trimStick.pitch, roll: t >= 0.5 ? 1 : 0 }) },
  // 9: roll into a 60° bank with a pulse of right stick, then release everything
  bank: {
    h: 10000, kcas: 350, t: 14,
    script: (t, sim) => {
      const bank = sim.airdata.roll;
      if (t < 4) return { pitch: 0, roll: bank < 60 ? 0.35 : 0 };
      return { pitch: 0, roll: 0 };
    },
  },
  // 4: idle, hold altitude until 90 KCAS
  // The limiter parks the jet at about 110 KCAS and 25° AoA, sinking, so 90 KCAS
  // never comes: the run also ends after 20 s of full aft stick.
  decel: {
    h: 10000, kcas: 300, t: 300, throttle: 0,
    make: (sim) => {
      const hold = altitudeHold(sim.airdata.altitude);
      let fullAftSince = null;
      return (t, s, dt) => {
        const pitch = hold(s, dt);
        if (pitch >= 1) fullAftSince ??= t; else fullAftSince = null;
        s.fullAftFor = fullAftSince === null ? 0 : t - fullAftSince;
        return { pitch, roll: 0 };
      };
    },
    stop: (sim) => sim.airdata.kcas <= 90 || sim.fullAftFor > 20,
  },
  // 10: random stick
  random: {
    h: 10000, kcas: 350, t: 60,
    make: (sim, args) => {
      const rnd = mulberry32(args.seed ?? 1);
      let hold = 0, stick = { pitch: 0, roll: 0 };
      return (t) => {
        if (t >= hold) {
          hold = t + 0.3 + 2.5 * rnd();
          stick = { pitch: 2 * rnd() - 1, roll: 2 * rnd() - 1 };
        }
        return stick;
      };
    },
  },
};

// Fly a manoeuvre. args may override h, kcas, t, throttle, seed. onStep is
// called after every physics step with (sim, stick). Returns the time history
// and a summary of extremes.
export function flyManoeuvre(name, args = {}, onStep) {
  const m = MANOEUVRES[name];
  const h = args.h ?? m.h, kcas = args.kcas ?? m.kcas, T = args.t ?? m.t;
  const sim = new Simulation({ h, kcas });
  const throttle = args.throttle ?? m.throttle ?? sim.trimThrottle;
  const script = m.make ? m.make(sim, args) : m.script;
  const rows = [];
  const s = { nzMax: -Infinity, nzMin: Infinity, alphaMax: -Infinity, alphaMin: Infinity, pMax: 0, betaMax: 0,
    kcasEnd: 0, altEnd: 0, nan: false, backstop: false };
  let stick = { pitch: 0, roll: 0 };
  while (sim.time < T - 1e-9 && !sim.crashed) {
    stick = script(sim.time, sim, DT);
    sim.step(stick, throttle);
    const a = sim.airdata, x = sim.state;
    const row = { t: sim.time, kcas: a.kcas, alt: a.altitude, alpha: a.alpha, nz: a.nz, q: x[IX.Q] * R2D,
      el: x[IX.EL], bank: a.roll, p: x[IX.P] * R2D, ps: (x[IX.P] * Math.cos(sim.aux.alpha) + x[IX.R] * Math.sin(sim.aux.alpha)) * R2D,
      beta: a.beta, heading: a.heading, pitch: a.pitch, ail: x[IX.AIL], rdr: x[IX.RDR], stick };
    rows.push(row);
    s.nzMax = Math.max(s.nzMax, a.nz); s.nzMin = Math.min(s.nzMin, a.nz);
    s.alphaMax = Math.max(s.alphaMax, a.alpha); s.alphaMin = Math.min(s.alphaMin, a.alpha);
    if (Math.abs(row.ps) > Math.abs(s.pMax)) s.pMax = row.ps;
    s.betaMax = Math.max(s.betaMax, Math.abs(a.beta));
    if (sim.backstop) s.backstop = true;
    for (let k = 0; k < x.length; k++) if (!Number.isFinite(x[k])) s.nan = true;
    if (onStep) onStep(sim, stick);
    if (m.stop && m.stop(sim)) break;
  }
  s.kcasEnd = sim.airdata.kcas; s.altEnd = sim.airdata.altitude; s.crashed = sim.crashed; s.tEnd = sim.time;
  return { rows, summary: s, sim };
}
