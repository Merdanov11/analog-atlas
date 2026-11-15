# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Sanity check of the scoring: do well-known analog sites score high, and where are the best less-studied places?

Run (after export.py):  .venv/bin/python -I analogs/validate.py
Writes docs/atlas/data/validation.json and prints a summary table.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score as sc  # noqa: E402
from config import KNOWN  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "atlas" / "data"


def load():
    meta = json.loads((DATA / "meta.json").read_text())
    buf = (DATA / "windows.bin").read_bytes()
    q = {c["name"]: np.frombuffer(buf, dtype=np.dtype(c["dtype"]), count=c["count"], offset=c["offset"]) for c in meta["columns"]}
    e = dict(lat=q["lat"].astype(float), lon=q["lon"].astype(float), smed=q["smed"] / 100.0, sp90=q["sp90"] / 100.0, relief=q["relief"].astype(float),
             rough=q["rough"].astype(float), elev=q["elev"].astype(float), hist=q["hist"].reshape(-1, 8).astype(float) / 255.0, tmean=q["tmean"] / 100.0,
             tdiur=q["tdiur"] / 100.0, precip=q["precip"].astype(float), wind=q["wind"] / 100.0, uv=q["uv"] / 100.0, volc_km=q["volc"].astype(float),
             country=q["country"])
    return meta, e


def haversine(la1, lo1, la2, lo2):
    la1, lo1, la2, lo2 = map(np.radians, (la1, lo1, la2, lo2))
    a = np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def main() -> None:
    meta, e = load()
    targets = json.loads((DATA / "targets.json").read_text())
    kd = np.stack([haversine(e["lat"], e["lon"], k[1], k[2]) - ((k[3] if len(k) > 3 else 120) - 120.0) for k in KNOWN], axis=1)     # N x K, <= 120 inside the area
    near = kd.min(1) <= 120.0
    out = {}
    print(f"{'target':14s} {'best overall':>12s} {'best known-site':>16s} {'known pctile':>13s} {'known sites in top 5%':>22s}")
    for t in targets:
        total = sc.score(t, e, meta)[0]
        thr95 = np.percentile(total, 95)
        best_by_site = []
        for k in range(len(KNOWN)):
            m = kd[:, k] <= 120.0
            best_by_site.append(float(total[m].max()) if m.any() else float("nan"))
        best_by_site = np.array(best_by_site)
        in_top = int(np.sum(best_by_site >= thr95))
        pct = float((total < np.nanmax(best_by_site)).mean() * 100)
        out[t["id"]] = dict(best_overall=float(total.max()), best_known=float(np.nanmax(best_by_site)), best_known_site=KNOWN[int(np.nanargmax(best_by_site))][0],
                            known_percentile=pct, known_in_top5=in_top, n_known=int(np.isfinite(best_by_site).sum()),
                            frac_top100_known=float(near[np.argsort(-total)[:100]].mean()))
        print(f"{t['id']:14s} {total.max():12.2f} {np.nanmax(best_by_site):16.2f} {pct:12.1f}% {in_top:12d} / {int(np.isfinite(best_by_site).sum())}")
    (DATA / "validation.json").write_text(json.dumps(out))


if __name__ == "__main__":
    main()
