// Shared by the browser scripts: a static server for the repo root, so the
// app loads over HTTP in headless Chromium the way it does from Pages.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };

export function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(join(ROOT, path));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      await stat(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

// beta and gamma for a phone held in landscape with the given tilt-back angle
// and steering-wheel turn, assuming screen angle 0 (as headless reports).
export function sensor(back, turn) {
  // up vector in device axes: start upright (0,1,0), tilt back about x, turn about z
  const D2R = Math.PI / 180;
  let [x, y, z] = [0, Math.cos(back * D2R), Math.sin(back * D2R)];
  const c = Math.cos(turn * D2R), s = Math.sin(turn * D2R);
  [x, y] = [c * x - s * y, s * x + c * y];
  return { beta: Math.asin(y) / D2R, gamma: Math.atan2(-x, z) / D2R, alpha: 0 };
}
