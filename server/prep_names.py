# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Готовит список названных мест из справочника IAU (Gazetteer of Planetary Nomenclature).

Запуск:  .venv/bin/python -I server/prep_names.py

Читает data/names/<тело>/*_nomenclature_center_pts.zip (точки центров объектов),
пишет data/places/<тело>.json. Таблица .dbf разбирается вручную, без сторонних библиотек.
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

# Код типа объекта IAU -> наша группа (для значка и фильтра).
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
        if rec[:1] == b"*":          # удалённая запись
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
        # Луна: «спутниковые» кратеры (Copernicus A, B, ...) не берём, их около 7000.
        # Не берём также Statio (места посадок, они есть в отдельном списке миссий)
        # и Albedo Feature (старые телескопные названия светлых и тёмных пятен).
        if code in ("SF", "AL") or r["type"].startswith("Statio") or r["approval"] != "Adopted by IAU":
            skipped += 1
            continue
        try:
            lat, lon, diam = float(r["center_lat"]), float(r["center_lon"]), float(r["diameter"] or 0)
        except ValueError:
            skipped += 1
            continue
        if code == "ME" and body == "moon":      # Mare на Луне это равнина («море»)
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
    print(f"{body}: {len(out)} мест (пропущено {skipped}), по группам: {groups}")


if __name__ == "__main__":
    for b in SOURCES:
        build(b)
