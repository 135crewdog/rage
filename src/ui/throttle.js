// The throttle: a slim vertical slider on the left edge, driven by pointer
// events with pointer capture, keeping its value when released. A detent at
// MIL (0.77): a finger anywhere in a band just below the mark, or in the gap
// above it, puts the throttle exactly at MIL with the thumb on the mark, so
// a pilot reaching for MIL gets MIL; the gap above has to be crossed to enter
// afterburner. The dry range below the band is stretched a little so every
// dry power setting is still reachable.

import { MIL_THROTTLE } from '../sim/engine.js';

const GAP = 0.12;    // fraction of the track the thumb must cross past MIL (doubled after the first flights)
const SNAP = 0.06;   // fraction of the track below MIL that reads as MIL: about a fingertip's uncertainty
const DRY = MIL_THROTTLE - SNAP;   // the track below the detent, which carries the whole dry range 0..MIL

// Pointer position along the track (0 bottom .. 1 top) → throttle 0..1.
export function throttleFromPosition(pos) {
  const p = Math.max(0, Math.min(1, pos));
  if (p <= DRY) return p / DRY * MIL_THROTTLE;
  if (p <= MIL_THROTTLE + GAP) return MIL_THROTTLE;
  return MIL_THROTTLE + (p - MIL_THROTTLE - GAP) / (1 - MIL_THROTTLE - GAP) * (1 - MIL_THROTTLE);
}

// The inverse, for drawing the thumb: at MIL it sits on the mark.
export function positionFromThrottle(t) {
  if (t < MIL_THROTTLE) return t / MIL_THROTTLE * DRY;
  if (t === MIL_THROTTLE) return MIL_THROTTLE;
  return MIL_THROTTLE + GAP + (t - MIL_THROTTLE) / (1 - MIL_THROTTLE) * (1 - MIL_THROTTLE - GAP);
}

export function createThrottle(root, initial, onChange) {
  const track = root.querySelector('.track');
  const thumb = root.querySelector('.thumb');
  const mil = root.querySelector('.mil');
  let value = initial;
  mil.style.top = `${(1 - positionFromThrottle(MIL_THROTTLE)) * 100}%`;

  function render() {
    thumb.style.top = `${(1 - positionFromThrottle(value)) * 100}%`;
    root.classList.toggle('ab', value > MIL_THROTTLE + 1e-6);
    root.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  }
  function set(v) {
    value = Math.max(0, Math.min(1, v));
    render();
    onChange(value);
  }
  function fromEvent(e) {
    const r = track.getBoundingClientRect();
    return 1 - (e.clientY - r.top) / r.height;
  }
  let active = null;
  root.addEventListener('pointerdown', (e) => {
    if (active !== null) return;
    active = e.pointerId;
    root.setPointerCapture(e.pointerId);
    set(throttleFromPosition(fromEvent(e)));
    e.preventDefault();
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    set(throttleFromPosition(fromEvent(e)));
  });
  const end = (e) => { if (e.pointerId === active) active = null; };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  render();
  return { set };
}
