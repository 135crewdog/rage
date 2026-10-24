// Draws the app icon, the F-16's planform in HUD green on black, as SVG and
// rasterises it with Chromium at the sizes iOS and the manifest need. A
// developer tool: needs Playwright installed, like the browser smoke test.
//
//   node icons/make-icons.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));

// The planform as measured from a published three-view: [metres from the
// nose, half-width in metres] down the right side, mirrored for the left.
const PLANFORM = [
  [0, 0], [0.77, 0.11], [1.0, 0.19], [1.32, 0.29], [1.65, 0.38], [2.0, 0.45], [2.5, 0.51], [3.0, 0.55],
  [3.4, 0.65], [3.9, 0.70], [4.3, 0.74], [4.7, 0.80], [5.05, 0.87], [5.4, 0.94], [5.65, 1.0], [6.0, 1.10],
  [6.35, 1.2], [6.65, 1.3], [7.0, 1.37], [7.15, 1.37], [7.2, 1.44], [8.52, 2.99], [9.9, 4.62], [11.2, 4.62],
  [11.2, 1.06], [12.1, 1.09], [12.19, 1.13], [13.6, 2.77], [14.35, 2.77], [14.6, 2.54], [14.65, 1.0],
  [14.7, 0.5], [14.9, 0.45], [15.0, 0],
];
const SCALE = 78 / 15, CX = 50, TOP = 11;      // nose up, 15 m across 78 of the 100-unit box
const right = PLANFORM.map(([x, w]) => [CX + w * SCALE, TOP + x * SCALE]);
const left = PLANFORM.slice().reverse().map(([x, w]) => [CX - w * SCALE, TOP + x * SCALE]);
const points = right.concat(left).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#000"/>
  <polygon points="${points}" fill="#7CFF4F"/>
</svg>`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-32.png', 32]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#000">${svg(size)}</body></html>`);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false });
  writeFileSync(join(here, name), buf);
  console.log(name, buf.length, 'bytes');
}
writeFileSync(join(here, 'icon.svg'), svg(512));
await browser.close();
