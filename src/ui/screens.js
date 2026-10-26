// The screens (start, pause, settings, credits, rotate, motion denied, crashed) and
// the theme. One screen shows at a time; none while flying.

const THEME_KEY = 'rage.theme';
const PLACE_KEY = 'rage.place';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(choice) {
  const dark = choice === 'dark' || (choice === 'auto' && media && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, choice); } catch { /* storage may be blocked; the theme still applies */ }
  for (const b of document.querySelectorAll('#theme button')) b.setAttribute('aria-checked', String(b.dataset.theme === choice));
}

// The place to fly from, remembered; only a name the start screen offers.
export function loadPlace() {
  const names = [...document.querySelectorAll('#place button')].map((b) => b.dataset.place);
  let choice = null;
  try { choice = localStorage.getItem(PLACE_KEY); } catch { /* storage may be blocked */ }
  return names.includes(choice) ? choice : names[0];
}

export function applyPlace(name) {
  try { localStorage.setItem(PLACE_KEY, name); } catch { /* storage may be blocked; the choice still applies */ }
  for (const b of document.querySelectorAll('#place button')) b.setAttribute('aria-checked', String(b.dataset.place === name));
}

// locked: a function returning the name of a screen that must show instead
// of any other (the rotate screen while the phone is portrait), or null.
export function createScreens({ version, onFly, onResume, onRecenter, onFlyAgain, onUpdate, onPlace, locked = () => null }) {
  const screens = {};
  for (const el of document.querySelectorAll('.screen')) screens[el.id.replace('screen-', '')] = el;
  const container = document.getElementById('screens');
  let current = null;
  let previous = null;

  function show(name) {
    const forced = locked();
    if (forced) name = forced;
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
    container.classList.toggle('clear', name === null);
    current = name;
  }
  function hide() { show(null); }

  document.getElementById('version').textContent = version;
  document.getElementById('fly').addEventListener('click', onFly);
  document.getElementById('resume').addEventListener('click', onResume);
  document.getElementById('recenter').addEventListener('click', onRecenter);
  document.getElementById('fly-again').addEventListener('click', onFlyAgain);
  document.getElementById('crash-again').addEventListener('click', onFlyAgain);
  document.getElementById('settings-open').addEventListener('click', () => { previous = current; show('settings'); });
  document.getElementById('settings-done').addEventListener('click', () => show(previous || 'pause'));
  document.getElementById('credits-open').addEventListener('click', () => show('credits'));
  document.getElementById('credits-back').addEventListener('click', () => show('settings'));
  for (const b of document.querySelectorAll('#theme button')) b.addEventListener('click', () => applyTheme(b.dataset.theme));
  for (const b of document.querySelectorAll('#place button')) b.addEventListener('click', () => { applyPlace(b.dataset.place); onPlace(b.dataset.place); });
  for (const b of document.querySelectorAll('.update-btn')) b.addEventListener('click', onUpdate);
  applyPlace(loadPlace());

  const choice = loadTheme();
  applyTheme(choice);
  if (media) media.addEventListener('change', () => applyTheme(loadTheme()));

  // Recenter happened: the button says so for a second, then offers again.
  const recenterButton = document.getElementById('recenter');
  let recenterTimer = null;
  function recentered() {
    recenterButton.textContent = 'Recentered ✓';
    recenterButton.classList.add('done');
    clearTimeout(recenterTimer);
    recenterTimer = setTimeout(() => { recenterButton.textContent = 'Recenter controls'; recenterButton.classList.remove('done'); }, 1200);
  }

  return {
    show, hide, recentered,
    get current() { return current; },
    // offer a waiting update on the start and pause screens only, never mid-flight
    offerUpdate(available) { for (const p of document.querySelectorAll('.update')) p.hidden = !available; },
  };
}
