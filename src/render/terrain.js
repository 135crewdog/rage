// The ground: the region's heightmaps drawn as a geometry clipmap, the
// standard way to put a big landscape on a small device. Nested square grids
// of the same vertex count but doubling spacing follow the camera, each
// snapped to its own grid so nothing swims, each with a hole where the finer
// one sits; the vertex shader lifts every vertex to the height read from the
// heightmaps (the same lookup heightmap.js does on the CPU), and the fragment
// shader colours the ground by height and slope with a fine grain, paints
// the lakes where the survey is flat at their levels, lights it by the sun
// and fades it into the fog. The grids are positioned relative to the
// camera, so single-precision positions stay exact 250 km from the origin.
// Metres; world x east, z south, y up.

import * as THREE from 'three';

const LEVELS = 7;      // 0.96, 1.9, 3.8, 7.7, 15, 31, 61 km across: the outer edge is 29 km off, past the fog's end at 24 km
const N = 96;          // cells per side of every level
const SPACING = 10;    // m, the finest level's cell

// Both shaders read the heightmaps the same way heightmap.js does: 16-bit
// posts in red and green, bilinear between them; each patch covering the
// point laid over the base in turn, coarsest first, blended in across the
// band inside its edge; and the base eased to one flat height across the
// band inside its own.
function heightGlsl(patches) {
  return `
  uniform sampler2D baseMap, atlasMap;
  uniform vec4 baseGrid;          // x0, z0, post, flat
  uniform vec2 baseSize, atlasSize, baseRange, atlasRange;   // posts; min, max − min
  uniform float blend, fade;
  uniform vec4 patchRect[${patches}];   // x0, z0, side, post; coarsest first
  uniform vec4 patchPix[${patches}];    // px, py, size
  float decode(vec4 t, vec2 range) { return range.x + (t.r * 65280.0 + t.g * 255.0) / 65535.0 * range.y; }
  float basePost(vec2 ij) { return decode(texture2D(baseMap, (ij + 0.5) / baseSize), baseRange); }
  float atlasPost(vec2 ij) { return decode(texture2D(atlasMap, (ij + 0.5) / atlasSize), atlasRange); }
  float baseHeight(vec2 xz) {
    vec2 p = clamp((xz - baseGrid.xy) / baseGrid.z, vec2(0.0), baseSize - 1.0);
    vec2 i = min(floor(p), baseSize - 2.0); vec2 f = p - i;
    return mix(mix(basePost(i), basePost(i + vec2(1.0, 0.0)), f.x), mix(basePost(i + vec2(0.0, 1.0)), basePost(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float patchHeight(vec2 xz, vec4 rect, vec4 pix) {
    vec2 p = clamp((xz - rect.xy) / rect.w, vec2(0.0), vec2(pix.z - 1.0));
    vec2 i = min(floor(p), vec2(pix.z - 2.0)); vec2 f = p - i;
    i += pix.xy;
    return mix(mix(atlasPost(i), atlasPost(i + vec2(1.0, 0.0)), f.x), mix(atlasPost(i + vec2(0.0, 1.0)), atlasPost(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float inside(vec2 xz, vec2 o, vec2 wh, float band) {
    vec2 d = min(xz - o, o + wh - xz);
    return clamp(min(d.x, d.y) / band, 0.0, 1.0);
  }
  // each patch's weight at xz: how far inside its edge band the point is
  void weigh(vec2 xz, out float w[${patches}]) {
    for (int i = 0; i < ${patches}; i++) w[i] = inside(xz, patchRect[i].xy, patchRect[i].zz, blend);
  }
  // the ground at xz with the patches weighed at w (the point's own, or a neighbour's for a slope)
  float heightWith(vec2 xz, float w[${patches}]) {
    float h = baseHeight(xz);
    for (int i = 0; i < ${patches}; i++) if (w[i] > 0.0) h += w[i] * (patchHeight(xz, patchRect[i], patchPix[i]) - h);
    float outer = inside(xz, baseGrid.xy, (baseSize - 1.0) * baseGrid.z, fade);
    return baseGrid.w + outer * (h - baseGrid.w);
  }
  float height(vec2 xz) { float w[${patches}]; weigh(xz, w); return heightWith(xz, w); }`;
}

const vertexShader = (patches) => `${heightGlsl(patches)}
  uniform vec2 rel;       // the level's centre relative to the camera, so positions stay small
  uniform float spacing;
  attribute vec2 edge;    // on a level's outer edge, between two of the coarser level's posts: average them, so levels meet without cracks
  varying vec3 wp;        // world position
  varying vec3 rp;        // position relative to the camera
  void main() {
    vec2 r = rel + position.xz * spacing;
    vec2 xz = cameraPosition.xz + r;
    float h = (edge.x != 0.0 || edge.y != 0.0) ? 0.5 * (height(xz - edge * spacing) + height(xz + edge * spacing)) : height(xz);
    wp = vec3(xz.x, h, xz.y);
    rp = vec3(r.x, h - cameraPosition.y, r.y);
    gl_Position = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(rp, 1.0);
  }`;

const fragmentShader = (patches, lakes) => `${heightGlsl(patches)}
  uniform vec3 sun, fogColor; uniform float fogNear, fogFar;
  uniform vec4 lakeBox[${lakes}];     // x0, z0, x1, z1
  uniform float lakeLevel[${lakes}];  // m above the sea
  varying vec3 wp, rp;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    // the slope from the heightmaps at a fixed 30 m step, the same at every level; the point's patch weights serve all four reads
    float d = 30.0;
    float w[${patches}]; weigh(wp.xz, w);
    float hx = heightWith(wp.xz + vec2(d, 0.0), w) - heightWith(wp.xz - vec2(d, 0.0), w);
    float hz = heightWith(wp.xz + vec2(0.0, d), w) - heightWith(wp.xz - vec2(0.0, d), w);
    vec3 n = normalize(vec3(-hx, 2.0 * d, -hz));
    float slope = 1.0 - n.y;
    // the region's bands by height above the sea: desert floor, green valleys, sandstone walls, pale plateaus; grey where it is steep
    vec3 desert = vec3(0.70, 0.60, 0.46), valley = vec3(0.34, 0.44, 0.26), sandstone = vec3(0.66, 0.40, 0.29), plateau = vec3(0.74, 0.64, 0.50), rock = vec3(0.48, 0.42, 0.40);
    vec3 c = mix(desert, valley, smoothstep(950.0, 1150.0, wp.y));
    c = mix(c, sandstone, smoothstep(1150.0, 1850.0, wp.y));
    c = mix(c, plateau, smoothstep(2150.0, 2950.0, wp.y));
    c = mix(c, rock, smoothstep(0.20, 0.55, slope));
    // a grain at two scales so the ground reads as moving at low level, fading before it aliases
    float dist = length(rp);
    float grain = 0.6 * noise(wp.xz / 50.0) + 0.4 * noise(wp.xz / 7.0);
    c *= mix(0.84 + 0.16 * grain, 0.92, smoothstep(1500.0, 6000.0, dist));
    float light = max(dot(n, sun), 0.0) * 0.85 + 0.35;
    c *= light;
    // water: where the ground is flat at a lake's level inside its box. The
    // survey recorded the lakes full, as flat ground; this paints them.
    float water = 0.0;
    for (int i = 0; i < ${lakes}; i++) {
      vec4 b = lakeBox[i];
      if (wp.x > b.x && wp.x < b.z && wp.z > b.y && wp.z < b.w) {
        float dh = abs(wp.y - lakeLevel[i]);
        water = max(water, (1.0 - smoothstep(1.0, 2.5, dh)) * (1.0 - smoothstep(0.003, 0.010, slope)));
      }
    }
    if (water > 0.0) {
      vec2 rip = vec2(noise(wp.xz / 9.0 + 3.0), noise(wp.xz / 9.0 + 11.0)) - 0.5;   // a faint ripple
      vec3 nw = normalize(vec3(rip.x * 0.06, 1.0, rip.y * 0.06));
      vec3 v = normalize(-rp);
      float grazing = pow(1.0 - max(dot(nw, v), 0.0), 3.0);
      vec3 deep = vec3(0.07, 0.22, 0.30);
      vec3 cw = mix(deep, fogColor, 0.15 + 0.55 * grazing);                               // the sky in it, more at a low angle
      cw += vec3(1.0, 0.95, 0.85) * 0.7 * pow(max(dot(nw, normalize(v + sun)), 0.0), 90.0);   // the sun's glint
      c = mix(c, cw, water);
    }
    float f = smoothstep(fogNear, fogFar, dist);
    gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
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

function heightTexture(image) {
  const texture = new THREE.Texture(image);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;                 // row 0 is the tile's north edge
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// region: the parsed region.json; images: { base, atlas } the two heightmap
// images; world: the world's fog and sun to match.
export function createTerrain(scene, region, images, world) {
  const { base, atlas } = region;
  const patches = [...region.patches].sort((a, b) => b.post - a.post);   // coarsest first, so the finest ends on top
  const lakes = region.lakes ?? [];
  const shared = {
    baseMap: { value: heightTexture(images.base) }, atlasMap: { value: heightTexture(images.atlas) },
    baseGrid: { value: new THREE.Vector4(base.x0, base.z0, base.post, base.flat) },
    baseSize: { value: new THREE.Vector2(base.w, base.h) }, atlasSize: { value: new THREE.Vector2(atlas.w, atlas.h) },
    baseRange: { value: new THREE.Vector2(base.min, base.max - base.min) }, atlasRange: { value: new THREE.Vector2(atlas.min, atlas.max - atlas.min) },
    blend: { value: region.blend }, fade: { value: region.fade },
    patchRect: { value: patches.map((p) => new THREE.Vector4(p.x0, p.z0, (p.size - 1) * p.post, p.post)) },
    patchPix: { value: patches.map((p) => new THREE.Vector4(p.px, p.py, p.size, 0)) },
    sun: { value: world.sun.clone().normalize() }, fogColor: { value: world.fog.color }, fogNear: { value: world.fog.near }, fogFar: { value: world.fog.far },
    lakeBox: { value: lakes.map((l) => new THREE.Vector4(l.x0, l.z0, l.x1, l.z1)) }, lakeLevel: { value: lakes.map((l) => l.level) },
  };
  const levels = [];
  for (let l = 0; l < LEVELS; l++) {
    const { geo, variants } = levelGeometry(l > 0);
    const material = new THREE.ShaderMaterial({
      uniforms: { ...shared, rel: { value: new THREE.Vector2() }, spacing: { value: SPACING * 2 ** l } },
      vertexShader: vertexShader(patches.length), fragmentShader: fragmentShader(patches.length, Math.max(1, lakes.length)),
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
        level.mesh.material.uniforms.rel.value.set(cx - cameraPosition.x, cz - cameraPosition.z);
        if (finer) {
          const dx = Math.round((finer.x - cx) / level.spacing), dz = Math.round((finer.z - cz) / level.spacing);
          level.mesh.geometry.setIndex(level.variants[dz * 2 + dx]);
        }
        finer = { x: cx, z: cz };
      }
    },
  };
}
