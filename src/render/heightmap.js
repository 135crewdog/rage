// The terrain's heights, read from a heightmap image: a square tile of
// elevation posts, each stored as a 16-bit value split across the red (high
// byte) and green (low byte) channels, scaled between the tile's lowest and
// highest points. The same sampler serves the crash check and the radar
// altitude on the CPU; the GPU reads the same image for the ground (see
// terrain.js), so the two can never disagree. Pure maths, no three.js, so it
// runs in node for the tests. Metres throughout, except where feet are named.

// The 16-bit heights of an RGBA pixel buffer (size × size).
export function decodeHeights(rgba, size) {
  const out = new Uint16Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1];
  return out;
}

// meta: { size (posts per side), metres (the tile's side), min, max (m, the
// heights for 0 and 65535), start: [px, py] (the post under the world origin,
// which is the air start; px grows east, py grows south) }.
// heightAt(x, z): the ground height in metres at world x (east) and z (south,
// so −north), bilinear between posts, clamped at the tile's edges so the
// ground runs on flat at the edge height.
export function createSampler(heights, meta) {
  const { size, metres, min, max, start } = meta;
  const post = metres / (size - 1);
  const scale = (max - min) / 65535;
  const at = (ix, iy) => min + heights[iy * size + ix] * scale;
  function heightAt(x, z) {
    const fx = Math.min(size - 1, Math.max(0, start[0] + x / post));
    const fz = Math.min(size - 1, Math.max(0, start[1] + z / post));
    const ix = Math.min(size - 2, Math.floor(fx)), iz = Math.min(size - 2, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz;
    const top = at(ix, iz) * (1 - tx) + at(ix + 1, iz) * tx;
    const bottom = at(ix, iz + 1) * (1 - tx) + at(ix + 1, iz + 1) * tx;
    return top * (1 - tz) + bottom * tz;
  }
  return { heightAt, post };
}
