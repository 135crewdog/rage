// The closed loop: stick and throttle in, a flying F-16 out. This is what
// main.js drives. Input reaches the simulation only here, as stick
// (pitch, roll in −1..+1) and throttle (0..1) passed into step().

import { DT, IX, N, step as dynamicsStep, derivative, airOf, crashed, R2D } from './dynamics.js';
import { createMemory, initFromTrim, fcsStep, balancingStick } from './fcs.js';
import { trimLevel } from './trim.js';
import { airdata, trueAirspeedFromKcas } from './airdata.js';
import { tgear } from './engine.js';
import { SURFACES } from './data/aircraft.js';

export class Simulation {
  // An air start: wings level, heading north, trimmed for 1 g at h (ft) and kcas.
  constructor({ h = 5000, kcas = 350 } = {}) {
    this.airStart(h, kcas);
  }

  airStart(h, kcas) {
    const vt = trueAirspeedFromKcas(kcas, h);
    const t = trimLevel(vt, h);
    if (!t.ok) throw new Error(`air start trim did not converge at ${kcas} KCAS, ${h} ft`);
    // The solver can balance the equations with more engine or stabilator than
    // the jet has; such a start would step straight into the limits.
    if (t.throttle < 0 || t.throttle > 1 || Math.abs(t.el) > SURFACES.el.limit) {
      throw new Error(`no level 1 g flight at ${kcas} KCAS, ${h} ft: trim needs throttle ${t.throttle.toFixed(2)}, stabilator ${t.el.toFixed(1)}°`);
    }
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

  // True while the AoA limiter is taking g away from what the stick asks.
  get limited() {
    return this.fcs.limiting > 0.05 || this.fcs.backstop;
  }

  // The control surfaces' positions in degrees, for the renderer: el, ail, rdr
  // with the signs of docs/flight-model.md 2.3.
  get surfaces() {
    const x = this.state;
    return { el: x[IX.EL], ail: x[IX.AIL], rdr: x[IX.RDR] };
  }

  // The engine's power state for the HUD, from the engine and not the slider:
  // IDLE, dry power as a percentage of MIL, MIL, or AB with its percentage.
  get powerState() {
    const pow = this.state[IX.POW];
    if (pow > 50.5) return { label: 'AB', percent: Math.round((pow - 50) * 2) };
    if (pow > 49) return { label: 'MIL', percent: 100 };
    if (pow > 2) return { label: 'DRY', percent: Math.round(pow * 2) };
    return { label: 'IDLE', percent: 0 };
  }
}

// The fixed-step clock of docs/flight-model.md 2.4. Given the time carried
// over from the last frame and the time since it, returns how many physics
// steps to take (at most maxSteps; time beyond that is dropped, not carried)
// and the time left over, which the renderer uses as the interpolation
// fraction between the last two states.
export function stepsFor(carry, elapsed, maxSteps = 8, dt = DT) {
  let acc = carry + Math.max(0, elapsed);
  let steps = Math.floor(acc / dt + 1e-9);     // 1/60 is two steps of 1/120, floating point or not
  if (steps > maxSteps) { steps = maxSteps; acc = maxSteps * dt; }
  acc -= steps * dt;
  return { steps, carry: acc, fraction: acc / dt };
}

export { DT, tgear };
