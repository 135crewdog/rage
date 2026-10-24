// Attitude as a unit quaternion [q0, q1, q2, q3] (scalar first), body
// relative to NED: v_ned = Q ⊗ v_body ⊗ Q*. Euler angles are the aerospace
// yaw-pitch-roll sequence (ψ about z, then θ about y, then φ about x), radians.

export function fromEuler(phi, theta, psi) {
  const cr = Math.cos(phi / 2), sr = Math.sin(phi / 2);
  const cp = Math.cos(theta / 2), sp = Math.sin(theta / 2);
  const cy = Math.cos(psi / 2), sy = Math.sin(psi / 2);
  return [
    cr * cp * cy + sr * sp * sy,
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
  ];
}

// Returns { phi, theta, psi } with ψ in −π..π.
export function toEuler([q0, q1, q2, q3]) {
  let s = 2 * (q0 * q2 - q3 * q1);
  if (s > 1) s = 1; else if (s < -1) s = -1;
  return {
    phi: Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2)),
    theta: Math.asin(s),
    psi: Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3)),
  };
}

// Direction cosine matrix body → NED, as nine numbers row by row.
export function toMatrix([q0, q1, q2, q3]) {
  return [
    q0 * q0 + q1 * q1 - q2 * q2 - q3 * q3, 2 * (q1 * q2 - q0 * q3), 2 * (q1 * q3 + q0 * q2),
    2 * (q1 * q2 + q0 * q3), q0 * q0 - q1 * q1 + q2 * q2 - q3 * q3, 2 * (q2 * q3 - q0 * q1),
    2 * (q1 * q3 - q0 * q2), 2 * (q2 * q3 + q0 * q1), q0 * q0 - q1 * q1 - q2 * q2 + q3 * q3,
  ];
}

export function bodyToNed(q, [x, y, z]) {
  const m = toMatrix(q);
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

export function nedToBody(q, [x, y, z]) {
  const m = toMatrix(q);
  return [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];
}

// Q̇ = ½ · Q ⊗ (0, p, q, r)
export function derivative([q0, q1, q2, q3], p, q, r) {
  return [
    0.5 * (-q1 * p - q2 * q - q3 * r),
    0.5 * (q0 * p + q2 * r - q3 * q),
    0.5 * (q0 * q - q1 * r + q3 * p),
    0.5 * (q0 * r + q1 * q - q2 * p),
  ];
}

export function normalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
