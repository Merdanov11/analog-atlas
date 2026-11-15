# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Prepares the list of named places from the IAU Gazetteer of Planetary Nomenclature.

Run:  .venv/bin/python -I server/prep_names.py

Reads data/names/<body>/*_nomenclature_center_pts.zip (feature centre points),
writes data/places/<body>.json. The .dbf table is parsed by hand, without third-party libraries.
"""
from __future__ import annotations

import json
import struct
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
SOURCES = {
    "mars": "names/mars/MARS_nomenclature_center_pts.zip",
    "moon": "names/moon/MOON_nomenclature_center_pts.zip",
}

# IAU feature type code -> our group (for the icon and the filter).
GROUPS = {
    "AA": "crater", "CA": "crater", "PE": "crater",
    "MO": "mountain", "TH": "mountain", "DO": "mountain", "CO": "mountain", "RU": "mountain",
    "SC": "mountain", "PR": "mountain", "ME": "mountain", "CM": "mountain",
    "VA": "valley", "CH": "valley", "FO": "valley", "RI": "valley", "LA": "valley", "SU": "valley",
    "CB": "valley", "FL": "valley",
    "PL": "plain", "PM": "plain", "TA": "plain", "VS": "plain", "OC": "plain", "LC": "plain",
    "SI": "plain", "PA": "plain", "RE": "plain", "AL": "plain", "UN": "plain",
    "LF": "site",
}


def read_dbf(raw: bytes):
    n, header_len, rec_len = struct.unpack("<IHH", raw[4:12])
    fields, o = [], 32
    while raw[o] != 0x0D:
        fields.append((raw[o:o + 11].split(b"\0")[0].decode(), raw[o + 16]))
        o += 32
    for k in range(n):
        rec = raw[header_len + k * rec_len: header_len + (k + 1) * rec_len]
        if rec[:1] == b"*":          # deleted record
            continue
        row, o = {}, 1
        for name, ln in fields:
            row[name] = rec[o:o + ln].decode("utf-8", "replace").strip()
            o += ln
        yield row


def build(body: str) -> None:
    z = zipfile.ZipFile(DATA / SOURCES[body])
    dbf = next(n for n in z.namelist() if n.lower().endswith(".dbf"))
    out, skipped = [], 0
    for r in read_dbf(z.read(dbf)):
        code = r["code"]
        # Moon: "satellite" craters (Copernicus A, B, ...) are skipped, there are about 7000 of them.
        # Statio (landing sites, they are in a separate mission list) is skipped as well,
        # and so is Albedo Feature (old telescope names of light and dark patches).
        if code in ("SF", "AL") or r["type"].startswith("Statio") or r["approval"] != "Adopted by IAU":
            skipped += 1
            continue
        try:
            lat, lon, diam = float(r["center_lat"]), float(r["center_lon"]), float(r["diameter"] or 0)
        except ValueError:
            skipped += 1
            continue
        if code == "ME" and body == "moon":      # Mare on the Moon is a plain (a "sea")
            group = "plain"
        else:
            group = GROUPS.get(code, "other")
        out.append(dict(
            n=r["name"], t=r["type"].split(",")[0], g=group,
            lat=round(lat, 4), lon=round((lon + 180.0) % 360.0 - 180.0, 4), d=round(diam, 1),
            o=r["origin"], u=r["link"].replace("http://", "https://"),
        ))
    out.sort(key=lambda p: -p["d"])
    dst = DATA / "places"
    dst.mkdir(exist_ok=True)
    (dst / f"{body}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    groups: dict[str, int] = {}
    for p in out:
        groups[p["g"]] = groups.get(p["g"], 0) + 1
    print(f"{body}: {len(out)} places (skipped {skipped}), by group: {groups}")


if __name__ == "__main__":
    for b in SOURCES:
        build(b)
