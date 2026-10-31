// The sky, the fog and the sun: a dome that fades to the horizon colour with
// an afternoon sun in the south-west and a scattered field of fair-weather
// cumulus painted on it, fog that hides the far edge, no shadows. The clouds
// are on the dome, infinitely far, so nothing is ever flown through: they
// are a texture of the sky, denser toward the horizon as a real cloud deck
// looks from below. The ground itself is terrain.js, which takes the fog and
// the sun from here. Metres; world x east, y up, z south.

import * as THREE from 'three';

const HORIZON = 0xb9c7d6;
const ZENITH = 0x3f78c8;
// The direction to the sun: 45° up, bearing 225° (south-west), mid-afternoon.
export const SUN = new THREE.Vector3(-0.5, 0.7071, 0.5).normalize();

const vertexShader = `
  varying vec3 dir;
  void main() { dir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Value noise, shared with the terrain's grain and ripple.
export const NOISE_GLSL = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

const fragmentShader = `
  uniform vec3 horizon, zenith, sun;
  varying vec3 dir;
  ${NOISE_GLSL}
  // four octaves of noise: the cloud field
  float fbm(vec2 p) { return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + 7.1) + 0.125 * noise(p * 4.11 + 3.7) + 0.0625 * noise(p * 8.07 + 1.3); }
  void main() {
    vec3 d = normalize(dir);
    float t = clamp(d.y * 2.2, 0.0, 1.0); t = t * t * (3.0 - 2.0 * t);
    vec3 sky = mix(horizon, zenith, t);
    // the sun: a disc, and a glow that also brightens the sky around it
    float s = max(dot(d, sun), 0.0);
    sky += vec3(1.0, 0.95, 0.85) * (0.35 * pow(s, 24.0) + 0.25 * pow(s, 200.0));
    sky = mix(sky, vec3(1.0, 0.98, 0.92), smoothstep(0.9993, 0.9997, s));
    // cumulus: the dome direction projected onto a flat deck above, so the
    // field compresses toward the horizon the way a real deck does
    float cloud = 0.0;
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.06) * 2.4;
      float n = fbm(uv);
      float cover = smoothstep(0.52, 0.68, n);                      // broken field, mostly clear overhead
      float body = smoothstep(0.52, 0.85, n);                       // thicker where the cloud is deeper
      vec3 colour = mix(vec3(1.0, 0.99, 0.97), vec3(0.78, 0.80, 0.84), body);   // bright edges, shaded cores
      colour += vec3(0.08, 0.06, 0.03) * s * s;                     // warmer toward the sun
      float edge = smoothstep(0.015, 0.10, d.y);                     // fades into the haze at the horizon
      cloud = cover * edge;
      sky = mix(sky, colour, cloud);
    }
    gl_FragColor = vec4(sky, 1.0);
  }`;

export function createWorld(scene) {
  scene.background = new THREE.Color(HORIZON);
  const fog = new THREE.Fog(HORIZON, 4000, 24000);
  scene.fog = fog;

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(28000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { horizon: { value: new THREE.Color(HORIZON) }, zenith: { value: new THREE.Color(ZENITH) }, sun: { value: SUN } },
      vertexShader, fragmentShader,
    }),
  );
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.copy(SUN);
  scene.add(sun, new THREE.HemisphereLight(0xdfe8f5, 0x4c5e3f, 0.9));

  return {
    fog, sun: sun.position,
    // keep the sky centred on the camera
    update(cameraPosition) { sky.position.copy(cameraPosition); },
  };
}
