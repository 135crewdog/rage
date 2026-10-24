// The head-up display: thin green symbols over the view, the way a fighter
// HUD looks. Drawn on a 2-D canvas every frame from the simulation's air data
// (docs/flight-model.md section 9). Not part of the UI; ignores the theme.

const GREEN = '#7cff4f';
const OUTLINE = 'rgba(0,0,0,0.75)';
const PX_PER_DEG = 11;          // pitch-ladder scale
const D2R = Math.PI / 180;

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let inset = { top: 0, right: 0, bottom: 0, left: 0 };

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const cs = getComputedStyle(document.documentElement);
    inset = {
      top: parseFloat(cs.getPropertyValue('--sat')) || 0, right: parseFloat(cs.getPropertyValue('--sar')) || 0,
      bottom: parseFloat(cs.getPropertyValue('--sab')) || 0, left: parseFloat(cs.getPropertyValue('--sal')) || 0,
    };
  }

  // Every stroke and glyph is drawn twice: a dark outline, then the green.
  function stroke(draw) {
    ctx.lineWidth = 3.5; ctx.strokeStyle = OUTLINE; ctx.beginPath(); draw(); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = GREEN; ctx.beginPath(); draw(); ctx.stroke();
  }
  function text(s, x, y, align = 'left', size = 15) {
    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y);
    ctx.fillStyle = GREEN; ctx.fillText(s, x, y);
  }
  function dashed(on) { ctx.setLineDash(on ? [8, 6] : []); }

  // air: the airdata object; power: { label, percent }
  function draw(air, power) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const left = inset.left + 64, right = w - inset.right - 60, top = inset.top + 14, bottom = h - inset.bottom - 18;

    // heading tape across the top
    const hdg = air.heading;
    stroke(() => { ctx.moveTo(cx, top + 22); ctx.lineTo(cx - 5, top + 30); ctx.lineTo(cx + 5, top + 30); ctx.closePath(); });
    text(String(Math.round(hdg) % 360).padStart(3, '0'), cx, top + 40, 'center', 15);
    const span = 60, pxDeg = (w * 0.5) / span;
    for (let d = -span / 2; d <= span / 2; d += 5) {
      const deg = Math.round((hdg + d) / 5) * 5;
      const x = cx + (deg - hdg) * pxDeg;
      if (Math.abs(x - cx) > w * 0.26) continue;
      const major = deg % 10 === 0;
      stroke(() => { ctx.moveTo(x, top + 4); ctx.lineTo(x, top + (major ? 14 : 9)); });
      if (major) text(String(((deg % 360) + 360) % 360 / 10).padStart(2, '0'), x, top + 22, 'center', 12);
    }

    // pitch ladder and horizon, rolling with the jet about the waterline
    ctx.save();
    ctx.beginPath(); ctx.rect(left + 40, top + 50, right - left - 80, bottom - top - 100); ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-air.roll * D2R);
    ctx.translate(0, air.pitch * PX_PER_DEG);     // the horizon drops below the waterline when the nose is up
    for (let p = -90; p <= 90; p += 5) {
      const y = -p * PX_PER_DEG;
      if (Math.abs(y + air.pitch * PX_PER_DEG) > h) continue;   // off the screen after the translate
      const half = p === 0 ? w * 0.22 : 48;
      dashed(p < 0);
      stroke(() => {
        ctx.moveTo(-half, y); ctx.lineTo(-(p === 0 ? 40 : 14), y);
        ctx.moveTo(p === 0 ? 40 : 14, y); ctx.lineTo(half, y);
        if (p !== 0) { ctx.moveTo(-half, y); ctx.lineTo(-half, y + (p > 0 ? 8 : -8)); ctx.moveTo(half, y); ctx.lineTo(half, y + (p > 0 ? 8 : -8)); }
      });
      dashed(false);
      if (p !== 0) { text(String(Math.abs(p)), -half - 6, y, 'right', 12); text(String(Math.abs(p)), half + 6, y, 'left', 12); }
    }
    ctx.restore();

    // waterline: where the nose points
    stroke(() => {
      ctx.moveTo(cx - 22, cy); ctx.lineTo(cx - 10, cy); ctx.lineTo(cx - 5, cy + 7); ctx.lineTo(cx, cy); ctx.lineTo(cx + 5, cy + 7); ctx.lineTo(cx + 10, cy); ctx.lineTo(cx + 22, cy);
    });

    // flight path marker: the velocity vector relative to the nose, in the
    // jet's own frame (the view rolls with the jet)
    const fx = cx + air.beta * PX_PER_DEG, fy = cy + air.alpha * PX_PER_DEG;
    stroke(() => {
      ctx.arc(fx, fy, 7, 0, Math.PI * 2);
      ctx.moveTo(fx + 7, fy); ctx.lineTo(fx + 20, fy);
      ctx.moveTo(fx - 7, fy); ctx.lineTo(fx - 20, fy);
      ctx.moveTo(fx, fy - 7); ctx.lineTo(fx, fy - 15);
    });

    // airspeed (KCAS) on the left, altitude on the right, with carets
    stroke(() => { ctx.moveTo(left + 46, cy); ctx.lineTo(left + 54, cy - 5); ctx.lineTo(left + 54, cy + 5); ctx.closePath(); });
    text(String(Math.round(air.kcas)), left + 42, cy, 'right', 20);
    stroke(() => { ctx.moveTo(right - 46, cy); ctx.lineTo(right - 54, cy - 5); ctx.lineTo(right - 54, cy + 5); ctx.closePath(); });
    text(String(Math.round(air.altitude)), right - 42, cy, 'left', 20);

    // g, AoA, Mach and the engine's power state, lower left
    text(`${air.nz.toFixed(1)} G`, left, bottom - 54, 'left', 14);
    text(`α ${air.alpha.toFixed(1)}`, left, bottom - 36, 'left', 14);
    text(`M ${air.mach.toFixed(2)}`, left, bottom - 18, 'left', 14);
    text(power.label === 'AB' ? `AB ${power.percent}%` : power.label, left, bottom, 'left', 14);
  }

  return { resize, draw };
}
