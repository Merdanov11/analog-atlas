# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Systematic scan of the whole Earth (land between 80 N and 80 S) for terrain and environment signatures.

Stages (run in this order):
  mask    land mask (Natural Earth 50 m land polygons) and the lattice of 48 km windows (36 km spacing)
  power   NASA POWER climatology (MERRA-2): mean, hottest-day and coldest-day temperature, precipitation, wind
  tiles   elevation tiles (Terrarium, zoom 8; NASA SRTM and other open sources) for all land windows
  scan    terrain signature of every window
  volc    distance of every window to the nearest Holocene basaltic volcano (Smithsonian GVP)
Everything is cached under data/analogs/ so that each stage can be repeated or resumed.

Usage:  .venv/bin/python -I analogs/earth.py <stage>
"""
from __future__ import annotations

import csv
import io
import json
import math
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, uniform_filter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import GRID_N, WINDOW_M, terrain_features  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data" / "analogs"
D.mkdir(parents=True, exist_ok=True)
Z = 8
NT = 2 ** Z
NPX = 256 * NT
MERC_R = 6378137.0
STEP_M = 36000.0
LAT_MAX = 80.0
UA = {"User-Agent": "Mozilla/5.0 (research client)"}


def get(url: str, tries: int = 4, timeout: float = 60.0) -> bytes | None:
    for k in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1.5 * (k + 1))
        except Exception:
            time.sleep(1.5 * (k + 1))
    return None


def merc_px(lat, lon):
    x = (np.asarray(lon) + 180.0) / 360.0 * NPX
    s = np.sin(np.radians(lat))
    y = (0.5 - np.log((1 + s) / (1 - s)) / (4 * math.pi)) * NPX
    return x, y


# ---------------------------------------------------------------- stage: mask + lattice
def stage_mask() -> None:
    import rasterio.features
    from rasterio.transform import from_origin
    src = D / "ne_50m_land.geojson"
    if not src.exists():
        print("downloading Natural Earth land polygons")
        data = get("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson")
        assert data, "could not download the land mask"
        src.write_bytes(data)
    gj = json.loads(src.read_text(encoding="utf-8"))
    res = 0.05
    h, w = int(180 / res), int(360 / res)
    mask = rasterio.features.rasterize(((f["geometry"], 1) for f in gj["features"]), out_shape=(h, w),
                                       transform=from_origin(-180, 90, res, res), fill=0, dtype="uint8")
    # lattice of windows
    dphi = STEP_M / 111195.0
    lats = np.arange(-LAT_MAX, LAT_MAX + 1e-9, dphi)
    wl, wo = [], []
    for phi in lats:
        n_lon = int(math.ceil(360.0 * math.cos(math.radians(phi)) / dphi))
        lons = -180.0 + (np.arange(n_lon) + 0.5) * 360.0 / n_lon
        wl.append(np.full(n_lon, phi))
        wo.append(lons)
    lat = np.concatenate(wl)
    lon = np.concatenate(wo)
    # land fraction: 7 x 7 sample points inside each window (about 7 km apart)
    off = (np.arange(7) - 3) * (WINDOW_M / 7.0)
    frac = np.zeros(lat.size)
    for oe in off:
        for on in off:
            la = lat + on / 111195.0
            lo = lon + oe / (111195.0 * np.maximum(np.cos(np.radians(lat)), 0.05))
            r = np.clip(((90 - la) / res).astype(int), 0, h - 1)
            c = (((lo + 180) / res).astype(int)) % w
            frac += mask[r, c]
    frac /= 49.0
    keep = frac >= 0.9
    np.savez_compressed(D / "lattice.npz", lat=lat[keep], lon=lon[keep], land=frac[keep])
    print(f"lattice: {lat.size} windows, {int(keep.sum())} with >= 90 % land")


# ---------------------------------------------------------------- stage: NASA POWER
POWER_PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "WS10M", "ALLSKY_SFC_UV_INDEX"]


def stage_power() -> None:
    lat = np.load(D / "lattice.npz")["lat"]
    lon = np.load(D / "lattice.npz")["lon"]
    boxes = sorted({(int(math.floor(a / 10) * 10), int(math.floor(b / 10) * 10)) for a, b in zip(lat, lon)})
    jobs = [(a, b, p) for a, b in boxes for p in POWER_PARAMS]
    out = D / "power"
    out.mkdir(exist_ok=True)
    todo = [j for j in jobs if not (out / f"{j[2]}_{j[0]}_{j[1]}.json").exists()]
    print(f"POWER: {len(boxes)} boxes, {len(todo)} requests to do", flush=True)
    done = [0]
    lock = threading.Lock()

    def one(j):
        a, b, p = j
        url = ("https://power.larc.nasa.gov/api/temporal/climatology/regional?parameters=%s&community=RE"
               "&latitude-min=%d&latitude-max=%d&longitude-min=%d&longitude-max=%d&format=JSON" % (p, a, a + 10, b, b + 10))
        data = None
        for attempt in range(8):                      # NASA POWER rate-limits (HTTP 429): back off and retry
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
                break
            except urllib.error.HTTPError as e:
                time.sleep(30 if e.code == 429 else 4 * (attempt + 1))
            except Exception:
                time.sleep(4 * (attempt + 1))
        if data is None:
            return
        time.sleep(1.0)
        d = json.loads(data)
        pts = {}
        for f in d["features"]:
            lo, la = f["geometry"]["coordinates"][:2]
            v = f["properties"]["parameter"][p]["ANN"]
            pts[f"{la},{lo}"] = None if v == -999.0 else v
        (out / f"{p}_{a}_{b}.json").write_text(json.dumps(pts))
        with lock:
            done[0] += 1
            if done[0] % 50 == 0:
                print("POWER", done[0], "/", len(todo), flush=True)

    with ThreadPoolExecutor(1) as ex:                 # POWER throttles bursts: one request at a time
        list(ex.map(one, todo))
    left = [j for j in jobs if not (out / f"{j[2]}_{j[0]}_{j[1]}.json").exists()]
    print("POWER finished; missing requests:", len(left))


def load_power_grid(param: str) -> np.ndarray:
    """Global grid 361 x 577 (0.5 deg lat, 0.625 deg lon) with NaN where unknown."""
    g = np.full((361, 577), np.nan, dtype=np.float32)
    for f in (D / "power").glob(f"{param}_[-0-9]*.json"):      # exact parameter (T2M must not match T2M_MAX)
        for k, v in json.loads(f.read_text()).items():
            if v is None:
                continue
            la, lo = map(float, k.split(","))
            i = int(round((la + 90.0) / 0.5))
            j = int(round((lo + 180.0) / 0.625)) % 576
            if 0 <= i < 361:
                g[i, j] = v
    return g


# ---------------------------------------------------------------- stage: tiles
def tile_file(x: int, y: int) -> Path:
    return D / "tiles" / f"{x}_{y}.png"


def window_geometry(lat, lon):
    cx, cy = merc_px(lat, lon)
    s = 2 * math.pi * MERC_R * np.cos(np.radians(lat)) / NPX     # metres per pixel
    k = WINDOW_M / s
    return cx, cy, k


def stage_tiles() -> None:
    d = np.load(D / "lattice.npz")
    cx, cy, k = window_geometry(d["lat"], d["lon"])
    need = set()
    for a, b, c in zip(cx, cy, k):
        x0, x1 = int(math.floor((a - c / 2 - 1) / 256)), int(math.floor((a + c / 2 + 1) / 256))
        y0, y1 = int(math.floor((b - c / 2 - 1) / 256)), int(math.floor((b + c / 2 + 1) / 256))
        for x in range(x0, x1 + 1):
            for y in range(max(0, y0), min(NT - 1, y1) + 1):
                need.add((x % NT, y))
    need = sorted(need)
    (D / "tiles").mkdir(exist_ok=True)
    todo = [t for t in need if not tile_file(*t).exists()]
    print(f"tiles: {len(need)} needed, {len(todo)} to download", flush=True)
    done = [0]
    lock = threading.Lock()

    def one(t):
        x, y = t
        data = get(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png")
        tile_file(x, y).write_bytes(data if data else b"")
        with lock:
            done[0] += 1
            if done[0] % 500 == 0:
                print("tiles", done[0], "/", len(todo), flush=True)

    with ThreadPoolExecutor(48) as ex:
        list(ex.map(one, todo))
    print("tiles finished")


# ---------------------------------------------------------------- stage: scan
_row_cache: dict[int, np.ndarray] = {}


def decode_row(y: int) -> np.ndarray:
    """One tile row (256 x NPX), int16 metres; -32768 where a tile is missing."""
    if y in _row_cache:
        return _row_cache[y]
    row = np.full((256, NPX), -32768, dtype=np.int16)
    if 0 <= y < NT:
        for x in range(NT):
            f = tile_file(x, y)
            if not f.exists() or f.stat().st_size == 0:
                continue
            try:
                a = np.asarray(Image.open(f).convert("RGB"), dtype=np.float32)
            except Exception:
                continue
            h = a[..., 0] * 256.0 + a[..., 1] + a[..., 2] / 256.0 - 32768.0
            row[:, x * 256:(x + 1) * 256] = np.clip(np.round(h), -32000, 32000).astype(np.int16)
    _row_cache[y] = row
    for old in [k for k in _row_cache if k < y - 4]:
        del _row_cache[old]
    return row


def window_grid(band: np.ndarray, x_off: int, y_off: int, cx: float, cy: float, k: float) -> np.ndarray | None:
    x0, x1 = int(math.floor(cx - k / 2 - 2)), int(math.ceil(cx + k / 2 + 2))
    y0, y1 = int(math.floor(cy - k / 2 - 2)), int(math.ceil(cy + k / 2 + 2))
    if y0 - y_off < 0 or y1 - y_off > band.shape[0]:
        return None
    cols = np.arange(x0, x1) % NPX
    crop = band[y0 - y_off:y1 - y_off][:, cols].astype(np.float32)
    if (crop <= -32000).any():
        return None
    if k / GRID_N > 1.6:
        crop = uniform_filter(crop, size=k / GRID_N, mode="nearest")
    pos = (np.arange(GRID_N) + 0.5) * (k / GRID_N) - 0.5
    xs = (cx - k / 2) + pos - x0
    ys = (cy - k / 2) + pos - y0
    yy, xx = np.meshgrid(ys, xs, indexing="ij")
    return map_coordinates(crop, [yy, xx], order=1, mode="nearest").astype(np.float64)


def stage_scan() -> None:
    d = np.load(D / "lattice.npz")
    lat, lon = d["lat"], d["lon"]
    cx, cy, k = window_geometry(lat, lon)
    yc = (cy // 256).astype(int)
    order = np.argsort(yc, kind="stable")
    n = lat.size
    feat = np.full((n, 6), np.nan, dtype=np.float32)       # slope_med, slope_p90, relief, rough, elev, valid
    hist = np.zeros((n, 8), dtype=np.float32)
    t0 = time.time()
    done = 0
    current = None
    band = None
    y_off = 0
    for idx in order:
        y = int(yc[idx])
        if y != current:
            current = y
            rows = [decode_row(y + dy) for dy in range(-3, 4)]
            band = np.concatenate(rows, axis=0)
            y_off = (y - 3) * 256
        z = window_grid(band, 0, y_off, float(cx[idx]), float(cy[idx]), float(k[idx]))
        done += 1
        if z is None:
            continue
        f = terrain_features(z)
        feat[idx] = [f["slope_med"], f["slope_p90"], f["relief"], f["rough"], f["elev"], 1.0]
        hist[idx] = f["hist"]
        if done % 5000 == 0:
            print(f"scan {done}/{n}  {time.time() - t0:.0f}s", flush=True)
    np.savez_compressed(D / "scan.npz", lat=lat, lon=lon, feat=feat, hist=hist)
    print("scan finished:", int(np.nansum(feat[:, 5])), "valid windows of", n)


# ---------------------------------------------------------------- direct window extraction (for thumbnails)
_tile_cache: dict = {}


def _tile(x: int, y: int) -> np.ndarray:
    key = (x % NT, y)
    if key in _tile_cache:
        return _tile_cache[key]
    f = tile_file(*key)
    arr = np.full((256, 256), -32768.0, dtype=np.float32)
    if 0 <= y < NT and f.exists() and f.stat().st_size > 0:
        try:
            a = np.asarray(Image.open(f).convert("RGB"), dtype=np.float32)
            arr = a[..., 0] * 256.0 + a[..., 1] + a[..., 2] / 256.0 - 32768.0
        except Exception:
            pass
    if len(_tile_cache) > 3000:
        _tile_cache.clear()
    _tile_cache[key] = arr
    return arr


def window_z_direct(lat: float, lon: float) -> np.ndarray | None:
    """100 x 100 window (480 m cells) at lat, lon from the cached tiles."""
    cx, cy, k = window_geometry(np.array([lat]), np.array([lon]))
    cx, cy, k = float(cx[0]), float(cy[0]), float(k[0])
    x0, x1 = int(math.floor(cx - k / 2 - 2)), int(math.ceil(cx + k / 2 + 2))
    y0, y1 = int(math.floor(cy - k / 2 - 2)), int(math.ceil(cy + k / 2 + 2))
    tx0, tx1, ty0, ty1 = x0 // 256, (x1 - 1) // 256, y0 // 256, (y1 - 1) // 256
    big = np.full(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), -32768.0, dtype=np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            big[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = _tile(tx, ty)
    crop = big[y0 - ty0 * 256:y1 - ty0 * 256, x0 - tx0 * 256:x1 - tx0 * 256]
    if (crop <= -32000).any():
        return None
    if k / GRID_N > 1.6:
        crop = uniform_filter(crop, size=k / GRID_N, mode="nearest")
    pos = (np.arange(GRID_N) + 0.5) * (k / GRID_N) - 0.5
    xs = (cx - k / 2) + pos - x0
    ys = (cy - k / 2) + pos - y0
    yy, xx = np.meshgrid(ys, xs, indexing="ij")
    return map_coordinates(crop, [yy, xx], order=1, mode="nearest").astype(np.float64)


# ---------------------------------------------------------------- stage: volcanoes
def stage_volc() -> None:
    src = D / "gvp.csv"
    if not src.exists():
        data = get("https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs?service=WFS&version=1.0.0&request=GetFeature"
                   "&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=csv")
        assert data
        src.write_bytes(data)
    rows = list(csv.DictReader(io.StringIO(src.read_text(encoding="utf-8"))))
    pts = [(float(r["Latitude"]), float(r["Longitude"])) for r in rows if r["Major_Rock_Type"].startswith("Basalt")]
    vla = np.radians([p[0] for p in pts])
    vlo = np.radians([p[1] for p in pts])
    d = np.load(D / "lattice.npz")
    la = np.radians(d["lat"])
    lo = np.radians(d["lon"])
    dist = np.full(la.size, 1e9, dtype=np.float32)
    for i in range(0, la.size, 4000):
        sl = slice(i, i + 4000)
        dlat = vla[None, :] - la[sl, None]
        dlon = vlo[None, :] - lo[sl, None]
        a = np.sin(dlat / 2) ** 2 + np.cos(la[sl, None]) * np.cos(vla[None, :]) * np.sin(dlon / 2) ** 2
        dist[sl] = (2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))).min(axis=1)
    np.save(D / "volc_km.npy", dist)
    print("volcano distance done:", len(pts), "basaltic Holocene volcanoes")


if __name__ == "__main__":
    {"mask": stage_mask, "power": stage_power, "tiles": stage_tiles, "scan": stage_scan, "volc": stage_volc}[sys.argv[1]]()
