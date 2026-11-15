# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Terrain signatures of the Moon and Mars targets from the LRO LOLA and MGS MOLA elevation models.

Run:  .venv/bin/python -I analogs/targets.py
Writes data/analogs/targets.json
"""
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import terrain_features, thumb_png_b64, sample_planetary_dem  # noqa: E402
from config import TARGETS, ENV  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEM = {
    "moon": (ROOT / "data/moon/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif", 0.5),
    "mars": (ROOT / "data/mars/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif", 1.0),
}


def main() -> None:
    out = []
    dss = {b: rasterio.open(p) for b, (p, _) in DEM.items()}
    for t in TARGETS:
        ds, scale = dss[t["body"]], DEM[t["body"]][1]
        z = sample_planetary_dem(ds, scale, t["body"], t["lat"], t["lon"])
        if np.isnan(z).any():
            z = np.where(np.isnan(z), np.nanmean(z), z)
        f = terrain_features(z)
        rec = dict(t, env_values=ENV[t["env"]], terrain=f, thumb=thumb_png_b64(z))
        out.append(rec)
        print(f"{t['id']:14s} slope med {f['slope_med']:5.1f}  p90 {f['slope_p90']:5.1f}  relief {f['relief']:7.0f} m  rough {f['rough']:6.0f} m  elev {f['elev']:7.0f} m")
    dest = ROOT / "data/analogs"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "targets.json").write_text(json.dumps(out), encoding="utf-8")
    print("wrote", dest / "targets.json")


if __name__ == "__main__":
    main()
