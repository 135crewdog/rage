// The closed loop: stick and throttle in, a flying F-16 out. This is what
// main.js drives. Input reaches the simulation only here, as stick
// (pitch, roll in −1..+1) and throttle (0..1) passed into step().

import { DT, IX, N, step as dynamicsStep, derivative, airOf, crashed, R2D } from './dynamics.js';
import { createMemory, initFromTrim, fcsStep, balancingStick } from './fcs.js';
import { trimLevel } from './trim.js';
import { airdata, trueAirspeedFromKcas } from './airdata.js';
import { tgear } from './engine.js';

export class Simulation {
  // An air start: wings level, heading north, trimmed for 1 g at h (ft) and kcas.
  constructor({ h = 5000, kcas = 350 } = {}) {
    this.airStart(h, kcas);
  }

  airStart(h, kcas) {
    const vt = trueAirspeedFromKcas(kcas, h);
    const t = trimLevel(vt, h);
    if (!t.ok) throw new Error(`air start trim did not converge at ${kcas} KCAS, ${h} ft`);
    this.state = t.state;
    this.controls = { throttle: t.throttle, el: t.el, ail: 0, rdr: 0 };
    this.trimThrottle = t.throttle;
    this.time = 0;
    this.aux = t.aux;
    this.fcs = createMemory();
    // Below 15° AoA the stick is centred; slower than that the pilot holds it aft.
    this.trimStick = { pitch: balancingStick(t.alpha, t.aux.nz), roll: 0 };
    initFromTrim(this.fcs, this.measurements(), t.el, this.trimStick.pitch);
    this.crashed = false;
    return this;
  }

  measurements() {
    const x = this.state, a = this.aux;
    return {
      alphaDeg: a.alpha * R2D, p: x[IX.P], q: x[IX.Q], r: x[IX.R],
      nz: a.nz, ny: a.ny, qbar: a.qbar, mach: a.mach, el: x[IX.EL],
    };
  }

  // One fixed physics step. stick = { pitch, roll }, throttle 0..1.
  step(stick, throttle, dt = DT) {
    if (this.crashed) return;
    const cmd = fcsStep(this.fcs, stick, this.measurements(), dt);
    this.controls = { throttle, el: cmd.el, ail: cmd.ail, rdr: cmd.rdr };
    const r = dynamicsStep(this.state, this.controls, dt);
    this.state = r.state;
    this.time += dt;
    // aux for the new state, so the HUD and the next FCS step see the present
    const xdot = new Float64Array(N);
    this.aux = derivative(this.state, this.controls, xdot);
    if (crashed(this.state)) this.crashed = true;
  }

  // The auxiliary quantities (n_z, α, q̄ ...) for a state and controls.
  auxFor(state, controls) {
    const xdot = new Float64Array(N);
    return derivative(state, controls, xdot);
  }

  get airdata() {
    return airdata(this.state, this.aux);
  }

  get outOfEnvelope() {
    return this.aux.outOfEnvelope;
  }

  get backstop() {
    return this.fcs.backstop;
  }

  // The engine's power state for the HUD: IDLE, MIL, or AB with a percentage.
  get powerState() {
    const pow = this.state[IX.POW];
    if (pow > 50.5) return { label: 'AB', percent: Math.round((pow - 50) * 2) };
    if (pow > 49) return { label: 'MIL', percent: 0 };
    return { label: 'IDLE', percent: 0 };
  }
}

export { DT, tgear };
