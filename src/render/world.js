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

  // The ground draws its own grid: 100 m and 1 km lines, one pixel wide
  // whatever the distance, each fading out before its cells get too small to
  // resolve, so nothing shimmers. Lines at 100 m read as motion at low
  // level; the kilometre lines read height and speed from altitude.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80000, 80000),
    new THREE.ShaderMaterial({
      uniforms: {
        ground: { value: new THREE.Color(GROUND) }, line: { value: new THREE.Color(0x7f9a6e) },
        fogColor: { value: new THREE.Color(HORIZON) }, fogNear: { value: 4000 }, fogFar: { value: 24000 },
      },
      vertexShader: `varying vec3 wp; varying float depth;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); wp = w.xyz; vec4 v = viewMatrix * w; depth = -v.z; gl_Position = projectionMatrix * v; }`,
      fragmentShader: `uniform vec3 ground, line, fogColor; uniform float fogNear, fogFar; varying vec3 wp; varying float depth;
        // how much of a line at this spacing covers the pixel, fading as cells shrink toward a pixel
        float grid(vec2 p, float spacing) {
          vec2 q = p / spacing;
          vec2 fw = fwidth(q);
          vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
          float a = 1.0 - min(min(g.x, g.y), 1.0);
          float fade = 1.0 - smoothstep(0.08, 0.3, max(fw.x, fw.y));
          return a * fade;
        }
        void main() {
          float a = max(0.55 * grid(wp.xz, 100.0), 0.9 * grid(wp.xz, 1000.0));
          vec3 c = mix(ground, line, a);
          float f = smoothstep(fogNear, fogFar, depth);
          gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
        }`,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

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
      // the plane follows the camera; the grid is drawn in world coordinates, so it stays put
      ground.position.x = cameraPosition.x;
      ground.position.z = cameraPosition.z;
    },
  };
}
