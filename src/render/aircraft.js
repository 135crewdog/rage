// An F-16C built in code, measured from a published three-view drawing so
// there is nothing to license. The fuselage is lofted through its cross-
// sections, each traced from the drawing's section cuts (13 points per
// side); the wing-and-strake, stabilators, fin and dorsal fairing are lofts
// too, through thin aerofoil or half-round sections. Mesh-local axes: nose
// along −z, right wing +x, canopy +y. Metres; the origin is 7.45 m behind
// the pitot tip, on the wing plane. Length 14.7 m, span 9.4 m with the rails.

import * as THREE from 'three';

const skin = new THREE.MeshLambertMaterial({ color: 0x8c939b, side: THREE.DoubleSide });
const dark = new THREE.MeshLambertMaterial({ color: 0x3a3f46, side: THREE.DoubleSide });
const black = new THREE.MeshLambertMaterial({ color: 0x15171a, side: THREE.DoubleSide });
const glass = new THREE.MeshLambertMaterial({ color: 0x24303f, transparent: true, opacity: 0.88, side: THREE.DoubleSide });

// Loft a closed skin through rings of 3-D points, all rings the same length,
// in order along the body. `materialOf(x, y, z)` may pick a material index for
// each quad from its centre, for the canopy glass and the intake mouth.
function loft(rings, materialOf) {
  const n = rings[0].length;
  const positions = [];
  rings.forEach((ring) => ring.forEach(([x, y, z]) => positions.push(x, y, z)));
  const index = [[], [], []];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + (j + 1) % n;
      const c = (i + 1) * n + (j + 1) % n, d = (i + 1) * n + j;
      let m = 0;
      if (materialOf) {
        const [p, q, r, s] = [a, b, c, d].map((k) => rings[Math.floor(k / n)][k % n]);
        m = materialOf((p[0] + q[0] + r[0] + s[0]) / 4, (p[1] + q[1] + r[1] + s[1]) / 4, (p[2] + q[2] + r[2] + s[2]) / 4);
      }
      index[m].push(a, b, c, a, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index.flat());
  let start = 0;
  index.forEach((list, m) => { if (list.length) geo.addGroup(start, list.length, m); start += list.length; });
  geo.computeVertexNormals();
  return geo;
}

// A body ring at station z from its right half, [x, y] pairs from the top
// down to the bottom, mirrored for the left.
function bodyRing(z, half) {
  const right = [];
  for (let i = 0; i < half.length; i += 2) right.push([half[i], half[i + 1], z]);
  const left = right.slice(1, -1).reverse().map(([x, y]) => [-x, y, z]);
  return right.concat(left);
}

// An aerofoil ring: a lens of chord from `le` to `te` along the body axis,
// `t` thick at 40% chord, lying in the plane of the wing (x across) or of the
// fin (y up). `across` is the position along the span.
const LENS = [[0, 0], [0.05, 0.35], [0.15, 0.65], [0.4, 1], [0.75, 0.6], [1, 0]];
function foilRing(across, le, te, t, vertical) {
  const upper = LENS.map(([f, h]) => [le + (te - le) * f, h * t / 2]);
  const lower = LENS.slice(1, -1).reverse().map(([f, h]) => [le + (te - le) * f, -h * t / 2]);
  return upper.concat(lower).map(([z, h]) => (vertical ? [h, across, z] : [across, h, z]));
}

// A round-topped ring standing on a buried base, flat-sided below the
// crown: the dorsal fairing's sections.
function domeRing(z, hw, base, top) {
  const cy = Math.max(top - hw, base);
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI / 2 * i / 4;
    pts.push([hw * Math.sin(a), cy + hw * Math.cos(a), z]);
  }
  return pts.concat([[hw, base, z], [0, base, z]]);
}

// A thin plate from an outline in the y–z plane (z aft, y up), at offset x.
function finPlate(points, thickness, material, x) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);                 // shape x (z)→z, shape y→y, depth→x
  geo.translate(x + thickness / 2, 0, 0);
  return new THREE.Mesh(geo, material);
}

// The fuselage, chin intake and nozzle as one body: at each station (z),
// the right half of the section from the top down, traced from the drawing.
const BODY = [
  [-7.45, [0.00, -0.19, 0.01, -0.19, 0.01, -0.19, 0.01, -0.20, 0.02, -0.20, 0.02, -0.20, 0.02, -0.21, 0.02, -0.22, 0.02, -0.22, 0.01, -0.22, 0.01, -0.23, 0.01, -0.23, 0.00, -0.23]],
  [-6.85, [0.00, -0.17, 0.01, -0.17, 0.02, -0.18, 0.03, -0.18, 0.03, -0.19, 0.04, -0.20, 0.04, -0.21, 0.04, -0.22, 0.03, -0.23, 0.03, -0.24, 0.02, -0.24, 0.01, -0.25, 0.00, -0.25]],
  [-6.55, [0.00, -0.06, 0.04, -0.06, 0.07, -0.07, 0.11, -0.09, 0.13, -0.11, 0.14, -0.14, 0.15, -0.17, 0.14, -0.20, 0.13, -0.22, 0.11, -0.25, 0.07, -0.27, 0.04, -0.28, 0.00, -0.28]],
  [-6.17, [0.00, 0.07, 0.05, 0.07, 0.11, 0.06, 0.17, 0.04, 0.23, -0.01, 0.26, -0.07, 0.27, -0.14, 0.26, -0.21, 0.23, -0.27, 0.17, -0.31, 0.11, -0.33, 0.06, -0.34, 0.00, -0.34]],
  [-5.65, [0.00, 0.22, 0.08, 0.22, 0.16, 0.20, 0.25, 0.17, 0.33, 0.12, 0.39, 0.04, 0.41, -0.06, 0.40, -0.16, 0.34, -0.24, 0.25, -0.30, 0.17, -0.33, 0.08, -0.34, 0.00, -0.34]],
  [-5.14, [0.00, 0.35, 0.09, 0.35, 0.18, 0.33, 0.27, 0.29, 0.36, 0.22, 0.43, 0.13, 0.47, 0.02, 0.47, -0.11, 0.39, -0.21, 0.29, -0.27, 0.18, -0.30, 0.09, -0.32, 0.00, -0.32]],
  [-4.54, [0.00, 0.47, 0.10, 0.47, 0.21, 0.45, 0.32, 0.40, 0.42, 0.32, 0.49, 0.21, 0.53, 0.08, 0.54, -0.06, 0.48, -0.20, 0.36, -0.28, 0.22, -0.30, 0.11, -0.31, 0.00, -0.31]],
  [-4.10, [0.00, 0.73, 0.14, 0.72, 0.26, 0.66, 0.36, 0.57, 0.42, 0.46, 0.49, 0.35, 0.55, 0.22, 0.58, 0.06, 0.60, -0.12, 0.46, -0.24, 0.30, -0.28, 0.14, -0.30, 0.00, -0.30]],
  [-3.63, [0.00, 0.97, 0.16, 0.94, 0.29, 0.84, 0.36, 0.70, 0.37, 0.55, 0.42, 0.45, 0.50, 0.34, 0.56, 0.19, 0.66, -0.04, 0.53, -0.19, 0.35, -0.26, 0.17, -0.29, 0.00, -0.29]],
  [-3.15, [0.00, 1.08, 0.18, 1.05, 0.32, 0.94, 0.40, 0.79, 0.40, 0.63, 0.46, 0.53, 0.54, 0.41, 0.61, 0.24, 0.72, -0.00, 0.58, -0.16, 0.38, -0.24, 0.18, -0.27, 0.00, -0.27]],
  [-2.87, [0.00, 1.10, 0.19, 1.07, 0.34, 0.96, 0.43, 0.81, 0.44, 0.65, 0.50, 0.54, 0.59, 0.42, 0.67, 0.26, 0.78, 0.01, 0.63, -0.15, 0.41, -0.23, 0.20, -0.26, 0.00, -0.26]],
  [-2.68, [0.00, 1.10, 0.24, 1.02, 0.38, 0.77, 0.43, 0.55, 0.52, 0.42, 0.59, 0.28, 0.62, 0.12, 0.62, -0.04, 0.58, -0.21, 0.72, -0.60, 0.52, -0.78, 0.26, -0.84, 0.00, -0.86]],
  [-1.73, [0.00, 0.97, 0.22, 0.82, 0.38, 0.67, 0.50, 0.52, 0.59, 0.36, 0.70, 0.21, 0.80, 0.02, 0.58, -0.14, 0.69, -0.38, 0.70, -0.68, 0.54, -0.92, 0.25, -0.93, 0.00, -0.93]],
  [-0.78, [0.00, 0.78, 0.22, 0.74, 0.40, 0.61, 0.53, 0.45, 0.65, 0.29, 0.82, 0.14, 0.80, -0.08, 0.66, -0.26, 0.74, -0.51, 0.64, -0.71, 0.45, -0.86, 0.23, -0.92, 0.00, -0.94]],
  [0.16, [0.00, 0.69, 0.21, 0.66, 0.38, 0.55, 0.52, 0.41, 0.68, 0.28, 0.94, 0.14, 0.97, -0.11, 0.74, -0.31, 0.70, -0.51, 0.58, -0.69, 0.41, -0.83, 0.21, -0.90, 0.00, -0.91]],
  [1.11, [0.00, 0.65, 0.20, 0.62, 0.37, 0.52, 0.51, 0.40, 0.69, 0.29, 1.00, 0.15, 1.00, -0.11, 0.72, -0.31, 0.66, -0.50, 0.56, -0.68, 0.40, -0.81, 0.20, -0.87, 0.00, -0.88]],
  [2.05, [0.00, 0.64, 0.19, 0.62, 0.37, 0.53, 0.52, 0.41, 0.70, 0.29, 1.00, 0.16, 1.00, -0.11, 0.68, -0.29, 0.62, -0.47, 0.54, -0.65, 0.40, -0.79, 0.20, -0.85, 0.00, -0.86]],
  [3.00, [0.00, 0.65, 0.19, 0.63, 0.37, 0.55, 0.52, 0.43, 0.69, 0.31, 1.00, 0.18, 1.04, -0.09, 0.66, -0.27, 0.60, -0.44, 0.52, -0.61, 0.38, -0.76, 0.20, -0.82, 0.00, -0.83]],
  [3.95, [0.00, 0.57, 0.18, 0.55, 0.35, 0.47, 0.49, 0.36, 0.63, 0.23, 0.91, 0.11, 1.04, -0.13, 0.65, -0.30, 0.60, -0.48, 0.52, -0.65, 0.38, -0.80, 0.19, -0.83, 0.00, -0.83]],
  [4.85, [0.00, 0.61, 0.18, 0.59, 0.35, 0.52, 0.49, 0.40, 0.62, 0.27, 0.89, 0.15, 1.05, -0.08, 0.64, -0.25, 0.59, -0.42, 0.51, -0.58, 0.37, -0.71, 0.19, -0.76, 0.00, -0.77]],
  [5.68, [0.00, 0.71, 0.18, 0.69, 0.35, 0.62, 0.49, 0.50, 0.60, 0.35, 0.85, 0.24, 1.05, 0.01, 0.63, -0.16, 0.58, -0.33, 0.49, -0.48, 0.35, -0.61, 0.18, -0.67, 0.00, -0.69]],
  [6.33, [0.00, 0.57, 0.15, 0.56, 0.29, 0.50, 0.41, 0.41, 0.51, 0.29, 0.56, 0.15, 0.58, -0.00, 0.56, -0.15, 0.50, -0.29, 0.41, -0.41, 0.29, -0.50, 0.15, -0.55, 0.00, -0.57]],
  [6.85, [0.00, 0.51, 0.14, 0.49, 0.27, 0.44, 0.38, 0.36, 0.47, 0.25, 0.53, 0.13, 0.55, -0.01, 0.53, -0.15, 0.47, -0.27, 0.38, -0.38, 0.27, -0.46, 0.14, -0.51, 0.00, -0.53]],
  [7.23, [0.00, 0.42, 0.12, 0.40, 0.23, 0.36, 0.32, 0.29, 0.40, 0.20, 0.44, 0.10, 0.46, -0.01, 0.44, -0.12, 0.40, -0.22, 0.32, -0.31, 0.23, -0.38, 0.12, -0.42, 0.00, -0.44]],
];

// Strake and wing as one planform: the strake's edge curves out from the
// radome to 1.37 m off the centreline, the leading edge then sweeps 40°, the
// trailing edge is straight at z 3.75. Each station: [span, leading edge].
const WING_LE = [
  [0.30, -4.15], [0.62, -3.65], [0.80, -2.75], [0.94, -2.05], [1.10, -1.45], [1.30, -0.80],
  [1.37, -0.45], [1.44, -0.25], [2.00, 0.23], [3.00, 1.07], [4.00, 1.93], [4.62, 2.45],
];
const WING_TE = 3.75;

// Stabilators: 40° leading edge, straight trailing edge, a raked tip.
// [span, leading edge, trailing edge]
const STAB = [[0.50, 4.14, 7.20], [1.13, 4.70, 7.20], [2.00, 5.47, 7.20], [2.54, 5.95, 7.20], [2.77, 6.15, 6.90]];

// Fin: [height, leading edge, trailing edge, thickness], root to tip.
const FIN = [[0.90, 4.02, 6.80, 0.36], [1.06, 4.15, 6.66, 0.34], [1.60, 4.78, 6.88, 0.26], [2.09, 5.35, 7.11, 0.18], [2.60, 5.85, 7.35, 0.13], [2.99, 6.35, 7.55, 0.10]];

export function createAircraft() {
  const jet = new THREE.Group();

  // Body: the canopy glass sits above the sill between the windscreen and
  // the frame behind the seat; the intake mouth is the step down to the lip.
  const body = loft(BODY.map(([z, half]) => bodyRing(z, half)), (x, y, z) => {
    if (z > -4.4 && z < -1.7 && y > 0.47 && Math.abs(x) < 0.46) return 1;
    if (z > -2.9 && z < -2.66 && y < -0.15) return 2;
    return 0;
  });
  jet.add(new THREE.Mesh(body, [skin, glass, black]));
  const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), black);
  exhaust.position.z = 7.2;
  jet.add(exhaust);

  // Wings, 4 % thick aerofoils from a buried root to the tip, and their rails.
  for (const sx of [1, -1]) {
    const rings = WING_LE.map(([s, le]) => foilRing(sx * s, le, WING_TE, 0.04 * (WING_TE - le)));
    rings.push(foilRing(sx * 4.63, 2.46, WING_TE, 0.0));
    jet.add(new THREE.Mesh(loft(rings), skin));
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.63), dark);
    rail.position.set(sx * 4.68, 0, 2.44);
    jet.add(rail);
  }

  // Stabilators, a little below the wing plane.
  for (const sx of [1, -1]) {
    const rings = STAB.map(([s, le, te]) => foilRing(sx * s, le, te, 0.04 * (te - le)));
    rings.push(foilRing(sx * 2.78, 6.16, 6.89, 0.0));
    const stab = new THREE.Mesh(loft(rings), skin);
    stab.position.y = -0.08;
    jet.add(stab);
  }

  // Fin, from the fairing to the tip pod.
  const fin = FIN.map(([h, le, te, t]) => foilRing(h, le, te, t, true));
  fin.push(foilRing(3.04, 6.4, 7.6, 0.0, true));
  jet.add(new THREE.Mesh(loft(fin), skin));

  // Dorsal fairing: the spine rising from behind the canopy into the fin's
  // root, running on under the fin to the blunt pod behind the rudder. Its
  // base is buried in the body until the body falls away to the nozzle;
  // from there the pod's flat underside overhangs the nozzle with a gap.
  // [z, half-width, top, base]
  const DORSAL = [
    [2.10, 0.20, 0.66, 0.30], [2.60, 0.24, 0.78, 0.30], [3.15, 0.27, 0.89, 0.30], [3.75, 0.29, 1.02, 0.30],
    [4.15, 0.30, 1.10, 0.30], [5.00, 0.30, 1.04, 0.30], [6.00, 0.28, 0.96, 0.62], [6.45, 0.27, 1.00, 0.63],
    [6.70, 0.27, 1.14, 0.64], [7.00, 0.27, 1.16, 0.64], [7.12, 0.20, 1.05, 0.66], [7.17, 0.06, 0.90, 0.70],
  ];
  jet.add(new THREE.Mesh(loft(DORSAL.map(([z, hw, top, base]) => domeRing(z, hw, base, top))), skin));

  // Ventral fins, canted outward.
  for (const sx of [1, -1]) {
    const v = finPlate([[3.40, 0.02], [3.55, -0.44], [4.40, -0.44], [4.45, 0.02]], 0.06, skin, -0.03);
    v.position.set(sx * 0.45, -0.70, 0);
    v.rotation.z = -sx * 0.28;
    jet.add(v);
  }

  return jet;
}
