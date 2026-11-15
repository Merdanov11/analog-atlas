# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Real vehicles on the Moon and Mars.

Live data: the positions of the Perseverance and Curiosity rovers are taken straight from NASA servers
(MMGIS, mars.nasa.gov): after each drive the team publishes an "end of drive" point with the sol number,
latitude, longitude, elevation, roll/pitch angles and distance driven. Data are cached for 10 minutes;
if NASA is unreachable, the last received value is returned (field `stale`).

The other vehicles (landers and stationary rovers) come from the catalogue sites.py: this is the
last known position, not a real-time data stream, and the response marks them `live: false`.
We could not find open sources with coordinates of operating lunar vehicles or of the Ingenuity helicopter,
so there are no invented coordinates here.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.request
from datetime import datetime, timedelta, timezone

from sites import sites as catalog_sites

TTL = 600.0
MMGIS = "https://mars.nasa.gov/mmgis-maps/{m}/Layers/json/{m}_waypoints{suffix}.json"
SOL_S = 88775.244                                   # length of a Martian day, s
MISSIONS = {
    "perseverance": dict(m="M20", en="Perseverance", agency="NASA", kind="rover",
                         epoch=datetime(2021, 2, 18, 20, 55, tzinfo=timezone.utc), year=2021),
    "curiosity": dict(m="MSL", en="Curiosity", agency="NASA", kind="rover",
                      epoch=datetime(2012, 8, 6, 5, 17, tzinfo=timezone.utc), year=2012),
}
_cache: dict = {}
_lock = threading.Lock()


def _get_json(url: str, timeout: float = 12.0):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (research client)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _fetch(key: str, suffix: str):
    """Downloads a file with a cache; on error returns the previous value (stale=True)."""
    mi = MISSIONS[key]
    ck = (key, suffix)
    with _lock:
        hit = _cache.get(ck)
        if hit and time.time() - hit["t"] < TTL:
            return hit["data"], False
    try:
        data = _get_json(MMGIS.format(m=mi["m"], suffix=suffix))
        with _lock:
            _cache[ck] = dict(t=time.time(), data=data)
        return data, False
    except Exception:
        with _lock:
            hit = _cache.get(ck)
        return (hit["data"], True) if hit else (None, True)


def _live(key: str) -> dict | None:
    mi = MISSIONS[key]
    data, stale = _fetch(key, "_current")
    if not data or not data.get("features"):
        return None
    p = data["features"][-1]["properties"]
    sol = int(p["sol"])
    lat, lon = float(p["lat"]), float(p["lon"])
    elev = p.get("elev_geoid")
    as_of = mi["epoch"] + timedelta(seconds=sol * SOL_S)
    return dict(id=key, en=mi["en"], agency=mi["agency"], kind=mi["kind"], year=mi["year"],
                lat=lat, lon=lon, elev_m=None if elev in (None, -9999.0) else round(float(elev), 1),
                heading_deg=round(float(p.get("yaw", 0.0)), 1), pitch_deg=round(float(p.get("pitch", 0.0)), 1),
                roll_deg=round(float(p.get("roll", 0.0)), 1), sol=sol, total_km=round(float(p.get("dist_total_m", 0)) / 1000, 2),
                as_of=as_of.strftime("%Y-%m-%dT%H:%MZ"), live=True, stale=stale,
                source="NASA/JPL-Caltech MMGIS", source_url="https://mars.nasa.gov/mmgis-maps/" + mi["m"] + "/")


def _trace(key: str) -> list:
    data, _ = _fetch(key, "")
    if not data:
        return []
    pts = [(f["properties"]["lat"], f["properties"]["lon"]) for f in data["features"]
           if f.get("properties") and f["properties"].get("lat") is not None]
    step = max(1, len(pts) // 400)
    return [[round(a, 5), round(b, 5)] for a, b in pts[::step]] + ([[round(pts[-1][0], 5), round(pts[-1][1], 5)]] if pts else [])


def assets(body: str, trace: bool = False) -> list[dict]:
    """List of vehicles on a body: live ones first, then the stationary ones from the catalogue."""
    out: list[dict] = []
    live_pos = []
    if body == "mars":
        for key in MISSIONS:
            a = _live(key)
            if a:
                if trace:
                    a["trace"] = _trace(key)
                out.append(a)
                live_pos.append((a["lat"], a["lon"]))
    for s in catalog_sites(body):
        # Curiosity and Perseverance are already in the live data: do not duplicate the catalogue landing next to them.
        if body == "mars" and s["en"].startswith(("Curiosity", "Perseverance")) and live_pos:
            continue
        out.append(dict(id="site:" + s["en"], en=s["en"], agency=s["agency"], kind=s["kind"], year=s["year"],
                        lat=s["lat"], lon=s["lon"], live=False, stale=False,
                        source="Landing-site catalogue (NASA NSSDCA and agency reports)", source_url="https://nssdc.gsfc.nasa.gov/"))
    return out
