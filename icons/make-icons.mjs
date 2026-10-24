// Draws the app icon (a HUD flight-path marker on black) as SVG and rasterises
// it with Chromium at the sizes iOS and the manifest need. A developer tool:
// needs Playwright installed, like the browser smoke test.
//
//   node icons/make-icons.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#000"/>
  <g fill="none" stroke="#7CFF4F" stroke-width="4" stroke-linecap="round">
    <circle cx="50" cy="52" r="11"/>
    <line x1="61" y1="52" x2="82" y2="52"/>
    <line x1="39" y1="52" x2="18" y2="52"/>
    <line x1="50" y1="41" x2="50" y2="30"/>
  </g>
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
