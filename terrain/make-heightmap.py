# Converts the elevation GeoTIFFs (SRTM, as OpenTopography serves them) into
# the region the app draws: one coarse BASE tile and an ATLAS of fine PATCHES
# at the places worth flying, every height a 16-bit value in the red and green
# channels of a PNG, with region.json beside them holding the scales and
# placings. A developer tool, run once; needs numpy and tifffile:
#
#   python terrain/make-heightmap.py base.tif zion.tif grand-canyon.tif bryce.tif page.tif las-vegas.tif terrain/
#
# The patch tifs come in the order of PATCHES below. Everything is laid out in
# one map projection: a plain plate carrée about ORIGIN (the world origin, the
# Zion air start over Springdale), with the metres per degree of longitude
# taken at LAT0 in the middle of the region, so the patches land on the base
# exactly. World x is east and z is south, in metres; heights are metres
# above sea level. The lookup that reads these files is in
# src/render/heightmap.js, and terrain.js does the same on the GPU.
import sys, os, json, zlib, struct, math
import numpy as np
import tifffile

ORIGIN = (37.19, -112.99)        # lat, lon of the world origin: Springdale, at Zion Canyon's mouth
LAT0 = 36.9                      # the projection's latitude: longitude metres are true here
M_LAT = 111132.0                 # metres per degree of latitude
M_LON = 111320.0 * math.cos(math.radians(LAT0))
BLEND = 3000.0                   # m: a patch blends into the base over this band inside its edge
FADE = 10000.0                   # m: the base eases to one flat height over this band inside its edge
BASE_WIDTH = 2048                # posts across the base tile; its height follows the box
ATLAS = (2048, 3072)             # the atlas image: 1,024-post patches, two across
PATCH = 1024                     # posts per side of every patch
# name, centre lat, centre lon, side in metres
PATCHES = [
    ('Zion', 37.30, -112.95, 60000.0),
    ('Grand Canyon', 36.12, -112.10, 60000.0),
    ('Bryce', 37.62, -112.50, 80000.0),
    ('Lake Powell', 36.95, -111.25, 60000.0),
    ('Las Vegas', 36.15, -114.95, 80000.0),
]

def world(lat, lon):
    return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT

def latlon(x, z):
    return ORIGIN[0] - z / M_LAT, ORIGIN[1] + x / M_LON

def load(path):
    with tifffile.TiffFile(path) as tif:
        page = tif.pages[0]
        dem = page.asarray().astype(np.float64)
        tags = {t.name: t.value for t in page.tags.values()}
    scale = tags['ModelPixelScaleTag']          # (dx, dy, dz) in degrees
    tie = tags['ModelTiepointTag']              # (i, j, k, lon, lat, z) of the top-left corner
    nodata = tags.get('GDAL_NODATA')
    if nodata is not None: dem[dem == float(nodata)] = np.nan
    geo = dict(dlon=float(scale[0]), dlat=float(scale[1]), lon0=float(tie[3]), lat0=float(tie[4]))
    rows, cols = dem.shape
    print(f'{os.path.basename(path)}: {cols} x {rows} posts, top-left {geo["lat0"]:.4f} N {geo["lon0"]:.4f} E, {geo["dlat"] * 3600:.0f} arcsec')
    return dem, geo

# The source's heights at a grid of world points (xs across, zs down), bilinear.
def resample(dem, geo, xs, zs):
    lat = ORIGIN[0] - zs / M_LAT
    lon = ORIGIN[1] + xs / M_LON
    rows, cols = dem.shape
    fr = np.clip((geo['lat0'] - lat) / geo['dlat'], 0, rows - 1.001)
    fc = np.clip((lon - geo['lon0']) / geo['dlon'], 0, cols - 1.001)
    r0 = np.floor(fr).astype(int); c0 = np.floor(fc).astype(int)
    tr = (fr - r0)[:, None]; tc = (fc - c0)[None, :]
    def g(r, c): return dem[r[:, None], c[None, :]]
    z = (g(r0, c0) * (1 - tc) + g(r0, c0 + 1) * tc) * (1 - tr) + (g(r0 + 1, c0) * (1 - tc) + g(r0 + 1, c0 + 1) * tc) * tr
    if np.isnan(z).any():
        print('  filling', int(np.isnan(z).sum()), 'void posts with the minimum')
        z = np.where(np.isnan(z), np.nanmin(z), z)
    return z

def quantise(z, lo, hi):
    return np.round((z - lo) / (hi - lo) * 65535).astype(np.uint16)

def png(q):
    rgb = np.zeros((q.shape[0], q.shape[1], 3), np.uint8); rgb[..., 0] = q >> 8; rgb[..., 1] = q & 255
    raw = b''.join(b'\x00' + rgb[y].tobytes() for y in range(rgb.shape[0]))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', rgb.shape[1], rgb.shape[0], 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

srcs = sys.argv[1:-1]; out = sys.argv[-1]
assert len(srcs) == 1 + len(PATCHES), f'expected the base tif and {len(PATCHES)} patch tifs'

# The base: the whole box of its tif, square posts, BASE_WIDTH across.
dem, geo = load(srcs[0])
rows, cols = dem.shape
x_west, z_north = world(geo['lat0'], geo['lon0'])
x_east, z_south = world(geo['lat0'] - geo['dlat'] * (rows - 1), geo['lon0'] + geo['dlon'] * (cols - 1))
post = (x_east - x_west) / (BASE_WIDTH - 1)
height = int(round((z_south - z_north) / post)) + 1
xs = x_west + post * np.arange(BASE_WIDTH); zs = z_north + post * np.arange(height)
base = resample(dem, geo, xs, zs)
border = np.concatenate([base[0], base[-1], base[:, 0], base[:, -1]])
flat = float(round(border.mean()))
lo, hi = float(np.floor(base.min())), float(np.ceil(base.max()))
open(os.path.join(out, 'base.png'), 'wb').write(png(quantise(base, lo, hi)))
meta_base = dict(image='base.png', w=BASE_WIDTH, h=height, post=round(post, 3), x0=round(x_west, 1), z0=round(z_north, 1), min=lo, max=hi, flat=flat)
print(f'base: {BASE_WIDTH} x {height} posts every {post:.1f} m, heights {lo:.0f}..{hi:.0f} m, flat edge height {flat:.0f} m')

# The patches: squares in world metres about their centres, into the atlas.
atlas = np.zeros((ATLAS[1], ATLAS[0]), np.float64)
patches = []; zs_all = []
for k, ((name, lat, lon, side), src) in enumerate(zip(PATCHES, srcs[1:])):
    dem, geo = load(src)
    cx, cz = world(lat, lon)
    p = side / (PATCH - 1)
    xs = cx - side / 2 + p * np.arange(PATCH); zs = cz - side / 2 + p * np.arange(PATCH)
    z = resample(dem, geo, xs, zs)
    px, py = (k % 2) * PATCH, (k // 2) * PATCH
    atlas[py:py + PATCH, px:px + PATCH] = z
    patches.append(dict(name=name, px=px, py=py, size=PATCH, post=round(p, 3), x0=round(xs[0], 1), z0=round(zs[0], 1), centre=[lat, lon]))
    zs_all.append(z)
    print(f'  {name}: {side / 1000:.0f} km, posts every {p:.1f} m, heights {z.min():.0f}..{z.max():.0f} m, at atlas ({px}, {py})')
lo, hi = float(np.floor(min(z.min() for z in zs_all))), float(np.ceil(max(z.max() for z in zs_all)))
atlas[atlas == 0] = lo
open(os.path.join(out, 'places.png'), 'wb').write(png(quantise(atlas, lo, hi)))
meta = dict(
    name='Zion to Las Vegas, SRTM 3 arc-second base with 1 arc-second patches',
    origin=list(ORIGIN), lat0=LAT0, mLat=M_LAT, mLon=round(M_LON, 3), blend=BLEND, fade=FADE,
    base=meta_base, atlas=dict(image='places.png', w=ATLAS[0], h=ATLAS[1], min=lo, max=hi), patches=patches,
)
json.dump(meta, open(os.path.join(out, 'region.json'), 'w'))
for f in ('base.png', 'places.png', 'region.json'):
    print(f'wrote {f}: {os.path.getsize(os.path.join(out, f)) / 1e6:.2f} MB')
