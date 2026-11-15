# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Подготовка сеток для маршрутизации из исходных карт высот (GeoTIFF).

Запуск:  .venv/bin/python -I server/prep.py mars
         .venv/bin/python -I server/prep.py moon

Исходный файл читается полосами (в память целиком не грузится). Для каждой
ячейки базовой сетки сохраняются:
  * средняя высота (int16, метры);
  * средний уклон, посчитанный по ИСХОДНОМУ разрешению (uint8, шаг 0.5 градуса).
Уклон считается до уменьшения, иначе стенки небольших кратеров сгладились бы
и исчезли. Затем строится пирамида уровней: каждый следующий вдвое грубее.
"""
from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from numpy.lib.format import open_memmap
from rasterio.windows import Window

DATA = Path(__file__).resolve().parent.parent / "data"

BODIES = {
    "mars": dict(
        src="mars/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif",
        radius=3396190.0, gravity=3.71, factor=2, scale=None,
    ),
    "moon": dict(
        src="moon/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif",
        radius=1737400.0, gravity=1.62, factor=4, scale=None,
    ),
}
LEVELS = 7          # уровень 0 = базовая сетка, уровень 6 = в 64 раза грубее
STRIP = 256         # сколько строк исходника читать за раз
SLOPE_UNIT = 0.5    # градусов на единицу uint8


def build(body: str) -> None:
    cfg = BODIES[body]
    out = DATA / "grids" / body
    out.mkdir(parents=True, exist_ok=True)
    f = cfg["factor"]
    t0 = time.time()

    with rasterio.open(DATA / cfg["src"]) as ds:
        W, H = ds.width, ds.height
        if W != 2 * H:
            raise SystemExit(f"ожидалась глобальная карта 2:1, получено {W}x{H}")
        scale = cfg["scale"] if cfg["scale"] is not None else (ds.scales[0] or 1.0)
        offset = ds.offsets[0] or 0.0
        print(f"{body}: {W}x{H}, dtype={ds.dtypes[0]}, scale={scale}, "
              f"offset={offset}, nodata={ds.nodata}, crs={ds.crs}")

        bw, bh = W // f, H // f
        res_deg = 180.0 / H
        res_m = cfg["radius"] * math.radians(res_deg)
        elev = open_memmap(out / "L0_elev.npy", "w+", np.int16, (bh, bw))
        slope = open_memmap(out / "L0_slope.npy", "w+", np.uint8, (bh, bw))
        zmin, zmax = math.inf, -math.inf

        for r0 in range(0, H, STRIP):
            r1 = min(r0 + STRIP, H)
            a, b = max(r0 - 1, 0), min(r1 + 1, H)     # +1 строка для градиента
            z = ds.read(1, window=Window(0, a, W, b - a)).astype(np.float32)
            z = z * np.float32(scale) + np.float32(offset)
            lat = 90.0 - (np.arange(a, b) + 0.5) * res_deg
            cosl = np.maximum(np.cos(np.radians(lat)), math.cos(math.radians(89.5)))
            gy = np.gradient(z, axis=0) / np.float32(res_m)
            # Уклон восток-запад. У полюсов ячейки сужаются до метров, и шум данных
            # выглядел бы как крутые склоны, поэтому разность берём через k ячеек,
            # чтобы база измерения оставалась примерно равной res_m.
            kk = np.minimum(np.ceil(1.0 / cosl).astype(int), W // 8)
            gx = np.empty_like(z)
            for kv in np.unique(kk):
                sel = kk == kv
                zz = z[sel]
                gx[sel] = (np.roll(zz, -kv, axis=1) - np.roll(zz, kv, axis=1)) / (
                    2 * kv * res_m * cosl[sel][:, None]).astype(np.float32)
            s = np.degrees(np.arctan(np.hypot(gx, gy)))
            del gx, gy
            k = r0 - a
            z = z[k:k + (r1 - r0)]
            s = s[k:k + (r1 - r0)]
            zb = z.reshape(-1, f, bw, f).mean(axis=(1, 3))
            sb = s.reshape(-1, f, bw, f).mean(axis=(1, 3))
            elev[r0 // f:r1 // f] = np.rint(zb).astype(np.int16)
            slope[r0 // f:r1 // f] = np.clip(np.rint(sb / SLOPE_UNIT), 0, 255).astype(np.uint8)
            zmin, zmax = min(zmin, float(zb.min())), max(zmax, float(zb.max()))
            if (r0 // STRIP) % 10 == 0:
                print(f"  {100 * r1 / H:5.1f}%  {time.time() - t0:5.0f} c", flush=True)
        elev.flush()
        slope.flush()

    print(f"  высоты: от {zmin:.0f} до {zmax:.0f} м")

    # Пирамида: каждый уровень = среднее по блокам 2x2 предыдущего.
    pe, ps = elev, slope
    for lvl in range(1, LEVELS):
        h, w = pe.shape[0] // 2, pe.shape[1] // 2
        ne = open_memmap(out / f"L{lvl}_elev.npy", "w+", np.int16, (h, w))
        ns = open_memmap(out / f"L{lvl}_slope.npy", "w+", np.uint8, (h, w))
        step = 1024
        for r in range(0, h, step):
            e = np.asarray(pe[2 * r:2 * (r + step)], dtype=np.float32)
            q = np.asarray(ps[2 * r:2 * (r + step)], dtype=np.float32)
            n = e.shape[0] // 2
            ne[r:r + n] = np.rint(e.reshape(n, 2, w, 2).mean(axis=(1, 3))).astype(np.int16)
            ns[r:r + n] = np.rint(q.reshape(n, 2, w, 2).mean(axis=(1, 3))).astype(np.uint8)
        ne.flush()
        ns.flush()
        pe, ps = ne, ns
        print(f"  уровень {lvl}: {w}x{h}")

    meta = dict(body=body, radius=cfg["radius"], gravity=cfg["gravity"], levels=LEVELS,
                width=bw, height=bh, slope_unit=SLOPE_UNIT,
                cell_m=cfg["radius"] * math.pi / bh, source=cfg["src"],
                elev_min=zmin, elev_max=zmax)
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"готово за {time.time() - t0:.0f} c: {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in BODIES:
        raise SystemExit("использование: prep.py mars|moon")
    build(sys.argv[1])
