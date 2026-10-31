// The throttle: a slim vertical slider on the left edge, driven by pointer
// events with pointer capture, keeping its value when released. A detent at
// MIL (0.77): the thumb has to cross a small gap to enter afterburner.

import { MIL_THROTTLE } from '../sim/engine.js';

const GAP = 0.12;   // fraction of the track the thumb must cross past MIL (doubled after the first flights)

// Pointer position along the track (0 bottom .. 1 top) → throttle 0..1.
export function throttleFromPosition(pos) {
  const p = Math.max(0, Math.min(1, pos));
  if (p <= MIL_THROTTLE) return p;
  if (p <= MIL_THROTTLE + GAP) return MIL_THROTTLE;
  return MIL_THROTTLE + (p - MIL_THROTTLE - GAP) / (1 - MIL_THROTTLE - GAP) * (1 - MIL_THROTTLE);
}

// The inverse, for drawing the thumb.
export function positionFromThrottle(t) {
  if (t <= MIL_THROTTLE) return t;
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
