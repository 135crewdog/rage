// The sky, the fog and the sun: a dome that fades to the horizon colour, fog
// that hides the far edge, a sun from above, no shadows. The ground itself is
// terrain.js, which takes the fog and sun from here. Metres.

import * as THREE from 'three';

const HORIZON = 0xb9c7d6;
const ZENITH = 0x3f78c8;

export function createWorld(scene) {
  scene.background = new THREE.Color(HORIZON);
  const fog = new THREE.Fog(HORIZON, 4000, 24000);
  scene.fog = fog;

  // Sky: a dome with a vertical gradient from the horizon colour to the zenith.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(28000, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { horizon: { value: new THREE.Color(HORIZON) }, zenith: { value: new THREE.Color(ZENITH) } },
      vertexShader: `varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; varying float h;
        void main() { float t = clamp(h * 2.2, 0.0, 1.0); t = t * t * (3.0 - 2.0 * t); gl_FragColor = vec4(mix(horizon, zenith, t), 1.0); }`,
    }),
  );
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(0.3, 1, 0.2);
  scene.add(sun, new THREE.HemisphereLight(0xdfe8f5, 0x4c5e3f, 0.9));

  return {
    fog, sun: sun.position,
    // keep the sky centred on the camera
    update(cameraPosition) { sky.position.copy(cameraPosition); },
  };
}
