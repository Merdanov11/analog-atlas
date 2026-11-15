# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Checks that the JavaScript scoring in docs/atlas/index.html gives the same numbers as analogs/score.py.

Run:  .venv/bin/python tests/atlas_parity.py      (needs Google Chrome and the exported data in docs/atlas/data/)
"""
import asyncio
import json
import subprocess
import sys
import tempfile
import threading
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import websockets

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "analogs"))
sys.path.insert(0, str(ROOT / "tools"))
import score as sc  # noqa: E402
import cdp as shots  # noqa: E402

DATA = ROOT / "docs" / "atlas" / "data"


def load_earth():
    meta = json.loads((DATA / "meta.json").read_text())
    buf = (DATA / "windows.bin").read_bytes()
    cols = {}
    for c in meta["columns"]:
        dt = np.dtype(c["dtype"])
        cols[c["name"]] = np.frombuffer(buf, dtype=dt, count=c["count"], offset=c["offset"])
    q = cols
    e = dict(smed=q["smed"] / 100.0, sp90=q["sp90"] / 100.0, relief=q["relief"].astype(float), rough=q["rough"].astype(float),
             elev=q["elev"].astype(float), hist=q["hist"].reshape(-1, 8).astype(float) / 255.0, tmean=q["tmean"] / 100.0,
             tdiur=q["tdiur"] / 100.0, precip=q["precip"].astype(float), wind=q["wind"] / 100.0, uv=q["uv"] / 100.0, volc_km=q["volc"].astype(float))
    return meta, e


async def main() -> int:
    meta, earth = load_earth()
    targets = json.loads((DATA / "targets.json").read_text())
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT / "docs" / "atlas"))
    srv = ThreadingHTTPServer(("127.0.0.1", 8765), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp()
    proc = subprocess.Popen([shots.CHROME, f"--remote-debugging-port={shots.PORT}", "--headless=new", f"--user-data-dir={prof}", "--no-first-run"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    bad = 0
    try:
        for _ in range(60):
            try:
                v = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{shots.PORT}/json/version").read())
                break
            except Exception:
                await asyncio.sleep(0.5)
        b = shots.Page(await websockets.connect(v["webSocketDebuggerUrl"], max_size=2 ** 27))
        asyncio.create_task(b.run())
        p = await shots.new_page(b, 1400, 900, 1)
        await p.goto("http://127.0.0.1:8765/index.html", 1.0)
        await p.until("window.__atlas && window.__atlas.N() > 0", 90)
        rng = np.random.default_rng(1)
        idx = rng.choice(len(earth["smed"]), 40, replace=False)
        for t in targets[:: max(1, len(targets) // 8)]:
            w = (0.5, 0.3, 0.2)
            py = sc.score(t, earth, meta, w)
            js = await p.js("(()=>{const a=window.__atlas;const t=a.targets.find(x=>x.id==%s);const r=a.scoreAll(t,[0.5,0.3,0.2]);"
                            "const ix=%s;return ix.map(i=>[r.S[i],r.T[i],r.E[i],r.R[i]]);})()" % (json.dumps(t["id"]), json.dumps([int(i) for i in idx])))
            js = np.array(js)
            ref = np.stack([py[0][idx], py[1][idx], py[2][idx], py[3][idx]], axis=1)
            err = float(np.abs(js - ref).max())
            ok = err < 2e-3
            bad += 0 if ok else 1
            print(("PASS" if ok else "FAIL"), f"{t['id']:14s} max |JS - Python| = {err:.2e}")
    finally:
        proc.terminate()
        srv.shutdown()
    print("All parity checks passed" if not bad else f"{bad} parity checks FAILED")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
