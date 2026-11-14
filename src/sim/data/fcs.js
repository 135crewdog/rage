// Flight control system gains and schedules, docs/flight-model.md section 8.
// The structure and limits come from public sources; the gains are tuned
// values, recorded here as data. Degrees, g, psf, seconds.

export const PITCH = {
  // stick to incremental g: dn = 10·x^1.6 pulling, −4·|x|^1.6 pushing, clamped −4..+8
  pullGain: 10, pushGain: 4, shapeExponent: 1.6, dnMin: -4, dnMax: 8,
  commandLag: 0.10,                       // s, on the g command
  // negative-g limit: 0 g at q̄ ≤ 60 psf fading to −3 g at q̄ ≥ 210 psf
  nminQbar: [60, 210], nminFloor: -3,
  // AoA/g limiter: g subtracted from the command above 15° and again above 20°
  limiter: { alpha1: 15, slope1: 0.34, alpha2: 20, slope2: 0.92 },
  // pseudo-AoA from roll rate: 0 below 20°/s, rising to +5.4° at 56°/s
  rollAlpha: { p0: 20, p1: 56, dAlpha: 5.4 },
  // The limiter sees where α will stop, not where it is: α + α̇·(stabilator swing
  // time + lead) + α̇²/(2·α̈max), with α̈max the pitch deceleration full nose-down
  // stabilator gives at this q̄. Braking distance, in effect.
  alphaRateLead: 0.1,                     // s, on top of the swing time
  leadSwingTo: 15,                        // deg: the stabilator position counted as "braking"
  cmDelta: 0.007,                         // |ΔCm| per degree of stabilator, from the Cm table

  crossover: 400,                         // ft/s, C* blend: g error − (crossover/g)·washout(q)
  washoutTau: 0.35,                       // s
  gainQbar: 300, gainMin: 0.25, gainMax: 2, gainQbarFloor: 40,   // G = clamp(300/max(q̄,40), 0.25, 2)
  Kp: 3.0,                                // deg per g
  Ki: 12.0,                               // deg per g·s
  Kq: 1.0,                                // deg per deg/s
  Ka: 0.5,                                // deg per deg of filtered α
  alphaFilterTau: 0.1,                    // s
  alpha0: 0,                              // deg
  backstopOn: 30, backstopOff: 25,        // deg α: full nose-down between these
};

export const ROLL = {
  // Roll-coupling protection (an addition to the TP-1538 limiter, see 8.5): when
  // the stabilator is within elMargin of full nose-down at AoA, the roll-rate
  // command fades to zero, because rolling is what is pitching the jet up.
  protect: { elMargin: 8, alphaStart: 10, alphaFull: 15 },
  forcePerStick: 16,                      // lb at full deflection
  // (°/s) per lb in bands: 5 to 2 lb, 15 to 8 lb, 30 above
  bands: [[2, 5], [8, 15], [Infinity, 30]],
  pmaxBase: 308, pmaxQbar: 219, pmaxQbarSlope: 0.55, pmaxAlpha: 15, pmaxAlphaSlope: 4,
  pmaxEl: 5, pmaxElSlope: 4, pmaxFloor: 80,
  commandLag: 0.1,                        // s
  gainQbar: 300, gainMin: 0.3, gainMax: 5,
  Kr: 1.0,                                // deg aileron per deg/s of rate error
  Kri: 0.0,                               // deg per deg (integral of rate error); 0 = proportional only
};

export const YAW = {
  // aileron-rudder interconnect: on top of the tables' cancellation of the
  // aileron's own yaw (ariFromTables in fcs.js), this tuned rise with α gives
  // the yaw a roll about the velocity vector needs; deg rudder per deg aileron
  ariAlpha: [0, 10, 20, 30], ariGain: [0, 0.54, 1.44, 2.16],   // 1.8× the starting shape (1.5× before the tables' term was separated out)
  ariMach: [0.6, 1.2],                    // full below, zero above
  ariOffAlpha: 35,                        // deg
  Kyd: 1.0,                               // deg per deg/s of washed-out stability-axis yaw rate
  yawWashoutTau: 1.0,                     // s
  Kny: 20,                                // deg per g of lateral acceleration
  gainQbar: 300, gainMin: 0.2, gainMax: 2,
};
