// Tilt to stick, docs/flight-model.md section 11. The maths is pure and
// tested; reading the sensor is the caller's job (see main.js).
//
// The phone is held in landscape like a steering wheel. Never map raw beta
// and gamma to pitch and roll: in landscape they jump by about 180° exactly
// when the screen passes upright. Instead find "up" in screen coordinates and
// measure tilt against a neutral attitude captured at Start or Recenter.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const MAPPING = {
  pitchFull: 25,        // deg of tilt from neutral for full force
  rollFull: 30,
  pitchDeadband: 2,     // deg, standing in for the stick's breakout force
  rollDeadband: 1.5,
  filterTau: 0.020,     // s, first-order smoothing of the sensor
  confidenceFade: 0.3,  // roll authority fades to zero as confidence drops below this
  // Signs confirmed on the iPhone (milestone 1c): with the maths above, the
  // raw pitch and roll both come out opposite to the pilot's sense, so both
  // are flipped here. Top edge toward you is a pull; clockwise is right.
  pitchSign: -1,
  rollSign: -1,
};

// World "up" in screen coordinates (x right, y up the screen, z out of the
// screen) from the sensor's beta and gamma (degrees) and the screen angle
// (degrees). alpha cancels out, so turning in a chair causes no input.
export function upInScreen(beta, gamma, screenAngle) {
  const b = beta * D2R, g = gamma * D2R;
  const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b), z = Math.cos(b) * Math.cos(g);
  const t = screenAngle * D2R, c = Math.cos(t), s = Math.sin(t);
  return { x: c * x - s * y, y: s * x + c * y, z };
}

// Tilt angles (degrees) and confidence from an up vector in screen coordinates.
export function tiltOf(u) {
  const flat = Math.hypot(u.x, u.y);
  return {
    pitch: Math.atan2(u.z, flat) * R2D,     // screen facing the sky → 90°
    roll: Math.atan2(u.x, u.y) * R2D,       // steering-wheel angle
    confidence: flat,                        // 0 when the screen faces the sky or the floor
  };
}

// The difference of two angles in degrees, wrapped to −180..180.
export function wrap(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

// Deadband then linear to ±1 at `full` degrees.
export function shape(deg, deadband, full) {
  const a = Math.abs(deg);
  if (a <= deadband) return 0;
  const x = (a - deadband) / (full - deadband);
  return Math.sign(deg) * Math.min(1, x);
}

// Stick values from the current tilt, the neutral tilt captured at Recenter,
// and the mapping. Roll authority fades with confidence.
export function stickFrom(tilt, neutral, m = MAPPING) {
  const dPitch = wrap(tilt.pitch - neutral.pitch);
  const dRoll = wrap(tilt.roll - neutral.roll);
  const fade = Math.max(0, Math.min(1, tilt.confidence / m.confidenceFade));
  return {
    pitch: m.pitchSign * shape(dPitch, m.pitchDeadband, m.pitchFull),
    roll: m.rollSign * shape(dRoll, m.rollDeadband, m.rollFull) * fade,
    dPitch, dRoll,
  };
}

// First-order smoothing of a stick value with the sensor's own timestamps.
export function smooth(previous, value, dtSeconds, tau = MAPPING.filterTau) {
  if (!(dtSeconds > 0)) return value;
  const k = 1 - Math.exp(-dtSeconds / tau);
  return previous + (value - previous) * k;
}
