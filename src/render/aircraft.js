// The jet is a low-poly F-16C model, "F 16 C" by Usman Zia, CC BY 4.0
// (see models/CREDITS.md), converted to glTF and scaled to the real jet's
// 15.06 m with its pitot tip at z −7.45 and its wing plane at y 0, so the
// camera and the HUD see the same geometry the code-built jet had. Its
// stabilators, flaperons and rudder are separate parts, cut along the
// author's hinge lines by models/cut-surfaces.py, and move with the FCS.
// Mesh-local axes: nose along −z, right wing +x, canopy +y. Metres.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPlume } from './plume.js';

const MODEL = './models/f16c.glb';

const D2R = Math.PI / 180;
// The rudder's hinge leans aft 21° from the vertical (models/cut-surfaces.py).
const RUDDER_AXIS = new THREE.Vector3(0, 0.9345, 0.356).normalize();
// The F-16's horizontal tails also move differentially for roll, about a
// quarter of the flaperon deflection (±5.25° against ±21.5°).
const DIFFERENTIAL_TAIL = 0.25;

// Returns the jet's group at once, empty until the model has loaded; `ready`
// resolves with the group when it has. `plume` is the afterburner, updated
// each frame from the engine's burner fraction; `surfaces.set(el, ail, rdr)`
// moves the stabilators, flaperons and rudder to the simulation's actuator
// positions, in degrees with the signs of docs/flight-model.md 2.3: el
// positive trailing edge down, ail positive rolls left (right surfaces down),
// rdr positive trailing edge left.
export function createAircraft() {
  const jet = new THREE.Group();
  jet.plume = createPlume();
  jet.add(jet.plume.mesh);
  const parts = {};
  jet.ready = new GLTFLoader().loadAsync(MODEL).then((gltf) => {
    for (const name of ['stabL', 'stabR', 'flapL', 'flapR', 'rudder']) parts[name] = gltf.scene.getObjectByName(name);
    jet.add(gltf.scene);
    return jet;
  });
  jet.surfaces = {
    el: 0, ail: 0, rdr: 0,
    set(el, ail, rdr) {
      this.el = el; this.ail = ail; this.rdr = rdr;
      if (!parts.rudder) return;
      parts.stabR.rotation.x = (el + DIFFERENTIAL_TAIL * ail) * D2R;
      parts.stabL.rotation.x = (el - DIFFERENTIAL_TAIL * ail) * D2R;
      parts.flapR.rotation.x = ail * D2R;
      parts.flapL.rotation.x = -ail * D2R;
      parts.rudder.quaternion.setFromAxisAngle(RUDDER_AXIS, -rdr * D2R);
    },
  };
  return jet;
}
