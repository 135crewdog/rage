// The chase camera: behind and slightly above the jet, following its attitude
// smoothly enough not to jitter and close enough that the jet's own motion
// reads. The cues of docs/flight-model.md section 10 (buffet shake, load sag)
// are applied here, driven by the model and never by a timer. A look-around
// (src/input/look.js) orbits the camera around the jet in the jet's frame.

import * as THREE from 'three';

const BEHIND = 15;        // m along the jet's +z (behind the tail)
const ABOVE = 3.2;        // m
const SAG_PER_G = 0.35;   // m the camera sags toward the belly per g above 1
const BUFFET_ONSET = 12;  // deg AoA
const BUFFET_FULL = 25;
const D2R = Math.PI / 180;

export function createChaseCamera(camera) {
  const q = new THREE.Quaternion();          // the camera's own smoothed attitude
  const pos = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const up = new THREE.Vector3();
  const shake = new THREE.Vector3();
  const lookQ = new THREE.Quaternion();     // the look-around, in the jet's frame
  const qv = new THREE.Quaternion();        // attitude then look-around
  const euler = new THREE.Euler();
  let first = true;
  let t = 0;

  return {
    // position, quaternion: the jet's world transform (interpolated).
    // aux: { nz, alphaDeg, qbar } from the simulation; look: { yaw, pitch } in
    // degrees, positive left and up, zero for the plain chase view.
    update(dt, position, quaternion, aux, look = { yaw: 0, pitch: 0 }) {
      t += dt;
      // follow attitude with a short time constant; snap on the first frame
      const k = first ? 1 : 1 - Math.exp(-dt / 0.12);
      q.slerp(quaternion, k);
      first = false;

      lookQ.setFromEuler(euler.set(look.pitch * D2R, look.yaw * D2R, 0, 'YXZ'));
      qv.copy(q).multiply(lookQ);
      const sag = -SAG_PER_G * Math.max(0, aux.nz - 1);
      offset.set(0, ABOVE + sag, BEHIND).applyQuaternion(qv);
      pos.copy(position).add(offset);

      // buffet: a small, high-frequency shake that starts at 12° AoA and grows
      // to the 25° limit, stronger at higher dynamic pressure
      const a = Math.max(0, Math.min(1, (aux.alphaDeg - BUFFET_ONSET) / (BUFFET_FULL - BUFFET_ONSET)));
      const amp = 0.12 * a * a * Math.min(1.5, aux.qbar / 300);   // halved after the first flights: it came on too hard
      shake.set(
        Math.sin(t * 61.3) + 0.5 * Math.sin(t * 97.1),
        Math.sin(t * 73.7 + 1.3) + 0.5 * Math.sin(t * 113.9),
        Math.sin(t * 53.1 + 2.1),
      ).multiplyScalar(amp).applyQuaternion(q);
      pos.add(shake);

      camera.position.copy(pos);
      // aim a little above the jet so it sits in the lower third of the frame and the HUD's centre is clear sky
      aim.set(0, 2.6, -12).applyQuaternion(qv).add(position);
      up.set(0, 1, 0).applyQuaternion(qv);
      camera.up.copy(up);
      camera.lookAt(aim);
    },
    reset() { first = true; },
  };
}
