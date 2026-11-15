# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Солнце и температура поверхности на Луне и Марсе в заданный момент времени.

Это учебные модели: положение Солнца считается по астрономическим формулам
(точность несколько градусов), температура — по упрощённым формулам,
подогнанным под типичные измеренные значения. Тени от гор не учитываются.
"""
from __future__ import annotations

import math
from datetime import datetime

SOLAR_FACTOR = {"moon": 1.0, "mars": 0.35}   # доля солнечной мощности у поверхности
DAY_HOURS = {"moon": 708.73, "mars": 24.66}  # длина солнечных суток в земных часах


def julian_date(dt: datetime) -> float:
    return dt.timestamp() / 86400.0 + 2440587.5


def _wrap180(x: float) -> float:
    return (x + 180.0) % 360.0 - 180.0


def sun_state(body: str, jd: float) -> dict:
    """Подсолнечная точка (где Солнце в зените) и расстояние до Солнца."""
    if body == "moon":
        # Средняя элонгация Луны (Meeus). Полнолуние (D=180) -> Солнце над долготой 0.
        t = (jd - 2451545.0) / 36525.0
        d = (297.8501921 + 445267.1114034 * t) % 360.0
        return dict(lat=0.0, lon=_wrap180(180.0 - d), r=1.0, ls=None)

    # Марс: алгоритм Mars24 (Allison & McEwen, 2000).
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
    """Возвращает (высота Солнца над горизонтом в градусах, температура поверхности в °C,
    местное солнечное время в часах 0..24)."""
    h = _wrap180(lon - sun["lon"])          # часовой угол: 0 = полдень, >0 = после полудня
    phi, dec, hr = math.radians(lat), math.radians(sun["lat"]), math.radians(h)
    sin_el = math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(hr)
    elev = math.degrees(math.asin(max(-1.0, min(1.0, sin_el))))
    local = (12.0 + h / 15.0) % 24.0

    if body == "moon":
        night = max(40.0, 95.0 * max(math.cos(phi), 1e-3) ** 0.15)   # перед рассветом, К
        if sin_el > 0:
            temp = max(392.0 * sin_el ** 0.25, night + (25.0 if h > 0 else 0.0))
        else:
            p = min(1.0, ((h - 90.0) % 360.0) / 180.0)               # доля прошедшей ночи
            temp = night + 25.0 * (1.0 - p)
    else:
        cz_noon = math.cos(math.radians(lat - sun["lat"]))
        if cz_noon <= 0.02:                                          # полярная ночь
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


# ---------------------------------------------------------------- этап 3: риски

def dust_tau(ls: float, lat: float) -> float:
    """Типичная запылённость атмосферы Марса (оптическая толщина) по сезону и широте.
    Сезон бурь: Ls 180-360 (весна и лето южного полушария), пик около Ls 270."""
    season = math.sin(math.radians(ls - 180.0)) ** 0.7 if 180.0 < ls < 360.0 else 0.0
    south = 1.0 - 0.3 * lat / 90.0                      # на юге пыли больше
    return 0.35 + 0.75 * season * south * (0.6 + 0.4 * math.cos(math.radians(lat)))


def storm_prob_per_sol(ls: float, lat: float) -> float:
    """Вероятность за одни марсианские сутки оказаться в пыльной буре (региональной
    или глобальной). Глобальные бури случаются примерно раз в три марсианских года."""
    season = math.sin(math.radians(ls - 180.0)) if 180.0 < ls < 360.0 else 0.0
    regional = 0.002 + 0.02 * season * (1.0 - 0.3 * lat / 90.0)
    return regional + (0.0011 if 180.0 <= ls <= 330.0 else 0.0)


def dose_rate_msv_day(body: str, elev_m: float) -> float:
    """Радиация на поверхности, мЗв в сутки. Луна: измерение Chang'e-4 (1,37).
    Марс: измерение Curiosity в кратере Гейл (0,67 на высоте -4,4 км);
    чем выше, тем тоньше атмосфера над головой и тем больше доза."""
    if body == "moon":
        return 1.37
    return max(0.5, min(1.3, 0.67 * (1.0 + 0.04 * (elev_m / 1000.0 + 4.4))))


# Крупные метеорные потоки: название, месяц и день максимума, полуширина (сут), ZHR.
SHOWERS = [
    ("Quadrantids", "Квадрантиды", 1, 3, 1, 110), ("Lyrids", "Лириды", 4, 22, 1, 18),
    ("Eta Aquariids", "Эта-Аквариды", 5, 6, 3, 50),
    ("Southern Delta Aquariids", "Южные Дельта-Аквариды", 7, 30, 3, 25),
    ("Perseids", "Персеиды", 8, 12, 2, 100), ("Orionids", "Ориониды", 10, 21, 2, 20),
    ("Leonids", "Леониды", 11, 17, 1, 15), ("Geminids", "Геминиды", 12, 14, 2, 150),
    ("Ursids", "Урсиды", 12, 22, 1, 10),
]


def showers_between(start: datetime, end: datetime) -> list[dict]:
    """Метеорные потоки, максимум которых попадает на время поездки."""
    from datetime import timedelta
    out = []
    for year in range(start.year - 1, end.year + 2):
        for en, ru, mo, day, hw, zhr in SHOWERS:
            peak = datetime(year, mo, day, tzinfo=start.tzinfo)
            if peak - timedelta(days=hw) <= end and peak + timedelta(days=hw + 1) >= start:
                out.append(dict(en=en, ru=ru, peak=peak.strftime("%Y-%m-%d"), zhr=zhr))
            if len(out) >= 12:
                return out
    return out
