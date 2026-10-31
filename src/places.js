// The places to fly, and the F-16's way of finding them. Each place has an
// air start 5,000 ft above the ground, pointed at the sight, and the sight
// itself, which is its steerpoint. `patch` names the fine patch in
// terrain/region.json it lies in; `hud` is its short name for the HUD.
// Headings are degrees true; positions are latitude and longitude, turned
// into the simulation's north and east feet with the region's projection.
//
// Navigation the way the jet does it, with no menu: the places form a fixed
// loop (LOOP), and the HUD shows one steerpoint, the next place on the loop
// after the one you chose, stepping on when you pass within STEP_NM of it,
// as the jet's auto-sequencing does. The bullseye is a fixed point every
// position can be called from, as bearing and range; the HUD shows the jet's
// own.

import { METRES_PER_FOOT } from './render/frames.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const METRES_PER_NM = 1852;
export const START_AGL_FT = 5000;
export const STEP_NM = 2;            // passing within this of a steerpoint steps to the next
// The bullseye: Kanab Municipal Airport (KKNB), N 37°00'37.8" W 112°31'53.3" (FAA), near the middle of the five places. One point; move it here.
export const BULLSEYE = { lat: 37.010511, lon: -112.531478, name: 'Kanab Municipal Airport' };

export const PLACES = [
  { name: 'Zion National Park', hud: 'ZION', patch: 'Zion', start: { lat: 37.19, lon: -112.99, heading: 0 }, sight: { lat: 37.27, lon: -112.95 }, where: 'over Springdale, heading north up the canyon' },
  { name: 'Grand Canyon National Park', hud: 'GRAND CANYON', patch: 'Grand Canyon', start: { lat: 36.054, lon: -112.138, heading: 0 }, sight: { lat: 36.10, lon: -112.09 }, where: 'over Grand Canyon Village, heading north across the gorge' },
  { name: 'Bryce Canyon National Park', hud: 'BRYCE', patch: 'Bryce', start: { lat: 37.60, lon: -112.26, heading: 90 }, sight: { lat: 37.60, lon: -112.16 }, where: 'over the plateau west of Bryce Point, heading east over the amphitheatre' },
  { name: 'Lake Powell', hud: 'LAKE POWELL', patch: 'Lake Powell', start: { lat: 36.80, lon: -111.42, heading: 330 }, sight: { lat: 36.94, lon: -111.48 }, where: 'over the Echo Cliffs south-east of Page, heading north-west over Horseshoe Bend to the dam and the lake' },
  { name: 'Nellis AFB', hud: 'NELLIS', patch: 'Las Vegas', start: { lat: 36.236, lon: -115.034, heading: 230 }, sight: { lat: 36.236, lon: -115.034 }, where: 'over Nellis, heading south-west down the Strip' },
];
// The loop the steerpoints follow: Zion, Bryce, Lake Powell, the Grand Canyon, Las Vegas, and round again.
export const LOOP = ['Zion National Park', 'Bryce Canyon National Park', 'Lake Powell', 'Grand Canyon National Park', 'Nellis AFB'];

export function nextPlace(name) {
  return placeNamed(LOOP[(LOOP.indexOf(name) + 1) % LOOP.length]);
}

// Bearing (degrees true, 0..360) and range (nm) from one world point to
// another; world x east, z south, metres.
export function bearingRange(from, to) {
  const east = to.x - from.x, north = -(to.z - from.z);
  let bearing = Math.atan2(east, north) * R2D;
  if (bearing < 0) bearing += 360;
  return { bearing, range: Math.hypot(east, north) / METRES_PER_NM };
}

// "058 for 47": how the F-16 says a bearing and range.
export function callOf({ bearing, range }) {
  return `${String(Math.round(bearing) % 360).padStart(3, '0')} for ${Math.round(range)}`;
}

// A place's sight as the bullseye calls it.
export function bullseyeOf(place, projection) {
  return bearingRange(projection.toWorld(BULLSEYE.lat, BULLSEYE.lon), projection.toWorld(place.sight.lat, place.sight.lon));
}

// The route from a chosen place: `current` is the next place on the loop,
// `update(xz)` steps it on when the jet passes within STEP_NM of its sight.
export function createRoute(startName, projection) {
  let current = nextPlace(startName);
  const sightOf = (place) => projection.toWorld(place.sight.lat, place.sight.lon);
  return {
    get current() { return current; },
    get sight() { return sightOf(current); },
    update(xz) {
      if (bearingRange(xz, sightOf(current)).range < STEP_NM) current = nextPlace(current.name);
      return current;
    },
  };
}

export const DEFAULT_PLACE = PLACES[0].name;

export function placeNamed(name) {
  return PLACES.find((p) => p.name === name) ?? PLACES[0];
}

// The simulation's air start for a place: north and east (ft) from the
// world origin, h (ft) above sea level, psi (rad), from the region's
// projection and the ground sampler.
export function airStartFor(place, projection, sampler) {
  const { x, z } = projection.toWorld(place.start.lat, place.start.lon);
  return {
    north: -z / METRES_PER_FOOT,
    east: x / METRES_PER_FOOT,
    h: sampler.heightAt(x, z) / METRES_PER_FOOT + START_AGL_FT,
    psi: place.start.heading * D2R,
  };
}
