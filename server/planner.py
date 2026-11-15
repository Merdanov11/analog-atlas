# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""План поездки по готовому маршруту: когда едем, когда отдыхаем, чего ждём.

Маршрут проходится во времени шаг за шагом. В каждой точке проверяется:
  * не кончилась ли смена (лимит часов движения подряд) -> отдых;
  * светло ли (для тех, кто движется только днём) -> ждём рассвета;
  * укладывается ли температура поверхности в допустимый диапазон -> ждём;
  * хватает ли заряда батареи (для роверов, зарядка от Солнца) -> заряжаемся.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from environment import (SOLAR_FACTOR, conditions, dose_rate_msv_day, dust_tau, julian_date,
                         showers_between, storm_prob_per_sol, sun_state)
from i18n import lang_of, tr

STEP_H = 0.5          # шаг моделирования, часы
MAX_WAIT_H = 800.0    # дольше этого в одной точке не ждём (лунная ночь ~354 ч)


@dataclass(frozen=True)
class Rules:
    shift_h: float            # сколько часов можно двигаться подряд
    rest_h: float             # сколько длится отдых
    daylight_only: bool       # двигаться только при Солнце над горизонтом
    t_min: float              # допустимая температура поверхности, °C
    t_max: float
    battery_kwh: float | None  # ёмкость батареи (None = не моделируется)
    solar_kw: float           # мощность солнечных панелей при Солнце в зените
    standby_kw: float         # расход на стоянке
    shield: float = 1.0       # какая доля радиации доходит до экипажа
    crewed: bool = True


RULES = {
    "walker": Rules(7.0, 17.0, True, -130.0, 110.0, None, 0.0, 0.0),
    "rover_crew": Rules(10.0, 14.0, False, -180.0, 120.0, 120.0, 10.0, 0.3, shield=0.6),
    "rover_robot": Rules(5.0, 19.0, True, -100.0, 60.0, 1.5, 0.6, 0.02, crewed=False),
    # Дрон: один вылет около 7 минут, затем зарядка/дозаправка. Вылеты только днём.
    "drone": Rules(0.12, 5.0, True, -90.0, 45.0, 0.9, 0.25, 0.01, crewed=False),
}



def simulate(body: str, profile: str, seg: dict, start: datetime, lang: str = "en") -> dict:
    """seg: массивы по отрезкам маршрута: lat, lon (точки), t (с), energy (Дж), dist (м)."""
    rules = RULES[profile]
    lat, lon = seg["lat"], seg["lon"]
    seg_h = seg["t"] / 3600.0
    seg_kwh = seg["energy"] / 3.6e6
    cum_km = np.concatenate([[0.0], np.cumsum(seg["dist"])]) / 1000.0
    jd0 = julian_date(start)
    solar = SOLAR_FACTOR[body]

    clock = 0.0                 # часы от старта
    shift = 0.0                 # часы движения с последнего отдыха
    battery = rules.battery_kwh
    stops: list[dict] = []
    series: list[tuple] = []
    moving_h = night_h = 0.0
    charging = False            # начав зарядку, заряжаемся до 80 %
    t_lo, t_hi = float("inf"), float("-inf")
    feasible, reason = True, ""
    elev_m = seg["elev"]
    env = dict(ls=None, tau=0.35)      # текущие сезон и запылённость (Марс)
    risk = dict(dose=0.0, no_storm=1.0, tau_sum=0.0, tau_max=0.0, hours=0.0, season_h=0.0)

    def expose(dt: float, la: float, h_m: float):
        """Накопление рисков за dt часов: радиация и шанс попасть в пыльную бурю."""
        risk["dose"] += dose_rate_msv_day(body, h_m) / 24.0 * dt * rules.shield
        risk["hours"] += dt
        if body == "mars":
            ls = env["ls"]
            env["tau"] = tau = dust_tau(ls, la)
            risk["tau_sum"] += tau * dt
            risk["tau_max"] = max(risk["tau_max"], tau)
            risk["no_storm"] *= (1.0 - storm_prob_per_sol(ls, la)) ** (dt / 24.66)
            if 180.0 < ls < 360.0:
                risk["season_h"] += dt

    def state(i: int, frac: float = 0.0):
        la = lat[i] + (lat[min(i + 1, len(lat) - 1)] - lat[i]) * frac
        lo = lon[i] + (lon[min(i + 1, len(lon) - 1)] - lon[i]) * frac
        sun = sun_state(body, jd0 + clock / 24.0)
        env["ls"] = sun["ls"]
        return (la, lo) + conditions(body, sun, la, lo)

    def charge(dt: float, elev: float, use_kwh: float):
        nonlocal battery
        if battery is None:
            return
        dust = float(np.exp(-0.7 * (env["tau"] - 0.35))) if body == "mars" else 1.0
        gain = rules.solar_kw * solar * dust * max(0.0, np.sin(np.radians(elev))) * dt
        battery = max(0.0, min(rules.battery_kwh, battery + gain - use_kwh))

    def add_stop(kind: str, la: float, lo: float, km: float, dt: float, temp: float):
        last = stops[-1] if stops else None
        if last and last["kind"] == kind and abs(last["_km"] - km) < 1e-6 \
                and abs(last["start_h"] + last["hours"] - clock) < 1e-6:
            last["hours"] += dt
        else:
            stops.append(dict(kind=kind, lat=round(la, 4), lon=round(lo, 4), km=round(km, 2), _km=km,
                              start_h=clock, hours=dt, temp_c=round(temp)))

    for i in range(len(seg_h)):
        done = 0.0                              # пройденная доля отрезка
        while done < 1.0 - 1e-9:
            la, lo, elev, temp, _ = state(i, done)
            km = cum_km[i] + (cum_km[i + 1] - cum_km[i]) * done
            waited = 0.0
            while True:                         # ждём, пока нельзя двигаться
                left_h = seg_h[i] * (1.0 - done)
                piece = min(left_h, STEP_H)
                need = seg_kwh[i] * piece / seg_h[i] if seg_h[i] > 0 else 0.0
                if shift >= rules.shift_h - 1e-9 and rules.rest_h > 0:
                    kind, dt = "rest", rules.rest_h
                elif rules.daylight_only and elev <= 0:
                    kind, dt = "night", STEP_H
                elif not (rules.t_min <= temp <= rules.t_max):
                    kind, dt = "temp", STEP_H
                elif battery is not None and (battery < need + 0.1 * rules.battery_kwh or
                                              (charging and battery < 0.8 * rules.battery_kwh)):
                    kind, dt, charging = "charge", STEP_H, True
                else:
                    charging = False
                    break
                add_stop(kind, la, lo, km, dt, temp)
                # Отдых и долгие ожидания моделируем по шагам, чтобы батарея заряжалась верно.
                rem = dt
                while rem > 1e-9:
                    d = min(rem, STEP_H)
                    expose(d, la, elev_m[i])
                    charge(d, elev, rules.standby_kw * d)
                    clock += d
                    rem -= d
                    la, lo, elev, temp, _ = state(i, done)
                waited += dt
                if kind == "rest" or waited >= max(rules.rest_h, 6.0):
                    shift = 0.0
                if waited > MAX_WAIT_H:
                    feasible = False
                    reason = tr(lang, "plan.stuck", hours=MAX_WAIT_H, kind=tr(lang, "kind." + kind).lower())
                    break
            if not feasible:
                break
            piece = min(seg_h[i] * (1.0 - done), STEP_H, max(rules.shift_h - shift, 1e-3))
            frac = piece / seg_h[i] if seg_h[i] > 0 else 1.0
            expose(piece, la, elev_m[i])
            charge(piece, elev, seg_kwh[i] * frac)
            clock += piece
            shift += piece
            moving_h += piece
            if elev <= 0:
                night_h += piece
            t_lo, t_hi = min(t_lo, temp), max(t_hi, temp)
            series.append((km, temp, elev))
            done += frac
        if not feasible:
            break

    # Итоги по видам остановок.
    summary: dict[str, dict] = {}
    for s in stops:
        g = summary.setdefault(s["kind"], dict(title=tr(lang, "kind." + s["kind"]), count=0, hours=0.0))
        g["count"] += 1
        g["hours"] += s["hours"]
    for s in stops:
        s["title"] = tr(lang, "kind." + s["kind"])
        del s["_km"]
        s["start_h"], s["hours"] = round(s["start_h"], 1), round(s["hours"], 1)
    pick = np.unique(np.linspace(0, len(series) - 1, min(len(series), 400)).astype(int)) if series else []
    sun0 = sun_state(body, jd0)
    _, _, elev0, temp0, local0 = (lat[0], lon[0]) + conditions(body, sun0, lat[0], lon[0])
    return dict(
        risks=_risks(body, rules, risk, start, start + timedelta(hours=clock), lang),
        dose_msv=round(risk["dose"], 2), storm_p=round(1.0 - risk["no_storm"], 4),
        feasible=feasible, reason=reason,
        start_utc=start.strftime("%Y-%m-%dT%H:%MZ"),
        arrival_utc=(start + timedelta(hours=clock)).strftime("%Y-%m-%dT%H:%MZ"),
        total_h=round(clock, 1), moving_h=round(moving_h, 1), stopped_h=round(clock - moving_h, 1),
        night_share=round(night_h / moving_h, 3) if moving_h else 0.0,
        temp_min_c=round(t_lo) if series else None, temp_max_c=round(t_hi) if series else None,
        battery_end_kwh=None if battery is None else round(float(battery), 1),
        stops=stops[:500], stops_total=len(stops),
        summary=[dict(kind=k, title=v["title"], count=v["count"], hours=round(v["hours"], 1))
                 for k, v in summary.items()],
        series=[[round(float(series[i][0]), 2), round(float(series[i][1])), round(float(series[i][2]), 1)]
                for i in pick],
        sun=dict(lat=round(sun0["lat"], 2), lon=round(sun0["lon"], 2),
                 ls=None if sun0["ls"] is None else round(sun0["ls"], 1)),
        start_local_time=round(local0, 2), start_sun_elev=round(elev0, 1), start_temp_c=round(temp0),
    )


def _risks(body: str, rules: Rules, risk: dict, start: datetime, end: datetime, lang: str) -> list[dict]:
    """Оценка рисков поездки: уровень low / mid / high и пояснение."""
    out = []
    days = risk["hours"] / 24.0

    if body == "mars":
        p = 1.0 - risk["no_storm"]
        tau = risk["tau_sum"] / risk["hours"] if risk["hours"] else 0.35
        share = risk["season_h"] / risk["hours"] if risk["hours"] else 0.0
        level = "low" if p < 0.10 else "mid" if p < 0.40 else "high"
        season = (tr(lang, "risk.season.out") if share < 0.05 else
                  tr(lang, "risk.season.all") if share > 0.95 else
                  tr(lang, "risk.season.part", pct=round(share * 100)))
        out.append(dict(kind="dust", title=tr(lang, "risk.dust"), level=level,
                        text=tr(lang, "risk.dust.mars", p=round(p * 100), season=season,
                                tau=tau, tmax=risk["tau_max"])))
        out.append(dict(kind="meteor", title=tr(lang, "risk.meteor.mars"), level="low",
                        text=tr(lang, "risk.meteor.mars.text")))
    else:
        out.append(dict(kind="dust", title=tr(lang, "risk.dust"), level="low",
                        text=tr(lang, "risk.dust.moon")))
        sh = showers_between(start, end)
        if sh:
            top = max(s["zhr"] for s in sh)
            level = "high" if top >= 100 and rules.crewed and rules.shield >= 1.0 else "mid"
            names = ", ".join(f"{s[lang_of(lang)]} ({s['peak']})" for s in sh[:5])
            out.append(dict(kind="meteor", title=tr(lang, "risk.meteor.moon"), level=level,
                            text=tr(lang, "risk.meteor.some", names=names)))
        else:
            out.append(dict(kind="meteor", title=tr(lang, "risk.meteor.moon"), level="low",
                            text=tr(lang, "risk.meteor.none")))

    dose = risk["dose"]
    if rules.crewed:
        level = "low" if dose < 50 else "mid" if dose < 250 else "high"
        text = tr(lang, "risk.rad.crew", days=days, dose=dose, x=dose / 2.4)
    else:
        level, text = "low", tr(lang, "risk.rad.robot", days=days, dose=dose)
    out.append(dict(kind="radiation", title=tr(lang, "risk.radiation"), level=level, text=text))
    return out
