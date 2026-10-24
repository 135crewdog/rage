// A low-poly F-16 built in code from simple shapes, so there is nothing to
// license. Mesh-local axes: nose along −z, right wing +x, canopy +y. Metres,
// roughly to scale: 15 m long, 9.5 m span.

import * as THREE from 'three';

const grey = new THREE.MeshLambertMaterial({ color: 0x8a919b });
const dark = new THREE.MeshLambertMaterial({ color: 0x5a6069 });
const glass = new THREE.MeshLambertMaterial({ color: 0x2a3340, transparent: true, opacity: 0.85 });

// A flat plate from a 2-D outline in the x–z plane (x right, z aft), with a thickness.
function plate(points, thickness, material, y = 0) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // extrude goes along +z of the shape's plane; lay it flat: shape x→x, shape y→z, depth→y
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y + thickness / 2;
  return mesh;
}

export function createAircraft() {
  const jet = new THREE.Group();

  // fuselage: a tapered body from a lathe-like stack of boxes
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 9.5, 8), grey);
  body.rotation.x = Math.PI / 2;        // along z
  body.position.set(0, 0, 0.5);
  jet.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.2, 8), grey);
  nose.rotation.x = -Math.PI / 2;       // point along −z
  nose.position.set(0, 0, -6.35);
  jet.add(nose);
  const tailpipe = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 1.6, 8), dark);
  tailpipe.rotation.x = Math.PI / 2;
  tailpipe.position.set(0, 0, 6.0);
  jet.add(tailpipe);

  // chin intake under the forward fuselage
  const intake = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 4.2), dark);
  intake.position.set(0, -0.75, -1.6);
  jet.add(intake);

  // blended wing: a cropped delta, leading-edge strakes running forward to the canopy
  jet.add(plate([[0.5, -3.6], [1.3, -2.0], [4.75, 2.4], [4.75, 3.4], [0.6, 3.6], [0.6, -3.6]], 0.14, grey, -0.1));
  jet.add(plate([[-0.5, -3.6], [-1.3, -2.0], [-4.75, 2.4], [-4.75, 3.4], [-0.6, 3.6], [-0.6, -3.6]], 0.14, grey, -0.1));

  // stabilators
  jet.add(plate([[0.5, 4.9], [2.7, 6.3], [2.7, 6.9], [0.5, 7.0]], 0.1, grey, -0.15));
  jet.add(plate([[-0.5, 4.9], [-2.7, 6.3], [-2.7, 6.9], [-0.5, 7.0]], 0.1, grey, -0.15));

  // one vertical tail: a plate in the y–z plane
  const finShape = new THREE.Shape([new THREE.Vector2(3.2, 0.4), new THREE.Vector2(5.4, 3.4), new THREE.Vector2(6.6, 3.4), new THREE.Vector2(6.9, 0.4)]);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2);    // shape x (aft) → z, shape y → y, depth → x
  const fin = new THREE.Mesh(finGeo, grey);
  fin.position.set(0.06, 0, 0);
  jet.add(fin);

  // bubble canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 1.05, 2.4);
  canopy.position.set(0, 0.45, -3.0);
  jet.add(canopy);

  return jet;
}
