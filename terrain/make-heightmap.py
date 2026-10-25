# Converts an elevation GeoTIFF (SRTM 1 arc-second, as OpenTopography or USGS
# serve it) into the tile the app draws: a square of SIZE posts over METRES
# metres, heights as 16-bit values in the red and green channels of a PNG,
# with zion.json beside it holding the scale and the post under the world
# origin. A developer tool, run once; needs numpy and tifffile:
#
#   python terrain/make-heightmap.py zion.tif terrain/zion.png terrain/zion.json
#
# The tile is cut square in metres around CENTRE and the world origin (the air
# start) is put over START, so the jet starts over the town at the canyon's
# mouth heading north, up the canyon. Heights are metres above sea level.
import sys, json, zlib, struct, math
import numpy as np
import tifffile

SRC, PNG, META = sys.argv[1:4]
SIZE = 1024                      # posts per side
METRES = 60000.0                 # the tile's side
CENTRE = (37.30, -112.95)        # lat, lon: Zion Canyon
START = (37.19, -112.99)         # lat, lon: Springdale, at the canyon's mouth

with tifffile.TiffFile(SRC) as tif:
    page = tif.pages[0]
    dem = page.asarray().astype(np.float64)
    tags = {t.name: t.value for t in page.tags.values()}
scale = tags['ModelPixelScaleTag']          # (dx, dy, dz) in degrees
tie = tags['ModelTiepointTag']              # (i, j, k, lon, lat, z) of the top-left corner
dlon, dlat = float(scale[0]), float(scale[1])
lon0, lat0 = float(tie[3]), float(tie[4])
nodata = tags.get('GDAL_NODATA')
if nodata is not None: dem[dem == float(nodata)] = np.nan
rows, cols = dem.shape
print(f'source {cols} x {rows} posts, top-left {lat0:.4f} N {lon0:.4f} E, spacing {dlat*3600:.2f} arcsec')

# metres per degree at the centre latitude
m_lat = 111132.0
m_lon = 111320.0 * math.cos(math.radians(CENTRE[0]))
# the square tile's post positions in lat/lon: x east, y south from the north-west corner
half = METRES / 2
ys = np.linspace(-half, half, SIZE)            # south positive
xs = np.linspace(-half, half, SIZE)
lat = CENTRE[0] - ys / m_lat
lon = CENTRE[1] + xs / m_lon
# fractional source indices (row down = south, col right = east), bilinear
fr = (lat0 - lat) / dlat; fc = (lon - lon0) / dlon
fr = np.clip(fr, 0, rows - 1.001); fc = np.clip(fc, 0, cols - 1.001)
r0 = np.floor(fr).astype(int); c0 = np.floor(fc).astype(int)
tr = (fr - r0)[:, None]; tc = (fc - c0)[None, :]
def g(r, c): return dem[r[:, None], c[None, :]]
z = (g(r0, c0) * (1 - tc) + g(r0, c0 + 1) * tc) * (1 - tr) + (g(r0 + 1, c0) * (1 - tc) + g(r0 + 1, c0 + 1) * tc) * tr
if np.isnan(z).any():
    print('filling', int(np.isnan(z).sum()), 'void posts with the tile minimum')
    z = np.where(np.isnan(z), np.nanmin(z), z)
lo, hi = float(np.floor(z.min())), float(np.ceil(z.max()))
q = np.round((z - lo) / (hi - lo) * 65535).astype(np.uint16)
rgb = np.zeros((SIZE, SIZE, 3), np.uint8); rgb[..., 0] = q >> 8; rgb[..., 1] = q & 255

def png(arr):
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(arr.shape[0]))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', arr.shape[1], arr.shape[0], 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
open(PNG, 'wb').write(png(rgb))
post = METRES / (SIZE - 1)
start = [round((START[1] - CENTRE[1]) * m_lon / post + (SIZE - 1) / 2, 2), round((CENTRE[0] - START[0]) * m_lat / post + (SIZE - 1) / 2, 2)]
json.dump({'size': SIZE, 'metres': METRES, 'min': lo, 'max': hi, 'start': start, 'name': 'Zion National Park, SRTM 1 arc-second', 'centre': CENTRE, 'startLatLon': START}, open(META, 'w'))
import os
print(f'wrote {PNG} {os.path.getsize(PNG)} bytes, heights {lo:.0f}..{hi:.0f} m, posts every {post:.1f} m, start post {start}, ground at start {float(z[int(start[1]), int(start[0])]):.0f} m')
