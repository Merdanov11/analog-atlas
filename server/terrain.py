# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Detailed terrain for the simulator: a piece of surface around a stage of the route.

The base is the real NASA elevation map (MOLA for Mars, LOLA for the Moon), read from the
original GeoTIFF at its native resolution (463 m and 118 m per pixel) and interpolated
bicubically. That is not enough for driving, so on top of it we add:
  * fine relief (fractal noise, step from 128 m to 8 m, stronger on steep slopes);
  * craters 16-800 m in diameter. Their number follows the power law N(>D) ~ D^-2,
    like on real lunar and Martian surfaces; depth ~0.2 D for fresh craters, less for old ones.
Everything is deterministic: the position of a crater depends only on latitude and longitude, so
neighbouring pieces and a repeated drive give the same terrain.

Pieces are built in a local "east-north-up" (ENU) frame with the origin at the point
(lat0, lon0); the curvature of the planet is taken into account exactly.
"""
from __future__ import annotations

import json
import math
import struct
import threading
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.ndimage import map_coordinates

DATA = Path(__file__).resolve().parent.parent / "data"
SRC = {
    "mars": dict(file="mars/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif", radius=3396190.0, scale=1.0, rough=0.8,
                 crater_k=0.9, depth=0.12),
    "moon": dict(file="moon/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif", radius=1737400.0, scale=0.5, rough=1.0,
                 crater_k=1.0, depth=0.15),
}
SEED = {"mars": 7, "moon": 3}
MAX_CELLS = 2_100_000
SATURATION = 0.012          # fraction of geometric saturation by craters
BANDS = [(16.0, 32.0), (32.0, 64.0), (64.0, 128.0), (128.0, 256.0), (256.0, 512.0), (512.0, 1024.0)]

_ds: dict = {}
_lock = threading.Lock()


def _dataset(body: str):
    with _lock:
        if body not in _ds:
            _ds[body] = rasterio.open(DATA / SRC[body]["file"])
        return _ds[body]


# ---------------------------------------------------------------- ENU geometry

def basis(lat0: float, lon0: float):
    p, l = math.radians(lat0), math.radians(lon0)
    e = np.array([-math.sin(l), math.cos(l), 0.0])
    n = np.array([-math.sin(p) * math.cos(l), -math.sin(p) * math.sin(l), math.cos(p)])
    u = np.array([math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p)])
    return e, n, u


def enu_to_latlon(radius: float, lat0: float, lon0: float, x, y):
    """A point on the sphere above the plane (x, y) -> latitude and longitude in degrees."""
    e, n, u = basis(lat0, lon0)
    up = np.sqrt(np.maximum(radius ** 2 - x ** 2 - y ** 2, 1.0))
    v = x[..., None] * e + y[..., None] * n + up[..., None] * u
    lat = np.degrees(np.arcsin(np.clip(v[..., 2] / radius, -1.0, 1.0)))
    lon = np.degrees(np.arctan2(v[..., 1], v[..., 0]))
    return lat, lon


def latlon_to_enu(radius: float, lat0: float, lon0: float, lat, lon):
    e, n, u = basis(lat0, lon0)
    p, l = np.radians(lat), np.radians(lon)
    v = np.stack([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)], axis=-1)
    return radius * (v @ e), radius * (v @ n), radius * (v @ u - 1.0)


# ---------------------------------------------------------------- noise and hashes

def _hash(ix, iy, seed: int):
    with np.errstate(over="ignore"):
        h = (ix.astype(np.uint32) * np.uint32(374761393) + iy.astype(np.uint32) * np.uint32(668265263)
             + np.uint32(seed * 2246822519 % (1 << 32)))
        h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
        h = h ^ (h >> np.uint32(16))
        h = h * np.uint32(2246822519)
        h = h ^ (h >> np.uint32(15))
    return h


def _rnd(ix, iy, seed: int):
    return (_hash(ix, iy, seed) & np.uint32(0xFFFFFF)).astype(np.float64) / 16777216.0


def value_noise(X, Y, wavelength: float, seed: int):
    x, y = X / wavelength, Y / wavelength
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    fx, fy = fx * fx * fx * (fx * (fx * 6 - 15) + 10), fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    ix, iy = ix.astype(np.int64), iy.astype(np.int64)
    a, b = _rnd(ix, iy, seed), _rnd(ix + 1, iy, seed)
    c, d = _rnd(ix, iy + 1, seed), _rnd(ix + 1, iy + 1, seed)
    return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2.0 - 1.0


# ---------------------------------------------------------------- NASA elevation map

def _read(ds, r0: int, r1: int, c0: int, c1: int) -> np.ndarray:
    """Window of rows r0..r1 and columns c0..c1; longitude wraps around (columns may go beyond 0..W)."""
    w = ds.width
    parts, c = [], c0
    while c < c1:
        cc = c % w
        take = min(c1 - c, w - cc)
        parts.append(ds.read(1, window=Window(cc, r0, take, r1 - r0)))
        c += take
    return np.concatenate(parts, axis=1).astype(np.float64)


def base_height(body: str, lat, lon):
    """Elevation from the NASA map (m) at points; bicubic interpolation."""
    ds = _dataset(body)
    cfg = SRC[body]
    h, w = ds.height, ds.width
    fr = np.clip((90.0 - lat) / 180.0 * h - 0.5, 0.0, h - 1.001)
    fc = (lon + 180.0) / 360.0 * w - 0.5
    r0, r1 = int(math.floor(fr.min())) - 2, int(math.ceil(fr.max())) + 3
    c0, c1 = int(math.floor(fc.min())) - 2, int(math.ceil(fc.max())) + 3
    r0c, r1c = max(r0, 0), min(r1, h)
    win = _read(ds, r0c, r1c, c0, c1)
    win[win == (ds.nodata if ds.nodata is not None else -32768.0)] = np.nan
    if np.isnan(win).any():
        win = np.where(np.isnan(win), np.nanmean(win) if not np.isnan(win).all() else 0.0, win)
    win *= cfg["scale"]
    return map_coordinates(win, [fr - r0c, fc - c0], order=3, mode="nearest")


# ---------------------------------------------------------------- fine relief and craters

def detail(body: str, X, Y, steep):
    """Fractal addition (m). steep - background steepness 0..1+: on slopes the relief is finer and sharper."""
    cfg = SRC[body]
    out = np.zeros_like(X)
    for i, wl in enumerate((128.0, 64.0, 32.0, 16.0, 8.0)):
        amp = 1.1 * cfg["rough"] * (wl / 128.0) ** 0.85
        out += amp * value_noise(X, Y, wl, 100 + i)
    return out * (0.55 + 0.9 * np.clip(steep, 0.0, 1.5))


def craters(body: str, radius: float, lat0: float, lon0: float, xmin, xmax, ymin, ymax, density: float = 1.0):
    """List of craters in the window (in ENU coordinates): x, y, radius R, depth d, age factor."""
    cfg = SRC[body]
    out = []
    # The window in "global" metres X = R*lon, Y = R*lat: take the window corners and an edge with a margin.
    cx = np.array([xmin, xmax, xmin, xmax, 0.5 * (xmin + xmax)])
    cy = np.array([ymin, ymin, ymax, ymax, 0.5 * (ymin + ymax)])
    la, lo = enu_to_latlon(radius, lat0, lon0, cx, cy)
    gx0, gx1 = radius * math.radians(lo.min()), radius * math.radians(lo.max())
    gy0, gy1 = radius * math.radians(la.min()), radius * math.radians(la.max())
    k = 1.54 * SATURATION * cfg["crater_k"] * density
    for bi, (dlo, dhi) in enumerate(BANDS):
        s = 4.0 * dhi
        reach = 2.2 * dhi
        i0, i1 = int(math.floor((gx0 - reach) / s)), int(math.floor((gx1 + reach) / s))
        j0, j1 = int(math.floor((gy0 - reach) / s)), int(math.floor((gy1 + reach) / s))
        if (i1 - i0 + 1) * (j1 - j0 + 1) > 400_000:
            continue
        ii, jj = np.meshgrid(np.arange(i0, i1 + 1), np.arange(j0, j1 + 1))
        ii, jj = ii.ravel(), jj.ravel()
        per_cell = 0.75 * k * (dlo / 1000.0) ** -2 * (s / 1000.0) ** 2        # expected number per cell
        # Density varies from place to place: there are "crater fields" and flat areas.
        cxm, cym = (ii + 0.5) * s, (jj + 0.5) * s
        mod = np.clip(1.0 + 0.9 * value_noise(cxm, cym, 6000.0 + 900.0 * bi, 500 + bi), 0.15, 2.2)
        for slot in range(2):
            seed = SEED[body] * 1000 + bi * 10 + slot
            present = _rnd(ii, jj, seed) < np.clip(per_cell * mod / 2.0, 0.0, 1.0)
            if not present.any():
                continue
            a, b = ii[present], jj[present]
            u1, u2, u3, u4 = (_rnd(a, b, seed + 1 + q * 17) for q in range(4))
            gx, gy = (a + u1) * s, (b + u2) * s
            diam = dlo * (1.0 - 0.75 * u3) ** -0.5
            age = u4
            lat = np.degrees(gy / radius)
            lon = np.degrees(gx / radius)
            x, y, _ = latlon_to_enu(radius, lat0, lon0, lat, lon)
            keep = ((x > xmin - 2.2 * diam) & (x < xmax + 2.2 * diam)
                    & (y > ymin - 2.2 * diam) & (y < ymax + 2.2 * diam))
            for xx, yy, dd, aa in zip(x[keep], y[keep], diam[keep], age[keep]):
                degr = 0.2 + 0.5 * (1.0 - aa) ** 2.5
                out.append((float(xx), float(yy), float(dd) / 2.0, float(cfg["depth"] * dd * degr),
                            float(0.04 * dd * degr)))
    return out


def stamp(z, x0: float, y0: float, res: float, cr):
    """Presses the craters into the elevation grid z (rows along y, columns along x)."""
    ny, nx = z.shape
    for cx, cy, R, depth, rim in cr:
        reach = 3.5 * R
        i0, i1 = max(0, int((cx - reach - x0) / res)), min(nx, int((cx + reach - x0) / res) + 2)
        j0, j1 = max(0, int((cy - reach - y0) / res)), min(ny, int((cy + reach - y0) / res) + 2)
        if i0 >= i1 or j0 >= j1:
            continue
        xs = x0 + np.arange(i0, i1) * res - cx
        ys = y0 + np.arange(j0, j1) * res - cy
        r = np.hypot(xs[None, :], ys[:, None]) / R
        inside = -depth * (1.0 - r ** 2) + rim * r ** 4          # a bowl with a rim
        outside = rim * np.maximum(r, 1.0) ** -3.0               # ejecta
        z[j0:j1, i0:i1] += np.where(r <= 1.0, inside, outside)


# ---------------------------------------------------------------- assembling a piece

def patch(body: str, lat0: float, lon0: float, xmin: float, xmax: float, ymin: float, ymax: float,
          res: float = 4.0, density: float = 1.0) -> bytes:
    cfg = SRC[body]
    R = cfg["radius"]
    nx = int(math.ceil((xmax - xmin) / res)) + 1
    ny = int(math.ceil((ymax - ymin) / res)) + 1
    if nx * ny > MAX_CELLS:
        raise ValueError("patch too large")
    xs = xmin + np.arange(nx) * res
    ys = ymin + np.arange(ny) * res
    gx, gy = np.meshgrid(xs, ys)
    lat, lon = enu_to_latlon(R, lat0, lon0, gx, gy)
    h = base_height(body, lat.ravel(), lon.ravel()).reshape(ny, nx)
    h0 = float(base_height(body, np.array([lat0]), np.array([lon0]))[0])
    # Planet curvature: the surface falls away from the tangent plane.
    curv = np.sqrt(np.maximum(R ** 2 - gx ** 2 - gy ** 2, 1.0)) - R
    gyr, gxr = np.gradient(h, res)
    steep = np.degrees(np.arctan(np.hypot(gxr, gyr))) / 12.0
    X, Y = R * np.radians(lon), R * np.radians(lat)
    z = (h - h0) + curv + detail(body, X, Y, steep)
    cr = craters(body, R, lat0, lon0, xmin, xmax, ymin, ymax, density)
    stamp(z, xmin, ymin, res, cr)
    header = dict(body=body, nx=nx, ny=ny, res=res, x0=xmin, y0=ymin, h0=h0, lat0=lat0, lon0=lon0, radius=R,
                  gravity={"moon": 1.62, "mars": 3.71}[body],
                  craters=[[round(c[0], 1), round(c[1], 1), round(c[2], 1), round(c[3], 2)]
                           for c in cr if c[2] >= 12.0])
    hb = json.dumps(header, separators=(",", ":")).encode()
    hb += b" " * (-len(hb) % 4)
    return b"TRN1" + struct.pack("<I", len(hb)) + hb + z.astype("<f4").tobytes()
