# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Combine the scan, NASA POWER climate, volcano distance and country labels into the compact dataset used by the
web tool (docs/atlas/data/), pick candidates that get a hillshade thumbnail, and write a few static summaries.

Run (after the earth.py stages):  .venv/bin/python -I analogs/export.py
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import numpy as np
from scipy.ndimage import distance_transform_edt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import earth  # noqa: E402
import score as sc  # noqa: E402
from common import GRID_N, terrain_features, thumb_png_b64  # noqa: E402
from config import KNOWN  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data" / "analogs"
OUT = ROOT / "docs" / "atlas" / "data"


def power_at(param: str, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    g = earth.load_power_grid(param)
    nan = np.isnan(g)
    if nan.any() and not nan.all():
        idx = distance_transform_edt(nan, return_distances=False, return_indices=True)
        g = g[tuple(idx)]
    i = np.clip(np.rint((lat + 90.0) / 0.5).astype(int), 0, 360)
    j = np.rint((lon + 180.0) / 0.625).astype(int) % 576
    return g[i, j]


def country_labels(lat: np.ndarray, lon: np.ndarray):
    import rasterio.features
    from rasterio.transform import from_origin
    src = D / "ne_50m_admin_0_countries.geojson"
    if not src.exists():
        data = earth.get("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson")
        assert data, "could not download country polygons"
        src.write_bytes(data)
    gj = json.loads(src.read_text(encoding="utf-8"))
    names = ["(unknown)"]
    shapes = []
    for f in gj["features"]:
        p = f["properties"]
        nm = p.get("NAME") or p.get("ADMIN") or p.get("name") or "?"
        names.append(nm)
        shapes.append((f["geometry"], len(names) - 1))
    res = 0.1
    h, w = int(180 / res), int(360 / res)
    grid = rasterio.features.rasterize(shapes, out_shape=(h, w), transform=from_origin(-180, 90, res, res), fill=0, dtype="uint16")
    nz = grid == 0
    idx = distance_transform_edt(nz, return_distances=False, return_indices=True)
    grid = grid[tuple(idx)]
    r = np.clip(((90 - lat) / res).astype(int), 0, h - 1)
    c = (((lon + 180) / res).astype(int)) % w
    return grid[r, c].astype(np.uint16), names


def _km(e, i, j):
    la1, lo1, la2, lo2 = map(math.radians, (e["lat"][i], e["lon"][i], e["lat"][j], e["lon"][j]))
    a = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(min(1.0, a)))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    s = np.load(D / "scan.npz")
    lat, lon, feat, hist = s["lat"], s["lon"], s["feat"], s["hist"]
    volc = np.load(D / "volc_km.npy")
    tmean = power_at("T2M", lat, lon)
    tmax = power_at("T2M_MAX", lat, lon)
    tmin = power_at("T2M_MIN", lat, lon)
    prec = power_at("PRECTOTCORR", lat, lon) * 365.25
    wind = power_at("WS10M", lat, lon)
    uv = power_at("ALLSKY_SFC_UV_INDEX", lat, lon)
    ok = (feat[:, 5] == 1) & np.isfinite(tmean) & np.isfinite(tmax) & np.isfinite(tmin) & np.isfinite(prec) & np.isfinite(wind) & np.isfinite(uv)
    print("valid windows:", int(ok.sum()), "of", ok.size)
    sel = np.where(ok)[0]
    ctry, cnames = country_labels(lat[sel], lon[sel])

    # ---- quantise (the web tool and the Python scoring both use the quantised values)
    q = dict(
        lat=lat[sel].astype("<f4"), lon=lon[sel].astype("<f4"),
        smed=np.clip(np.rint(feat[sel, 0] * 100), 0, 65535).astype("<u2"), sp90=np.clip(np.rint(feat[sel, 1] * 100), 0, 65535).astype("<u2"),
        relief=np.clip(np.rint(feat[sel, 2]), 0, 65535).astype("<u2"), rough=np.clip(np.rint(feat[sel, 3]), 0, 65535).astype("<u2"),
        elev=np.clip(np.rint(feat[sel, 4]), -32000, 32000).astype("<i2"),
        hist=np.clip(np.rint(hist[sel] * 255), 0, 255).astype("u1"),
        tmean=np.clip(np.rint(tmean[sel] * 100), -32000, 32000).astype("<i2"),
        tdiur=np.clip(np.rint((tmax[sel] - tmin[sel]) * 100), 0, 32000).astype("<u2"),
        precip=np.clip(np.rint(prec[sel]), 0, 65535).astype("<u2"),
        wind=np.clip(np.rint(wind[sel] * 100), 0, 65535).astype("<u2"),
        uv=np.clip(np.rint(uv[sel] * 100), 0, 65535).astype("<u2"),
        volc=np.clip(np.rint(volc[sel]), 0, 65000).astype("<u2"),
        country=ctry.astype("u1"),
    )
    earthd = dict(
        lat=q["lat"].astype(float), lon=q["lon"].astype(float), smed=q["smed"] / 100.0, sp90=q["sp90"] / 100.0,
        relief=q["relief"].astype(float), rough=q["rough"].astype(float), elev=q["elev"].astype(float),
        hist=q["hist"].astype(float) / 255.0, tmean=q["tmean"] / 100.0, tdiur=q["tdiur"] / 100.0,
        precip=q["precip"].astype(float), wind=q["wind"] / 100.0, uv=q["uv"] / 100.0, volc_km=q["volc"].astype(float),
    )
    # ---- statistics for the scoring
    tv = sc.terrain_vec(earthd["smed"], earthd["sp90"], earthd["relief"], earthd["rough"])
    ev = sc.env_vec(earthd["tmean"], earthd["tdiur"], earthd["precip"], sc.pressure_kpa(earthd["elev"]), earthd["wind"], earthd["uv"])
    meta = dict(
        n=int(sel.size), terrain_mean=tv.mean(0).tolist(), terrain_std=tv.std(0).tolist(),
        env_std=ev.std(0).tolist(), env_q01=np.percentile(ev, 1, axis=0).tolist(), env_q99=np.percentile(ev, 99, axis=0).tolist(),
        env_min=ev.min(0).tolist(), env_max=ev.max(0).tolist(),
        sigma_t=sc.SIGMA_T, sigma_e=sc.SIGMA_E, env_w=sc.ENV_W.tolist(), default_w=list(sc.DEFAULT_W),
        slope_edges=[0, 2, 5, 8, 12, 16, 22, 30, 90], countries=cnames, window_km=48, cell_m=480,
    )
    # ---- binary file (struct of arrays, each column 4-byte aligned)
    cols, blob, off = [], bytearray(), 0
    for name, arr in q.items():
        b = arr.tobytes()
        pad = (-len(b)) % 4
        cols.append(dict(name=name, dtype=arr.dtype.str, count=int(arr.size), offset=off))
        blob += b + b"\0" * pad
        off += len(b) + pad
    meta["columns"] = cols
    (OUT / "windows.bin").write_bytes(bytes(blob))
    (OUT / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    print("windows.bin:", len(blob) // 1024, "KB")

    # ---- targets and thumbnails
    targets = json.loads((D / "targets.json").read_text(encoding="utf-8"))
    known = [dict(name=k[0], lat=k[1], lon=k[2], radius=(k[3] if len(k) > 3 else 120)) for k in KNOWN]
    (OUT / "known.json").write_text(json.dumps(known), encoding="utf-8")
    klat = np.radians([k[1] for k in KNOWN])
    klon = np.radians([k[2] for k in KNOWN])
    la, lo = np.radians(earthd["lat"]), np.radians(earthd["lon"])
    a = np.sin((klat[None] - la[:, None]) / 2) ** 2 + np.cos(la[:, None]) * np.cos(klat[None]) * np.sin((klon[None] - lo[:, None]) / 2) ** 2
    kdist = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    krad = np.array([(k[3] if len(k) > 3 else 120) for k in KNOWN], dtype=float)
    earthd["known_km"] = (kdist - (krad[None, :] - 120.0)).min(1)       # <= 120 means inside the site's area

    presets = [(0.5, 0.3, 0.2), (1.0, 0.0, 0.0), (0.1, 0.5, 0.4)]
    topn = [25, 25, 15]
    want = {}
    highlights = {}
    for t in targets:
        total0, T0, E0, R0 = sc.score(t, earthd, meta, presets[0])
        less = earthd["known_km"] > 120.0
        order = [int(i) for i in np.argsort(-total0)[:3000]]
        chosen = []
        for i in order:                                         # distinct places at least 100 km apart
            if all(_km(earthd, i, j) >= 100.0 for j in chosen):
                chosen.append(i)
            if len(chosen) >= 8:
                break
        lessorder = [i for i in np.argsort(-np.where(less, total0, -1))[:3000]]
        chosen_less = []
        for i in lessorder:
            if all(_km(earthd, i, j) >= 100.0 for j in chosen_less):
                chosen_less.append(int(i))
            if len(chosen_less) >= 8:
                break
        def rec(i):
            return dict(i=int(i), lat=float(earthd["lat"][i]), lon=float(earthd["lon"][i]), country=cnames[int(q["country"][i])], total=float(total0[i]),
                        terrain=float(T0[i]), env=float(E0[i]), proc=float(R0[i]), known_km=float(earthd["known_km"][i]))
        highlights[t["id"]] = dict(distinct=[rec(i) for i in chosen_less], any=[rec(i) for i in chosen])
        for i in chosen[:5] + chosen_less[:5]:
            want[int(i)] = True
        for p, n in zip(presets, topn):
            tot = sc.score(t, earthd, meta, p)[0]
            for i in np.argsort(-tot)[:n]:
                want[int(i)] = True
            lessorder = np.argsort(-np.where(less, tot, -1))[:n // 2]
            for i in lessorder:
                want[int(i)] = True
    print("windows that need a thumbnail:", len(want))
    if os.environ.get("ANALOG_FAST"):                       # quick test run
        want = dict(list(want.items())[:60])
    thumbs = {}
    for k, i in enumerate(sorted(want)):
        z = earth.window_z_direct(float(earthd["lat"][i]), float(earthd["lon"][i]))
        if z is not None:
            thumbs[str(i)] = thumb_png_b64(z, 56)
        if k % 200 == 0:
            print("thumb", k, "/", len(want), flush=True)
    (OUT / "thumbs.json").write_text(json.dumps(thumbs), encoding="utf-8")
    for t in targets:
        t["thumb"] = t["thumb"]
    (OUT / "targets.json").write_text(json.dumps(targets), encoding="utf-8")
    (OUT / "highlights.json").write_text(json.dumps(highlights), encoding="utf-8")
    print("export done")


if __name__ == "__main__":
    main()
