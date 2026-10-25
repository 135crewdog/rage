import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLACES, DEFAULT_PLACE, placeNamed, airStartFor, START_AGL_FT } from '../src/places.js';
import { createProjection } from '../src/render/heightmap.js';
import { Simulation } from '../src/sim/simulation.js';
import { IX } from '../src/sim/dynamics.js';
import { METRES_PER_FOOT } from '../src/render/frames.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const region = JSON.parse(readFileSync(new URL('../terrain/region.json', import.meta.url)));
const projection = createProjection(region);

test('places: five, each starting well inside its own fine patch, with a heading', () => {
  assert.equal(PLACES.length, 5);
  assert.equal(DEFAULT_PLACE, 'Zion');
  for (const place of PLACES) {
    const patch = region.patches.find((p) => p.name === place.name);
    assert.ok(patch, `a patch named ${place.name}`);
    const { x, z } = projection.toWorld(place.start.lat, place.start.lon);
    const side = (patch.size - 1) * patch.post;
    const depth = Math.min(x - patch.x0, patch.x0 + side - x, z - patch.z0, patch.z0 + side - z);
    console.log(`  ${place.name}: start ${(depth / 1000).toFixed(1)} km inside its patch, heading ${place.start.heading}°`);
    assert.ok(depth > region.blend + 5000, `${place.name} starts more than 5 km inside the fine ground, past the blend band`);
    assert.ok(place.start.heading >= 0 && place.start.heading < 360);
  }
  assert.equal(placeNamed('Nowhere').name, 'Zion', 'an unknown name falls back to Zion');
});

test('places: the air start is 5,000 ft above the ground there, pointed the right way', () => {
  const sampler = { heightAt: () => 1000 };
  const s = airStartFor(placeNamed('Las Vegas'), projection, sampler);
  near(s.h, 1000 / METRES_PER_FOOT + START_AGL_FT, 0.01, 'height');
  near(s.psi, 230 * Math.PI / 180, 1e-12, 'heading');
  const { x, z } = projection.toWorld(36.236, -115.034);
  near(s.east * METRES_PER_FOOT, x, 1e-6, 'east'); near(-s.north * METRES_PER_FOOT, z, 1e-6, 'north');
  const zion = airStartFor(placeNamed('Zion'), projection, sampler);
  near(zion.north, 0, 1e-9); near(zion.east, 0, 1e-9); near(zion.psi, 0, 1e-12);
});

test('places: the simulation takes the heading and position and is still trimmed', () => {
  const sim = new Simulation({ h: 7000, kcas: 350, psi: 230 * Math.PI / 180, north: -1000, east: 2000 });
  near(sim.airdata.heading, 230, 0.01, 'heading');
  near(sim.state[IX.NORTH], -1000, 1e-9); near(sim.state[IX.EAST], 2000, 1e-9);
  near(sim.aux.nz, 1, 0.01, '1 g');
  near(sim.airdata.roll, 0, 0.01, 'wings level');
  sim.step(sim.trimStick, sim.trimThrottle); sim.step(sim.trimStick, sim.trimThrottle);
  near(sim.airdata.heading, 230, 0.05, 'heading holds');
  near(sim.state[IX.H], 7000, 1, 'height holds');
});

test('navigation: bearings and ranges in the flat world, and how the jet calls them', async () => {
  const { bearingRange, callOf, bullseyeOf, nextPlace, createRoute, LOOP, STEP_NM } = await import('../src/places.js');
  const o = { x: 0, z: 0 };
  near(bearingRange(o, { x: 0, z: -1852 }).bearing, 0, 1e-9, 'north'); near(bearingRange(o, { x: 0, z: -1852 }).range, 1, 1e-9, 'one mile');
  near(bearingRange(o, { x: 1852, z: 0 }).bearing, 90, 1e-9, 'east');
  near(bearingRange(o, { x: -1852, z: 1852 }).bearing, 225, 1e-9, 'south-west');
  assert.equal(callOf({ bearing: 58.4, range: 47.2 }), '058 for 47');
  assert.equal(callOf({ bearing: 359.6, range: 0.4 }), '000 for 0', 'rounds round the compass');
  const calls = Object.fromEntries(PLACES.map((p) => [p.name, bullseyeOf(p, projection)]));
  for (const [name, b, r] of [['Bryce', 58, 47], ['Lake Powell', 102, 74], ['Grand Canyon', 147, 78], ['Las Vegas', 238, 123]]) {
    console.log(`  ${name}: bullseye ${callOf(calls[name])}`);
    near(calls[name].bearing, b, 1.5, name); near(calls[name].range, r, 1.5, name);
  }
  assert.deepEqual(LOOP, ['Zion', 'Bryce', 'Lake Powell', 'Grand Canyon', 'Las Vegas']);
  assert.equal(nextPlace('Zion').name, 'Bryce');
  assert.equal(nextPlace('Las Vegas').name, 'Zion', 'the loop closes');
  assert.ok(PLACES.every((p) => LOOP.includes(p.name)), 'every place is on the loop');
});

test('navigation: the route steps on when the jet passes within 2 nm of the steerpoint', async () => {
  const { createRoute, STEP_NM } = await import('../src/places.js');
  const route = createRoute('Las Vegas', projection);
  assert.equal(route.current.name, 'Zion');
  const zion = route.sight;
  route.update({ x: zion.x + 3 * 1852, z: zion.z });
  assert.equal(route.current.name, 'Zion', '3 nm off: not yet');
  route.update({ x: zion.x + (STEP_NM - 0.1) * 1852, z: zion.z });
  assert.equal(route.current.name, 'Bryce', 'inside 2 nm: the next place');
  route.update({ x: zion.x, z: zion.z });
  assert.equal(route.current.name, 'Bryce', 'and it stays stepped');
});
