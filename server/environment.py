# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""The Sun and the surface temperature on the Moon and Mars at a given moment.

These are educational models: the Sun position is computed from astronomical formulas
(accuracy a few degrees), the temperature from simplified formulas
fitted to typical measured values. Shadows of mountains are not taken into account.
"""
from __future__ import annotations

import math
from datetime import datetime

SOLAR_FACTOR = {"moon": 1.0, "mars": 0.35}   # fraction of solar power at the surface
DAY_HOURS = {"moon": 708.73, "mars": 24.66}  # length of a solar day in Earth hours


def julian_date(dt: datetime) -> float:
    return dt.timestamp() / 86400.0 + 2440587.5


def _wrap180(x: float) -> float:
    return (x + 180.0) % 360.0 - 180.0


def sun_state(body: str, jd: float) -> dict:
    """Subsolar point (where the Sun is at the zenith) and the distance to the Sun."""
    if body == "moon":
        # Mean elongation of the Moon (Meeus). Full moon (D=180) -> the Sun is over longitude 0.
        t = (jd - 2451545.0) / 36525.0
        d = (297.8501921 + 445267.1114034 * t) % 360.0
        return dict(lat=0.0, lon=_wrap180(180.0 - d), r=1.0, ls=None)

    # Mars: the Mars24 algorithm (Allison & McEwen, 2000).
    jd_tt = jd + 69.184 / 86400.0
    dj = jd_tt - 2451545.0
    m = math.radians((19.3871 + 0.52402073 * dj) % 360.0)
    afms = (270.3871 + 0.524038496 * dj) % 360.0
    eoc = ((10.691 + 3.0e-7 * dj) * math.sin(m) + 0.623 * math.sin(2 * m) + 0.050 * math.sin(3 * m)
           + 0.005 * math.sin(4 * m) + 0.0005 * math.sin(5 * m))
    ls = (afms + eoc) % 360.0
    lr = math.radians(ls)
    eot = 2.861 * math.sin(2 * lr) - 0.071 * math.sin(4 * lr) + 0.002 * math.sin(6 * lr) - eoc
    mtc = (24.0 * ((jd_tt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626)) % 24.0
    decl = math.degrees(math.asin(0.42565 * math.sin(lr))) + 0.25 * math.sin(lr)
    r = 1.52367934 * (1.00436 - 0.09309 * math.cos(m) - 0.004336 * math.cos(2 * m)
                      - 0.00031 * math.cos(3 * m) - 0.00003 * math.cos(4 * m))
    return dict(lat=decl, lon=_wrap180(-(mtc * 15.0 + eot + 180.0)), r=r, ls=ls)


def conditions(body: str, sun: dict, lat: float, lon: float) -> tuple[float, float, float]:
    """Returns (Sun elevation above the horizon in degrees, surface temperature in °C,
    local solar time in hours 0..24)."""
    h = _wrap180(lon - sun["lon"])          # hour angle: 0 = noon, >0 = after noon
    phi, dec, hr = math.radians(lat), math.radians(sun["lat"]), math.radians(h)
    sin_el = math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(hr)
    elev = math.degrees(math.asin(max(-1.0, min(1.0, sin_el))))
    local = (12.0 + h / 15.0) % 24.0

    if body == "moon":
        night = max(40.0, 95.0 * max(math.cos(phi), 1e-3) ** 0.15)   # before dawn, K
        if sin_el > 0:
            temp = max(392.0 * sin_el ** 0.25, night + (25.0 if h > 0 else 0.0))
        else:
            p = min(1.0, ((h - 90.0) % 360.0) / 180.0)               # fraction of the night that has passed
            temp = night + 25.0 * (1.0 - p)
    else:
        cz_noon = math.cos(math.radians(lat - sun["lat"]))
        if cz_noon <= 0.02:                                          # polar night
            temp = 148.0
        else:
            tmax = max(150.0, 301.0 * cz_noon ** 0.25 * math.sqrt(1.524 / sun["r"]))
            tmin = max(148.0, tmax - 105.0 * cz_noon ** 0.5)
            if 6.0 <= local <= 13.0:
                s = math.sin(math.pi / 2 * (local - 6.0) / 7.0)
            elif 13.0 < local <= 18.0:
                s = 0.35 + 0.65 * math.cos(math.pi / 2 * (local - 13.0) / 5.0)
            else:
                s = 0.35 * math.exp(-((local - 18.0) % 24.0) / 4.0)
            temp = tmin + (tmax - tmin) * s
    return elev, temp - 273.15, local


# ---------------------------------------------------------------- stage 3: risks

def dust_tau(ls: float, lat: float) -> float:
    """Typical dust opacity of the Martian atmosphere (optical depth) by season and latitude.
    Storm season: Ls 180-360 (spring and summer of the southern hemisphere), peak around Ls 270."""
    season = math.sin(math.radians(ls - 180.0)) ** 0.7 if 180.0 < ls < 360.0 else 0.0
    south = 1.0 - 0.3 * lat / 90.0                      # there is more dust in the south
    return 0.35 + 0.75 * season * south * (0.6 + 0.4 * math.cos(math.radians(lat)))


def storm_prob_per_sol(ls: float, lat: float) -> float:
    """Probability of meeting a dust storm (regional or global) within one Martian day.
    Global storms happen about once every three Martian years."""
    season = math.sin(math.radians(ls - 180.0)) if 180.0 < ls < 360.0 else 0.0
    regional = 0.002 + 0.02 * season * (1.0 - 0.3 * lat / 90.0)
    return regional + (0.0011 if 180.0 <= ls <= 330.0 else 0.0)


def dose_rate_msv_day(body: str, elev_m: float) -> float:
    """Surface radiation, mSv per day. Moon: Chang'e-4 measurement (1.37).
    Mars: Curiosity measurement in Gale crater (0.67 at an elevation of -4.4 km);
    the higher up, the thinner the atmosphere overhead and the larger the dose."""
    if body == "moon":
        return 1.37
    return max(0.5, min(1.3, 0.67 * (1.0 + 0.04 * (elev_m / 1000.0 + 4.4))))


# Major meteor showers: name, month and day of the peak, half-width (days), ZHR.
SHOWERS = [
    ("Quadrantids", 1, 3, 1, 110), ("Lyrids", 4, 22, 1, 18),
    ("Eta Aquariids", 5, 6, 3, 50),
    ("Southern Delta Aquariids", 7, 30, 3, 25),
    ("Perseids", 8, 12, 2, 100), ("Orionids", 10, 21, 2, 20),
    ("Leonids", 11, 17, 1, 15), ("Geminids", 12, 14, 2, 150),
    ("Ursids", 12, 22, 1, 10),
]


def showers_between(start: datetime, end: datetime) -> list[dict]:
    """Meteor showers whose peak falls within the trip time."""
    from datetime import timedelta
    out = []
    for year in range(start.year - 1, end.year + 2):
        for en, mo, day, hw, zhr in SHOWERS:
            peak = datetime(year, mo, day, tzinfo=start.tzinfo)
            if peak - timedelta(days=hw) <= end and peak + timedelta(days=hw + 1) >= start:
                out.append(dict(en=en, peak=peak.strftime("%Y-%m-%d"), zhr=zhr))
            if len(out) >= 12:
                return out
    return out
