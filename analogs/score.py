# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Similarity scoring between a Moon/Mars target and Earth windows.

The same formulas are implemented in JavaScript in docs/atlas/index.html; tests/atlas_parity.py checks that both give
the same numbers. Terrain, environment and process/resource similarity are each in 0..1; the total is a weighted mean.
"""
from __future__ import annotations

import numpy as np

SIGMA_T, SIGMA_E = 0.6, 1.4
ENV_W = np.array([1.0, 0.5, 1.0, 0.5, 0.5, 0.5])     # tmean, annual temperature range, ln(1+precip), ln(pressure), wind, UV index
DEFAULT_W = (0.5, 0.3, 0.2)


def terrain_vec(smed, sp90, relief, rough):
    return np.stack([np.log1p(smed), np.log1p(sp90), np.log1p(relief), np.log1p(rough)], axis=-1)


def pressure_kpa(elev_m):
    return 101.325 * np.exp(-np.maximum(elev_m, 0.0) / 8434.0)


def env_vec(tmean, tdiur, precip_mm, p_kpa, wind, uv):
    return np.stack([tmean, tdiur, np.log1p(precip_mm), np.log(np.maximum(p_kpa, 1e-3)), wind, uv], axis=-1)


def jsd(p, q):
    """Jensen-Shannon divergence in bits (0..1) between histograms along the last axis."""
    eps = 1e-9
    p = np.asarray(p) + eps
    q = np.asarray(q) + eps
    p = p / p.sum(-1, keepdims=True)
    q = q / q.sum(-1, keepdims=True)
    m = 0.5 * (p + q)
    return 0.5 * (p * np.log2(p / m)).sum(-1) + 0.5 * (q * np.log2(q / m)).sum(-1)


def earth_proxies(tmean, precip_mm, wind, volc_km):
    ice = np.clip((4.0 - tmean) / 6.0, 0, 1)
    aeol = np.clip(wind / 6.0, 0, 1) * np.clip(1 - precip_mm / 500.0, 0, 1)
    volc = np.where(volc_km > 150.0, 0.0, np.exp(-volc_km / 40.0))
    return ice, aeol, volc


def score(target: dict, earth: dict, meta: dict, w=DEFAULT_W):
    """target: terrain dict + env_values + ice/aeolian/volcanic; earth: arrays. Returns (total, T, E, R)."""
    mu, sd = np.array(meta["terrain_mean"]), np.array(meta["terrain_std"])
    tt = target["terrain"]
    zt = (terrain_vec(tt["slope_med"], tt["slope_p90"], tt["relief"], tt["rough"]) - mu) / sd
    zw = (terrain_vec(earth["smed"], earth["sp90"], earth["relief"], earth["rough"]) - mu) / sd
    d2 = ((zw - zt) ** 2).mean(-1) + 4.0 * jsd(np.asarray(tt["hist"]), earth["hist"])
    T = np.exp(-d2 / (2 * SIGMA_T ** 2))

    ev = target["env_values"]
    tv = env_vec(ev["tmean"], ev["tmax"] - ev["tmin"], ev["precip_mm"], max(ev["p_kpa"], 1e-3), ev["wind"], ev["uv"])
    lo, hi = np.array(meta["env_q01"]), np.array(meta["env_q99"])
    tv = np.clip(tv, lo, hi)
    esd = np.array(meta["env_std"])
    ew = env_vec(earth["tmean"], earth["tdiur"], earth["precip"], pressure_kpa(earth["elev"]), earth["wind"], earth["uv"])
    d2e = (ENV_W * ((ew - tv) / esd) ** 2).sum(-1) / ENV_W.sum()
    E = np.exp(-d2e / (2 * SIGMA_E ** 2))

    ice, aeol, volc = earth_proxies(earth["tmean"], earth["precip"], earth["wind"], earth["volc_km"])
    R = 1.0 - (np.abs(target["ice"] - ice) + np.abs(target["aeolian"] - aeol) + np.abs(target["volcanic"] - volc)) / 3.0
    total = (w[0] * T + w[1] * E + w[2] * R) / (w[0] + w[1] + w[2])
    return total, T, E, R
