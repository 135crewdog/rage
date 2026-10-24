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

## Layout

The simulation lives in `src/sim/` and is plain JavaScript with no DOM, no three.js and no browser APIs. Its units are the book's imperial ones: feet, slugs, pounds, degrees in the tables and radians in the state. `src/sim/data/` holds the F-16 tables, re-keyed from `docs/f16-data.md`.
