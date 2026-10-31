// The acceptance flights of docs/flight-model.md 12.2, as measurements. Each
// check flies a manoeuvre and returns { name, pass, text } with the numbers it
// measured; manoeuvres.test.js asserts on them and the tuning script prints them.

import { flyManoeuvre } from './manoeuvres.js';

const inBand = (v, lo, hi) => v >= lo && v <= hi;
const f = (v, d = 2) => Number(v).toFixed(d);

function after(rows, t0) { return rows.filter((r) => r.t >= t0); }

export function check1() {
  const { rows } = flyManoeuvre('level');
  const late = after(rows, 2);
  const dev = Math.max(...late.map((r) => Math.abs(r.nz - 1)));
  const qMax = Math.max(...late.map((r) => Math.abs(r.q)));
  const pitchDrift = Math.abs(rows[rows.length - 1].pitch - rows[0].pitch);
  return { name: '1 wings level, stick released, 10 s', pass: dev <= 0.05 && pitchDrift < 2 && qMax < 1,
    text: `n_z within 1 ± ${f(dev, 3)} after 2 s, pitch drift ${f(pitchDrift, 2)}°, max |q| ${f(qMax, 2)} °/s` };
}

export function check2() {
  const { rows, summary } = flyManoeuvre('idle');
  const late = after(rows, 2);
  const dev = Math.max(...late.map((r) => Math.abs(r.nz - 1)));
  const qMax = Math.max(...late.map((r) => Math.abs(r.q)));
  const speedFell = rows[rows.length - 1].kcas < rows[0].kcas - 20;
  const alphaRose = rows[rows.length - 1].alpha > rows[0].alpha + 0.5;
  return { name: '2 throttle MIL → idle, stick released, 20 s', pass: dev <= 0.1 && speedFell && alphaRose && qMax < 1,
    text: `KCAS ${f(rows[0].kcas, 0)} → ${f(summary.kcasEnd, 0)}, α ${f(rows[0].alpha, 1)} → ${f(rows[rows.length - 1].alpha, 1)}°, n_z within 1 ± ${f(dev, 3)}, max |q| ${f(qMax, 2)} °/s` };
}

export function check3() {
  const { rows, summary } = flyManoeuvre('pull', { kcas: 450, t: 4.5 });
  const t0 = 0.5;
  const t8 = rows.find((r) => r.nz >= 8)?.t;
  const within3 = rows.filter((r) => r.t <= t0 + 3);
  const peak3 = Math.max(...within3.map((r) => r.nz));
  const pass = t8 !== undefined && t8 - t0 <= 1.5 && inBand(peak3, 8.7, 9.3) && summary.nzMax <= 9.5;
  return { name: '3 full aft stick at 450 KCAS', pass,
    text: `8 g at ${t8 === undefined ? 'never' : f(t8 - t0, 2) + ' s'}, peak ${f(peak3, 2)} g within 3 s, max ${f(summary.nzMax, 2)} g, α max ${f(summary.alphaMax, 1)}°` };
}

export function check4() {
  const { rows, summary } = flyManoeuvre('decel');
  const end = rows[rows.length - 1];
  const sinking = end.alt < rows[rows.length - 120].alt;
  const pass = summary.alphaMax <= 26 && inBand(end.alpha, 24, 25.5) && inBand(end.nz, 0.9, 1.1) && sinking;
  return { name: '4 idle, hold altitude to full aft stick', pass,
    text: `α max ${f(summary.alphaMax, 1)}°; at the end (${f(end.t, 0)} s, ${f(end.kcas, 0)} KCAS) α ${f(end.alpha, 1)}°, n_z ${f(end.nz, 2)}, ${sinking ? 'sinking' : 'not sinking'}` };
}

export function check5() {
  const { rows, summary } = flyManoeuvre('pull', { kcas: 200, t: 6 });
  const t0 = 0.5;
  const late = after(rows, t0 + 1.5);
  const aLo = Math.min(...late.map((r) => r.alpha)), aHi = Math.max(...late.map((r) => r.alpha));
  const pass = inBand(summary.nzMax, 2.7, 3.5) && summary.nzMax <= 4 && summary.alphaMax <= 26 && aLo >= 22 && aHi <= 25.5;
  return { name: '5 full aft stick at 200 KCAS', pass,
    text: `peak ${f(summary.nzMax, 2)} g, α max ${f(summary.alphaMax, 1)}°, α from 1.5 s on ${f(aLo, 1)}–${f(aHi, 1)}°` };
}

// 8.7: full-aft entries down to 100 KCAS, where the limiter must hold α at or
// below 26°. Below about 110 KCAS the 1 g trim is already past the limit
// (27.6° at 100 KCAS), so the entry starts above it: the limiter must bring
// α down within a second and hold it while the jet sinks.
export function check5b() {
  const { rows, summary } = flyManoeuvre('pull', { h: 10000, kcas: 100, t: 10 });
  const start = rows[0].alpha;
  const tBelow = rows.find((r) => r.alpha <= 26)?.t;
  const late = after(rows, 2);
  const aLo = Math.min(...late.map((r) => r.alpha)), aHi = Math.max(...late.map((r) => r.alpha));
  const pass = summary.alphaMax <= start + 0.05 && tBelow !== undefined && tBelow <= 1 && aLo >= 22 && aHi <= 26 && !summary.nan;
  return { name: '5b full aft stick entry at 100 KCAS (trim already past the limit)', pass,
    text: `α at start ${f(start, 1)}°, never above it, below 26° at ${tBelow === undefined ? 'never' : f(tBelow, 2) + ' s'}, held ${f(aLo, 1)}–${f(aHi, 1)}° from 2 s on while sinking to ${f(summary.altEnd, 0)} ft at ${f(summary.kcasEnd, 0)} KCAS` };
}

export function check6() {
  const { summary } = flyManoeuvre('push', { kcas: 450, t: 4.5 });
  const pass = inBand(summary.nzMin, -3.3, -2.7) && summary.nzMin >= -3.5;
  return { name: '6 full forward stick at 450 KCAS', pass, text: `min ${f(summary.nzMin, 2)} g, α min ${f(summary.alphaMin, 1)}°` };
}

// |β| through the first 360° of roll (and through each full roll after it,
// in perRoll), and the peak stability-axis roll rate.
function rollMetrics(rows, t0) {
  let turned = 0, prev = null, betaMax = 0, pMax = 0, tDone = null;
  const perRoll = [];
  for (const r of rows) {
    if (r.t < t0) continue;
    if (prev !== null) {
      let d = r.bank - prev;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      turned += d;
    }
    prev = r.bank;
    if (Math.abs(r.ps) > Math.abs(pMax)) pMax = r.ps;
    betaMax = Math.max(betaMax, Math.abs(r.beta));
    if (Math.abs(turned) >= 360) {
      if (tDone === null) tDone = r.t;
      perRoll.push(betaMax); betaMax = 0; turned = 0;
    }
  }
  return { pMax, betaMax: perRoll[0] ?? betaMax, perRoll, tDone, turned };
}

export function check7() {
  // flown on through four rolls: the sideslip of each is printed, because it grows (8.7)
  const { rows, summary } = flyManoeuvre('roll', { kcas: 350, t: 7 });
  const m = rollMetrics(rows, 0.5);
  const pass = inBand(m.pMax, 270, 330) && m.betaMax < 3 && m.tDone !== null;
  return { name: '7 full right stick, 1 g, 350 KCAS', pass,
    text: `peak roll rate ${f(m.pMax, 0)} °/s, |β| max ${f(m.betaMax, 2)}° through 360° (done at ${m.tDone === null ? 'never' : f(m.tDone - 0.5, 2) + ' s'}), then ${m.perRoll.slice(1).map((b) => f(b, 2) + '°').join(', ')} on the rolls after; n_z ${f(summary.nzMin, 2)}–${f(summary.nzMax, 2)}, α to ${f(summary.alphaMax, 1)}°` };
}

export function check8() {
  const { rows, summary } = flyManoeuvre('roll', { h: 500, kcas: 120, t: 4 });
  const m = rollMetrics(rows, 0.5);
  const pass = inBand(Math.abs(m.pMax), 80, 140) && summary.alphaMax <= 25 && m.betaMax < 3;
  return { name: '8 full right stick at 1 g, 20° AoA (120 KCAS, sea level)', pass,
    text: `α at start ${f(rows[0].alpha, 1)}°, peak roll rate ${f(m.pMax, 0)} °/s, α max ${f(summary.alphaMax, 1)}°, |β| max ${f(m.betaMax, 2)}°, rolled ${f(m.turned, 0)}°` };
}

export function check9() {
  const { rows } = flyManoeuvre('bank');
  const release = rows.find((r) => r.t >= 4);
  const window = rows.filter((r) => r.t >= 4 && r.t <= 14);
  const drift = Math.max(...window.map((r) => Math.abs(r.bank - release.bank)));
  const end = rows[rows.length - 1];
  const pass = drift <= 8 && end.pitch < release.pitch - 2;
  return { name: '9 stick released in a 60° bank', pass,
    text: `bank ${f(release.bank, 0)}° at release, drifts ${f(drift, 1)}° over 10 s; pitch ${f(release.pitch, 0)}° → ${f(end.pitch, 0)}°, n_z ${f(end.nz, 2)}` };
}

export function check10() {
  // Random stick from eight starts and two seeds each, 20 s a flight.
  const starts = [[20000, 150], [20000, 350], [20000, 600], [30000, 250], [5000, 700], [15000, 110], [10000, 200], [25000, 130]];
  let alphaMax = -Infinity, nan = false, backstops = 0, time = 0, crashes = 0;
  starts.flatMap(([h, kcas], i) => [[h, kcas, i + 1], [h, kcas, i + 9]]).forEach(([h, kcas, seed]) => {
    const { summary } = flyManoeuvre('random', { h, kcas, t: 20, seed });
    alphaMax = Math.max(alphaMax, summary.alphaMax);
    nan = nan || summary.nan;
    if (summary.backstop) backstops++;
    if (summary.crashed) crashes++;
    time += summary.tEnd;
  });
  const pass = !nan && alphaMax < 32;
  return { name: '10 random stick, 100–700 KCAS', pass,
    text: `${f(time, 0)} s flown over ${2 * starts.length} flights, α max ${f(alphaMax, 1)}°, backstop engaged in ${backstops}, crashes ${crashes}, NaN ${nan}` };
}

// 11: the stick released at a 1 g trim past the 15° limiter onset. The
// floor on the pilot's command is 0 g this slow; the limiter's subtraction
// comes after it (8.3, as in the jet), so the law unloads firmly to bring α
// down, and must do so without negative g and settle with the stabilator
// near neutral.
export function check11() {
  const results = [105, 115].map((kcas) => {
    const { rows, summary } = flyManoeuvre('level', { kcas, t: 5 });
    const tBelow = rows.find((r) => r.alpha < 15)?.t;
    const settled = after(rows, 3).every((r) => Math.abs(r.el) <= 5);
    return { kcas, start: rows[0].alpha, tBelow, nzMin: summary.nzMin, elMax: Math.max(...rows.map((r) => r.el)), settled, nan: summary.nan };
  });
  const pass = results.every((r) => r.tBelow !== undefined && r.tBelow <= 2 && r.nzMin >= 0 && r.nzMin <= 0.95 && r.settled && !r.nan);
  return { name: '11 stick released at a 1 g trim past the limiter onset (105 and 115 KCAS)', pass,
    text: results.map((r) => `${r.kcas} KCAS from α ${f(r.start, 1)}°: below 15° at ${r.tBelow === undefined ? 'never' : f(r.tBelow, 2) + ' s'}, n_z min ${f(r.nzMin, 2)}, stabilator to ${f(r.elMax, 1)}°, ${r.settled ? 'within ±5° from 3 s' : 'NOT settled by 3 s'}`).join('; ') };
}

export const CHECKS = [check1, check2, check3, check4, check5, check5b, check6, check7, check8, check9, check10, check11];

export function runChecks(only) {
  return CHECKS.filter((c) => !only || only.includes(c.name.replace('check', ''))).map((c) => c());
}
