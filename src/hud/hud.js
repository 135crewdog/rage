// The head-up display: thin green symbols over the view, the way a fighter
// HUD looks. Drawn on a 2-D canvas every frame from the simulation's air data
// (docs/flight-model.md section 9). Not part of the UI; ignores the theme.
//
// The HUD is conformal with the view: the flight-path marker, the waterline
// and the pitch ladder are world directions projected through the chase
// camera, so the marker sits on the point the jet is flying toward and the
// ladder rolls and scales with the camera.

const GREEN = '#7cff4f';
const OUTLINE = 'rgba(0,0,0,0.75)';
const D2R = Math.PI / 180;

// A unit NED direction at heading ψ and pitch θ (degrees).
function direction(headingDeg, pitchDeg) {
  const h = headingDeg * D2R, p = pitchDeg * D2R;
  return [Math.cos(p) * Math.cos(h), Math.cos(p) * Math.sin(h), -Math.sin(p)];
}

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

  // air: the airdata object; power: { label, percent }; project: a NED
  // direction → { x, y, visible } on the screen; velocity and nose: unit NED
  // directions of the flight path and the body x axis.
  function draw(air, power, project, velocity, nose) {
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

    // pitch ladder and horizon: each line is the direction at heading ψ ± a
    // span and pitch p, projected, so it lies on the scene and rolls with it
    ctx.save();
    // the ladder shows through a window about the centre, like the glass of a real HUD
    ctx.beginPath(); ctx.rect(cx - w * 0.27, top + 52, w * 0.54, bottom - top - 112); ctx.clip();
    for (let p = -90; p <= 90; p += 5) {
      const span = p === 0 ? 22 : 5;                 // degrees of azimuth each side
      const a = project(direction(hdg - span, p)), b = project(direction(hdg + span, p));
      const gap = project(direction(hdg - span * (p === 0 ? 0.22 : 0.3), p)), gapB = project(direction(hdg + span * (p === 0 ? 0.22 : 0.3), p));
      if (!a.visible || !b.visible) continue;
      if (Math.min(a.x, b.x) > w || Math.max(a.x, b.x) < 0 || Math.min(a.y, b.y) > h || Math.max(a.y, b.y) < 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const tx = -dy / len * 8 * (p > 0 ? 1 : -1), ty = dx / len * 8 * (p > 0 ? 1 : -1);   // end ticks toward the horizon
      dashed(p < 0);
      stroke(() => {
        ctx.moveTo(a.x, a.y); ctx.lineTo(gap.x, gap.y);
        ctx.moveTo(gapB.x, gapB.y); ctx.lineTo(b.x, b.y);
        if (p !== 0) { ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + tx, a.y + ty); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + tx, b.y + ty); }
      });
      dashed(false);
      if (p !== 0) {
        const ux = dx / len * 14, uy = dy / len * 14;
        text(String(Math.abs(p)), a.x - ux, a.y - uy, 'center', 12);
        text(String(Math.abs(p)), b.x + ux, b.y + uy, 'center', 12);
      }
    }
    ctx.restore();

    // waterline: where the nose points
    const n = project(nose);
    if (n.visible) {
      const nx = n.x, ny = n.y;
      stroke(() => {
        ctx.moveTo(nx - 22, ny); ctx.lineTo(nx - 10, ny); ctx.lineTo(nx - 5, ny + 7); ctx.lineTo(nx, ny); ctx.lineTo(nx + 5, ny + 7); ctx.lineTo(nx + 10, ny); ctx.lineTo(nx + 22, ny);
      });
    }

    // flight path marker: where the jet is actually going
    const f = project(velocity);
    if (f.visible) {
      const fx = Math.max(left + 30, Math.min(right - 30, f.x)), fy = Math.max(top + 60, Math.min(bottom - 70, f.y));
      dashed(fx !== f.x || fy !== f.y);               // dashed when held at the edge of the HUD
      stroke(() => {
        ctx.arc(fx, fy, 7, 0, Math.PI * 2);
        ctx.moveTo(fx + 7, fy); ctx.lineTo(fx + 20, fy);
        ctx.moveTo(fx - 7, fy); ctx.lineTo(fx - 20, fy);
        ctx.moveTo(fx, fy - 7); ctx.lineTo(fx, fy - 15);
      });
      dashed(false);
    }

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
