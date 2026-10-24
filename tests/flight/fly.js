#!/usr/bin/env node
// Headless flight script: flies a manoeuvre with the full simulation and
// prints a time history, so FCS tuning is visible.
//
//   node tests/flight/fly.js <manoeuvre> [options]
//
// Manoeuvres: level, idle, pull, push, roll, bank, slowroll, random
// Options:   --h=10000 --kcas=350 --t=10 --every=0.25 --pitch=1 --roll=1 --throttle=0.77

import { Simulation } from '../../src/sim/simulation.js';
import { flyManoeuvre, MANOEUVRES } from './manoeuvres.js';

const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : Number(v)];
}));
const name = process.argv[2];
if (!name || !MANOEUVRES[name]) {
  console.log('manoeuvres:', Object.keys(MANOEUVRES).join(', '));
  process.exit(1);
}

const every = args.every ?? 0.25;
const cols = ['t', 'KCAS', 'alt', 'alpha', 'nz', 'q', 'el', 'bank', 'p', 'beta', 'rdr', 'pitch', 'stick'];
const widths = [6, 6, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 11];
console.log(cols.map((c, i) => c.padStart(widths[i])).join(''));
let next = 0;
const history = flyManoeuvre(name, args, (sim, stick) => {
  if (sim.time + 1e-9 >= next) {
    next += every;
    const a = sim.airdata, x = sim.state;
    const row = [
      sim.time.toFixed(2), a.kcas.toFixed(0), a.altitude.toFixed(0), a.alpha.toFixed(1), a.nz.toFixed(2),
      (x[8] * 180 / Math.PI).toFixed(1), x[14].toFixed(1), a.roll.toFixed(0), (x[7] * 180 / Math.PI).toFixed(0),
      a.beta.toFixed(1), x[16].toFixed(1), a.pitch.toFixed(0),
      `${stick.pitch.toFixed(2)}/${stick.roll.toFixed(2)}`,
    ];
    console.log(row.map((c, i) => String(c).padStart(widths[i])).join(''));
  }
});
console.log('\nsummary:', JSON.stringify(history.summary, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)));
