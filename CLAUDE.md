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
| 1d | **Second look.** Zenith and nadir symbols, Credits row, look-around by dragging, afterburner plume. | Done |
| 2 | **Terrain.** Zion National Park from real elevation data, the crash on the ground that is there, radar altitude on the HUD; plus the recenter confirmation and movable control surfaces. The section "Milestone 2" below. | Flown. The tile's edge looked wrong; milestone 3 fixes it |
| 3 | **Places.** A coarse base tile from Las Vegas to Lake Powell with five fine patches at the places worth flying, a place to choose on the start screen, and the F-16's steerpoint and bullseye on the HUD. The section "Milestone 3" below. | Built; waiting for the owner's flights |

Later milestones (sound, a bandit to dogfight) get specified when milestone 3 is done.

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
src/places.js             the places to fly and their air starts
src/sim/                  the simulation: pure JS, no DOM, no three.js, no browser APIs
src/sim/data/             the F-16 tables as JS modules, re-keyed from docs/f16-data.md
src/input/                tilt and look-around; browser-facing, maths kept pure and tested
src/render/               all three.js code: world, terrain, aircraft, plume, camera, frame conversions
terrain/                  base.png, places.png and region.json (the heightmaps), CREDITS.md, make-heightmap.py (the GeoTIFF conversion)
src/hud/                  the HUD
src/ui/                   throttle, stick indicator, pause button, screens, settings
vendor/three/             three.js r186: build/three.module.js, build/three.core.js, examples/jsm/ (GLTFLoader and its helpers), LICENSE, VERSION
models/                   f16c.glb, CREDITS.md, cut-surfaces.py (the one-off Blender cut)
tests/*.test.js           node --test: model, FCS, input maths, frames
tests/flight/             the flight tests of docs/flight-model.md 12.2 and 12.3
tests/browser/smoke.js    loads the app in headless Chromium and flies a few seconds of simulated tilt
.github/workflows/        test.yml runs every test; pages.yml runs it, then publishes the app
```

- **The simulation never imports from `render/`, `hud/`, `ui/` or `input/`.** The renderer, HUD and UI only read simulation state; none of them changes it. Input reaches the simulation only as stick (x_pitch, x_roll) and throttle values passed into the step function.
- `index.html` loads three.js through an inline import map with `./`-relative paths. Every path in the app is relative (`./`), because the app lives under `/rage/`, not at the site root.
- Get three.js once with `npm pack three@0.186.1` and copy the two build files and the licence in. Record the version in `vendor/three/VERSION`. No CDN, ever: the app must work offline. Copy an addon only if one is needed, with its own imports.

## The aircraft and the world

- **The jet** is a low-poly F-16C model, “F 16 C” by Usman Zia, CC BY 4.0, converted to glTF in `models/f16c.glb` and credited in `models/CREDITS.md` and under Credits in Settings. It is loaded with three.js's GLTFLoader addon, copied into `vendor/three/examples/jsm/` with its two helpers. Its stabilators, flaperons and rudder are separate parts, cut along the author's painted hinge lines by `models/cut-surfaces.py` (the flaperon hinge raked 8° aft along the wing, ending before the tip rail; the rudder's raked 33°, stopping under the fin's cap; the stabilator pivot at 44% of the root chord), and move every frame to the simulation's actuator positions; the stabilators also move differentially with roll, a quarter of the flaperon deflection, as the real tails do. Behind the nozzle, an afterburner plume (`src/render/plume.js`): two additive cones with shock diamonds, growing with the burner fraction the engine reports, hidden at dry power. Control surfaces don't need to move in milestone 1.
- **The world** is the country from Las Vegas to Lake Powell and from the Grand Canyon to Bryce Canyon: a coarse base tile of real elevation data with five fine patches at Zion, the Grand Canyon, Bryce, Lake Powell and Las Vegas (`terrain/`, see its CREDITS.md), drawn as a geometry clipmap by `src/render/terrain.js`, coloured by height and slope with a fine grain; the same heightmaps read on the CPU by `src/render/heightmap.js` for the crash and the radar altitude. A sky that fades to a horizon colour, with a mid-afternoon sun in the south-west and a scattered field of fair-weather cumulus painted on the dome (`src/render/world.js`), infinitely far, so nothing is ever flown through; the ground and the jet lit from the same sun; fog that hides the far edge; no shadows.
- **Air start:** 5,000 ft above the ground at the place chosen on the start screen (`src/places.js`), pointed at the sight: Zion is over Springdale heading north up the canyon; 350 KCAS, wings level, trimmed for 1 g. The throttle slider starts at the trim setting. The FCS starts trimmed too (`docs/flight-model.md` 8.2).
- **Crash:** below the ground that is there the flight ends. The screen says "Crashed" with one button, "Fly again", which returns to the start screen.

## Camera

A chase camera behind and slightly above the jet, like vazgriz's flight sim (his series is MIT-licensed and a good reference for the camera and HUD: https://github.com/vazgriz/FlightSim). It follows the jet's attitude smoothly enough not to jitter, and stays close enough that the jet's own motion reads clearly. The cues in `docs/flight-model.md` section 10 (buffet shake, load sag) are applied to it. **Look-around:** a finger dragged on the view, outside the controls, swings the camera around the jet in two axes, dragging the world (drag right, look left; drag down, look up), and the view eases back when the finger lifts; tilt and throttle keep working meanwhile. The HUD's numbers stay put and its conformal symbols are seen only when the view includes them. No other camera views in milestone 1.

## HUD

The HUD is the cockpit's head-up display, drawn over the view the way a real fighter HUD looks and the way vazgriz's does: thin green symbols and numbers, no boxes of colour, no backgrounds. It is not part of the UI.

- **Airspeed** in KCAS on the left; **altitude** in feet on the right: barometric, or below 1,500 ft above the ground the radar altitude with an R, as the F-16's AUTO mode shows it.
- **Heading** across the top, degrees true.
- **Pitch ladder** with the horizon line, every 5° (dashed below the horizon), rolling with the jet. At straight up and straight down, the F-16's zenith symbol (an eight-pointed star with a tail) and nadir symbol (a hatched circle with a tail), upright on the screen.
- **Flight path marker**: where the jet is actually going.
- **Waterline**: where the nose points.
- **g** (one decimal), **AoA** in degrees (one decimal), **Mach** (two decimals), and **power state**: IDLE, MIL, or AB with the afterburner percentage. The power state shows the engine, not the slider, so the spool-up lag is visible.
- **Steerpoint**: the next place on the loop (`src/places.js`), as the F-16's diamond on the sight when it is in the view, or its tadpole above the flight path marker with a tail pointing the way to turn when it isn't; the range in nautical miles and the place's name in the lower right. Passing within 2 nm steps to the next place.
- **Bullseye**: the jet's own bearing and range from the bullseye, Springdale, in the lower left, as "BE 238/123".

Every value comes from `src/sim/` air data (`docs/flight-model.md` section 9). The HUD sits inside the safe area, uses the same green in Light and Dark (see Departures), and has a thin dark outline so it reads against bright sky and dark ground.

## UI

Minimal, and as unobtrusive as the controls of a real cockpit:

- **Throttle**: a slim vertical slider along the left edge, inside the safe area and clear of the bottom edge, where an upward swipe leaves the app. Pointer events with pointer capture; it keeps its value when released. A detent at MIL: the thumb has to cross a small gap to enter afterburner.
- **Stick indicator**: a small, faint cross in a corner showing where the tilt is, inside a square for full deflection. It shows when the stick is past what the limiter allows, and when the controls need recentering.
- **Pause button**: small, in a top corner.

Screens:

- **Start.** The name, a list of the five places by their full names (remembered as `rage.place`), and one button: **Fly**. Tapping it asks for motion access, keeps the screen awake and starts the flight at the chosen place. Fly again, on the pause and crash screens, comes back here, so the place can be changed between flights. The motion permission request is the first statement in that tap's handler, before anything else, or iOS refuses it.
- **Pause.** Resume, **Recenter controls**, Fly again (back to the start screen, where a place can be picked before flying), Settings. Recentering confirms itself: the button reads "Recentered" with a tick for a second, and the stick indicator glows once as its cross snaps to centre.
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

## Milestone 2

Agreed with the owner after milestone 1d. Each numbered item is its own pull request, in this order; the terrain is several.

1. **Recenter confirmation.** Tapping Recenter controls on the pause screen gives two signals: the button's label becomes "Recentered" with a tick for about a second, and the stick indicator's cross snaps to the centre with a brief glow.
2. **Movable control surfaces.** The stabilators, flaperons and rudder of Usman Zia's model are cut out of its single mesh in Blender along the author's own hinge lines (the mesh has edge loops there), each given a pivot on its hinge, and exported as named parts in the same glTF. Every frame the renderer rotates them from the simulation's actuator states, so they move as the FCS moves them and never otherwise. Leading-edge flaps are not in the book's data and stay fixed. The cut replaces `models/f16c.glb` in one pull request, so reverting that pull request restores the uncut model; if the cut comes out badly the owner looks for a model with separate surfaces instead.
3. **Terrain: Zion National Park**, as vazgriz's reference sim has it, from real elevation data. The owner downloads a public-domain SRTM 30 m elevation tile covering about 60 km square around Zion Canyon (roughly 37.03° to 37.57° N, 113.29° to 112.61° W) and uploads it; it is converted to a heightmap image of about 1.5 MB in `terrain/`, with its source and licence noted in `terrain/CREDITS.md`. The ground is a grid that follows the camera, displaced by the heightmap on the GPU in rings of increasing coarseness, with the same heights read on the CPU for the crash and the radar altitude. Beyond the tile the ground flattens at the edge height under the fog. Colour comes from height and slope with a fine procedural grain so speed reads at low level: sandstone reds and greys on steep rock, green in the valleys, lighter on the plateaus. No image textures. The flat-ground grid goes. Sky, fog and sun stay.
   - **Crash:** the flight ends when the jet is below the ground that is there, not below 0 ft. `docs/flight-model.md` is updated to say so.
   - **Air start:** 5,000 ft above the ground over a chosen valley, heading toward the canyon; still 350 KCAS, wings level, trimmed.
   - **Radar altitude** on the HUD in the F-16's AUTO mode: below 1,500 ft above the ground the altitude window shows radar altitude with an R; above that, barometric as now.
   - **Tests:** the height sampler and the crash and radar-altitude rules in `node --test`; the smoke test checks the terrain draws and the radar altitude reads.

Settled at the same time: the transonic patch in `docs/flight-model.md` 5.2 stays.

## Milestone 3

Agreed with the owner after flying milestone 2. Beyond the Zion tile's last row of survey posts the ground was extruded in straight streaks, and the south edge is only 18 km from the air start. The fix is more real ground, fine at the places worth flying and coarse between them. Sound and the bandit move back one milestone each. Three pull requests, in this order, once the owner has uploaded the downloads in the table below.

1. **A region and its places.** One coarse base tile of SRTM 90 m data covers the country from Las Vegas to Lake Powell and from the Grand Canyon to Bryce Canyon, about 420 by 270 km, at about 200 m between posts. Inside it, five fine patches of SRTM 30 m data at 60 to 80 m between posts: Zion (the tile of milestone 2); the Grand Canyon's inner gorge from the South Rim to the North Rim; Bryce Canyon with Cedar Breaks and the high plateaus between; Page with Glen Canyon Dam, Horseshoe Bend and the lower lake; Las Vegas with Nellis AFB, the Strip, Hoover Dam and Lake Mead. The base is one image; the patches sit side by side in one atlas image, with a JSON file saying where each lies. `terrain/make-heightmap.py` converts them all in one map projection, so the patches land on the base exactly; `terrain/CREDITS.md` lists every tile. About 16 MB in all, cached for offline play like everything else. Grand Junction, Moab and Monument Valley were considered and left out: too far for the ground between.
   - **The lookup.** The ground height at a point is the finest patch that covers it, else the base. Across the outer 3 km of each patch the two are blended so no step shows; across the outer 10 km of the base the ground eases to one flat height, so the streaks never return. The GPU and the CPU do the same lookup from the same images, as now. The clipmap, the crash and the radar altitude don't change.
   - **Colour** by height and slope across the whole region's heights, from 200 m at Lake Mead to 3,400 m on the plateaus, with the same four bands. Lakes are flat in the data (SRTM saw Lake Powell and Lake Mead full in February 2000) and read as flat valley floor; no water in this round.
   - **Far coordinates.** Las Vegas is 250 km from Zion. The terrain shader works relative to the camera, so single-precision positions stay exact at that distance.
2. **Choose a place.** The start screen gains a list of the five places under the title, by their full names (Zion National Park, Grand Canyon National Park, Bryce Canyon National Park, Lake Powell, Nellis AFB); the choice is remembered (`rage.place`), and Fly and Fly again start there: 5,000 ft above the ground, 350 KCAS, wings level, trimmed, pointed at the sight.
   - **Zion:** over Springdale, heading north up the canyon, as now.
   - **Grand Canyon:** over Grand Canyon Village on the South Rim, heading north across the gorge toward the North Rim.
   - **Bryce:** over the plateau west of Bryce Point, heading east over the amphitheatre toward the Paria valley.
   - **Lake Powell:** over the Echo Cliffs south-east of Page, heading north-west over Horseshoe Bend to the dam and the lake. (The river below Horseshoe Bend is 6 km from the patch's edge, too close to the blend band.)
   - **Nellis AFB:** over Nellis, heading south-west down the Strip, with Lake Mead and Hoover Dam behind.
   - **Tests:** the lookup (patch, base, blend, outer fade) and each place's air start in `node --test`; the smoke test chooses a place and checks the air start is 5,000 ft above the ground there.
3. **Steerpoint and bullseye.** Navigation the way the F-16 does it, with no menu. The five places form a fixed loop, Zion, Bryce, Lake Powell, Grand Canyon, Las Vegas and back to Zion, and choosing a place is choosing where to join it. The HUD shows one steerpoint, the next place on the loop: the jet's steerpoint diamond on the sight when it is in the view; when it isn't, the jet's tadpole, a small circle with a tail pointing the way, near the flight path marker; and the range in nautical miles in the lower right. Passing within 2 nm steps to the next place, as the jet's auto-sequencing does, so the loop can be flown round (an hour and four minutes at 400 knots). The bullseye is a fixed point, Springdale for now, one constant that the owner may move later; the HUD's lower left shows the jet's bearing and range from it, two numbers, as the jet does. (The start screen was to show each place's bullseye call; the owner found it clutter and it was dropped.)
   - **Tests:** the loop's legs (heading and range from the places' positions), the auto-step, the bullseye numbers, and the tadpole's direction in `node --test`; the smoke test reads the steerpoint range at the air start.

Agreed after the owner's flights, as follow-ups in the same milestone:

4. **Sky.** A sun disc with a glow, 45° up in the south-west, and a broken field of fair-weather cumulus drawn from noise on the sky dome, denser toward the horizon as a deck looks from below. The clouds are a texture of the sky, not objects: nothing is flown through. The terrain's lighting and the jet's use the same sun.

The downloads, from OpenTopography as for milestone 2 (the boxes carry a small margin):

| Tile | Data | North | South | West | East |
|---|---|---|---|---|---|
| Base | SRTM GL3 (90 m) | 38.10 | 35.70 | -115.50 | -110.80 |
| Grand Canyon, 60 km | SRTM GL1 (30 m) | 36.41 | 35.83 | -112.45 | -111.75 |
| Bryce and Cedar Breaks, 80 km | SRTM GL1 (30 m) | 38.00 | 37.24 | -112.97 | -112.03 |
| Page and Lake Powell, 60 km | SRTM GL1 (30 m) | 37.24 | 36.66 | -111.61 | -110.89 |
| Las Vegas and Nellis, 80 km | SRTM GL1 (30 m) | 36.53 | 35.77 | -115.42 | -114.48 |

Zion's patch is the milestone 2 tile, regenerated from its download in the new projection.

## Parked

Discussed, not adopted, might come back. Ask before building.

- **Double-tap the stick indicator to trim.** For a future aircraft without the F-16's automatic trim.
- **A touch-stick fallback** when motion access is denied. The owner finds on-screen sticks unnatural.
- **Bank compensation as an "easy mode."** The real F-16 has none.
- **Sound, a bandit to dogfight.** Milestones 4 and 5.
- **Takeoff and landing**, with the FCS's gear-down laws.
- **NASA's high-fidelity data**, which would allow leading-edge flaps, departures and the deep stall.
- **A heavier, more powerful F-16C** (real half-fuel weight with an F110-GE-129 engine). The book's lighter jet with its weaker engine already turns like a real one; changing one without the other would break that.
