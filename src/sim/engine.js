// The book's engine, docs/f16-data.md section 4: throttle gearing, power lag
// and the thrust tables. Thrust in lbf along +x body through the CG.

import { interp2 } from './table.js';
import { MACH, ALT, IDLE, MIL, MAX } from './data/engine.js';

export const MIL_THROTTLE = 0.77;   // the detent: 0.77 → 50 % = MIL

// Throttle 0..1 to commanded power 0..100 %.
export function tgear(thtl) {
  return thtl <= MIL_THROTTLE ? 64.94 * thtl : 217.38 * thtl - 117.38;
}

export function rtau(dp) {
  if (dp <= 25) return 1.0;
  if (dp >= 50) return 0.1;
  return 1.9 - 0.036 * dp;
}

// Rate of change of power state (%/s). p3 = actual power, p1 = commanded.
export function pdot(p3, p1) {
  let t, p2;
  if (p1 >= 50) {
    if (p3 >= 50) { t = 5.0; p2 = p1; } else { p2 = 60.0; t = rtau(p2 - p3); }
  } else if (p3 >= 50) { t = 5.0; p2 = 40.0; } else { p2 = p1; t = rtau(p2 - p3); }
  return t * (p2 - p3);
}

// Table inputs clamp to 0..50,000 ft and Mach 0..2.2; within Mach 1.0..2.2
// the book's linear extrapolation in Mach is kept. The drag rise in aero.js
// is calibrated against exactly this thrust.
export const THRUST_ALT_MAX = 50000;
export const THRUST_MACH_MAX = 2.2;

export function thrust(pow, alt, mach) {
  const h = alt < 0 ? 0 : alt > THRUST_ALT_MAX ? THRUST_ALT_MAX : alt;
  const m = mach < 0 ? 0 : mach > THRUST_MACH_MAX ? THRUST_MACH_MAX : mach;
  const tmil = interp2(MACH, ALT, MIL, m, h);
  if (pow < 50) {
    const tidl = interp2(MACH, ALT, IDLE, m, h);
    return tidl + (tmil - tidl) * pow * 0.02;
  }
  const tmax = interp2(MACH, ALT, MAX, m, h);
  return tmil + (tmax - tmil) * (pow - 50) * 0.02;
}
