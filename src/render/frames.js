// The one module that converts between the simulation's frames and the
// three.js world, docs/flight-model.md 2.2.
//
//   NED:          x north, y east, z down; feet.
//   three.js:     x east, y up, z south; metres.
//   body:         x nose, y right wing, z belly.
//   mesh local:   nose along −z, right wing +x, canopy +y.
//
// Both NED→world and body→mesh are the same axis permutation P:
// (x, y, z) → (y, −z, −x), so a body-to-NED quaternion becomes the mesh's
// world quaternion by conjugation with P.

export const METRES_PER_FOOT = 0.3048;

// Position: NED (ft) → world (m). h is altitude above the sea.
export function positionToWorld(north, east, h) {
  return [east * METRES_PER_FOOT, h * METRES_PER_FOOT, -north * METRES_PER_FOOT];
}

// A vector in NED → the same vector in world axes (no scaling).
export function vectorToWorld([n, e, d]) {
  return [e, -d, -n];
}

// The permutation P as a quaternion (scalar first), found once from its
// rotation matrix: columns P·e1 = (0,0,−1), P·e2 = (1,0,0), P·e3 = (0,−1,0).
const P = matrixToQuaternion([
  [0, 1, 0],
  [0, 0, -1],
  [-1, 0, 0],
]);
const P_INV = [P[0], -P[1], -P[2], -P[3]];

function matrixToQuaternion(m) {
  const t = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    q = [0.25 * s, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s];
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    q = [(m[2][1] - m[1][2]) / s, 0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s];
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    q = [(m[0][2] - m[2][0]) / s, (m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s];
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    q = [(m[1][0] - m[0][1]) / s, (m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s];
  }
  return q;
}

function multiply(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

// Attitude: the simulation's body→NED quaternion [q0, q1, q2, q3] (scalar
// first) → the mesh's world quaternion in three.js order [x, y, z, w].
export function attitudeToWorld(q) {
  const w = multiply(multiply(P, q), P_INV);
  return [w[1], w[2], w[3], w[0]];
}

// Rotate a world vector by a three.js-order quaternion [x, y, z, w].
export function rotate([x, y, z, w], [vx, vy, vz]) {
  // v' = v + 2w(u×v) + 2u×(u×v), u = (x, y, z)
  const cx = y * vz - z * vy, cy = z * vx - x * vz, cz = x * vy - y * vx;
  const dx = y * cz - z * cy, dy = z * cx - x * cz, dz = x * cy - y * cx;
  return [vx + 2 * (w * cx + dx), vy + 2 * (w * cy + dy), vz + 2 * (w * cz + dz)];
}
