# Lays satellite imagery over the region's ground: the same base tile and
# atlas of patches as make-heightmap.py, read from region.json, so every
# colour pixel sits on the ground it belongs to. The sources are 8-bit RGB
# GeoTIFFs in WGS 84 as the Copernicus Browser exports them (Sentinel-2
# cloudless mosaics, true colour). The base is resampled onto the heightmap's
# own posts; each patch onto a square of SCALE times its posts, so the places
# are sharper than their heights. Writes base-colour.jpg and places-colour.jpg
# and records them in region.json under "colour". A developer tool, run once;
# needs numpy, tifffile and Pillow:
#
#   python terrain/make-imagery.py base.tif zion.tif grand-canyon.tif bryce.tif page.tif las-vegas.tif terrain/
#
# The patch tifs come in the order of region.json's patches. The mosaics are
# low in contrast as exported, so one fixed lift of contrast and saturation
# is applied to every tile alike; nothing else is changed.
import sys, os, json
import numpy as np
import tifffile
from PIL import Image

SCALE = 2            # colour pixels per height post across each patch: 1,024 posts become 2,048 pixels
QUALITY = 85         # JPEG
CONTRAST = 1.18      # the fixed lift, the same for every tile
SATURATION = 1.25
BLACK = 12           # the value taken as black before the lift

srcs = sys.argv[1:-1]; out = sys.argv[-1]
region = json.load(open(os.path.join(out, 'region.json')))
assert len(srcs) == 1 + len(region['patches']), f'expected the base tif and {len(region["patches"])} patch tifs'
ORIGIN, M_LAT, M_LON = region['origin'], region['mLat'], region['mLon']

def load(path):
    with tifffile.TiffFile(path) as tif:
        page = tif.pages[0]
        rgb = page.asarray()[..., :3].astype(np.float32)
        tags = {t.name: t.value for t in page.tags.values()}
    scale = tags['ModelPixelScaleTag']; tie = tags['ModelTiepointTag']
    # the tiepoint is the top-left corner of the top-left pixel (RasterPixelIsArea); centres are half a pixel in
    geo = dict(dlon=float(scale[0]), dlat=float(scale[1]), lon0=float(tie[3]) + 0.5 * float(scale[0]), lat0=float(tie[4]) - 0.5 * float(scale[1]))
    rows, cols = rgb.shape[:2]
    print(f'{os.path.basename(path)}: {cols} x {rows} pixels, {geo["dlon"] * M_LON:.0f} x {geo["dlat"] * M_LAT:.0f} m')
    return rgb, geo

# the source's colour at a grid of world points (xs across, zs down), bilinear
def resample(rgb, geo, xs, zs):
    lat = ORIGIN[0] - zs / M_LAT
    lon = ORIGIN[1] + xs / M_LON
    rows, cols = rgb.shape[:2]
    fr = np.clip((geo['lat0'] - lat) / geo['dlat'], 0, rows - 1.001)
    fc = np.clip((lon - geo['lon0']) / geo['dlon'], 0, cols - 1.001)
    r0 = np.floor(fr).astype(int); c0 = np.floor(fc).astype(int)
    tr = (fr - r0)[:, None, None]; tc = (fc - c0)[None, :, None]
    def g(r, c): return rgb[r[:, None], c[None, :]]
    return (g(r0, c0) * (1 - tc) + g(r0, c0 + 1) * tc) * (1 - tr) + (g(r0 + 1, c0) * (1 - tc) + g(r0 + 1, c0 + 1) * tc) * tr

def lift(v):
    v = (v - BLACK) * CONTRAST
    luma = v @ np.array([0.299, 0.587, 0.114], np.float32)
    v = luma[..., None] + (v - luma[..., None]) * SATURATION
    return np.clip(v, 0, 255).astype(np.uint8)

base = region['base']
rgb, geo = load(srcs[0])
xs = base['x0'] + base['post'] * np.arange(base['w']); zs = base['z0'] + base['post'] * np.arange(base['h'])
colour_base = lift(resample(rgb, geo, xs, zs))
Image.fromarray(colour_base).save(os.path.join(out, 'base-colour.jpg'), quality=QUALITY, optimize=True)

atlas = region['atlas']
colour_atlas = np.zeros((atlas['h'] * SCALE, atlas['w'] * SCALE, 3), np.uint8)
for p, src in zip(region['patches'], srcs[1:]):
    rgb, geo = load(src)
    n = p['size'] * SCALE
    side = (p['size'] - 1) * p['post']
    xs = p['x0'] + side / (n - 1) * np.arange(n); zs = p['z0'] + side / (n - 1) * np.arange(n)
    colour_atlas[p['py'] * SCALE:p['py'] * SCALE + n, p['px'] * SCALE:p['px'] * SCALE + n] = lift(resample(rgb, geo, xs, zs))
    print(f'  {p["name"]}: {n} pixels a side, {side / (n - 1):.1f} m apart')
Image.fromarray(colour_atlas).save(os.path.join(out, 'places-colour.jpg'), quality=QUALITY, optimize=True)

region['colour'] = dict(base='base-colour.jpg', atlas='places-colour.jpg', scale=SCALE,
                        source='Sentinel-2 L2A quarterly cloudless mosaic, true colour, from the Copernicus Browser')
json.dump(region, open(os.path.join(out, 'region.json'), 'w'))
for f in ('base-colour.jpg', 'places-colour.jpg', 'region.json'):
    print(f'wrote {f}: {os.path.getsize(os.path.join(out, f)) / 1e6:.2f} MB')
