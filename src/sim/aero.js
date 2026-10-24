// Total aerodynamic coefficients in body axes, exactly as docs/f16-data.md
// section 3 (the book's subroutine F), plus the transonic drag rise of
// docs/flight-model.md section 5.2.

import { interp1, interp2 } from './table.js';
import * as T from './data/aero.js';
import { B, CBAR, XCGR } from './data/aircraft.js';

const D2R = Math.PI / 180;

// The tables extrapolate linearly from their end segments, as the book does.
// Far outside the data the extrapolation has no physical meaning and can grow
// without bound, so the lookup angles are held at these guards; the FCS never
// gets near them (α beyond −15° or 45° already raises outOfEnvelope).
const ALPHA_GUARD = [-30, 60];
const BETA_GUARD = 45;

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

// Extra drag above Mach 0.85: zero below, a smoothstep to 0.029 at Mach 1.05,
// flat above. Calibrated so the book's engine balances it at Mach 1.17 at sea
// level and Mach 2.0 at 40,000 ft. Below 0.85 nothing changes.
export const DRAG_RISE_START = 0.85;
export const DRAG_RISE_END = 1.05;
export const DRAG_RISE_CD = 0.029;

export function dragRise(mach) {
  const t = clamp((mach - DRAG_RISE_START) / (DRAG_RISE_END - DRAG_RISE_START), 0, 1);
  return DRAG_RISE_CD * t * t * (3 - 2 * t);
}

// alpha, beta, el, ail, rdr in degrees; p, q, r in rad/s; vt in ft/s;
// xcg as a fraction of c̄; mach for the drag rise.
// Returns { cx, cy, cz, cl, cm, cn }.
export function coefficients({ alpha, beta, el, ail, rdr, p, q, r, vt, xcg, mach }) {
  const a = clamp(alpha, ALPHA_GUARD[0], ALPHA_GUARD[1]);
  const bs = clamp(beta, -BETA_GUARD, BETA_GUARD);
  const ba = Math.abs(bs);
  const sb = bs < 0 ? -1 : bs > 0 ? 1 : 0;
  const dail = ail / 20;
  const drdr = rdr / 30;

  let cx = interp2(T.EL, T.ALPHA, T.CX, el, a);
  let cy = -0.02 * bs + 0.021 * dail + 0.086 * drdr;
  let cz = interp1(T.ALPHA, T.CZ0, a) * (1 - (bs / 57.3) ** 2) - 0.19 * (el / 25);
  let cl = sb * interp2(T.BETA_ABS, T.ALPHA, T.CL, ba, a)
    + interp2(T.BETA_SIGNED, T.ALPHA, T.DLDA, bs, a) * dail
    + interp2(T.BETA_SIGNED, T.ALPHA, T.DLDR, bs, a) * drdr;
  let cm = interp2(T.EL, T.ALPHA, T.CM, el, a);
  let cn = sb * interp2(T.BETA_ABS, T.ALPHA, T.CN, ba, a)
    + interp2(T.BETA_SIGNED, T.ALPHA, T.DNDA, bs, a) * dail
    + interp2(T.BETA_SIGNED, T.ALPHA, T.DNDR, bs, a) * drdr;

  // Damping. The order matters: the CG-transfer terms use the damped cz and cy.
  const tvt = 0.5 / Math.max(vt, 1);
  const b2v = B * tvt;
  const cq = CBAR * q * tvt;
  const D = T.DAMP;
  cx += cq * interp1(T.ALPHA, D.CXq, a);
  cy += b2v * (interp1(T.ALPHA, D.CYr, a) * r + interp1(T.ALPHA, D.CYp, a) * p);
  cz += cq * interp1(T.ALPHA, D.CZq, a);
  cl += b2v * (interp1(T.ALPHA, D.Clr, a) * r + interp1(T.ALPHA, D.Clp, a) * p);
  cm += cq * interp1(T.ALPHA, D.Cmq, a) + cz * (XCGR - xcg);
  cn += b2v * (interp1(T.ALPHA, D.Cnr, a) * r + interp1(T.ALPHA, D.Cnp, a) * p)
    - cy * (XCGR - xcg) * CBAR / B;

  // Transonic drag rise, along the velocity vector.
  const dcd = dragRise(mach);
  if (dcd > 0) {
    const ca = Math.cos(alpha * D2R), sa = Math.sin(alpha * D2R);
    const cb = Math.cos(beta * D2R), sbb = Math.sin(beta * D2R);
    cx -= dcd * ca * cb;
    cy -= dcd * sbb;
    cz -= dcd * sa * cb;
  }

  return { cx, cy, cz, cl, cm, cn };
}
