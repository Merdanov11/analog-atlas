# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Correction of the path cost for environmental conditions: light, temperature, radiation, storms.

Returns, for a window of the grid, a multiplier of the cost of entering each cell (>= 1).

Moon. A day lasts 29.5 Earth days, so WHEN we are in a cell matters.
The arrival time is estimated as the distance from the start divided by the mean speed
including stops (given by the first pass without corrections). If moving is not allowed there
at that moment (night for those who drive only by day, or a temperature outside the limits),
the cell becomes more expensive: standing and waiting for a long time.

Mars. A day is almost like on Earth and the trip is longer than a day, so the time of day is averaged:
the fraction of the day when moving is possible at the given latitude in the given season is computed.
If this window is shorter than a working shift (in winter at high latitudes), the cell becomes more expensive.

In the "safe" mode for a crew on Mars, radiation (higher on
highlands) and the probability of a dust storm (depends on season and latitude) are added.
"""
from __future__ import annotations

import math
from datetime import datetime

import numpy as np

from environment import DAY_HOURS, julian_date, sun_state
from planner import RULES

BLOCKED = 3.0        # how many times more expensive a cell is where moving is not allowed at the arrival moment
DARK_SOLAR = 1.3     # darkness penalty for those who charge from the Sun


def moon_cond_np(lat, h):
    """Sun elevation (sine) and temperature (°C) on the Moon; h = hour angle, degrees."""
    phi = np.radians(lat)
    sin_el = np.cos(phi) * np.cos(np.radians(h))
    night = np.maximum(40.0, 95.0 * np.maximum(np.cos(phi), 1e-3) ** 0.15)
    day = np.maximum(392.0 * np.clip(sin_el, 0.0, 1.0) ** 0.25, night + np.where(h > 0, 25.0, 0.0))
    p = np.minimum(1.0, ((h - 90.0) % 360.0) / 180.0)
    return sin_el, np.where(sin_el > 0, day, night + 25.0 * (1.0 - p)) - 273.15


def mars_cond_np(lat, local, sun):
    """Sun elevation (sine) and temperature (°C) on Mars; local = local time, hours."""
    phi, dec = np.radians(lat), math.radians(sun["lat"])
    sin_el = np.sin(phi) * math.sin(dec) + np.cos(phi) * math.cos(dec) * np.cos(np.radians((local - 12.0) * 15.0))
    cz = np.cos(np.radians(lat - sun["lat"]))
    czc = np.clip(cz, 0.02, 1.0)
    tmax = np.maximum(150.0, 301.0 * czc ** 0.25 * math.sqrt(1.524 / sun["r"]))
    tmin = np.maximum(148.0, tmax - 105.0 * czc ** 0.5)
    s = np.where((local >= 6) & (local <= 13), np.sin(np.pi / 2 * (local - 6.0) / 7.0),
                 np.where((local > 13) & (local <= 18), 0.35 + 0.65 * np.cos(np.pi / 2 * (local - 13.0) / 5.0),
                          0.35 * np.exp(-((local - 18.0) % 24.0) / 4.0)))
    return sin_el, np.where(cz <= 0.02, 148.0, tmin + (tmax - tmin) * s) - 273.15


def _mars_availability(lat, sun, rules) -> np.ndarray:
    """How many hours per day at latitude lat moving is really possible: the window of suitable
    conditions, but not more than the shift length (a long day beyond the shift gives nothing)."""
    local = (np.arange(48) / 2.0)[None, :]
    sin_el, temp = mars_cond_np(np.asarray(lat, dtype=float)[:, None], local, sun)
    ok = (temp >= rules.t_min) & (temp <= rules.t_max)
    if rules.daylight_only:
        ok &= sin_el > 0
    return np.minimum(ok.mean(axis=1) * DAY_HOURS["mars"], rules.shift_h)


def make_env(body: str, radius: float, profile: str, mode: str, start: datetime,
             lat0: float, lon0: float, speed_m_per_h: float):
    rules = RULES[profile]
    sun0 = sun_state(body, julian_date(start))

    if body == "moon":
        drift = 360.0 / DAY_HOURS["moon"]            # degrees per hour: the Sun moves west
        p0, l0 = math.radians(lat0), math.radians(lon0)

        def env(lat, lon, elev):
            """lat, lon, elev: arrays of consistent shape (a grid or points along a line)."""
            la, lo = np.radians(lat), np.radians(lon)
            cosd = np.sin(p0) * np.sin(la) + np.cos(p0) * np.cos(la) * np.cos(lo - l0)
            hours = radius * np.arccos(np.clip(cosd, -1.0, 1.0)) / speed_m_per_h
            h = (lon - (sun0["lon"] - drift * hours) + 180.0) % 360.0 - 180.0
            sin_el, temp = moon_cond_np(lat, h)
            ok = (temp >= rules.t_min) & (temp <= rules.t_max)
            if rules.daylight_only:
                ok &= sin_el > 0
            mult = np.where(ok, 1.0, BLOCKED)
            if rules.battery_kwh is not None and not rules.daylight_only:
                mult = mult * np.where(sin_el > 0, 1.0, DARK_SOLAR)
            return mult.astype(np.float32)
        return env

    best = max(float(_mars_availability(np.linspace(-90, 90, 181), sun0, rules).max()), 0.5)
    ls = sun0["ls"]
    season = math.sin(math.radians(ls - 180.0)) if 180.0 < ls < 360.0 else 0.0
    glob = 0.0011 if 180.0 <= ls <= 330.0 else 0.0

    def env(lat, lon, elev):
        lat = np.asarray(lat, dtype=float)
        avail = np.maximum(_mars_availability(lat.ravel(), sun0, rules), 0.5).reshape(lat.shape)
        mult = np.minimum(best / avail, 6.0)
        if mode == "safe" and rules.crewed:
            dose = np.clip(0.67 * (1.0 + 0.04 * (elev / 1000.0 + 4.4)), 0.5, 1.3)
            storm = 0.002 + 0.02 * season * (1.0 - 0.3 * lat / 90.0) + glob
            mult = mult * (1.0 + 0.5 * (dose / 0.67 - 1.0)) * (1.0 + 10.0 * storm)
        shape = np.broadcast_shapes(lat.shape, np.shape(lon), np.shape(elev))
        return np.broadcast_to(mult, shape).astype(np.float32)
    return env
