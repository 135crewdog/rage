// Rage: the composition root. Wires the simulation, the tilt input, the
// renderer, the HUD and the UI together. Nothing here changes the simulation
// except stick and throttle values passed into step().

import * as THREE from 'three';
import { Simulation, stepsFor, DT } from './sim/simulation.js';
import { IX, quaternionOf } from './sim/dynamics.js';
import { positionToWorld, attitudeToWorld, vectorToWorld, METRES_PER_FOOT } from './render/frames.js';
import * as Quat from './sim/quaternion.js';
import { createWorld } from './render/world.js';
import { createTerrain } from './render/terrain.js';
import { decodeHeights, createSampler, createProjection } from './render/heightmap.js';
import { placeNamed, airStartFor, createRoute, bearingRange, BULLSEYE, START_AGL_FT } from './places.js';
import { createAircraft } from './render/aircraft.js';
import { createChaseCamera } from './render/camera.js';
import { createLook, attachLook } from './input/look.js';
import { createHud } from './hud/hud.js';
import { createThrottle } from './ui/throttle.js';
import { createStickIndicator } from './ui/stick.js';
import { createScreens, loadPlace } from './ui/screens.js';
import { upInScreen, tiltOf, stickFrom, smooth, MAPPING } from './input/tilt.js';
import { APP_VERSION } from './version.js';

const AIR_START_KCAS = 350;   // the air start: START_AGL_FT above the ground at the chosen place, at this speed, trimmed
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

// ---- renderer, world, jet, camera, HUD ----
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 1, 30000);
const world = createWorld(scene);
const jet = createAircraft();
scene.add(jet);
// The ground: the region of terrain/region.json (see heightmap.js), a base
// tile and an atlas of fine patches, and the satellite imagery on the same
// grids. Each heightmap is drawn once to read its posts for the CPU sampler;
// the GPU reads the images directly.
let terrain = null;
async function loadTerrain() {
  const region = await (await fetch('./terrain/region.json')).json();
  const load = async (meta) => {
    const image = new Image();
    image.src = './terrain/' + meta.image;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = meta.w; canvas.height = meta.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return { image, heights: decodeHeights(ctx.getImageData(0, 0, meta.w, meta.h).data, meta.w * meta.h) };
  };
  const picture = async (name) => { const image = new Image(); image.src = './terrain/' + name; await image.decode(); return image; };
  const [base, atlas, colourBase, colourAtlas] = await Promise.all([load(region.base), load(region.atlas), picture(region.colour.base), picture(region.colour.atlas)]);
  return {
    sampler: createSampler(region, { base: base.heights, atlas: atlas.heights }),
    projection: createProjection(region),
    mesh: createTerrain(scene, region, { base: base.image, atlas: atlas.image, colourBase, colourAtlas }, world, Math.min(8, renderer.capabilities.getMaxAnisotropy())),
    region,
    colour: { base: { w: colourBase.width, h: colourBase.height }, atlas: { w: colourAtlas.width, h: colourAtlas.height } },
  };
}
// ground height in feet under a simulation state (north, east in feet)
function groundFt(state) {
  if (!terrain) return 0;
  return terrain.sampler.heightAt(state[IX.EAST] * METRES_PER_FOOT, -state[IX.NORTH] * METRES_PER_FOOT) / METRES_PER_FOOT;
}
const chase = createChaseCamera(camera);
const look = createLook();                  // look-around by dragging the view
attachLook(view, look, () => mode === 'flying');
const hud = createHud(document.getElementById('hud'));

let sizedW = 0, sizedH = 0;
let renderPending = true;     // draw the next frame even under an opaque screen: something changed
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  if (!w || !h) return;
  sizedW = w; sizedH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hud.resize();
  renderPending = true;
}
resize();   // and on every resize event, through onRotate below
// iOS can fire resize before the layout has settled, above all as a
// home-screen app at launch and on rotation, which leaves the camera with the
// wrong aspect; so every frame also checks the canvas's real size.
function resizeIfChanged() {
  if (view.clientWidth !== sizedW || view.clientHeight !== sizedH) resize();
}

// ---- simulation and flight state ----
let sim = null;               // made by airStart()
let mode = 'start';           // start | flying | paused | crashed
let carry = 0;
let prevPose = null, pose = null;
let throttleValue = 0;        // the trim setting, from airStart()
const stick = { pitch: 0, roll: 0 };
// Portrait: the rotate screen, whatever else was asked for.
const portrait = matchMedia('(orientation: portrait)');
// Read the viewport itself, not the media query's cached answer: an
// orientation event can arrive before the query has re-evaluated, and a
// screen chosen on the stale answer stayed wrong (the pause screen in
// portrait, with Resume refusing).
const isPortrait = () => innerHeight > innerWidth;
let wasPortrait = isPortrait();
let place = loadPlace();         // the place to fly from, chosen on the start screen
const screens = createScreens({
  version: APP_VERSION,
  onFly: fly, onResume: resume, onRecenter: recenter, onFlyAgain: flyAgain, onUpdate: applyUpdate,
  onPlace: (name) => { place = name; if (mode === 'start' && terrain) airStart(); },
  locked: () => (isPortrait() ? 'rotate' : null),
});
const throttle = createThrottle(document.getElementById('throttle'), throttleValue, (v) => { throttleValue = v; });
const stickIndicator = createStickIndicator(document.getElementById('stick'));
const controls = document.getElementById('controls');
document.getElementById('pause').addEventListener('click', pause);

function poseOf(state) {
  const p = positionToWorld(state[IX.NORTH], state[IX.EAST], state[IX.H]);
  const q = attitudeToWorld(quaternionOf(state));
  return { position: new THREE.Vector3(p[0], p[1], p[2]), quaternion: new THREE.Quaternion(q[0], q[1], q[2], q[3]) };
}

let route = null;              // the steerpoints from the chosen place round the loop
let bullseye = null;           // the bullseye's place in the world
let nav = null;                // what the HUD shows of them this frame
function airStart() {
  const start = terrain ? airStartFor(placeNamed(place), terrain.projection, terrain.sampler) : { h: START_AGL_FT };
  sim = new Simulation({ ...start, kcas: AIR_START_KCAS });
  route = terrain ? createRoute(place, terrain.projection) : null;
  bullseye = terrain ? terrain.projection.toWorld(BULLSEYE.lat, BULLSEYE.lon) : null;
  carry = 0;
  prevPose = pose = poseOf(sim.state);
  throttleValue = sim.trimThrottle;
  throttle.set(throttleValue);
  chase.reset();
  renderPending = true;
}
airStart();
// Fly waits for the jet and the ground: on a first visit they may still be downloading.
Promise.all([jet.ready, loadTerrain()]).then(([, t]) => {
  terrain = t;
  airStart();                                   // now 5,000 ft above the ground that is there
  screens.ready();
}, (e) => { console.error(e); screens.failed(); });

// ---- tilt input ----
const tilt = { pitch: 0, roll: 0, confidence: 0, beta: 0, gamma: 0, alpha: 0, seen: false, at: 0 };
let neutral = null;
let wantRecenter = true;
const smoothed = { pitch: 0, roll: 0 };

function screenAngle() {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

function onOrientation(e) {
  if (e.beta === null || e.gamma === null) return;
  const u = upInScreen(e.beta, e.gamma, screenAngle());
  const t = tiltOf(u);
  const now = performance.now();
  const dt = tilt.seen ? (now - tilt.at) / 1000 : 0;
  Object.assign(tilt, t, { beta: e.beta, gamma: e.gamma, alpha: e.alpha ?? 0, seen: true, at: now });
  if (wantRecenter && t.confidence > 0.3) {
    neutral = { pitch: t.pitch, roll: t.roll }; wantRecenter = false;
    screens.recentered(); stickIndicator.pulse();   // the tap did something: say so
  }
  if (!neutral) return;
  const s = stickFrom(t, neutral, MAPPING);
  smoothed.pitch = smooth(smoothed.pitch, s.pitch, dt);
  smoothed.roll = smooth(smoothed.roll, s.roll, dt);
  stick.pitch = smoothed.pitch;
  stick.roll = smoothed.roll;
}
window.addEventListener('deviceorientation', onOrientation);

function recenter() {
  wantRecenter = true;
  neutral = null;
  stick.pitch = stick.roll = smoothed.pitch = smoothed.roll = 0;
}

// The screen that belongs to the current mode (the rotate screen wins in portrait).
function showForMode() {
  if (mode === 'flying') screens.hide();
  else if (mode === 'paused') screens.show('pause');
  else if (mode === 'crashed') screens.show('crashed');
  else screens.show('start');
}

// ---- screens and modes ----
let wakeLock = null;
function keepAwake() {
  if (!navigator.wakeLock) return;
  navigator.wakeLock.request('screen').then((l) => { wakeLock = l; }).catch(() => {});
}

function fly() {
  // The motion permission request must be the first statement in the tap
  // handler, synchronously, or iOS refuses it.
  const permission = (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function')
    ? DeviceOrientationEvent.requestPermission()
    : Promise.resolve('granted');
  keepAwake();
  permission.then((state) => state === 'granted', () => false).then((granted) => {
    if (!granted) { screens.show('denied'); return; }
    recenter();
    startFlight();
  });
}

function startFlight() {
  if (isPortrait()) { screens.show('rotate'); return; }   // no flying in portrait
  mode = 'flying';
  controls.hidden = false;
  screens.hide();
  carry = 0;
}

function pause() {
  if (mode !== 'flying') return;
  mode = 'paused';
  look.reset();                               // resume from the plain chase view
  screens.show('pause');
  checkForUpdate();
}

function resume() {
  if (mode !== 'paused' || isPortrait()) return;
  mode = 'flying';
  screens.hide();
  carry = 0;
  keepAwake();
}

// Fly again returns to the start screen, at the air start of the chosen
// place, so a different place can be picked before the next flight.
function flyAgain() {
  if (isPortrait()) return;
  airStart();
  look.reset();
  mode = 'start';
  controls.hidden = true;
  screens.show('start');
}

function crash() {
  mode = 'crashed';
  controls.hidden = true;
  screens.show('crashed');
  checkForUpdate();
}

// Pause when the app is hidden; resume only from the pause screen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); } else { keepAwake(); checkForUpdate(); }
});

// Portrait: show the rotate screen; on any rotation during flight, pause and recenter.
function onRotate() {
  const p = isPortrait();
  if (p !== wasPortrait) {
    wasPortrait = p;
    if (p && mode === 'flying') pause();
    if (!p && mode === 'paused') recenter();
  }
  showForMode();
  resize();
}
portrait.addEventListener('change', onRotate);
window.addEventListener('resize', onRotate);   // whichever event comes last settles the screen on the viewport as it is
if (isPortrait()) screens.show('rotate');
// A flip between the two landscapes never changes the portrait query, but it
// turns the tilt frame by 180°: pause and recenter on any orientation change.
let lastAngle = screenAngle();
function onScreenAngle() {
  const a = screenAngle();
  if (a === lastAngle) return;
  lastAngle = a;
  if (mode === 'flying') pause();
  if (mode === 'paused') recenter();
  showForMode();
}
if (screen.orientation) screen.orientation.addEventListener('change', onScreenAngle);
window.addEventListener('orientationchange', onScreenAngle);

// ---- service worker and updates ----
let waiting = null, registration = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    registration = reg;
    const watch = (w) => {
      if (!w) return;
      if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; screens.offerUpdate(true); }
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; screens.offerUpdate(true); }
      });
    };
    watch(reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch(() => {});
  // Reload only for an update the pilot accepted: the first install also
  // takes control (clients.claim) and must not interrupt a flight.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateAccepted) location.reload(); });
}
// The browser looks for a new sw.js only on a navigation, and a home-screen
// app resumed from the background makes none; so ask whenever the app comes
// back to the screen and whenever flying stops. The offer still shows only
// on the start and pause screens, and nothing activates until it is taken.
function checkForUpdate() {
  if (registration) registration.update().catch(() => {});
}
let updateAccepted = false;
function applyUpdate() {
  if (!waiting) return;
  updateAccepted = true;
  waiting.postMessage('skip-waiting');
}

// ---- HUD projection: a direction in NED → where it falls on the screen ----
const projected = new THREE.Vector3();
function projectDirection([n, e, d]) {
  const w = vectorToWorld([n, e, d]);
  projected.set(camera.position.x + w[0] * 10000, camera.position.y + w[1] * 10000, camera.position.z + w[2] * 10000).project(camera);
  const behind = projected.z > 1;
  return { x: (projected.x + 1) / 2 * view.clientWidth, y: (1 - projected.y) / 2 * view.clientHeight, visible: !behind };
}
// The steerpoint and bullseye for the HUD: the route steps on when passed;
// the steerpoint's direction is to the sight on the ground, so it sits on it.
function navigation() {
  if (!route) return null;
  const x = sim.state;
  const here = { x: x[IX.EAST] * METRES_PER_FOOT, z: -x[IX.NORTH] * METRES_PER_FOOT };
  route.update(here);
  const sight = route.sight;
  const { bearing, range } = bearingRange(here, sight);
  const dn = (-sight.z - x[IX.NORTH] * METRES_PER_FOOT), de = (sight.x - x[IX.EAST] * METRES_PER_FOOT);
  const dd = x[IX.H] * METRES_PER_FOOT - terrain.sampler.heightAt(sight.x, sight.z);
  const m = Math.hypot(dn, de, dd) || 1;
  nav = { steer: { dir: [dn / m, de / m, dd / m], bearing, range, name: route.current.hud }, bullseye: bearingRange(bullseye, here) };
  return nav;
}
function velocityNed(state) {
  const v = Quat.bodyToNed(quaternionOf(state), [state[IX.U], state[IX.V], state[IX.W]]);
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}
function noseNed(state) {
  return Quat.bodyToNed(quaternionOf(state), [1, 0, 0]);
}

// ---- the loop ----
const debug = document.getElementById('debug');
debug.hidden = !DEBUG;
let last = performance.now();
let frames = 0, fpsAt = last, fps = 0;
const lerped = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

function frame(now) {
  requestAnimationFrame(frame);
  resizeIfChanged();
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;

  let fraction = 1;
  if (mode === 'flying') {
    const clock = stepsFor(carry, elapsed);
    carry = clock.carry;
    fraction = clock.fraction;
    for (let i = 0; i < clock.steps; i++) {
      prevPose = pose;
      sim.step(stick, throttleValue, DT);
      pose = poseOf(sim.state);
      if (sim.crashed || sim.state[IX.H] <= groundFt(sim.state)) { crash(); break; }   // the ground that is there
    }
  }

  // Under an opaque screen (start, settings, credits, rotate, denied) none
  // of the view shows: draw once after a change, then rest. The pause and
  // crash screens are translucent, so the view keeps drawing under them.
  const opaque = screens.current !== null && screens.current !== 'pause' && screens.current !== 'crashed';
  if (opaque && !renderPending) return;
  renderPending = false;

  // render between the last two physics states
  lerped.position.lerpVectors(prevPose.position, pose.position, fraction);
  lerped.quaternion.slerpQuaternions(prevPose.quaternion, pose.quaternion, fraction);
  jet.position.copy(lerped.position);
  jet.quaternion.copy(lerped.quaternion);
  const aux = sim.aux;
  look.update(elapsed);
  const power = sim.powerState;
  jet.plume.update(power.label === 'AB' ? power.percent / 100 : 0, elapsed);
  const sfc = sim.surfaces;
  jet.surfaces.set(sfc.el, sfc.ail, sfc.rdr);
  chase.update(elapsed, lerped.position, lerped.quaternion, { nz: aux.nz, alphaDeg: aux.alpha * 180 / Math.PI, qbar: aux.qbar }, look);
  world.update(camera.position);
  if (terrain) terrain.mesh.update(camera.position);
  renderer.render(scene, camera);

  const air = sim.airdata;
  if (terrain) air.ground = groundFt(sim.state);
  hud.draw(air, power, projectDirection, velocityNed(sim.state), noseNed(sim.state), look.active, navigation());
  if (mode === 'flying') stickIndicator.update(stick, sim.limited && stick.pitch > 0, !neutral || tilt.confidence < 0.3);   // under a screen it holds, so a recenter's glow waits for flight

  frames++;
  if (now - fpsAt > 500) { fps = frames * 1000 / (now - fpsAt); frames = 0; fpsAt = now; }
  if (DEBUG) {
    debug.textContent = [
      `β ${tilt.beta.toFixed(1)}  γ ${tilt.gamma.toFixed(1)}  α ${tilt.alpha.toFixed(0)}  screen ${screenAngle()}°`,
      `pitch ${tilt.pitch.toFixed(1)}  roll ${tilt.roll.toFixed(1)}  conf ${tilt.confidence.toFixed(2)}  neutral ${neutral ? `${neutral.pitch.toFixed(1)}/${neutral.roll.toFixed(1)}` : '—'}`,
      `stick ${stick.pitch.toFixed(2)} / ${stick.roll.toFixed(2)}  throttle ${throttleValue.toFixed(2)}`,
      `n_z ${air.nz.toFixed(2)}  α ${air.alpha.toFixed(1)}°  β ${air.beta.toFixed(1)}°  ${sim.limited ? 'LIMITER' : ''}${sim.backstop ? ' BACKSTOP' : ''}${sim.outOfEnvelope ? ' OUT' : ''}`,
      `${fps.toFixed(0)} fps  ${renderer.info.render.calls} draws  ${mode}`,
    ].join('\n');
  }
}
requestAnimationFrame(frame);

// A read-only hook for the browser smoke test and the debug overlay.
window.rage = {
  version: APP_VERSION,
  get mode() { return mode; },
  get sim() { return sim; },
  get stick() { return stick; },
  get look() { return look; },
  get plume() { return jet.plume.mesh; },
  get surfaces() { return jet.surfaces; },
  get ground() { return groundFt(sim.state); },
  get terrain() { return terrain; },
  get place() { return place; },
  get nav() { return nav; },
  set throttle(v) { throttleValue = v; throttle.set(v); },
  get neutral() { return neutral; },
  get draws() { return renderer.info.render.calls; },
  get hud() { return hud.anchors(); },   // where the HUD last drew each item, for the user guide's labelled picture
};
