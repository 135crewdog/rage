// The jet is a low-poly F-16C model, "F 16 C" by Usman Zia, CC BY 4.0
// (see models/CREDITS.md), converted to glTF and scaled to the real jet's
// 15.06 m with its pitot tip at z −7.45 and its wing plane at y 0, so the
// camera and the HUD see the same geometry the code-built jet had.
// Mesh-local axes: nose along −z, right wing +x, canopy +y. Metres.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPlume } from './plume.js';

const MODEL = './models/f16c.glb';

// Returns the jet's group at once, empty until the model has loaded; `ready`
// resolves with the group when it has. `plume` is the afterburner, updated
// each frame from the engine's burner fraction.
export function createAircraft() {
  const jet = new THREE.Group();
  jet.plume = createPlume();
  jet.add(jet.plume.mesh);
  jet.ready = new GLTFLoader().loadAsync(MODEL).then((gltf) => {
    jet.add(gltf.scene);
    return jet;
  });
  return jet;
}
