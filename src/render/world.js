// The flat world of milestone 1: ground at 0 ft with a grid fine enough to
// read speed and height from, a sky that fades to the horizon colour, fog
// that hides the far edge, and a sun from above. No shadows. Metres.

import * as THREE from 'three';

const HORIZON = 0xb9c7d6;
const ZENITH = 0x3f78c8;
const GROUND = 0x4c5e3f;

export function createWorld(scene) {
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 4000, 24000);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80000, 80000),
    new THREE.MeshLambertMaterial({ color: GROUND }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  scene.add(ground);

  // Two grids, 100 m and 1 km, moved under the camera in whole cells so they
  // look endless. Lines at 100 m read as motion at low level; the kilometre
  // lines read height and speed from altitude.
  const fine = new THREE.GridHelper(12000, 120, 0x6f8460, 0x6f8460);
  const coarse = new THREE.GridHelper(40000, 40, 0x8da37a, 0x8da37a);
  fine.material.transparent = coarse.material.transparent = true;
  fine.material.opacity = 0.6; coarse.material.opacity = 0.8;
  fine.position.y = 0; coarse.position.y = 0.05;
  scene.add(fine, coarse);

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
    // keep the sky centred on the camera and the grids under it
    update(cameraPosition) {
      sky.position.copy(cameraPosition);
      fine.position.x = Math.round(cameraPosition.x / 100) * 100;
      fine.position.z = Math.round(cameraPosition.z / 100) * 100;
      coarse.position.x = Math.round(cameraPosition.x / 1000) * 1000;
      coarse.position.z = Math.round(cameraPosition.z / 1000) * 1000;
      ground.position.x = cameraPosition.x;
      ground.position.z = cameraPosition.z;
    },
  };
}
