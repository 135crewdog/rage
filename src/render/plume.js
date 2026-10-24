// The afterburner plume: two nested cones behind the nozzle, a white-blue
// core inside an orange sheath, drawn additively with shock diamonds along
// their length. It grows with the burner fraction the engine reports (never
// the slider) and is hidden at dry power. Mesh-local axes as the jet's: the
// nozzle exit is at z +7.5 on the centreline, the plume trails along +z.

import * as THREE from 'three';

const NOZZLE_Z = 7.5;
const RADIUS = 0.42;         // m, the nozzle exit
const MIN_LENGTH = 3.0;      // m at minimum burner
const MAX_LENGTH = 9.0;      // m at full burner

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormalV, vPosV;
  void main() {
    vUv = uv;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    vPosV = p.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * p;
  }`;

// t runs from the nozzle (0) to the tip (1): the plume fades along it, and
// the diamonds are a standing wave in brightness that fades out with it.
const fragmentShader = `
  uniform vec3 colour;
  uniform float burner, time, core;
  varying vec2 vUv;
  varying vec3 vNormalV, vPosV;
  void main() {
    float t = vUv.y;
    float fade = pow(1.0 - t, 1.6);
    float diamonds = 0.55 + 0.45 * pow(abs(sin(t * (5.0 + 3.0 * burner) * 3.14159)), 6.0) * (1.0 - t);
    float flicker = 0.92 + 0.08 * sin(time * 71.0 + t * 20.0) * sin(time * 53.0);
    // brighter where the cone is seen through its thickness (near its silhouette)
    float rim = 1.0 - abs(dot(normalize(vNormalV), normalize(-vPosV)));
    float body = mix(0.35, 1.0, rim);
    float a = fade * diamonds * flicker * mix(body, 1.0, core) * (0.55 + 0.45 * burner);
    gl_FragColor = vec4(colour * a, a);
  }`;

function cone(radius, material) {
  // a cylinder along +z, wide end at z 0 and the narrow end at z 1: scaled to length later
  const geo = new THREE.CylinderGeometry(radius * 0.25, radius, 1, 18, 24, true);
  geo.rotateX(-Math.PI / 2);          // axis −y → +z: the wide end (bottom) ends up at +z
  geo.translate(0, 0, -0.5);          // ...so put the wide end at z 0, the narrow end at z −1
  geo.scale(1, 1, -1);                // and flip: wide end at 0, narrow end at +1
  return new THREE.Mesh(geo, material);
}

export function createPlume() {
  const make = (colour, core) => new THREE.ShaderMaterial({
    uniforms: { colour: { value: new THREE.Color(colour) }, burner: { value: 0 }, time: { value: 0 }, core: { value: core } },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const sheath = cone(RADIUS, make(0xff7a2a, 0));
  const inner = cone(RADIUS * 0.55, make(0xbfe0ff, 1));
  const group = new THREE.Group();
  group.position.z = NOZZLE_Z;
  group.add(sheath, inner);
  group.visible = false;
  let t = 0;

  return {
    mesh: group,
    // burner: 0 at dry power, 0..1 through the afterburner range; dt in seconds.
    update(burner, dt) {
      t += dt;
      group.visible = burner > 0;
      if (!group.visible) return;
      const length = MIN_LENGTH + (MAX_LENGTH - MIN_LENGTH) * burner;
      sheath.scale.set(1, 1, length);
      inner.scale.set(1, 1, length * 0.85);
      for (const m of [sheath.material, inner.material]) { m.uniforms.burner.value = burner; m.uniforms.time.value = t; }
    },
  };
}
