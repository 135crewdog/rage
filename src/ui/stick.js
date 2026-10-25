// The stick indicator: a small, faint cross showing where the tilt is, inside
// a square for full deflection. It shows when the stick asks for more than
// the limiter allows, and when the controls need recentering.

export function createStickIndicator(root) {
  const dot = root.querySelector('.dot');
  const half = () => root.clientWidth / 2 - 5;
  let pulsePending = false;
  root.addEventListener('animationend', () => root.classList.remove('pulse'));
  return {
    // the controls were just recentered: glow once, the next time the indicator is drawn
    pulse() { pulsePending = true; },
    // stick: { pitch, roll } in −1..+1; limited: the limiter is holding the
    // jet below what the stick asks; recenter: the tilt reading is unreliable
    update(stick, limited, recenter) {
      const r = half();
      // pull is aft: the dot moves down the square, as the stick would move toward the pilot
      dot.style.transform = `translate(${stick.roll * r}px, ${stick.pitch * r}px)`;
      root.classList.toggle('limited', limited);
      root.classList.toggle('recenter', recenter);
      if (pulsePending) { pulsePending = false; root.classList.remove('pulse'); void root.offsetWidth; root.classList.add('pulse'); }
    },
  };
}
