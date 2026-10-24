// An F-16 built in code, true to the published dimensions, so there is
// nothing to license: the fuselage and the chin intake are lofted through
// cross-sections; the LERX-and-wing, the stabilators, the fin and the
// ventral fins are planforms extruded thin; the canopy is a stretched
// bubble; nozzle and pitot boom finish it. Mesh-local axes: nose along −z,
// right wing +x, canopy +y. Metres. Length 15.0 m with the boom, span 9.45 m.

import * as THREE from 'three';

const skin = new THREE.MeshLambertMaterial({ color: 0x8c939b, side: THREE.DoubleSide });
const dark = new THREE.MeshLambertMaterial({ color: 0x3a3f46, side: THREE.DoubleSide });
const black = new THREE.MeshLambertMaterial({ color: 0x15171a });
const glass = new THREE.MeshLambertMaterial({ color: 0x24303f, transparent: true, opacity: 0.88 });

// A cross-section: at station z, a super-ellipse of half-width w, extending
// `top` above and `bottom` below the centre height cy, with squareness n
// (2 is an ellipse, higher is boxier with rounded corners).
function outline({ w, top, bottom, cy, n }, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const x = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const r = s >= 0 ? top : bottom;
    const y = cy + r * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push([x, y]);
  }
  return pts;
}

// Loft a closed surface through sections ordered nose to tail.
function loft(sections, count = 28) {
  const positions = [];
  const rings = sections.map((sec) => outline(sec, count));
  const index = [];
  rings.forEach((ring, i) => ring.forEach(([x, y]) => positions.push(x, y, sections[i].z)));
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < count; j++) {
      const a = i * count + j, b = i * count + (j + 1) % count;
      const c = (i + 1) * count + (j + 1) % count, d = (i + 1) * count + j;
      index.push(a, b, c, a, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// A flat cap on a section, facing forward (−z) or aft (+z).
function cap(section, count = 28) {
  const shape = new THREE.Shape(outline(section, count).map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.translate(0, 0, section.z);
  return geo;
}

// A thin plate from a planform in the x–z plane (x to the right, z aft), at height y.
function plate(points, thickness, material, y) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);                  // shape x→x, shape y→z, depth→−y
  geo.translate(0, y + thickness / 2, 0);
  return new THREE.Mesh(geo, material);
}

// A thin plate from an outline in the y–z plane (z aft, y up), at offset x.
function finPlate(points, thickness, material, x) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);                 // shape x (z)→z, shape y→y, depth→x
  geo.translate(x + thickness / 2, 0, 0);
  return new THREE.Mesh(geo, material);
}

const mirror = (pts) => pts.map(([x, z]) => [-x, z]);

export function createAircraft() {
  const jet = new THREE.Group();

  // Fuselage: radome, cockpit sill under the canopy, the wide blended
  // mid-body that flattens into the wing, tapering to the nozzle.
  const fuselage = [
    { z: -7.45, w: 0.02, top: 0.02, bottom: 0.02, cy: 0.00, n: 2 },
    { z: -6.80, w: 0.22, top: 0.22, bottom: 0.22, cy: 0.00, n: 2 },
    { z: -6.00, w: 0.40, top: 0.40, bottom: 0.40, cy: 0.00, n: 2 },
    { z: -5.20, w: 0.52, top: 0.50, bottom: 0.52, cy: 0.02, n: 2.2 },
    { z: -4.40, w: 0.62, top: 0.52, bottom: 0.62, cy: 0.05, n: 2.4 },
    { z: -3.40, w: 0.72, top: 0.52, bottom: 0.70, cy: 0.08, n: 2.6 },
    { z: -2.60, w: 0.80, top: 0.58, bottom: 0.72, cy: 0.10, n: 2.8 },
    { z: -1.60, w: 0.94, top: 0.66, bottom: 0.74, cy: 0.10, n: 3 },
    { z: -0.40, w: 1.06, top: 0.74, bottom: 0.76, cy: 0.10, n: 3.2 },
    { z: 1.00, w: 1.12, top: 0.80, bottom: 0.76, cy: 0.10, n: 3.4 },
    { z: 2.40, w: 1.08, top: 0.84, bottom: 0.74, cy: 0.10, n: 3.4 },
    { z: 3.80, w: 0.94, top: 0.80, bottom: 0.70, cy: 0.08, n: 3 },
    { z: 5.20, w: 0.76, top: 0.72, bottom: 0.64, cy: 0.04, n: 2.5 },
    { z: 6.40, w: 0.60, top: 0.60, bottom: 0.58, cy: 0.00, n: 2.1 },
    { z: 7.00, w: 0.52, top: 0.52, bottom: 0.52, cy: 0.00, n: 2 },
  ];
  jet.add(new THREE.Mesh(loft(fuselage), skin));

  // Chin intake: a rounded-rectangular mouth under the cockpit, a duct that
  // deepens the belly, blending into the underside ahead of the nozzle.
  const intake = [
    { z: -3.00, w: 0.55, top: 0.36, bottom: 0.36, cy: -0.98, n: 3.5 },
    { z: -2.20, w: 0.60, top: 0.40, bottom: 0.38, cy: -0.96, n: 3.5 },
    { z: -1.20, w: 0.72, top: 0.55, bottom: 0.45, cy: -0.85, n: 3.2 },
    { z: 0.20, w: 0.88, top: 0.75, bottom: 0.52, cy: -0.70, n: 3.2 },
    { z: 1.80, w: 0.96, top: 0.85, bottom: 0.52, cy: -0.58, n: 3.2 },
    { z: 3.40, w: 0.86, top: 0.75, bottom: 0.50, cy: -0.52, n: 3 },
    { z: 4.80, w: 0.66, top: 0.60, bottom: 0.42, cy: -0.46, n: 2.6 },
    { z: 6.00, w: 0.44, top: 0.40, bottom: 0.26, cy: -0.42, n: 2.2 },
  ];
  jet.add(new THREE.Mesh(loft(intake), skin));
  jet.add(new THREE.Mesh(cap(intake[0]), black));            // the mouth

  // Nozzle and the turbine face inside it.
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.7, 20, 1, true), dark);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = 7.35;
  jet.add(nozzle);
  const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), black);
  exhaust.position.z = 7.68;
  jet.add(exhaust);

  // Pitot boom.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.7, 6), dark);
  boom.rotation.x = Math.PI / 2;
  boom.position.z = -7.75;
  jet.add(boom);

  // Bubble canopy, from the windscreen to the turtledeck.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.92, 1.15, 3.1);
  canopy.position.set(0, 0.5, -3.5);
  jet.add(canopy);
  // the dorsal spine behind the canopy, running back into the fin's root fairing
  jet.add(finPlate([[-2.0, 0.55], [-1.3, 0.98], [2.2, 1.08], [2.2, 0.5], [-2.0, 0.4]], 0.52, skin, -0.26));

  // LERX and wing as one planform: the strake runs forward along the fuselage
  // from the wing root, the leading edge sweeps 40°, the trailing edge is
  // straight. Root chord 5.0 m on the centreline, tip 1.04 m, half-span 4.72 m.
  const wing = [
    [0.70, -4.20], [1.05, -2.80], [1.30, -1.50], [1.62, -0.60], [2.00, -0.22],
    [4.72, 2.06], [4.72, 3.10], [0.70, 3.10],
  ];
  jet.add(plate(wing, 0.14, skin, -0.12));
  jet.add(plate(mirror(wing), 0.14, skin, -0.12));
  // wingtip launcher rails
  for (const sx of [1, -1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.3), dark);
    rail.position.set(sx * 4.74, -0.05, 2.5);
    jet.add(rail);
  }

  // All-moving stabilators, 40° leading edges, below the wing plane.
  const stab = [[0.62, 4.70], [2.79, 6.50], [2.79, 7.30], [0.62, 7.45]];
  jet.add(plate(stab, 0.10, skin, -0.30));
  jet.add(plate(mirror(stab), 0.10, skin, -0.30));

  // Fin with its rudder, and the root fairing it grows out of.
  // the tip stands 2.2 m above the spine, as on the jet (4.88 m overall height on its gear)
  jet.add(finPlate([[2.20, 0.85], [4.60, 3.05], [5.90, 3.05], [7.00, 0.85]], 0.12, skin, -0.06));
  jet.add(finPlate([[0.40, 0.85], [2.20, 0.85], [2.20, 1.30]], 0.44, skin, -0.22));

  // Ventral fins, canted outward.
  for (const sx of [1, -1]) {
    const v = finPlate([[4.00, -0.70], [5.00, -1.35], [5.80, -1.35], [5.80, -0.70]], 0.06, skin, 0);
    v.position.x = sx * 0.45;
    v.rotation.z = sx * 0.5;
    jet.add(v);
  }

  return jet;
}
