// The head-up display: thin green symbols over the view, the way a fighter
// HUD looks. Drawn on a 2-D canvas every frame from the simulation's air data
// (docs/flight-model.md section 9). Not part of the UI; ignores the theme.
//
// The HUD is conformal with the view: the flight-path marker, the waterline
// and the pitch ladder are world directions projected through the chase
// camera, so the marker sits on the point the jet is flying toward and the
// ladder rolls and scales with the camera. Straight up and straight down get
// the F-16's zenith and nadir symbols when the ladder's window reaches them.

const GREEN = '#7cff4f';
const OUTLINE = 'rgba(0,0,0,0.75)';
const D2R = Math.PI / 180;
const LADDER_RANGE = 12.5;   // deg of pitch each side of the nose that the ladder shows
const BAR_HALF = 64;         // px, half-length of a pitch bar; the bars are symbols, so they never shrink
const BAR_GAP = 22;          // px, half the gap in the middle of a bar

// A unit NED direction at heading ψ and pitch θ (degrees).
function direction(headingDeg, pitchDeg) {
  const h = headingDeg * D2R, p = pitchDeg * D2R;
  return [Math.cos(p) * Math.cos(h), Math.cos(p) * Math.sin(h), -Math.sin(p)];
}

// The direction a little to the right of (ψ, θ): used to find which way a
// pitch bar lies on the screen, whatever the camera's bank.
function rightOf(headingDeg, pitchDeg) {
  const d = direction(headingDeg, pitchDeg);
  const h = headingDeg * D2R;
  const e = 0.03;
  const v = [d[0] - e * Math.sin(h), d[1] + e * Math.cos(h), d[2]];
  const m = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / m, v[1] / m, v[2] / m];
}

// Which of the two apex symbols the ladder's window has reached, if either:
// the zenith when straight up is within LADDER_RANGE of the nose, the nadir
// when straight down is.
export const RADAR_BELOW_FT = 1500;   // the F-16 HUD's AUTO mode shows radar altitude below this

// What the altitude window shows: barometric altitude, or below RADAR_BELOW_FT
// above the ground the radar altitude with an R, rounded to 10 ft as the radar
// altimeter reads. Feet in, feet out. Without a ground height, barometric.
export function altitudeDisplay(altitudeFt, groundFt) {
  if (groundFt === undefined) return { radar: false, value: Math.round(altitudeFt) };
  const agl = altitudeFt - groundFt;
  if (agl < RADAR_BELOW_FT) return { radar: true, value: Math.max(0, Math.round(agl / 10) * 10) };
  return { radar: false, value: Math.round(altitudeFt) };
}

// Which way the tadpole's tail points: toward the steerpoint's place on the
// screen when it is in front of the camera, else straight left or right by
// the relative bearing (degrees, −180..180). A unit screen vector.
export function cueDirection(screen, from, relativeBearingDeg) {
  if (screen && screen.visible) {
    const dx = screen.x - from.x, dy = screen.y - from.y, m = Math.hypot(dx, dy);
    if (m > 1) return { x: dx / m, y: dy / m };
  }
  return { x: relativeBearingDeg < 0 ? -1 : 1, y: 0 };
}

// A bearing relative to a heading, −180..180, negative to the left.
export function relativeBearing(headingDeg, bearingDeg) {
  let r = (bearingDeg - headingDeg) % 360;
  if (r > 180) r -= 360; else if (r < -180) r += 360;
  return r;
}

export function apexFor(pitchDeg) {
  if (pitchDeg >= 90 - LADDER_RANGE) return 'zenith';
  if (pitchDeg <= -90 + LADDER_RANGE) return 'nadir';
  return null;
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

  // The F-16's zenith symbol: an eight-pointed star with the lowest point
  // drawn long as a tail toward the bottom of the display.
  function zenith(x, y, r) {
    stroke(() => {
      for (let k = 0; k <= 16; k++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * (k % 16)) / 16;
        const rr = k % 2 ? r * 0.6 : k % 16 === 8 ? r * 2 : r * 1.25;
        const px = x + rr * Math.cos(a), py = y + rr * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
    });
  }
  // The nadir symbol: a circle hatched with horizontal lines, a short tail up.
  function nadir(x, y, r) {
    stroke(() => {
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
      for (const f of [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]) {
        const half = r * Math.sqrt(1 - f * f);
        ctx.moveTo(x - half, y + f * r); ctx.lineTo(x + half, y + f * r);
      }
      ctx.moveTo(x, y - r); ctx.lineTo(x, y - r * 2);
    });
  }

  // air: the airdata object, plus ground (ft) when the terrain is known; power: { label, percent }; project: a NED
  // direction → { x, y, visible } on the screen; velocity and nose: unit NED
  // directions of the flight path and the body x axis; looking: true while
  // the view is swung away from the chase position; nav, when the terrain is
  // known: { steer: { dir (unit NED to the steerpoint), bearing, range (nm),
  // name }, bullseye: { bearing, range } (the jet's own, from the bullseye) }.
  function draw(air, power, project, velocity, nose, looking = false, nav = null) {
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

    // pitch ladder: each bar is a fixed-size symbol drawn where its pitch
    // angle falls on the screen, lying along the horizon's direction there.
    // Only the bars within LADDER_RANGE of the nose show, plus the horizon
    // line itself, the way a real HUD's glass shows a window of the ladder.
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - w * 0.3, top + 52, w * 0.6, bottom - top - 112); ctx.clip();
    const pFirst = Math.ceil((air.pitch - LADDER_RANGE) / 5) * 5, pLast = Math.floor((air.pitch + LADDER_RANGE) / 5) * 5;
    const bars = [];
    for (let p = pFirst; p <= pLast; p += 5) if (p >= -85 && p <= 85) bars.push(p);
    if (!bars.includes(0)) bars.push(0);
    for (const p of bars) {
      const c = project(direction(hdg, p));
      if (!c.visible) continue;
      const r = project(rightOf(hdg, p));
      let ux = r.x - c.x, uy = r.y - c.y;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len; uy /= len;                           // along the bar, to the right
      const nx = uy, ny = -ux;                        // screen "up" in the bar's frame
      const half = p === 0 ? w * 0.26 : BAR_HALF, gap = p === 0 ? 40 : BAR_GAP;
      const tick = p > 0 ? -8 : 8;                    // end ticks point toward the horizon
      dashed(p < 0);
      stroke(() => {
        ctx.moveTo(c.x - ux * half, c.y - uy * half); ctx.lineTo(c.x - ux * gap, c.y - uy * gap);
        ctx.moveTo(c.x + ux * gap, c.y + uy * gap); ctx.lineTo(c.x + ux * half, c.y + uy * half);
        if (p !== 0) {
          ctx.moveTo(c.x - ux * half, c.y - uy * half); ctx.lineTo(c.x - ux * half + nx * tick, c.y - uy * half + ny * tick);
          ctx.moveTo(c.x + ux * half, c.y + uy * half); ctx.lineTo(c.x + ux * half + nx * tick, c.y + uy * half + ny * tick);
        }
      });
      dashed(false);
      if (p !== 0) {
        text(String(Math.abs(p)), c.x - ux * (half + 14), c.y - uy * (half + 14), 'center', 12);
        text(String(Math.abs(p)), c.x + ux * (half + 14), c.y + uy * (half + 14), 'center', 12);
      }
    }
    // straight up and straight down, once the ladder's window reaches them:
    // conformal like the bars, but upright on the screen rather than rolling
    const apex = apexFor(air.pitch);
    if (apex) {
      const c = project(apex === 'zenith' ? [0, 0, -1] : [0, 0, 1]);
      if (c.visible) (apex === 'zenith' ? zenith : nadir)(c.x, c.y, 16);
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

    // flight path marker: where the jet is actually going. Held at the HUD's
    // edge and dashed when it leaves the frame, as the jet's is; while looking
    // around it is simply where it is, in view or not.
    const f = project(velocity);
    const inFrame = f.visible && f.x >= left + 30 && f.x <= right - 30 && f.y >= top + 60 && f.y <= bottom - 70;
    let fpm = null;
    if (f.visible && (inFrame || !looking)) {
      const fx = Math.max(left + 30, Math.min(right - 30, f.x)), fy = Math.max(top + 60, Math.min(bottom - 70, f.y));
      fpm = { x: fx, y: fy };
      dashed(!inFrame);
      stroke(() => {
        ctx.arc(fx, fy, 7, 0, Math.PI * 2);
        ctx.moveTo(fx + 7, fy); ctx.lineTo(fx + 20, fy);
        ctx.moveTo(fx - 7, fy); ctx.lineTo(fx - 20, fy);
        ctx.moveTo(fx, fy - 7); ctx.lineTo(fx, fy - 15);
      });
      dashed(false);
    }

    // steerpoint: the F-16's diamond on the next place when it is in the
    // view; otherwise the tadpole, a small circle above the flight path
    // marker with a tail pointing the way to turn
    if (nav) {
      const s = project(nav.steer.dir);
      const steerInFrame = s.visible && s.x >= left + 30 && s.x <= right - 30 && s.y >= top + 60 && s.y <= bottom - 70;
      if (steerInFrame) {
        stroke(() => { ctx.moveTo(s.x, s.y - 9); ctx.lineTo(s.x + 9, s.y); ctx.lineTo(s.x, s.y + 9); ctx.lineTo(s.x - 9, s.y); ctx.closePath(); });
      } else {
        const at = fpm ?? { x: cx, y: cy };
        const u = cueDirection(s, at, relativeBearing(hdg, nav.steer.bearing));
        const tx = at.x, ty = at.y - 34;
        stroke(() => {
          ctx.moveTo(tx + 5, ty); ctx.arc(tx, ty, 5, 0, Math.PI * 2);
          ctx.moveTo(tx + u.x * 5, ty + u.y * 5); ctx.lineTo(tx + u.x * 18, ty + u.y * 18);
        });
      }
    }

    // airspeed (KCAS) on the left, altitude on the right, with carets
    stroke(() => { ctx.moveTo(left + 46, cy); ctx.lineTo(left + 54, cy - 5); ctx.lineTo(left + 54, cy + 5); ctx.closePath(); });
    text(String(Math.round(air.kcas)), left + 42, cy, 'right', 20);
    stroke(() => { ctx.moveTo(right - 46, cy); ctx.lineTo(right - 54, cy - 5); ctx.lineTo(right - 54, cy + 5); ctx.closePath(); });
    const alt = altitudeDisplay(air.altitude, air.ground);
    text((alt.radar ? 'R ' : '') + alt.value, right - 42, cy, 'left', 20);

    // g, AoA, Mach, the engine's power state and the jet's own bullseye
    // position, lower left; the steerpoint's range and name, lower right
    const rows = nav ? [bottom - 72, bottom - 54, bottom - 36, bottom - 18] : [bottom - 54, bottom - 36, bottom - 18, bottom];
    text(`${air.nz.toFixed(1)} G`, left, rows[0], 'left', 14);
    text(`α ${air.alpha.toFixed(1)}`, left, rows[1], 'left', 14);
    text(`M ${air.mach.toFixed(2)}`, left, rows[2], 'left', 14);
    text(power.label === 'AB' ? `AB ${power.percent}%` : power.label === 'DRY' ? `${power.percent}%` : power.label, left, rows[3], 'left', 14);
    if (nav) {
      text(`BE ${String(Math.round(nav.bullseye.bearing) % 360).padStart(3, '0')}/${Math.round(nav.bullseye.range)}`, left, bottom, 'left', 14);
      text(`${nav.steer.range.toFixed(1)} > ${nav.steer.name}`, right, bottom, 'right', 14);
    }
  }

  return { resize, draw };
}
