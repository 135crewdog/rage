// The flight control system, docs/flight-model.md section 8: stick in,
// surface commands out. Pure functions over a small memory object so the
// closed loop stays deterministic. Angles in degrees except body rates, which
// arrive in rad/s from the state. Gains live in data/fcs.js.

import { PITCH, ROLL, YAW } from './data/fcs.js';
import { G as GRAV, S, CBAR, JYY, SURFACES } from './data/aircraft.js';
import { interp1 } from './table.js';

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const EL_LIM = SURFACES.el.limit;
const AIL_LIM = SURFACES.ail.limit;
const RDR_LIM = SURFACES.rdr.limit;

// First-order lag and washout, Euler-discretised at the FCS rate.
function lag(state, input, tau, dt) {
  return state + (input - state) * Math.min(1, dt / tau);
}

// The most g full aft stick gives at this AoA: the limiter schedule, static form.
export function limiterLoad(alphaDeg) {
  return 1 + PITCH.dnMax - limiterSubtraction(alphaDeg);
}

export function limiterSubtraction(alphaEff) {
  const L = PITCH.limiter;
  return L.slope1 * Math.max(0, alphaEff - L.alpha1) + L.slope2 * Math.max(0, alphaEff - L.alpha2);
}

// Stick to incremental g request.
export function pitchRequest(x) {
  const dn = x >= 0
    ? PITCH.pullGain * Math.pow(x, PITCH.shapeExponent)
    : -PITCH.pushGain * Math.pow(-x, PITCH.shapeExponent);
  return clamp(dn, PITCH.dnMin, PITCH.dnMax);
}

export function negativeLimit(qbar) {
  const [q0, q1] = PITCH.nminQbar;
  return PITCH.nminFloor * clamp((qbar - q0) / (q1 - q0), 0, 1) + 0;   // + 0 turns −0 into 0
}

export function pseudoAlpha(pDegPerS) {
  const { p0, p1, dAlpha } = PITCH.rollAlpha;
  return dAlpha * clamp((Math.abs(pDegPerS) - p0) / (p1 - p0), 0, 1);
}

// How far α will still rise before full nose-down stabilator can stop it:
// the swing time to full nose-down (plus a small lead) at the present rate,
// then the braking distance against the pitch deceleration full nose-down
// gives at this dynamic pressure. Only when α is rising.
export function alphaLead(alphaDot, qbar, el) {
  if (alphaDot <= 0) return PITCH.alphaRateLead * alphaDot;
  const swing = Math.max(0, PITCH.leadSwingTo - el) / SURFACES.el.rate;      // s
  const decel = qbar * S * CBAR * PITCH.cmDelta * EL_LIM / JYY * R2D;          // deg/s²
  return alphaDot * (swing + PITCH.alphaRateLead) + alphaDot * alphaDot / (2 * Math.max(decel, 1));
}

export function pitchGain(qbar) {
  return clamp(PITCH.gainQbar / Math.max(qbar, PITCH.gainQbarFloor), PITCH.gainMin, PITCH.gainMax);
}

// Stick force to roll-rate request (deg/s), NASA sidestick bands.
export function rollRequest(x) {
  let f = ROLL.forcePerStick * Math.abs(x);
  let rate = 0, f0 = 0;
  for (const [fEnd, slope] of ROLL.bands) {
    const df = Math.min(f, fEnd) - f0;
    if (df <= 0) break;
    rate += slope * df;
    f0 = fEnd;
  }
  return Math.sign(x) * rate;
}

// Roll-rate limiter, NASA TP-1538 control system B. el > 0 is trailing edge down.
export function rollRateLimit(alphaDeg, qbar, el) {
  const p = ROLL.pmaxBase
    - ROLL.pmaxQbarSlope * Math.max(0, ROLL.pmaxQbar - qbar)
    - ROLL.pmaxAlphaSlope * Math.max(0, alphaDeg - ROLL.pmaxAlpha)
    - ROLL.pmaxElSlope * Math.max(0, el - ROLL.pmaxEl);
  return Math.max(p, ROLL.pmaxFloor);
}

// 1 normally; fades to 0 as the stabilator nears full nose-down at AoA.
export function rollProtection(alphaDeg, el) {
  const P = ROLL.protect;
  const sat = clamp((el - (EL_LIM - P.elMargin)) / P.elMargin, 0, 1);
  const aoa = clamp((alphaDeg - P.alphaStart) / (P.alphaFull - P.alphaStart), 0, 1);
  return 1 - sat * aoa;
}

export function rollGain(qbar) {
  return clamp(ROLL.gainQbar / qbar, ROLL.gainMin, ROLL.gainMax);
}

export function ariGain(alphaDeg, mach) {
  if (alphaDeg > YAW.ariOffAlpha) return 0;
  const a = clamp(alphaDeg, YAW.ariAlpha[0], YAW.ariAlpha[YAW.ariAlpha.length - 1]);
  const [m0, m1] = YAW.ariMach;
  return interp1(YAW.ariAlpha, YAW.ariGain, a) * clamp((m1 - mach) / (m1 - m0), 0, 1);
}

export function yawGain(qbar) {
  return clamp(YAW.gainQbar / qbar, YAW.gainMin, YAW.gainMax);
}

export function createMemory() {
  return {
    ncmd: 1,          // lagged g command
    I: 0,             // pitch integrator, deg
    alphaFilt: 0,     // deg
    qWash: 0,         // low-pass state of q (rad/s); washout = q − qWash
    pcmd: 0,          // lagged roll-rate command, deg/s
    rollI: 0,         // roll integrator, deg
    rWash: 0,         // low-pass state of stability-axis yaw rate (rad/s)
    backstop: false,
  };
}

// The pitch stick that balances the law in steady flight at this AoA and
// load factor: zero below 15° AoA, aft above it to hold off the limiter, as
// in the real jet, which needs aft stick to fly slowly.
export function balancingStick(alphaDeg, nz) {
  const dn = nz + limiterSubtraction(alphaDeg) - 1;
  if (dn <= 0.01) return 0;
  return Math.pow(Math.min(dn, PITCH.dnMax) / PITCH.pullGain, 1 / PITCH.shapeExponent);
}

// Set the memory so the law outputs the trim stabilator with no transient.
// meas: { alphaDeg, q, qbar, nz }, el: the trim stabilator (deg), stickPitch:
// the stick the pilot holds (balancingStick for a trimmed start).
export function initFromTrim(mem, meas, el, stickPitch = 0) {
  mem.ncmd = 1 + pitchRequest(stickPitch);
  mem.alphaFilt = meas.alphaDeg;
  mem.qWash = meas.q;
  mem.rWash = 0;
  mem.pcmd = 0;
  mem.rollI = 0;
  mem.backstop = false;
  const G = pitchGain(meas.qbar);
  const neff = Math.max(mem.ncmd, negativeLimit(meas.qbar)) - limiterSubtraction(meas.alphaDeg);
  const e = neff - meas.nz;    // washout output is zero at init
  mem.I = -(el - PITCH.Kq * G * meas.q * R2D - PITCH.Ka * (meas.alphaDeg - PITCH.alpha0)) / G - PITCH.Kp * e;
  return mem;
}

// One FCS step. stick = { pitch, roll } each −1..+1 (pull and right positive).
// meas = { alphaDeg, p, q, r (rad/s), nz, ny, qbar, mach, el (deg, position) }.
// Returns surface commands { el, ail, rdr } in degrees and updates mem.
export function fcsStep(mem, stick, meas, dt) {
  const { alphaDeg, p, q, r, nz, ny, qbar, mach } = meas;
  const pDeg = p * R2D, qDeg = q * R2D;
  const ca = Math.cos(alphaDeg * D2R), sa = Math.sin(alphaDeg * D2R);

  // ---- pitch: g command with automatic trim ----
  mem.ncmd = lag(mem.ncmd, 1 + pitchRequest(stick.pitch), PITCH.commandLag, dt);
  let ncmd = Math.max(mem.ncmd, negativeLimit(qbar));
  // α rate estimated from the α filter (the derivative a first-order lag implies)
  const alphaDot = (alphaDeg - mem.alphaFilt) / PITCH.alphaFilterTau;
  mem.alphaFilt = lag(mem.alphaFilt, alphaDeg, PITCH.alphaFilterTau, dt);
  const alphaEff = alphaDeg + pseudoAlpha(pDeg) + alphaLead(alphaDot, qbar, meas.el);
  const neff = ncmd - limiterSubtraction(alphaEff);

  mem.qWash = lag(mem.qWash, q, PITCH.washoutTau, dt);
  const qWashed = q - mem.qWash;
  const e = neff - nz - (PITCH.crossover / GRAV) * qWashed;

  const G = pitchGain(qbar);
  const feedback = PITCH.Kq * G * qDeg + PITCH.Ka * (mem.alphaFilt - PITCH.alpha0);

  let el;
  if (mem.backstop) {
    // 8.5: full nose-down until α is back below 25°, integrator held
    if (alphaDeg < PITCH.backstopOff) {
      mem.backstop = false;
      // re-initialise so the law's output equals the current stabilator position
      mem.I = -(meas.el - feedback) / G - PITCH.Kp * e;
      el = meas.el;
    } else {
      el = EL_LIM;
    }
  } else if (alphaDeg > PITCH.backstopOn) {
    mem.backstop = true;
    el = EL_LIM;
  } else {
    const unsat = -G * (PITCH.Kp * e + mem.I) + feedback;
    // freeze the integrator when the stabilator is saturated in the direction e pushes
    const saturated = (unsat <= -EL_LIM && e > 0) || (unsat >= EL_LIM && e < 0);
    if (!saturated) mem.I += PITCH.Ki * e * dt;
    el = -G * (PITCH.Kp * e + mem.I) + feedback;
  }
  el = clamp(el, -EL_LIM, EL_LIM);

  // ---- roll: roll-rate command about the velocity vector ----
  const pmax = rollRateLimit(alphaDeg, qbar, meas.el) * rollProtection(alphaDeg, meas.el);
  const pReq = clamp(rollRequest(stick.roll), -pmax, pmax);
  mem.pcmd = lag(mem.pcmd, pReq, ROLL.commandLag, dt);
  const ps = (p * ca + r * sa) * R2D;             // stability-axis roll rate, deg/s
  const pErr = mem.pcmd - ps;
  const Gr = rollGain(qbar);
  let ail = -Gr * (ROLL.Kr * pErr + mem.rollI);
  if (ROLL.Kri > 0) {
    const sat = (ail <= -AIL_LIM && pErr > 0) || (ail >= AIL_LIM && pErr < 0);
    if (!sat) mem.rollI += ROLL.Kri * pErr * dt;
  }
  ail = clamp(ail, -AIL_LIM, AIL_LIM);

  // ---- yaw: automatic coordination ----
  const rs = r * ca - p * sa;                     // stability-axis yaw rate, rad/s
  mem.rWash = lag(mem.rWash, rs, YAW.yawWashoutTau, dt);
  const rWashed = (rs - mem.rWash) * R2D;
  let rdr = ariGain(alphaDeg, mach) * ail
    + YAW.Kyd * rWashed
    + YAW.Kny * yawGain(qbar) * ny;
  rdr = clamp(rdr, -RDR_LIM, RDR_LIM);

  return { el, ail, rdr };
}
