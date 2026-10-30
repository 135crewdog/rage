# Rage

An F-16 flight sim for iPhone. `CLAUDE.md` says what it is and the rules it's built under; `docs/flight-model.md` is the authority on the simulation and `docs/f16-data.md` holds its numbers.

## Running the tests

You need Node 20 or later and nothing else: there are no dependencies to install.

```
node --test
```

This runs every test under `tests/`, except the browser test. It takes a few seconds. The tests print what they measured, not just pass or fail:

- `tests/dynamics.test.js` prints the book's check case next to the model's 13 derivatives.
- `tests/trim.test.js` prints the 16 level-flight trims next to the book's table.
- `tests/flight/performance.test.js` prints the model's turn rates, corner speed and top speeds next to the real F-16's published bands.
- `tests/flight/manoeuvres.test.js` flies the ten manoeuvres of `docs/flight-model.md` 12.2 with the full flight control system and prints what each one measured.
- `tests/flight/modes.test.js` linearises the closed loop at points across the envelope and prints the short-period, roll and dutch-roll modes and the g-step response.

To run one file:

```
node --test tests/trim.test.js
```

The same command runs in GitHub Actions on every push and pull request (`.github/workflows/test.yml`).

## Flying headless

To watch the flight control system work, fly a manoeuvre from the command line and read the time history:

```
node tests/flight/fly.js pull --kcas=450 --every=0.25
node tests/flight/fly.js roll --h=500 --kcas=120
node tests/flight/fly.js random --seed=4 --t=30
```

Run it with no arguments for the list of manoeuvres. Options are `--h` (ft), `--kcas`, `--t` (seconds), `--every` (print interval), `--throttle` and `--seed`. The FCS gains live in `src/sim/data/fcs.js`; change one, fly again, and the difference is in the table.

## The browser smoke test

`tests/browser/smoke.js` loads the app in headless Chromium at an iPhone-sized landscape viewport, taps Fly, feeds simulated tilt and checks that it renders and the jet responds. It needs Playwright with Chromium, which is a developer tool and not part of the app:

```
npm install --no-save playwright
npx playwright install chromium
node tests/browser/smoke.js            # pass a folder to save screenshots: node tests/browser/smoke.js shots
```

CI runs it on every push. Nothing replaces the phone: headless Chromium is not iOS.

## The user guide

`guide/index.html` is the user guide, a page beside the app at `/rage/guide/`, opened by the User guide button in Settings. It imports the app's version, places and theme, and pulls the credits from the app's own page, so none of those is written twice. Its pictures are made from the app by `tests/browser/guide.js`, which flies the air start in headless Chromium and writes the labelled HUD and screen, the start, rotate and Settings screens, and a map drawn from the heightmaps and the places into `guide/img/` (ignored by git). CI runs it on every push and the Pages workflow publishes what it made, so the pictures always show the current app. To see the guide locally:

```
node tests/browser/guide.js
node tests/browser/smoke.js          # or any static server; then open /guide/
```

## Running the app

The app is static files. Serve the repo root over HTTP and open `index.html`; the smoke test's server does exactly that, or use any static server. Tilt controls need a phone over HTTPS, so for real flying use the Pages site: `https://135crewdog.github.io/rage/`.

## The debug overlay

Add `?debug=1` to the URL and a small panel shows the raw sensor angles (β, γ, α and the screen angle), the derived pitch and roll with the captured neutral, the stick and throttle values, n_z, α, β and the limiter state, and the frame rate and draw calls. It is how the tilt signs and smoothness get checked on the phone; if pitch or roll come out backwards, flip `pitchSign` or `rollSign` in `src/input/tilt.js`.

## Deploying

`.github/workflows/pages.yml` runs the tests, the smoke test and the guide's picture script, then publishes the repo root with those pictures to GitHub Pages on every push to `main`. One-time setup: in the repository's Settings, under Pages, set the build source to GitHub Actions.

## Version bumps

One version string lives in two places: `APP_VERSION` in `src/version.js` (shown in Settings and in the user guide) and `VERSION` in `sw.js` (the cache name). Bump both with every change to anything the app serves, or phones keep the old copy. Add any new file the app loads to the list in `sw.js`. The service worker never updates itself mid-flight: a new version is offered on the start and pause screens.

## Icons

`icons/make-icons.mjs` draws the icon (the F-16's planform in HUD green, from the same measurements as the drawing check) and rasterises it with Chromium. Nothing is downloaded, so there is nothing to license.

## Layout

The simulation lives in `src/sim/` and is plain JavaScript with no DOM, no three.js and no browser APIs. Its units are the book's imperial ones: feet, slugs, pounds, degrees in the tables and radians in the state. `src/sim/data/` holds the F-16 tables, re-keyed from `docs/f16-data.md`. `src/render/` is all the three.js code, with `frames.js` the one place that converts feet and NED into metres and the three.js world. `src/hud/` draws the HUD on a 2-D canvas, `src/ui/` holds the throttle, stick indicator and screens, `src/input/` the tilt maths, and `src/main.js` wires them together. three.js r186 is copied into `vendor/three/`, with the GLTFLoader addon and its two helpers under `examples/jsm/`; the app loads it through an import map and never from a CDN.

The ground is `terrain/base.png` and `terrain/places.png`, a coarse base tile and an atlas of five fine patches made from public-domain SRTM elevation data by `terrain/make-heightmap.py` (see `terrain/CREDITS.md`), with `terrain/region.json` saying where each lies; `src/render/heightmap.js` reads them on the CPU for the crash and the radar altitude and `src/render/terrain.js` draws them as a geometry clipmap with the same lookup on the GPU. To remake them, download the GeoTIFFs listed in `CLAUDE.md` under milestone 3 and run `python terrain/make-heightmap.py base.tif zion.tif grand-canyon.tif bryce.tif page.tif las-vegas.tif terrain/` (needs numpy and tifffile).

The ground's colour is `terrain/base-colour.jpg` and `terrain/places-colour.jpg`, Sentinel-2 imagery laid on the same grids by `terrain/make-imagery.py` from the Copernicus Browser's exports (see `terrain/CREDITS.md` and milestone 3 item 9 in `CLAUDE.md` for the boxes and resolutions): `python terrain/make-imagery.py base.tif zion.tif grand-canyon.tif bryce.tif page.tif las-vegas.tif terrain/` (needs numpy, tifffile and Pillow). It reads `region.json` for the grids and records the images in it.

The jet is `models/f16c.glb`, "F 16 C" by Usman Zia under CC BY 4.0. The licence needs the credit kept: it is in `models/CREDITS.md` and on the Credits screen, opened from Settings.
