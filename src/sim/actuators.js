// Control-surface actuators, docs/flight-model.md section 7: a first-order
// lag with a rate limit and a position limit. Degrees and seconds.

import { SURFACES } from './data/aircraft.js';

export function clampSurface(name, pos) {
  const lim = SURFACES[name].limit;
  return pos < -lim ? -lim : pos > lim ? lim : pos;
}

// Rate of travel (deg/s) toward a commanded position.
export function surfaceRate(name, command, position) {
  const { tau, rate } = SURFACES[name];
  const v = (clampSurface(name, command) - position) / tau;
  return v < -rate ? -rate : v > rate ? rate : v;
}
