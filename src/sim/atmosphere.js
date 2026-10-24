// The book's air-data computer, docs/f16-data.md section 4.4.
// Inputs: true airspeed VT in ft/s, altitude in ft. Imperial outputs.

const R0 = 2.377e-3;   // slug/ft³, sea-level density
const GAMMA_R = 1.4 * 1716.3;

export function atmosphere(vt, alt) {
  const tfac = 1 - 0.703e-5 * alt;
  const temp = alt >= 35000 ? 390 : 519 * tfac;       // °R
  const rho = R0 * Math.pow(tfac, 4.14);               // slug/ft³
  const a = Math.sqrt(GAMMA_R * temp);                 // ft/s, speed of sound
  return {
    temp,
    rho,
    a,
    pressure: 1715 * rho * temp,                       // psf, static pressure
    mach: vt / a,
    qbar: 0.5 * rho * vt * vt,                         // psf, dynamic pressure
  };
}

// Sea-level values from the same atmosphere, so calibrated and true airspeed
// agree at sea level.
const sl = atmosphere(0, 0);
export const P0 = sl.pressure;
export const A0 = sl.a;
export const RHO0 = sl.rho;
