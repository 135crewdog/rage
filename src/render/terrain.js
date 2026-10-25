// The ground: a heightmap tile drawn as a geometry clipmap, the standard way
// to put a big landscape on a small device. Nested square grids of the same
// vertex count but doubling spacing follow the camera, each snapped to its
// own grid so nothing swims, each with a hole where the finer one sits; the
// vertex shader lifts every vertex to the height read from the heightmap
// (the same image heightmap.js samples on the CPU), and the fragment shader
// colours the ground by height and slope with a fine grain, lit by the sun
// and faded into the fog. Metres; world x east, z south, y up.

import * as THREE from 'three';

const LEVELS = 6;      // 0.96, 1.9, 3.8, 7.7, 15, 31 km across: out to the far plane
const N = 96;          // cells per side of every level
const SPACING = 10;    // m, the finest level's cell

// Both shaders read the heightmap the same way heightmap.js does: 16-bit
// posts in red and green, bilinear between them, clamped at the tile's edge.
const heightGlsl = `
  uniform sampler2D heightMap;
  uniform float size, metres, minH, rangeH;
  uniform vec2 start;
  float post(vec2 ij) {
    vec2 c = clamp(ij, vec2(0.0), vec2(size - 1.0));
    vec4 t = texture2D(heightMap, (c + 0.5) / size);
    return minH + (t.r * 65280.0 + t.g * 255.0) / 65535.0 * rangeH;
  }
  float height(vec2 xz) {
    vec2 p = clamp(start + xz / (metres / (size - 1.0)), vec2(0.0), vec2(size - 1.0));
    vec2 i = min(floor(p), vec2(size - 2.0)); vec2 f = p - i;
    return mix(mix(post(i), post(i + vec2(1.0, 0.0)), f.x), mix(post(i + vec2(0.0, 1.0)), post(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

const vertexShader = `${heightGlsl}
  uniform vec2 centre; uniform float spacing;
  attribute vec2 edge;    // on a level's outer edge, between two of the coarser level's posts: average them, so levels meet without cracks
  varying vec3 wp;
  void main() {
    vec2 xz = centre + position.xz * spacing;
    float h = (edge.x != 0.0 || edge.y != 0.0) ? 0.5 * (height(xz - edge * spacing) + height(xz + edge * spacing)) : height(xz);
    wp = vec3(xz.x, h, xz.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

const fragmentShader = `${heightGlsl}
  uniform vec3 sun, fogColor; uniform float fogNear, fogFar;
  varying vec3 wp;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    // the slope from the heightmap at a fixed 30 m step, the same at every level
    float d = 30.0;
    float hx = height(wp.xz + vec2(d, 0.0)) - height(wp.xz - vec2(d, 0.0));
    float hz = height(wp.xz + vec2(0.0, d)) - height(wp.xz - vec2(0.0, d));
    vec3 n = normalize(vec3(-hx, 2.0 * d, -hz));
    float slope = 1.0 - n.y;
    // Zion's bands: green along the river, sandstone on the walls, pale plateau on top, grey where it is steep
    float t = clamp((wp.y - minH) / rangeH, 0.0, 1.0);
    vec3 valley = vec3(0.34, 0.44, 0.26), sandstone = vec3(0.66, 0.40, 0.29), plateau = vec3(0.74, 0.64, 0.50), rock = vec3(0.48, 0.42, 0.40);
    vec3 c = mix(valley, sandstone, smoothstep(0.08, 0.40, t));
    c = mix(c, plateau, smoothstep(0.55, 0.90, t));
    c = mix(c, rock, smoothstep(0.20, 0.55, slope));
    // a grain at two scales so the ground reads as moving at low level, fading before it aliases
    float dist = length(wp - cameraPosition);
    float grain = 0.6 * noise(wp.xz / 50.0) + 0.4 * noise(wp.xz / 7.0);
    c *= mix(0.84 + 0.16 * grain, 0.92, smoothstep(1500.0, 6000.0, dist));
    float light = max(dot(n, sun), 0.0) * 0.85 + 0.35;
    float f = smoothstep(fogNear, fogFar, dist);
    gl_FragColor = vec4(mix(c * light, fogColor, f), 1.0);
  }`;

// One level's grid: (N+1)² vertices in cell units, with the edge attribute,
// and four index sets for the four places the finer level's hole can sit.
function levelGeometry(withHole) {
  const positions = [], edges = [];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      positions.push(i - N / 2, 0, j - N / 2);
      const onX = j === 0 || j === N, onZ = i === 0 || i === N;
      edges.push(onX && i % 2 === 1 ? 1 : 0, onZ && j % 2 === 1 ? 1 : 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('edge', new THREE.Float32BufferAttribute(edges, 2));
  const variants = [];
  for (const dy of [0, 1]) {
    for (const dx of [0, 1]) {
      const index = [];
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          if (withHole && i >= N / 4 + dx && i < 3 * N / 4 + dx && j >= N / 4 + dy && j < 3 * N / 4 + dy) continue;
          const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
          index.push(a, c, b, b, c, d);
        }
      }
      variants.push(new THREE.Uint32BufferAttribute(index, 1));
    }
  }
  geo.setIndex(variants[0]);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return { geo, variants };
}

// image: the heightmap image; meta as heightmap.js describes; world: the
// world's fog and sun to match.
export function createTerrain(scene, image, meta, world) {
  const texture = new THREE.Texture(image);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;                 // row 0 is the tile's north edge
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  const shared = {
    heightMap: { value: texture }, size: { value: meta.size }, metres: { value: meta.metres },
    minH: { value: meta.min }, rangeH: { value: meta.max - meta.min }, start: { value: new THREE.Vector2(meta.start[0], meta.start[1]) },
    sun: { value: world.sun.clone().normalize() }, fogColor: { value: world.fog.color }, fogNear: { value: world.fog.near }, fogFar: { value: world.fog.far },
  };
  const levels = [];
  for (let l = 0; l < LEVELS; l++) {
    const { geo, variants } = levelGeometry(l > 0);
    const material = new THREE.ShaderMaterial({
      uniforms: { ...shared, centre: { value: new THREE.Vector2() }, spacing: { value: SPACING * 2 ** l } },
      vertexShader, fragmentShader,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    levels.push({ mesh, variants, spacing: SPACING * 2 ** l });
  }
  return {
    // place every level under the camera: each snaps to twice its spacing, so
    // the finer level inside it lands on its grid, one cell over or not
    update(cameraPosition) {
      let finer = null;
      for (const level of levels) {
        const step = 2 * level.spacing;
        const cx = Math.floor(cameraPosition.x / step) * step, cz = Math.floor(cameraPosition.z / step) * step;
        level.mesh.material.uniforms.centre.value.set(cx, cz);
        if (finer) {
          const dx = Math.round((finer.x - cx) / level.spacing), dz = Math.round((finer.z - cz) / level.spacing);
          level.mesh.geometry.setIndex(level.variants[dz * 2 + dx]);
        }
        finer = { x: cx, z: cz };
      }
    },
  };
}
