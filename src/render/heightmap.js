// The terrain's heights, read from the region's heightmap images: a coarse
// base tile and an atlas of fine patches at the places worth flying, each
// post a 16-bit value split across the red (high byte) and green (low byte)
// channels, scaled between the image's lowest and highest points.
// terrain/region.json (written by terrain/make-heightmap.py) says where each
// lies. The same lookup serves the crash check and the radar altitude on the
// CPU, and terrain.js does it the same way on the GPU from the same images,
// so the two can never disagree. Pure maths, no three.js, so it runs in node
// for the tests. Metres throughout; world x east, z south.

// The 16-bit heights of an RGBA pixel buffer of `count` pixels.
export function decodeHeights(rgba, count) {
  const out = new Uint16Array(count);
  for (let i = 0; i < count; i++) out[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1];
  return out;
}

// World metres of a latitude and longitude, in the region's projection: a
// plain plate carrée about the origin, longitude metres true at lat0.
export function createProjection(region) {
  const [lat1, lon1] = region.origin;
  return {
    toWorld: (lat, lon) => ({ x: (lon - lon1) * region.mLon, z: -(lat - lat1) * region.mLat }),
    toLatLon: (x, z) => ({ lat: lat1 - z / region.mLat, lon: lon1 + x / region.mLon }),
  };
}

// region: the parsed region.json; heights: { base, atlas } as decodeHeights
// gives them. heightAt(x, z): the ground height in metres at world x (east)
// and z (south, so −north): the base, with each patch that covers the point
// laid over it in turn, coarsest first, blended in across the band inside
// its edge, so where patches overlap the finer one shows and every join is
// smooth; and across the band inside the base's own edge the ground eases to
// one flat height, which it keeps beyond.
export function createSampler(region, heights) {
  const { base, atlas, patches, blend, fade } = region;
  const baseScale = (base.max - base.min) / 65535, atlasScale = (atlas.max - atlas.min) / 65535;
  // bilinear read of a w × h grid of posts at a fractional post position, clamped to the grid
  function bilinear(get, w, h, fx, fz) {
    fx = Math.min(w - 1, Math.max(0, fx)); fz = Math.min(h - 1, Math.max(0, fz));
    const ix = Math.min(w - 2, Math.floor(fx)), iz = Math.min(h - 2, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz;
    const top = get(ix, iz) * (1 - tx) + get(ix + 1, iz) * tx;
    const bottom = get(ix, iz + 1) * (1 - tx) + get(ix + 1, iz + 1) * tx;
    return top * (1 - tz) + bottom * tz;
  }
  const baseAt = (ix, iz) => base.min + heights.base[iz * base.w + ix] * baseScale;
  const patchAt = (p) => (ix, iz) => atlas.min + heights.atlas[(p.py + iz) * atlas.w + p.px + ix] * atlasScale;
  const order = [...patches].sort((a, b) => b.post - a.post);   // coarsest first, so the finest ends on top
  // how far inside a rectangle a point is, as a fraction of the band, 0 outside and 1 past the band
  const inside = (x, z, x0, z0, w, h, band) => Math.min(1, Math.max(0, Math.min(x - x0, x0 + w - x, z - z0, z0 + h - z) / band));
  function heightAt(x, z) {
    let h = bilinear(baseAt, base.w, base.h, (x - base.x0) / base.post, (z - base.z0) / base.post);
    for (const p of order) {
      const side = (p.size - 1) * p.post;
      const w = inside(x, z, p.x0, p.z0, side, side, blend);
      if (w > 0) h += w * (bilinear(patchAt(p), p.size, p.size, (x - p.x0) / p.post, (z - p.z0) / p.post) - h);
    }
    const outer = inside(x, z, base.x0, base.z0, (base.w - 1) * base.post, (base.h - 1) * base.post, fade);
    return base.flat + outer * (h - base.flat);
  }
  return { heightAt, post: Math.min(base.post, ...patches.map((p) => p.post)) };
}
