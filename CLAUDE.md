# Rage

An F-16 flight sim for iPhone. You fly by tilting the phone, held in landscape like a steering wheel, with a throttle under your left thumb. No missions, no story, no score: the flying is the game. It's a home-screen web app hosted on GitHub Pages at `https://135crewdog.github.io/rage/`.

The owner is a pilot and builds these apps to learn. Rage is about learning real-time 3D, flight physics and fly-by-wire control, not about shipping a commercial game.

## The project rules

1. **REAL.** The jet flies by physics and its flight control system, from public F-16 data, never by shortcuts that point it where the player wants. `docs/flight-model.md` is the authority on everything in the simulation; `docs/f16-data.md` holds its numbers. If something feels wrong, the fix goes in the model, the FCS or the input mapping.
2. **SIMPLE.** Plain HTML, CSS and JavaScript (ES modules). No framework, no build step, no runtime dependency except three.js, copied into the repo. When in doubt, choose fewer files, features, settings and words.
3. **FUTURE-PROOF.** It works offline, depends on as little as possible, and keeps working for years without maintenance.

The owner's design philosophy applies to everything a person sees or touches: https://135crewdog.github.io/hig/. Read it. Its baseline says a departure from it needs a reason, written down; this file's "Departures" section is where those reasons live.

**Working rules.**
- Build only the current milestone. Ask before adding anything this file doesn't describe. Ideas discussed and not adopted are under "Parked"; don't build them without asking.
- Propose a solution and agree it with the owner before building anything that isn't already specified here.
- Work in pull requests. A pull request waits for the owner's review; never merge one unasked.
- Every pull request description ends with a short **What this teaches** section: the one to three ideas in it worth understanding, in plain words, the way you'd explain them to a pilot who isn't a programmer. No jargon without a one-line explanation. Keep it short; the owner wants the basic ideas, not a course.
- When a test can't pass, stop and report what you found with numbers. Never loosen a test to make it pass.

## Milestones

| # | Scope | Status |
|---|---|---|
| 1 | **First flight.** The whole simulation in `docs/flight-model.md`, tested; a flat world; the jet, the chase camera, the HUD and the UI; tilt and throttle; the app installable and working offline; deployed to Pages. Delivered as the three pull requests below. | Not started |
| 1a | Simulation core: atmosphere, aero, engine, actuators, equations of motion, trim solver, air data. All of `docs/flight-model.md` section 12.1 and 12.3 passing. No visuals. | Done |
| 1b | Flight control system, tuned. Section 12.2 passing. A headless flight script that flies a manoeuvre and prints a time history, so tuning is visible. | Done |
| 1c | The app: world, aircraft, camera, HUD, UI, tilt, throttle, menus, PWA, Pages. Ends with the owner flying it on the iPhone. | Flown. Tilt, crash, update prompt and pause-when-hidden confirmed; the wake lock still to confirm |
| 1d | **Second look.** The four items under "Next round" below, from the owner's first flights. | Built; waiting for the owner's flights |

Later milestones (terrain, sound, a bandit to dogfight) get specified when milestone 1 is done.

## Files

```
CLAUDE.md                 this file
README.md                 for developers: running tests, the debug overlay, deploying, version bumps
docs/flight-model.md      the simulation's authority: physics, FCS, input, cues, tests
docs/f16-data.md          the F-16 tables and the book's check cases
index.html                the app's only page
style.css
manifest.webmanifest
sw.js                     service worker
icons/                    app icons
src/main.js               composition root: wires sim, input, renderer, HUD and UI together
src/sim/                  the simulation: pure JS, no DOM, no three.js, no browser APIs
src/sim/data/             the F-16 tables as JS modules, re-keyed from docs/f16-data.md
src/input/                tilt and look-around; browser-facing, maths kept pure and tested
src/render/               all three.js code: world, aircraft, camera, frame conversions
src/hud/                  the HUD
src/ui/                   throttle, stick indicator, pause button, screens, settings
vendor/three/             three.js r186: build/three.module.js, build/three.core.js, examples/jsm/ (GLTFLoader and its helpers), LICENSE, VERSION
models/                   f16c.glb and CREDITS.md
tests/*.test.js           node --test: model, FCS, input maths, frames
tests/flight/             the flight tests of docs/flight-model.md 12.2 and 12.3
tests/browser/smoke.js    loads the app in headless Chromium and flies a few seconds of simulated tilt
.github/workflows/        test.yml runs every test; pages.yml runs it, then publishes the app
```

- **The simulation never imports from `render/`, `hud/`, `ui/` or `input/`.** The renderer, HUD and UI only read simulation state; none of them changes it. Input reaches the simulation only as stick (x_pitch, x_roll) and throttle values passed into the step function.
- `index.html` loads three.js through an inline import map with `./`-relative paths. Every path in the app is relative (`./`), because the app lives under `/rage/`, not at the site root.
- Get three.js once with `npm pack three@0.186.1` and copy the two build files and the licence in. Record the version in `vendor/three/VERSION`. No CDN, ever: the app must work offline. Copy an addon only if one is needed, with its own imports.

## The aircraft and the world

- **The jet** is a low-poly F-16C model, “F 16 C” by Usman Zia, CC BY 4.0, converted to glTF in `models/f16c.glb` and credited in `models/CREDITS.md` and under Credits in Settings. It is loaded with three.js's GLTFLoader addon, copied into `vendor/three/examples/jsm/` with its two helpers. Behind the nozzle, an afterburner plume (`src/render/plume.js`): two additive cones with shock diamonds, growing with the burner fraction the engine reports, hidden at dry power. Control surfaces don't need to move in milestone 1.
- **The world** in milestone 1 is flat ground at 0 ft with a grid fine enough to read speed and height from, a sky that fades to a horizon colour, and fog that hides the far edge. Sun from above, no shadows.
- **Air start:** 5,000 ft, 350 KCAS, wings level, heading north, trimmed for 1 g. The throttle slider starts at the trim setting. The FCS starts trimmed too (`docs/flight-model.md` 8.2).
- **Crash:** below 0 ft the flight ends. The screen says "Crashed" with one button, "Fly again", which restarts from the air start.

## Camera

A chase camera behind and slightly above the jet, like vazgriz's flight sim (his series is MIT-licensed and a good reference for the camera and HUD: https://github.com/vazgriz/FlightSim). It follows the jet's attitude smoothly enough not to jitter, and stays close enough that the jet's own motion reads clearly. The cues in `docs/flight-model.md` section 10 (buffet shake, load sag) are applied to it. **Look-around:** a finger dragged on the view, outside the controls, swings the camera around the jet in two axes, dragging the world (drag right, look left; drag down, look up), and the view eases back when the finger lifts; tilt and throttle keep working meanwhile. The HUD's numbers stay put and its conformal symbols are seen only when the view includes them. No other camera views in milestone 1.

## HUD

The HUD is the cockpit's head-up display, drawn over the view the way a real fighter HUD looks and the way vazgriz's does: thin green symbols and numbers, no boxes of colour, no backgrounds. It is not part of the UI.

- **Airspeed** in KCAS on the left; **altitude** in feet on the right.
- **Heading** across the top, degrees true.
- **Pitch ladder** with the horizon line, every 5° (dashed below the horizon), rolling with the jet. At straight up and straight down, the F-16's zenith symbol (an eight-pointed star with a tail) and nadir symbol (a hatched circle with a tail), upright on the screen.
- **Flight path marker**: where the jet is actually going.
- **Waterline**: where the nose points.
- **g** (one decimal), **AoA** in degrees (one decimal), **Mach** (two decimals), and **power state**: IDLE, MIL, or AB with the afterburner percentage. The power state shows the engine, not the slider, so the spool-up lag is visible.

Every value comes from `src/sim/` air data (`docs/flight-model.md` section 9). The HUD sits inside the safe area, uses the same green in Light and Dark (see Departures), and has a thin dark outline so it reads against bright sky and dark ground.

## UI

Minimal, and as unobtrusive as the controls of a real cockpit:

- **Throttle**: a slim vertical slider along the left edge, inside the safe area and clear of the bottom edge, where an upward swipe leaves the app. Pointer events with pointer capture; it keeps its value when released. A detent at MIL: the thumb has to cross a small gap to enter afterburner.
- **Stick indicator**: a small, faint cross in a corner showing where the tilt is, inside a square for full deflection. It shows when the stick is past what the limiter allows, and when the controls need recentering.
- **Pause button**: small, in a top corner.

Screens:

- **Start.** The name, and one button: **Fly**. Tapping it asks for motion access, keeps the screen awake and starts the flight. The motion permission request is the first statement in that tap's handler, before anything else, or iOS refuses it.
- **Pause.** Resume, **Recenter controls**, Fly again (back to the air start), Settings.
- **Settings.** Theme: Light, Dark, Auto (Auto follows the phone). The app's version. A Credits row that expands in place to the jet's credit and licence. Done.
- **Rotate your phone.** Shown whenever the phone is in portrait. It also says: if it won't rotate, turn off Portrait Orientation Lock in Control Center.
- **Motion access denied.** If the permission is refused, say so plainly and how to fix it: close the app completely, open it again, tap Fly and choose Allow. There is no touch-stick fallback (see Parked).

The UI and every screen follow the owner's Show Time and Apollo apps (https://github.com/135crewdog/showtime): system font, Apple's colours and grays, rounded cards, sentence case, Light, Dark and Auto. The game view itself is dark regardless of theme; the theme applies to the screens and the UI.

## Platform rules (iPhone Safari, iOS 18.4 and later)

These come from research done while preparing the project; `docs/flight-model.md` section 11 has the tilt maths.

- **Motion permission**: `DeviceOrientationEvent.requestPermission()` only works when called synchronously inside a tap handler, over HTTPS. Expect the prompt on every cold launch. A plain `click` on a normal button is the safest gesture for it.
- **No orientation lock** on iOS: the manifest's `orientation` and `screen.orientation.lock()` are ignored. Put `"orientation": "landscape"` in the manifest anyway (Android honours it), show the rotate screen in portrait, and on any rotation during flight pause and recenter.
- **Wake lock**: with tilt controls nobody touches the screen, so request a screen wake lock in the Fly tap, and again whenever the app becomes visible. It works in home-screen apps from iOS 18.4.
- **Full screen** means a home-screen app with `display: standalone` and `viewport-fit=cover`. The 3D view fills the whole screen, under the Dynamic Island; the HUD and UI stay inside `env(safe-area-inset-*)`.
- **No scrolling, zooming or selecting**: a fixed root, nothing scrollable, `touch-action: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`. Safari ignores `user-scalable=no`.
- **Frame rate**: assume 60 fps, 30 in Low Power Mode, 120 possible. The fixed-step loop and interpolation in `docs/flight-model.md` 2.4 handle all three. Pause automatically when the app is hidden; resume only from the pause screen.
- **Rendering**: three.js `WebGLRenderer` (WebGL2), pixel ratio capped at 2, no shadows, no post-processing, no logarithmic depth buffer. Near plane about 1 m, far plane about 30 km, with fog.
- **Shared origin**: every app on `135crewdog.github.io` shares storage and caches. Prefix every cache with `rage-` and every storage key with `rage.`, and only ever delete caches that start with `rage-`.
- **Updates**: the service worker caches the whole app for offline play and never calls `skipWaiting()` on its own. When a new version is waiting, offer it on the pause or start screen only, never mid-flight.

## Testing

- `node --test` runs everything in `tests/` except the browser test. The simulation tests need nothing installed.
- The flight tests run the full simulation headless and print what they measured, not just pass or fail.
- `tests/browser/smoke.js` uses Playwright (installed in CI without saving it to the repo, the way Apollo does it) to load the app in headless Chromium, tap Fly, feed simulated tilt, and check that it renders and the jet responds.
- **A debug overlay** at `?debug=1` shows raw sensor angles, derived pitch and roll, n_z, α, β, fps and draw calls. It's how signs and smoothness get checked on the phone.
- **Nothing replaces the phone.** Milestone 1c ends with the owner flying it. Headless Chromium is not iOS.

## Versioning

One version string, `APP_VERSION` in `src/main.js`, shown in Settings, and the same value as `VERSION` in `sw.js`. Bump both with every change to anything the app serves, or phones keep the old copy.

## Departures from the owner's design philosophy

- **A full-screen app shell.** The philosophy's working examples are pages that scroll. A flight sim fills the screen and can't scroll; the game view is fixed and sized to the screen.
- **The HUD ignores the theme.** A real HUD is green, and green reads against both sky and ground. Light and Dark apply to the screens and the UI.
- **Focused, not broad.** Rage is for an iPhone held in landscape. It doesn't try to work on a tablet or a computer beyond the tests.

## Deliberately not in the game

Not in milestone 1, and not planned unless the owner says so: missions, scores, a story, menus beyond those above, weapons, multiple aircraft, cockpit view, and everything in `docs/flight-model.md` section 13.

## Next round (milestone 1d)

Agreed with the owner after the first flights; each is its own pull request, in this order.

1. **Zenith and nadir symbols** on the pitch ladder at +90° and −90°, as the real F-16 HUD draws them (the exact symbols checked against references first), so straight up and straight down read without hunting between the 85° bars. Conformal like the rest of the ladder.
2. **Credits as an expanding row** in Settings: a "Credits" row under the version that opens in place to show the jet's full credit and licence, instead of the line now under the version.
3. **Look-around by dragging.** A finger dragged on the game view, outside the throttle, pause button and stick indicator, swings the chase camera around the jet in two axes: dragging right pulls the world right, so you end up looking left; up and down tilt over and under the jet. Lifting the finger eases the view back to the standard chase position. The jet keeps flying by tilt and the throttle keeps working under the other thumb. The HUD does what vazgriz's does: the ladder, horizon, waterline and flight-path marker stay where they are in the world, so they are seen only when the view happens to include them; airspeed, altitude, heading, g, AoA, Mach and power stay in their fixed places.
4. **Afterburner visuals.** A tapered plume from the nozzle with shock diamonds, growing with the burner percentage, driven by the engine's afterburner state like the HUD's power readout, so it lights with the spool-up lag and not with the slider. The model's nozzle stays as it is. Nothing shows at dry power. vazgriz's afterburner effect (MIT) is the reference.

Settled at the same time: the transonic patch in `docs/flight-model.md` 5.2 is enough for now; no placard warning. Milestone 2 waits until this round is done.

## Parked

Discussed, not adopted, might come back. Ask before building.

- **Double-tap the stick indicator to trim.** For a future aircraft without the F-16's automatic trim.
- **A touch-stick fallback** when motion access is denied. The owner finds on-screen sticks unnatural.
- **Bank compensation as an "easy mode."** The real F-16 has none.
- **Terrain, sound, a bandit to dogfight.** Likely next milestones.
- **Takeoff and landing**, with the FCS's gear-down laws.
- **NASA's high-fidelity data**, which would allow leading-edge flaps, departures and the deep stall.
- **A heavier, more powerful F-16C** (real half-fuel weight with an F110-GE-129 engine). The book's lighter jet with its weaker engine already turns like a real one; changing one without the other would break that.
