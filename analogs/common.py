# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Shared helpers for the Far from Earth pipeline.

Every comparison window, on the Moon, Mars or Earth, is a 48 km x 48 km square resampled to a 100 x 100 grid
with a 480 m cell. At that scale the Mars MOLA DEM (463 m) is used as it is, the Moon LOLA DEM (118 m) is
block-averaged, and the Earth DEM (about 300-600 m per pixel) is resampled, so that the terrain statistics of all
three bodies describe the same spatial scale.
"""
from __future__ import annotations

import base64
import io
import math

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

GRID_N = 100
CELL_M = 480.0
WINDOW_M = GRID_N * CELL_M                       # 48 km
SLOPE_EDGES = [0, 2, 5, 8, 12, 16, 22, 30, 90]   # degrees; 8 histogram bins
RADIUS = {"moon": 1737400.0, "mars": 3396190.0, "earth": 6371000.0}


def slope_deg(z: np.ndarray, cell: float = CELL_M) -> np.ndarray:
    gy, gx = np.gradient(z, cell)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def terrain_features(z: np.ndarray) -> dict:
    """Terrain signature of one 100 x 100 window (metres, 480 m cells)."""
    n = z.shape[0]
    s = slope_deg(z)[1:-1, 1:-1]
    hist = np.histogram(s, bins=SLOPE_EDGES)[0] / s.size
    x = np.arange(n, dtype=np.float64) - (n - 1) / 2.0
    xx, yy = np.meshgrid(x, x)
    zm = z - z.mean()
    a = (xx * zm).sum() / (xx * xx).sum()
    b = (yy * zm).sum() / (yy * yy).sum()
    resid = zm - a * xx - b * yy
    return dict(
        slope_med=float(np.median(s)), slope_p90=float(np.percentile(s, 90)),
        relief=float(np.percentile(z, 95) - np.percentile(z, 5)),
        rough=float(resid.std()), elev=float(z.mean()), hist=[float(v) for v in hist],
        zmin=float(z.min()), zmax=float(z.max()),
    )


def hillshade(z: np.ndarray, az_deg: float = 315.0, alt_deg: float = 35.0, exag: float = 2.0) -> np.ndarray:
    gy, gx = np.gradient(z * exag, CELL_M)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(gy, -gx)
    az, alt = math.radians(az_deg), math.radians(alt_deg)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect + math.pi / 2)
    return np.clip(hs, 0, 1)


def thumb_png_b64(z: np.ndarray, size: int = 64) -> str:
    """Hillshade thumbnail as a base64 PNG (grayscale)."""
    hs = hillshade(z)
    img = Image.fromarray((hs * 255).astype(np.uint8)).resize((size, size), Image.BILINEAR)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def enu_to_latlon(radius: float, lat0: float, lon0: float, east: np.ndarray, north: np.ndarray):
    """Local tangent-plane offsets (metres) to latitude and longitude on a sphere; valid at the poles."""
    d = np.hypot(east, north) / radius
    th = np.arctan2(east, north)
    p0, l0 = math.radians(lat0), math.radians(lon0)
    sin_lat = np.sin(p0) * np.cos(d) + np.cos(p0) * np.sin(d) * np.cos(th)
    lat = np.arcsin(np.clip(sin_lat, -1, 1))
    lon = l0 + np.arctan2(np.sin(th) * np.sin(d) * np.cos(p0), np.cos(d) - np.sin(p0) * sin_lat)
    lon = (np.degrees(lon) + 180.0) % 360.0 - 180.0
    return np.degrees(lat), lon


def sample_planetary_dem(ds, scale: float, body: str, lat0: float, lon0: float) -> np.ndarray:
    """100 x 100 window (480 m cells) centred on lat0, lon0 from a global equirectangular DEM (lon -180..180)."""
    native = abs(ds.transform.a)                              # metres per pixel
    fine = CELL_M if native > 300 else CELL_M / 4.0          # sample finely, then block-average
    k = int(round(CELL_M / fine))
    n = GRID_N * k
    off = (np.arange(n) - (n - 1) / 2.0) * fine
    east, north = np.meshgrid(off, off[::-1])                  # north-up
    lat, lon = enu_to_latlon(RADIUS[body], lat0, lon0, east, north)
    h, w = ds.height, ds.width
    rows = (90.0 - lat) / 180.0 * h - 0.5
    cols = (lon + 180.0) / 360.0 * w - 0.5
    r0 = max(0, int(math.floor(rows.min())) - 2)
    r1 = min(h, int(math.ceil(rows.max())) + 3)
    from rasterio.windows import Window
    arr = ds.read(1, window=Window(0, r0, w, r1 - r0)).astype(np.float32)
    nodata = arr == ds.nodata
    arr = arr * scale
    if nodata.any():
        arr[nodata] = np.nan
    z = map_coordinates(arr, [rows - r0, np.mod(cols, w)], order=1, mode="grid-wrap")
    if k > 1:
        z = z.reshape(GRID_N, k, GRID_N, k).mean(axis=(1, 3))
    return z.astype(np.float64)
