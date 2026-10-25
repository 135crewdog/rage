// The places to fly: each has an air start 5,000 ft above the ground,
// pointed at the sight. `patch` names the fine patch in terrain/region.json
// it lies in; `hud` is its short name for the HUD.
// Headings are degrees true; positions are latitude and longitude, turned
// into the simulation's north and east feet with the region's projection.

import { METRES_PER_FOOT } from './render/frames.js';

const D2R = Math.PI / 180;
export const START_AGL_FT = 5000;

export const PLACES = [
  { name: 'Zion National Park', hud: 'ZION', patch: 'Zion', start: { lat: 37.19, lon: -112.99, heading: 0 }, where: 'over Springdale, heading north up the canyon' },
  { name: 'Grand Canyon National Park', hud: 'GRAND CANYON', patch: 'Grand Canyon', start: { lat: 36.054, lon: -112.138, heading: 0 }, where: 'over Grand Canyon Village, heading north across the gorge' },
  { name: 'Bryce Canyon National Park', hud: 'BRYCE', patch: 'Bryce', start: { lat: 37.60, lon: -112.26, heading: 90 }, where: 'over the plateau west of Bryce Point, heading east over the amphitheatre' },
  { name: 'Lake Powell', hud: 'LAKE POWELL', patch: 'Lake Powell', start: { lat: 36.80, lon: -111.42, heading: 330 }, where: 'over the Echo Cliffs south-east of Page, heading north-west over Horseshoe Bend to the dam and the lake' },
  { name: 'Nellis AFB', hud: 'NELLIS', patch: 'Las Vegas', start: { lat: 36.236, lon: -115.034, heading: 230 }, where: 'over Nellis, heading south-west down the Strip' },
];

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
