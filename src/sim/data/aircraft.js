// The F-16 of docs/f16-data.md section 1 and section 5: geometry, mass,
// inertia and limits. Imperial units throughout: ft, slug, lbf, degrees.

export const G = 32.17;            // ft/s², gravity
export const RM = 1.57e-3;         // 1/slug, the book's inverse mass (m ≈ 636.9 slug, 20,490 lb)
export const MASS = 1 / RM;        // slug
export const WEIGHT = MASS * G;    // lbf
export const S = 300;              // ft², wing area
export const B = 30;               // ft, span
export const CBAR = 11.32;         // ft, mean aerodynamic chord
export const XCGR = 0.35;          // reference centre of gravity, fraction of c̄
export const XCG = 0.35;           // the jet's centre of gravity, fraction of c̄
export const HX = 160;             // slug·ft²/s, engine angular momentum along body x

// The book's rounded inertia constants. The check case needs these exact values.
export const C1 = -0.770;
export const C2 = 0.02755;
export const C3 = 1.055e-4;
export const C4 = 1.642e-6;
export const C5 = 0.9604;
export const C6 = 1.759e-2;
export const C7 = 1.792e-5;
export const C8 = -0.7336;
export const C9 = 1.587e-5;

// Control surfaces: position limit (deg), rate limit (deg/s), first-order lag (s).
export const SURFACES = {
  el:  { limit: 25,   rate: 60,  tau: 0.0495 },
  ail: { limit: 21.5, rate: 80,  tau: 0.0495 },
  rdr: { limit: 30,   rate: 120, tau: 0.0495 },
};

// Beyond these the tables extrapolate; beyond ALPHA_ENVELOPE the sim flags outOfEnvelope.
export const ALPHA_DATA = [-10, 45];       // deg
export const BETA_DATA = [-30, 30];        // deg
export const ALPHA_ENVELOPE = [-15, 45];   // deg
