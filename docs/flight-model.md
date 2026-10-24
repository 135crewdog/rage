# Flight model

How Rage's F-16 flies: the physics, the flight control system, the pilot's input, and the tests that prove it. The numbers live in `docs/f16-data.md`; this file says how to use them.

Read this file before touching anything in the simulation. When this file and your own knowledge disagree, this file wins. When this file is wrong, say so and propose a fix; don't quietly work around it.

## 0. The goal in one paragraph

A real F-16, as far as public data allows, flown by tilting an iPhone. Not an arcade model. The pilot's input is a stick force. The fly-by-wire flight control system (FCS) turns that force into surface commands, the surfaces move the jet through real aerodynamic data, and every behaviour the pilot feels comes out of that chain. Nothing in the game points the jet where the player wants it to go. If the jet does something unrealistic, the fix belongs in the model, the FCS or the input mapping, never in a shortcut around them.

What the pilot should feel, in their own words: "sense the stall approaching, almost hear the strain of the wings in a high-g turn, anticipate the trim changes that tell me speed, AoA and lift are correctly related." On a real F-16 the FCS does the trimming and won't let the jet stall, so that feel shows up as: g that builds and stops at the limiter, AoA that climbs as speed bleeds, a jet that won't give 9 g when slow, roll that softens at high AoA, and buffet as the limiter gets close. Section 10 says how each one shows on screen.

## 1. Concepts in one page

- **Body axes.** x out the nose, y out the right wing, z out the belly. Roll rate p, pitch rate q and yaw rate r are about those axes, positive right wing down, nose up, nose right.
- **Angle of attack (α)** is the angle between the nose (body x) and the oncoming air, measured in the jet's plane of symmetry. **Sideslip (β)** is the sideways angle. Almost every aerodynamic number depends on α.
- **Dynamic pressure (q̄ = ½ρV²)** is how hard the air pushes. Force = q̄ × wing area × a coefficient. The coefficient comes from the tables; q̄ scales it.
- **Coefficients in body axes.** The data give CX (force along the nose, negative is drag-like), CZ (force along the belly, negative is lift-like), CY (side force), and moment coefficients Cl, Cm, Cn (roll, pitch, yaw). They are not lift and drag; they are lift and drag already rotated into the body frame.
- **Load factor (g, n_z)** is what an accelerometer in the cockpit reads: 1 in level flight, 9 at the limit. It is lift divided by weight, not anything to do with gravity's direction.
- **Relaxed static stability.** At the reference centre of gravity the F-16 is slightly unstable in pitch on its own: left alone, a nose-up disturbance grows. The FCS feeds AoA and pitch rate back to the stabilator to make it fly. That is why the FCS is not optional here: without it the model departs.
- **Energy.** Specific excess power, Ps = V × (thrust − drag) / weight, in ft/s. Positive means the jet can climb or accelerate; negative means a turn is costing speed or height. Sustained turn rate is the fastest turn at Ps = 0. Instantaneous turn rate is the fastest turn at any Ps, limited by g or by AoA.
- **Corner speed** is the slowest speed at which the jet can reach its g limit. Below it the jet runs out of AoA first; above it the g limit caps the turn and the radius grows.

## 2. Conventions

### 2.1 Units

- **Inside the simulation: the book's imperial units.** ft, slug, lbf, ft/s, psf, degrees in the tables, radians and rad/s in the state. This keeps the code line-for-line comparable with the check cases. Never mix in metres inside `sim/`.
- **Rendering: 1 world unit = 1 metre.** Convert once, at the boundary between the simulation and the renderer.
- **On screen: knots, feet, degrees, g, Mach**, as the real jet's HUD shows them.

### 2.2 Frames

- **Earth frame: NED**, flat and non-rotating: x north, y east, z down. Ground level is h = 0 ft. Gravity is 32.17 ft/s², straight down, constant.
- **Body frame**: section 1.
- **Three.js world**: x = east, y = up, z = south (−north). This is right-handed. The aircraft mesh is built with its nose along local −z, right wing along +x and canopy along +y.
- **One module owns every conversion** between these frames, and unit tests prove it: a jet heading north appears pointing along three.js −z; a right bank of 30° lowers the mesh's +x wing; a nose-up pitch raises the mesh's −z end.

### 2.3 Signs

| Quantity | Positive means | Note |
|---|---|---|
| α | nose above the velocity vector | |
| β | air arriving from the right (velocity has +y body component) | |
| Elevator (stabilator) el | trailing edge down → **nose-down** moment | So a pull is a **negative** elevator command. |
| Aileron ail | moment that rolls **left** (Cl < 0) | So a right roll needs **negative** aileron. |
| Rudder rdr | moment that yaws the nose **left** (Cn < 0), side force +y | |
| n_z | accelerometer reading, +1 in level flight | n_z = −q̄·S·CZ_total / (m·g); thrust has no z component |
| n_y | lateral accelerometer reading | n_y = q̄·S·CY_total / (m·g) |

These come from the data's own signs, and they are easy to get backwards. **Every sign in this table, and every sign in the FCS laws in section 8, must be proved by a unit test** that steps one input and checks the response's direction. Don't trust this file over a test.

### 2.4 Time

- **Physics runs at a fixed 120 Hz** with a fourth-order Runge-Kutta step. The FCS runs every physics step (the real digital F-16 runs at 64 Hz; faster is fine).
- The render loop uses an accumulator: as many fixed steps as real time requires, at most 8 per frame, and dt clamped to 0.1 s. Rendering interpolates between the last two physics states, so 30, 60 and 120 Hz screens all look smooth. iPhone Safari usually gives 60 Hz, 30 Hz in Low Power Mode.
- The simulation is **deterministic**: the same initial state and the same input sequence produce the same flight, bit for bit, on the same machine. Tests depend on it.

## 3. Structure of the simulation

The simulation is plain JavaScript with **no DOM, no three.js and no browser APIs**, so all of it runs and is tested in Node. The renderer only reads simulation state; it never changes it.

| Module | Job |
|---|---|
| `atmosphere` | The book's ADC routine: density, temperature, pressure, Mach, q̄ from (V, h). |
| `aero` | Table lookups and the total coefficients, exactly as `docs/f16-data.md` section 3, plus the transonic drag rise of section 5.2. |
| `engine` | Throttle gearing, power lag, thrust tables (section 6). |
| `actuators` | Surface lags, rate limits, position limits (section 7). |
| `dynamics` | The equations of motion: state derivative and the RK4 step (section 4). |
| `fcs` | The flight control laws: stick in, surface commands out (section 8). |
| `airdata` | What the HUD shows: KCAS, Mach, altitude, heading, g, AoA (section 9). |
| `input` | Tilt to normalised stick, and the throttle (section 11). Lives outside `sim/` because it reads the browser, but its maths is pure and tested. |

### 3.1 State

| Symbol | Meaning | Units |
|---|---|---|
| u, v, w | velocity in body axes | ft/s |
| quaternion | attitude, body relative to NED, normalised every step | |
| p, q, r | body rates | rad/s |
| north, east, h | position; h is height above the ground (= altitude, the ground is at 0) | ft |
| POW | engine power state | % (0..100) |
| el, ail, rdr | actual surface positions, after actuators | deg |
| FCS memory | integrators and filter states | |

VT, α and β are computed from u, v, w each step: VT = √(u²+v²+w²), α = atan2(w, u), β = asin(v / VT). Guard VT against zero: an air start never gets there, but a test might.

**Use a quaternion for attitude**, not Euler angles. The book integrates φ, θ, ψ, which breaks at θ = ±90°, and an F-16 loops. Euler angles are still computed for the HUD and for the check-case test.

## 4. Equations of motion

Rigid body, 6 degrees of freedom, constant mass, flat non-rotating earth. Use the book's formulation from `docs/f16-data.md` section 3, with these changes of form (not of content):

1. **Translational**: integrate u, v, w directly.
   ```
   udot = r·v − q·w + gx + (q̄·S·CXT + T)/m
   vdot = p·w − r·u + gy + (q̄·S·CYT)/m
   wdot = q·u − p·v + gz + (q̄·S·CZT)/m
   ```
   where (gx, gy, gz) is gravity rotated into body axes by the attitude quaternion. With Euler angles this is exactly the book's −g·sinθ, g·cosθ·sinφ, g·cosθ·cosφ.
2. **Rotational**: the book's equations with the constants c1..c9 and the engine angular momentum Hx = 160 slug·ft²/s, unchanged:
   ```
   pdot = (c2·p + c1·r + c4·Hx)·q + q̄·S·b·(c3·Cl + c4·Cn)
   qdot = (c5·p − c7·Hx)·r + c6·(r² − p²) + q̄·S·c̄·c7·Cm
   rdot = (c8·p − c2·r + c9·Hx)·q + q̄·S·b·(c4·Cl + c9·Cn)
   ```
   Use the rounded constants printed in the data file; the check case needs them.
3. **Attitude**: q̇ = ½ · q ⊗ (0, p, q, r), renormalised after each step.
4. **Position**: rotate (u, v, w) into NED and integrate. ḣ = −(NED down velocity).

**Mass.** Use the book's value, 1/m = 1.57e-3 slug⁻¹ (m ≈ 636.9 slug, 20,490 lb). Keep it in the aircraft data, not as a literal in the code. The real F-16C at half fuel is heavier (about 23,000–24,000 lb), but the book's engine is also weaker than an F-16C's, and the two cancel well enough that the model's turn performance lands inside the real aircraft's published bands (section 12.3). Changing the weight without changing the engine would break that. Weight is a decision for the owner, recorded in CLAUDE.md.

**Centre of gravity.** xcg = 0.35 c̄, the data's reference. The jet is slightly unstable there; that is correct.

**Outside the data.** The tables cover α −10..45° and β ±30°; beyond that they extrapolate linearly from the end segment, as the book does. The FCS keeps the jet well inside (section 8.5). If the jet does leave the range (a test can force it), the simulation must stay numerically stable and set an `outOfEnvelope` flag the debug overlay shows. It must never produce NaN.

**Ground.** When h ≤ 0 the flight ends in a crash state. There is no landing gear in this model.

## 5. Aerodynamics

### 5.1 The low-fidelity tables

Exactly as `docs/f16-data.md` sections 2 and 3: CX(α, el), CY, CZ(α, β, el), Cl(α, β) plus aileron and rudder terms, Cm(α, el), Cn(α, β) plus aileron and rudder terms, damping derivatives as functions of α, and the CG-transfer terms. Note the details the data file calls out:

- Aileron is normalised by **20**, not by its 21.5° travel.
- Cl and Cn tables are looked up with |β| and multiplied by sign(β).
- The CG-transfer terms use CZ and CY **after** their damping terms are added.
- The bold cells are the values that reproduce the book; don't change them.

What the model leaves out, and why that's acceptable here: no leading-edge flap, no speed brake, gear or flaps, no α-rate terms, no data past 45° AoA, and no Mach effects at all. That last one needs fixing for top speed (5.2). The rest is either outside the envelope the FCS allows or parked (section 13).

### 5.2 Transonic drag rise

Without Mach effects the model keeps accelerating: at sea level it reaches Mach 1.6 on less than full throttle. The real F-16 tops out around Mach 1.2 at sea level (about 800 KCAS, its placard) and around Mach 2 at 40,000 ft. Add an extra drag coefficient that depends on Mach only, applied along the velocity vector:

```
ΔCX = −ΔCD(M)·cosα·cosβ      ΔCY = −ΔCD(M)·sinβ      ΔCZ = −ΔCD(M)·sinα·cosβ
```

Starting curve, computed for this model with the book's engine at full afterburner (the values are the extra drag that exactly balances max thrust in level flight: sea level needs 0.027 at Mach 1.2; 40,000 ft needs 0.029 at Mach 2.0):

- ΔCD = 0 up to Mach 0.85.
- A smoothstep rise from 0 at Mach 0.85 to 0.029 at Mach 1.05.
- ΔCD = 0.029, flat, above Mach 1.05.
 With this curve the jet should settle near Mach 1.17 at sea level and Mach 2.0 at 40,000 ft. Below Mach 0.85 nothing changes, so the subsonic turn performance and every book check case are untouched. This is an approximation: the real F-16's stability and control also change with Mach, and this model doesn't capture that.

## 6. Engine

The book's model, `docs/f16-data.md` section 4:

- **Throttle 0..1 → commanded power 0..100%.** 0.77 is military power (MIL, 50%); above it is afterburner, reaching 100% at 1.0.
- **Power lag.** The engine spools at a rate that depends on how far it has to go. Crossing between dry and afterburner uses fixed intermediate targets. This lag is real: going from idle to MIL takes seconds.
- **Thrust tables** by Mach (rows) and altitude (columns), idle, MIL and max. Read the orientation warning in the data file: getting rows and columns backwards fails the check case.
- **Clamp the table inputs** to 0..50,000 ft and Mach 0..2.2. Within 1.0..2.2 the book's linear extrapolation in Mach is kept.

The throttle slider maps to throttle 0..1. Put a detent at 0.77 so the pilot can feel MIL. Pushing past it lights the afterburner. The HUD shows the current power state, not the slider position, so the spool lag is visible.

## 7. Actuators

The book's model moves the surfaces instantly. Real surfaces lag and are rate-limited, and the FCS gains depend on that, so model them:

| Surface | Position limit | Rate limit | Lag |
|---|---|---|---|
| Stabilator (el) | ±25° | 60°/s | first order, τ = 0.0495 s |
| Aileron (ail) | ±21.5° | 80°/s | same |
| Rudder (rdr) | ±30° | 120°/s | same |

Source: the University of Minnesota F-16 simulation (Russell, 2003), which is built on the same NASA data. The book's check cases bypass the actuators: they feed surface positions straight in, and so must the check-case tests.

## 8. Flight control system

### 8.1 What's real and what isn't

The F-16's actual control laws are distribution-limited. What's public: the structure of each axis, the limits, the limiter schedules and the pilot-visible behaviour, from NASA reports, a former F-16 test pilot's public talk, and engineers' public statements. The **structure and limits below are from those sources. The gains are not; they are starting values to tune** against the behaviour targets in 8.6. The NASA report TP-1538 has an appendix with its simulated FCS's real diagrams and gains; it could not be read while writing this file. If someone obtains it, it supersedes these gains.

Stick input arrives as a normalised force, x_pitch and x_roll, each −1..+1 (section 11). Positive pitch is a pull; positive roll is right.

### 8.2 Pitch: g command with automatic trim

The stick commands **load factor**, not elevator. Released, the jet holds **1 g**. An integrator in the loop drives the g error to zero, which trims the jet automatically as speed changes: the pilot changes speed with the throttle and never re-trims. This gives neutral speed stability: unlike a light aircraft, the jet does not try to return to a trim speed.

```
// Stick to g request (shape approximate; range from sources)
dn   = x ≥ 0 ? 10·x^1.6 : −4·|x|^1.6       // incremental g
dn   = clamp(dn, −4, +8)                    // full aft asks for more than 9 g; logic caps it
ncmd = 1 + dn                               // a constant +1 g: no bank or climb compensation
ncmd = lag(ncmd, 0.10 s)

// Negative-g limit: −3 g above about 250 KCAS, toward 0 g when slow
nmin = lerp(0, −3, clamp((q̄ − 60)/(210 − 60), 0, 1))     // q̄ in psf
ncmd = max(ncmd, nmin)

// AoA/g limiter: AoA feedback that subtracts from the command above 15°
αeff = α + Δα_roll(|p|)        // pseudo-AoA: 0 below 20°/s roll rate, rising linearly to +5.4° at 56°/s
lim  = 0.34·max(0, αeff − 15) + 0.92·max(0, αeff − 20)    // g
neff = ncmd − lim              // full aft gives 9 g up to 15° AoA, 7.3 g at 20°, 1 g at 25°

// C*-like error: pitch rate shapes the transient, g sets the steady state
e    = neff − n_z − (400/32.17)·washout(q, 1.0 s)          // q in rad/s; 400 ft/s crossover

// PI forward path, stability feedback, gains scheduled on dynamic pressure
G    = clamp(300 / max(q̄, 40), 0.25, 6)
I   += Ki·e·dt                 // freeze when the stabilator is saturated in the direction e pushes
el   = −G·(Kp·e + I)           // negative el is nose-up
     + Kq·G·q_deg              // pitch damping
     + Ka·(α_filt − α0)        // artificial static stability; α_filt = α through a 0.1 s lag
el   = clamp(el, −25, 25)      // then the actuator
```

Starting gains at q̄ = 300 psf: Kp ≈ 1.5 deg/g, Ki ≈ 3.0 deg/(g·s), Kq ≈ 0.3 deg per deg/s, Ka ≈ 0.5 deg/deg. An alternative to the 300/q̄ schedule, if it tunes better: compute the stabilator's pitch-moment effectiveness from the tables each step and divide by it. Either is acceptable; record which one was chosen.

The limiter schedule (9 g at 15°, 7.3 g at 20°, 1 g at 25°) and the 25° ceiling are the most important numbers in this section: they decide corner speed, instantaneous turn and the jet's low-speed behaviour.

### 8.3 Roll: roll-rate command about the velocity vector

The stick commands **roll rate**, up to 308°/s, about the velocity vector (stability axis), so at high AoA the nose slices around the flight path rather than the jet rolling about its own nose.

```
// Stick to roll-rate request. Force F = 17·|x| lb; gradient bands from NASA sidestick data
p_cmd = sign(x) · band(F)       // 5 (°/s)/lb to 2 lb, 15 to 8 lb, 30 above
                                //   → 10°/s at 2 lb, 100°/s at 8 lb, capped by pmax around 15 lb

// Roll-rate limiter (NASA TP-1538, control system B)
pmax  = 308 − 0.55·max(0, 219 − q̄) − 4·max(0, α − 15) − 4·max(0, el − 5)
pmax  = max(pmax, 80)           // °/s; el > 0 is trailing edge down
p_cmd = clamp(p_cmd, −pmax, pmax)
p_cmd = lag(p_cmd, 0.1 s)

p_s   = p·cosα + r·sinα         // stability-axis roll rate
ail   = −Kr·Gr·(p_cmd − p_s)    // negative because +ail rolls left; Gr = clamp(300/q̄, 0.3, 5)
```

Starting gain Kr ≈ 0.12 deg per deg/s at q̄ = 300 psf. Target roll-mode time constant 0.3–0.5 s. Released, the stick commands zero roll rate, so the jet holds its bank.

### 8.4 Yaw: automatic coordination, no pedals

The pilot has no rudder control. The FCS keeps the ball centred, as on the real jet, where pilots normally fly with their feet on the floor:

```
r_s  = r·cosα − p·sinα                   // stability-axis yaw rate
rdr  = K_ARI(α, M)·ail                   // aileron-rudder interconnect: same sign as aileron
     + Kyd·washout(r_s, 1.0 s)·57.3      // yaw damper: opposes unwanted yaw
     + Kny·n_y                           // lateral-acceleration feedback: centres the ball
rdr  = clamp(rdr, −30, 30)
```

K_ARI rises with AoA (starting shape: 0 at 0°, 0.3 at 10°, 0.8 at 20°, 1.2 at 30°) and falls with Mach. Starting values: Kyd ≈ 0.5–1 deg per deg/s, Kny ≈ 20 deg/g. Turn the interconnect off above 35° AoA. The signs above follow 2.3 (a right roll needs negative aileron and negative rudder); prove them with tests.

If tuning the interconnect proves impractical, an acceptable fallback is a yaw-rate command, r_cmd = p_s·sinα + (g/V)·sinφ·cosθ, tracked by the rudder. That is not the F-16's structure, so record the change as a departure if it's used.

### 8.5 Protection

- The limiter in 8.2 keeps AoA at or below about 25° in normal flying. The pilot cannot stall the jet with the stick alone.
- **Backstop:** if α exceeds 30°, command full nose-down stabilator until it's back below 25°. A NASA YF-16 study used exactly this backup. It also keeps the model inside its data.
- The real F-16 can still depart in extreme cases (very aggressive rolls at very low speed), into a deep stall near 60° AoA. This model has no data there, so departures are out of scope and the backstop prevents them (section 13).

### 8.6 What not to add

- **No bank or climb compensation** in the pitch command. Released in a 60° bank, the jet holds 1 g and the nose drops; the pilot has to pull to hold altitude in a turn. That is how the real jet flies.
- **No altitude, heading or bank hold.** Those are autopilot functions.
- **No stall warning horn or shaker.** The F-16 has none; the limiter is the protection.

### 8.7 Tuning targets

Tune the gains to these, across the envelope (at least sea level, 15,000 ft and 30,000 ft, 200–600 KCAS), then store the scheduled gains as data:

- Pitch: short-period frequency 4–6 rad/s, damping ratio 0.6–0.8. A g step reaches 90% in 0.5–1.0 s with less than 10% overshoot.
- Roll: roll-mode time constant 0.3–0.5 s; full-stick rate within 270–330°/s at mid speed.
- Yaw: sideslip within ±3° during a full-stick 360° roll at Mach 0.6, and at 20° AoA.

Use the trim solver plus finite-difference linearisation to get the open-loop dynamics at each point. Explain each tuning decision in plain words in the pull request; the owner wants to understand them.

## 9. Air data for the HUD

From the atmosphere module (pressure p, temperature, density), with sea-level values p0 and a0 taken from the same atmosphere at h = 0 so that calibrated and true airspeed agree at sea level:

- **Mach** = VT / a.
- **KCAS** (calibrated airspeed, the number on the real HUD), from impact pressure qc:
  - subsonic: qc = p·((1 + 0.2·M²)^3.5 − 1)
  - supersonic (Rayleigh pitot): qc = p·(166.9216·M⁷ / (7·M² − 1)^2.5 − 1)
  - then Vc = a0·√(5·((qc/p0 + 1)^(2/7) − 1)) while that gives Vc ≤ a0; above a0, solve the supersonic form with p0 and a0 for Vc (a few Newton steps).
  - knots = ft/s ÷ 1.68781.
- **Altitude** in feet; **heading** in degrees true, 0–359; **g** = n_z to one decimal; **AoA** = α in degrees to one decimal.
- **Flight path marker** (velocity vector): where the velocity points relative to the nose.

## 10. Cues: what the pilot feels without sound

Sound comes in a later milestone. Until then the cues are visual, and each one is driven by the model, never by a timer or a script. Starting values; tune them on the phone.

- **Buffet.** A small, high-frequency camera shake that starts around 12° AoA and grows as AoA approaches the 25° limit, scaled by dynamic pressure (stronger when fast). It tells the pilot the limiter is near before the HUD does.
- **Load.** The chase camera sags slightly toward the belly as g builds, so a 9 g pull looks heavier than a 3 g one.
- **Limiter.** When the pilot pulls past what the limiter allows, the input indicator shows the stick past the point where g stops rising, and the g and AoA readouts stop climbing. Nothing else is needed: that plateau is what an F-16 pilot feels.
- **Energy.** Speed bleeds in a hard turn and the AoA needed for the same g rises; both are visible on the HUD.

## 11. Pilot input: tilt to stick

### 11.1 Reading the phone

Never map raw `beta`/`gamma` to pitch and roll. In landscape they jump by about 180° exactly when the screen passes upright, which is the natural way to hold the phone. Instead, find "up" in screen coordinates and measure tilt against a neutral attitude captured when the pilot taps Start or **Recenter controls**:

```js
const D2R = Math.PI / 180;
function screenAngle() {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}
// World "up" in screen coordinates (x right, y up the screen, z out of the screen).
// alpha cancels out, so turning in a chair causes no input.
function upInScreen(e) {
  const b = e.beta * D2R, g = e.gamma * D2R;
  const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b), z = Math.cos(b) * Math.cos(g);
  const t = screenAngle() * D2R, c = Math.cos(t), s = Math.sin(t);
  return { x: c * x - s * y, y: s * x + c * y, z };
}
// pitch = atan2(u.z, hypot(u.x, u.y)) − pitch at Recenter
// roll  = atan2(u.x, u.y)
// confidence = hypot(u.x, u.y): fades to 0 when the screen faces the sky or the floor
```

This was checked in simulation, not on a phone: it is continuous through upright, ignores yaw, and reads a 20° steering-wheel turn as 20° of roll at any neutral tilt. **The signs must be confirmed on the iPhone**, with the debug overlay showing the raw angles and the derived pitch and roll. Which way iOS reports landscape-left versus landscape-right is not documented.

### 11.2 Mapping

- **Pitch:** tilting the top edge toward you is a pull (nose up), like a yoke. Full force at 25° of tilt from neutral.
- **Roll:** turning the phone like a steering wheel. Clockwise rolls right. Full force at 30°.
- **Deadband** 2° in pitch and 1.5° in roll, standing in for the real stick's breakout force. Beyond it, tilt maps linearly to x = −1..+1; the FCS does the shaping.
- **Smoothing:** a first-order filter with τ ≈ 60 ms, to remove sensor noise and hand tremor without adding noticeable lag. Total input latency should stay under 50 ms.
- **Confidence:** fade roll authority to zero as confidence drops below 0.3.
- **Recenter controls** captures a new neutral. It's in the pause menu, and it also happens on Start and after any screen rotation.

### 11.3 Throttle

A vertical slider along one side of the screen, driven by pointer events with pointer capture, keeping its value when released. A detent at MIL (0.77): the thumb has to move past a small gap to enter afterburner.

## 12. Acceptance tests

Three layers. All run headless in Node from the command line; none needs a browser.

### 12.1 The model is the book's model

- **Book check case** (`docs/f16-data.md` section 6, Table 3.5-2): all 13 state derivatives within 1e-5 relative. Feed surface positions directly, bypassing actuators and FCS. Build the state from the book's Euler angles; compute Euler-angle rates in the test from p, q, r.
- **Level-flight trims** (Table 3.6-2): a trim solver finds throttle, α and elevator for wings-level 1 g flight at sea level, xcg 0.35. All 16 rows within: throttle 0.001, α 0.02° (0.15° below 200 ft/s), elevator 0.01° (0.05° below 200 ft/s).
- **Engine**: thrust at the table's grid points is exact; power-lag rates match the book's PDOT for a few hand-picked cases.
- **Frames**: the conversion tests of section 2.2.
- **Signs**: each surface's step response has the sign in section 2.3.

### 12.2 The FCS behaves like an F-16

Each test flies the full simulation (FCS, actuators, engine) from an air start with a scripted stick and throttle sequence, then checks:

| # | Manoeuvre | Pass when |
|---|---|---|
| 1 | Wings level, stick released, 10 s | n_z within 1 ± 0.05 after 2 s; no divergence in pitch |
| 2 | Throttle from MIL to idle, stick released, 20 s | speed falls, α rises, n_z stays 1 ± 0.1, no pitch oscillation |
| 3 | Full aft stick at 450 KCAS, 10,000 ft | n_z reaches 9 ± 0.3 within 1.5 s; never exceeds 9.5 |
| 4 | Full aft stick held as speed bleeds | α never exceeds 26°; settles near 25° at low speed with n_z near 1 |
| 5 | Full aft stick at 200 KCAS, 10,000 ft | α settles at 24–25°, n_z about 3, far below 9 |
| 6 | Full forward stick at 450 KCAS | n_z reaches −3 ± 0.3, never below −3.5 |
| 7 | Full right stick, 1 g, 350 KCAS | peak roll rate 270–330°/s; |β| < 3° throughout a 360° roll |
| 8 | Full right stick while holding about 20° AoA | roll rate reduced by the limiter (about 170–220°/s); |β| < 3° |
| 9 | Stick released in a 60° bank | bank holds within 5° over 10 s; nose drops (no bank compensation) |
| 10 | Any input sequence, including random stick for 60 s | no NaN; α stays below 30° |

### 12.3 Performance lands in the real F-16's bands

Computed with the trim solver on the model plus the limiter schedule (static, not closed loop), clean, model weight. The real-aircraft bands come from pilots' public statements and are given as ranges because sources disagree. The middle column is what the plain model gave when it was checked while writing this file; the test passes on the band.

| Check | Real F-16 band | Model, as checked |
|---|---|---|
| Max sustained turn, sea level, max afterburner | 19–22.5 °/s | 21.6 °/s at Mach 0.63 |
| Max sustained turn, 15,000 ft | 12.5–15.5 °/s | 14.3 °/s |
| Max instantaneous turn, 15,000 ft | 17–21 °/s | 19.4 °/s at 410 KCAS |
| Max instantaneous turn, sea level | 23–27 °/s | 24.9 °/s at 391 KCAS |
| Corner speed | 330–450 KCAS | about 390–410 KCAS |
| Max level speed, sea level | Mach 1.15–1.25 | depends on 5.2; about 1.17 |
| Max level speed, 40,000 ft | Mach 1.9–2.1 | depends on 5.2; about 2.0 |
| 1 g speed at the 25° AoA limit | about 100–130 KCAS | about 105 KEAS |
| Full-stick roll rate | 270–330 °/s | set by the FCS |

### 12.4 On the phone

No test above can check the feel. Every milestone ends with the owner flying it on the iPhone, using the debug overlay (raw sensor angles, derived pitch and roll, n_z, α, fps) to confirm signs and smoothness.

## 13. Out of scope for now

| Item | Why |
|---|---|
| Departures, spins, deep stall | No data past 45° AoA; the FCS prevents them anyway. Would need NASA's high-fidelity tables. |
| Leading-edge flaps as aerodynamics | The low-fidelity data has no flap input. They could be animated on the model later. |
| Gear, flaps, speed brake, takeoff and landing | Air start only. The FCS's gear-down laws come with them. |
| Mach effects beyond drag | Not in the data. |
| Heavy-store limiter (CAT III), stores, fuel burn | Clean jet only; weight is fixed. |
| Pitch trim switch, rudder pedals | The FCS trims automatically and coordinates the rudder. |
| G-induced loss of consciousness, structural damage | The FCS limits g; nothing to model. |
| Sound | A later milestone. |

## 14. Sources

- Stevens, Lewis & Johnson, *Aircraft Control and Simulation*, 3rd ed., Wiley 2015: the low-fidelity model and its check cases.
- Nguyen et al., NASA TP-1538, December 1979: the aerodynamic data, the simulated FCS structure, the roll limiter formula, the 25° AoA limit and the deep-stall behaviour. https://ntrs.nasa.gov/citations/19800005879
- Gilbert, Nguyen & Van Gunst, NASA TN D-8176, 1976: the AoA limiter and the 30° backstop. https://ntrs.nasa.gov/citations/19760017178
- Marchand, AFIT thesis GGC/EE/77-7: the C* blend and 400 ft/s crossover. https://apps.dtic.mil/sti/pdfs/ADA055417.pdf
- Smith & Montgomery, NASA TM-4752, 1996: sidestick force bands. https://corpora.tika.apache.org/base/docs/govdocs1/076/076497.pdf
- Russell, *Non-linear F-16 Simulation using Simulink and Matlab*, University of Minnesota, 2003: actuator model.
- *The Safety Value of Protected Flight Controls*, Flight Test Safety Workshop 2022, by a former F-16 test pilot: limiter schedule, roll limits. https://www.flighttestsafety.org/images/FTSW_2022_-_The_Safety_Value_of_Protected_Flight_Controls.pdf
- Public statements by F-16 pilots and engineers on f-16.net: performance bands, stick forces, hands-off behaviour. Treated as approximate.
- The F-16 flight manual (T.O. 1F-16C-1) and FCS block diagrams are distribution-limited and were not used. Don't seek them out.
