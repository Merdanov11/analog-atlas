# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Server: serves the web map, the presentation and computes routes.

Run:  .venv/bin/uvicorn app:app --app-dir server --port 8000
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

import assets as assets_mod
import terrain
from multiplayer import hub
from envcost import make_env
from environment import julian_date, sun_state
from i18n import tr
from planner import RULES, simulate
from routing import GRIDS, MODES, PROFILES, Body, NoRoute, find_route
from sites import sites as landing_sites

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
PLACES = ROOT / "data" / "places"

app = FastAPI(title="Far from Earth")
BODIES: dict[str, Body] = {
    name: Body(name) for name in ("moon", "mars") if (GRIDS / name / "meta.json").exists()
}


@app.middleware("http")
async def no_stale_pages(request, call_next):
    """The browser revalidates the site pages with the server every time so that it never shows an old version."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


def _body(name: str, lang: str) -> Body:
    if name not in BODIES:
        raise HTTPException(404, tr(lang, "err.no_dem"))
    return BODIES[name]


def _when(start: str | None, lang: str) -> datetime:
    try:
        when = datetime.fromisoformat(start.replace("Z", "+00:00")) if start else datetime.now(timezone.utc)
    except ValueError:
        raise HTTPException(400, tr(lang, "err.time_format"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    if not 1900 <= when.year <= 2200:
        raise HTTPException(400, tr(lang, "err.time_range"))
    return when


@app.get("/api/meta")
def meta(lang: str = "en"):
    return dict(
        bodies={k: dict(resolution_m=round(b.cell_m(0)), radius=b.radius) for k, b in BODIES.items()},
        profiles={k: dict(title=tr(lang, "profile." + k), speed_kmh=p.speed_kmh, max_slope=p.max_slope)
                  for k, p in PROFILES.items()},
        modes={k: tr(lang, "mode." + k) for k in MODES},
    )


@app.get("/api/places")
def places(body: str):
    """Named features from the IAU gazetteer (craters, mountains, valleys, plains)."""
    if body not in ("moon", "mars") or not (PLACES / f"{body}.json").exists():
        raise HTTPException(404, tr("en", "err.body"))
    return FileResponse(PLACES / f"{body}.json", media_type="application/json",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/sites")
def sites(body: str):
    """Landing sites of spacecraft."""
    return landing_sites(body)


@app.get("/api/elevation")
def elevation(body: str, lat: float = Query(ge=-90, le=90), lon: float = 0.0, lang: str = "en"):
    b = _body(body, lang)
    h, w = b.shape(0)
    r = min(h - 1, max(0, int((90.0 - lat) / 180.0 * h)))
    c = int(((lon + 180.0) % 360.0) / 360.0 * w) % w
    return dict(elev_m=int(b.elev[0][r, c]), slope_deg=float(b.slope[0][r, c]) * b.unit)


@app.get("/api/sun")
def sun(body: str, start: str | None = None, lang: str = "en"):
    """The point where the Sun stands at the zenith (to draw day and night)."""
    if body not in ("moon", "mars"):
        raise HTTPException(404, tr(lang, "err.body"))
    s = sun_state(body, julian_date(_when(start, lang)))
    return dict(lat=round(s["lat"], 3), lon=round(s["lon"], 3), ls=s["ls"])


@app.get("/api/route")
def route(body: str,
          lat1: float = Query(ge=-90, le=90), lon1: float = 0.0,
          lat2: float = Query(ge=-90, le=90), lon2: float = 0.0,
          profile: str = "rover_crew", mode: str = "fast", start: str | None = None,
          lang: str = "en"):
    b = _body(body, lang)
    if profile not in PROFILES or mode not in MODES:
        raise HTTPException(400, tr(lang, "err.profile"))
    when = _when(start, lang)
    t0 = time.time()
    try:
        res = find_route(b, lat1, lon1, lat2, lon2, profile, mode)
    except NoRoute:
        raise HTTPException(422, tr(lang, "err.no_route"))
    seg = res.pop("_segments", None)
    plan = simulate(body, profile, seg, when, lang) if seg else None
    cond = dict(applied=False, text=tr(lang, "cond.none"))

    # Second pass: the same search, but cells that are dark, too cold or too hot at the estimated arrival time
    # (and, in safe mode, also dangerous) cost more.
    if plan and plan["total_h"] > 0 and res["distance_m"] > 0 and profile != "drone":
        speed = res["distance_m"] / plan["total_h"]          # m/h including stops
        env = make_env(body, b.radius, profile, mode, when, lat1, lon1, speed)
        try:
            res2 = find_route(b, lat1, lon1, lat2, lon2, profile, mode, env=env)
            plan2 = simulate(body, profile, res2.pop("_segments"), when, lang)
        except NoRoute:
            res2 = plan2 = None
        if res2 and abs(res2["distance_m"] - res["distance_m"]) > 1.0:
            dk = (res2["distance_m"] - res["distance_m"]) / 1000.0
            dh = plan2["total_h"] - plan["total_h"]
            dist = tr(lang, "cond.longer" if dk >= 0 else "cond.shorter", km=abs(dk))
            dtime = tr(lang, "cond.slower" if dh >= 0 else "cond.faster", h=abs(dh))
            # In safe mode on Mars the second pass also lowers radiation and storm risk,
            # so we take it even if it is not faster.
            risk_mode = mode == "safe" and body == "mars" and RULES[profile].crewed
            text = None
            if plan2["feasible"] and not plan["feasible"]:
                text = tr(lang, "cond.infeasible", dist=dist)
            elif plan2["feasible"] and plan["feasible"]:
                # A detour is justified only if it saves noticeable time: at least 5 % and 1 hour.
                # Otherwise the extra kilometres (fatigue, energy, radiation) do not pay off.
                if plan2["total_h"] < plan["total_h"] - max(1.0, 0.05 * plan["total_h"]):
                    text = tr(lang, "cond.time", dist=dist, time=dtime)
                elif (risk_mode and plan2["total_h"] <= 1.15 * plan["total_h"]
                      and (plan2["dose_msv"] < 0.97 * plan["dose_msv"]
                           or plan2["storm_p"] < plan["storm_p"] - 0.02)):
                    # We take it only if the risk really dropped and the trip is not much longer.
                    text = tr(lang, "cond.risk", dist=dist, time=dtime,
                              d2=plan2["dose_msv"], d1=plan["dose_msv"],
                              s2=round(plan2["storm_p"] * 100), s1=round(plan["storm_p"] * 100))
            if text:
                cond = dict(applied=True, delta_km=round(dk, 1), delta_h=round(dh, 1), text=text)
                res, plan = res2, plan2
    res["plan"] = plan
    res["conditions"] = cond
    res["compute_s"] = round(time.time() - t0, 2)
    return res


@app.get("/api/sim/patch")
def sim_patch(body: str, lat0: float = Query(ge=-90, le=90), lon0: float = 0.0,
              x0: float = -1000.0, x1: float = 1000.0, y0: float = -1000.0, y1: float = 1000.0,
              res: float = Query(4.0, ge=2.0, le=16.0), density: float = Query(1.0, ge=0.0, le=3.0),
              lang: str = "en"):
    """Detailed terrain around a route stage for the simulator (binary response, see terrain.patch)."""
    if body not in ("moon", "mars"):
        raise HTTPException(404, tr(lang, "err.body"))
    if not (x1 > x0 and y1 > y0):
        raise HTTPException(400, "bad window")
    try:
        data = terrain.patch(body, lat0, lon0, x0, x1, y0, y1, res, density)
    except ValueError:
        raise HTTPException(413, "patch too large")
    return Response(data, media_type="application/octet-stream", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/sim/sun")
def sim_sun(body: str, start: str | None = None, hours: float = Query(48.0, gt=0, le=4000), n: int = Query(97, ge=2, le=4001),
            lang: str = "en"):
    """Subsolar point at n moments over hours hours: the simulator computes the Sun at any point from it."""
    if body not in ("moon", "mars"):
        raise HTTPException(404, tr(lang, "err.body"))
    when = _when(start, lang)
    jd0 = julian_date(when)
    lat, lon, r, ls = [], [], [], []
    prev = None
    for i in range(n):
        s = sun_state(body, jd0 + hours * i / (n - 1) / 24.0)
        lo = s["lon"]
        if prev is not None:                       # make the longitude continuous
            lo += 360.0 * round((prev - lo) / 360.0)
        prev = lo
        lat.append(round(s["lat"], 4)); lon.append(round(lo, 4)); r.append(round(s["r"], 5))
        ls.append(None if s["ls"] is None else round(s["ls"], 3))
    return dict(start=when.isoformat(), hours=hours, n=n, lat=lat, lon=lon, r=r, ls=ls)


@app.get("/api/assets")
def api_assets(body: str, trace: bool = False, lang: str = "en"):
    """Real vehicles on a body: live positions of Perseverance and Curiosity (NASA) and catalogue landings."""
    if body not in ("moon", "mars"):
        raise HTTPException(404, tr(lang, "err.body"))
    return assets_mod.assets(body, trace)


@app.get("/api/players")
def api_players(body: str | None = None):
    """Who is playing in the simulator right now (for markers on the map)."""
    return dict(online=hub.online(body), players=hub.list_players(body))


@app.websocket("/ws/sim")
async def ws_sim(ws: WebSocket):
    await hub.handle(ws)


@app.get("/presentation")
def presentation():
    return FileResponse(WEB / "presentation.html")


app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
