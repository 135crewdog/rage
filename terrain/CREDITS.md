# Terrain

The ground is made by `make-heightmap.py` from NASA's SRTM elevation data,
which is in the public domain, downloaded from OpenTopography
(https://opentopography.org) as GeoTIFFs, and laid out in one projection
(plate carrée about Springdale, longitude metres true at 36.9° N) so the fine
patches land on the coarse base exactly. `region.json` says where each lies.

- `base.png`: the region from Las Vegas to Lake Powell and from the Grand
  Canyon to Bryce Canyon, 35.7° to 38.1° N, 115.5° to 110.8° W, from SRTM
  3 arc-second (90 m) data: 2,048 by 1,306 posts 204 m apart, heights 190 to
  3,432 m above sea level, easing to 1,692 m at its edge.
- `places.png`: five patches from SRTM 1 arc-second (30 m) data, 1,024 posts
  a side each: Zion National Park (60 km about 37.30° N 112.95° W, posts 58.7 m
  apart), the Grand Canyon's inner gorge (60 km about 36.12° N 112.10° W),
  Bryce Canyon with Cedar Breaks (80 km about 37.62° N 112.50° W, posts 78.2 m
  apart), Page and Lake Powell (60 km about 36.95° N 111.25° W), Las Vegas
  with Nellis AFB, Hoover Dam and Lake Mead (80 km about 36.15° N 114.95° W).
  Heights 177 to 3,447 m. SRTM saw Lake Powell and Lake Mead full in February
  2000, so they are flat at their levels then.
