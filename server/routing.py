# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Поиск маршрута по поверхности Луны и Марса.

Идея:
  1. Поверхность = сетка ячеек (широта/долгота) с высотой и средним уклоном.
  2. Между соседними ячейками (8 направлений) считается стоимость перехода:
     время, энергия и штраф за риск. Слишком крутые переходы запрещены.
  3. Алгоритм Дейкстры находит путь с минимальной суммарной стоимостью.
     «Обходить кратер или ехать насквозь» решается само: что дешевле.
  4. Чтобы длинные маршруты считались быстро, поиск идёт от грубой сетки
     к подробной: сначала общий путь, потом уточнение в коридоре вокруг него.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

GRIDS = Path(__file__).resolve().parent.parent / "data" / "grids"

MAX_NODES = 1_000_000   # максимум ячеек в окне грубого поиска
CHUNK = 96              # длина куска пути при уточнении (в грубых ячейках)
HALF = 2                # полуширина коридора уточнения (в грубых ячейках)
DIRS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


@dataclass(frozen=True)
class Profile:
    key: str
    title: str
    speed_kmh: float    # скорость по ровной поверхности
    max_slope: float    # предельный уклон, градусы
    k_up: float         # насколько подъём замедляет
    k_down: float       # насколько спуск замедляет
    k_rough: float      # насколько неровность местности замедляет
    mass: float         # кг (с грузом / скафандром)
    crr: float          # сопротивление движению
    p_base: float       # Вт: постоянный расход (жизнеобеспечение, электроника)

    @property
    def speed(self) -> float:
        return self.speed_kmh / 3.6


PROFILES = {
    p.key: p for p in [
        Profile("walker", "walker", 3.0, 25.0, 3.5, 2.0, 2.0, 200.0, 0.25, 300.0),
        Profile("rover_crew", "rover_crew", 10.0, 20.0, 3.0, 1.0, 3.0, 1500.0, 0.15, 1000.0),
        Profile("rover_robot", "rover_robot", 0.15, 15.0, 3.0, 1.0, 3.0, 900.0, 0.15, 100.0),
        # Дрон летит по дуге большого круга, рельеф не ограничивает путь; p_base = мощность висения.
        Profile("drone", "drone", 30.0, 89.0, 0.3, 0.1, 0.0, 30.0, 0.0, 3000.0),
    ]
}

MODES = {
    "fast": dict(w_safe=0.0),
    "safe": dict(w_safe=6.0),
    "eco": dict(w_safe=0.0),
}


class NoRoute(Exception):
    pass


class Body:
    def __init__(self, name: str):
        d = GRIDS / name
        self.meta = json.loads((d / "meta.json").read_text())
        self.name = name
        self.radius: float = self.meta["radius"]
        self.gravity: float = self.meta["gravity"]
        self.levels: int = self.meta["levels"]
        self.unit: float = self.meta["slope_unit"]
        self.elev = [np.load(d / f"L{k}_elev.npy", mmap_mode="r") for k in range(self.levels)]
        self.slope = [np.load(d / f"L{k}_slope.npy", mmap_mode="r") for k in range(self.levels)]

    def shape(self, lvl: int) -> tuple[int, int]:
        return self.elev[lvl].shape

    def cell_m(self, lvl: int) -> float:
        return self.radius * math.pi / self.shape(lvl)[0]

    def lat_rows(self, lvl: int, rows) -> np.ndarray:
        return 90.0 - (np.asarray(rows) + 0.5) * 180.0 / self.shape(lvl)[0]

    def lon_cols(self, lvl: int, cols) -> np.ndarray:
        return (np.asarray(cols) + 0.5) * 360.0 / self.shape(lvl)[1] - 180.0

    def window(self, lvl: int, r0: int, r1: int, c0: int, c1: int):
        """Высоты (м) и уклоны (град.) окна. Столбцы могут выходить за 0..W: долгота замкнута."""
        w = self.shape(lvl)[1]
        if 0 <= c0 and c1 <= w:
            e, s = self.elev[lvl][r0:r1, c0:c1], self.slope[lvl][r0:r1, c0:c1]
        else:
            cols = np.arange(c0, c1) % w
            e, s = self.elev[lvl][r0:r1][:, cols], self.slope[lvl][r0:r1][:, cols]
        return np.asarray(e, dtype=np.float32), np.asarray(s, dtype=np.float32) * self.unit

    def sample(self, lvl: int, rows: np.ndarray, cols: np.ndarray):
        w = self.shape(lvl)[1]
        e = np.asarray(self.elev[lvl][rows, cols % w], dtype=np.float64)
        s = np.asarray(self.slope[lvl][rows, cols % w], dtype=np.float64) * self.unit
        return e, s


def move_cost(d, dh, slope_dst, prof: Profile, mode: str, gravity: float):
    """Стоимость перехода: d = расстояние по горизонтали (м), dh = перепад высот (м),
    slope_dst = средний уклон местности в ячейке назначения (градусы)."""
    g = dh / d
    sdir = np.degrees(np.arctan(np.abs(g)))                 # уклон по ходу движения
    rough = np.tan(np.radians(np.minimum(slope_dst, 60.0)))
    v = prof.speed * np.exp(-np.where(g > 0, prof.k_up, prof.k_down) * np.abs(g)
                            - prof.k_rough * rough)
    t = np.hypot(d, dh) / v                                 # секунды
    energy = prof.mass * gravity * (prof.crr * d + np.maximum(dh, 0.0)) + prof.p_base * t
    if mode == "eco":
        cost = energy
    else:
        worst = np.maximum(sdir, slope_dst) / prof.max_slope
        cost = t * (1.0 + MODES[mode]["w_safe"] * worst ** 2)
    return cost, t, energy, sdir


def _solve(body: Body, lvl: int, r0: int, r1: int, c0: int, c1: int,
           src: tuple[int, int], dst: tuple[int, int], prof: Profile, mode: str,
           mask: np.ndarray | None = None, wrap: bool = False, env=None):
    """Кратчайший путь внутри окна. Возвращает список ячеек (строка, столбец) или None."""
    if src == dst:
        return [src]
    elev, slope = body.window(lvl, r0, r1, c0, c1)
    h, w = elev.shape
    # Поправка на условия среды (свет, температура, риски): множитель на въезд в ячейку.
    mult = env(body.lat_rows(lvl, np.arange(r0, r1))[:, None],
               body.lon_cols(lvl, np.arange(c0, c1))[None, :], elev) \
        if env is not None else None
    s = (src[0] - r0, src[1] - c0)
    t = (dst[0] - r0, dst[1] - c0)
    ok = slope <= prof.max_slope
    if mask is not None:
        ok &= mask
    ok[s] = ok[t] = True          # старт и финиш разрешены всегда
    idx = np.arange(h * w, dtype=np.int32).reshape(h, w)
    coslat = np.maximum(np.cos(np.radians(body.lat_rows(lvl, np.arange(r0, r1)))), 1e-4)
    cell = body.cell_m(lvl)

    rows, cols, data = [], [], []
    for dr, dc in DIRS:
        ra, rb = max(0, -dr), min(h, h - dr)
        if wrap:
            ca, cb = 0, w
            dcols = (np.arange(w) + dc) % w
        else:
            ca, cb = max(0, -dc), min(w, w - dc)
            dcols = slice(ca + dc, cb + dc)
        S = (slice(ra, rb), slice(ca, cb))
        D = (slice(ra + dr, rb + dr), dcols)
        cm = (coslat[ra:rb] + coslat[ra + dr:rb + dr]) / 2
        d = np.hypot(dr * cell, dc * cell * cm)[:, None]
        cost, _, _, sdir = move_cost(d, elev[D] - elev[S], slope[D], prof, mode, body.gravity)
        if mult is not None:
            cost = cost * mult[D]
        valid = ok[S] & ok[D] & (sdir <= prof.max_slope)
        rows.append(idx[S][valid])
        cols.append(idx[D][valid])
        data.append(cost[valid])

    n = h * w
    graph = csr_matrix((np.concatenate(data), (np.concatenate(rows), np.concatenate(cols))),
                       shape=(n, n))
    si, ti = int(idx[s]), int(idx[t])
    dist, pred = dijkstra(graph, directed=True, indices=si, return_predecessors=True)
    if not np.isfinite(dist[ti]):
        return None
    path = [ti]
    while path[-1] != si:
        path.append(int(pred[path[-1]]))
    path.reverse()
    return [(p // w + r0, p % w + c0) for p in path]


def _unwrap(path, w: int):
    """Убирает скачки столбцов через линию ±180° (после поиска по замкнутому кольцу)."""
    out, shift = [path[0]], 0
    for (r, c), (_, pc) in zip(path[1:], path[:-1]):
        if c - pc > w // 2:
            shift -= w
        elif pc - c > w // 2:
            shift += w
        out.append((r, c + shift))
    return out


def _refine(body: Body, lvl: int, path, a_fine, b_fine, prof: Profile, mode: str, env=None):
    """Уточняет путь уровня lvl на уровне lvl-1 внутри узкого коридора, кусками."""
    lf = lvl - 1
    hf = body.shape(lf)[0]
    out = [a_fine]
    cur, i, n, exact = a_fine, 0, len(path), True
    while True:
        j = min(i + CHUNK, n)
        last = j == n
        cells = path[i:j]
        rs = [p[0] for p in cells]
        cs = [p[1] for p in cells]
        cr0, cr1 = max(0, min(rs) - HALF), min(body.shape(lvl)[0], max(rs) + HALF + 1)
        cc0, cc1 = min(cs) - HALF, max(cs) + HALF + 1
        m = np.zeros((cr1 - cr0, cc1 - cc0), dtype=bool)
        for r, c in cells:
            m[max(0, r - HALF - cr0):r + HALF + 1 - cr0, c - HALF - cc0:c + HALF + 1 - cc0] = True
        mask = np.repeat(np.repeat(m, 2, axis=0), 2, axis=1)
        r0, r1, c0, c1 = 2 * cr0, min(hf, 2 * cr1), 2 * cc0, 2 * cc1
        mask = mask[:r1 - r0]
        if last:
            target = b_fine
        else:  # промежуточная точка: самая ровная из 4 подробных ячеек грубой ячейки
            r, c = cells[-1]
            _, sl = body.window(lf, 2 * r, 2 * r + 2, 2 * c, 2 * c + 2)
            k = int(np.argmin(sl))
            target = (2 * r + k // 2, 2 * c + k % 2)
        part = _solve(body, lf, r0, r1, c0, c1, cur, target, prof, mode, mask=mask, env=env)
        if part is None:          # в коридоре прохода нет: оставляем грубый отрезок
            part, exact = [cur, target], False
        out.extend(part[1:])
        cur = target
        if last:
            break
        i = j - 1
    return out, exact


def find_route(body: Body, lat1: float, lon1: float, lat2: float, lon2: float,
               profile: str = "rover_crew", mode: str = "fast", env=None,
               smooth: bool = True) -> dict:
    prof = PROFILES[profile]
    if mode not in MODES:
        raise ValueError("неизвестный режим")
    if profile == "drone":
        return _drone_route(body, lat1, lon1, lat2, lon2, prof, mode)
    h0, w0 = body.shape(0)

    def cell0(lat, lon):
        r = min(h0 - 1, max(0, int((90.0 - lat) / 180.0 * h0)))
        c = int(((lon + 180.0) % 360.0) / 360.0 * w0) % w0
        return r, c

    (ra, ca), (rb, cb) = cell0(lat1, lon1), cell0(lat2, lon2)
    if cb - ca > w0 // 2:         # короче идти через линию ±180°
        cb -= w0
    elif ca - cb > w0 // 2:
        cb += w0

    # 1. Грубый поиск: самый подробный уровень, на котором окно помещается в лимит.
    for lvl in range(body.levels):
        s = 1 << lvl
        h, w = body.shape(lvl)
        a, b = (ra // s, ca // s), (rb // s, cb // s)
        m = max(24, max(abs(a[0] - b[0]), abs(a[1] - b[1])) // 2)
        r0, r1 = max(0, min(a[0], b[0]) - m), min(h, max(a[0], b[0]) + m + 1)
        c0, c1 = min(a[1], b[1]) - m, max(a[1], b[1]) + m + 1
        wrap = c1 - c0 >= w
        if wrap:
            c0, c1, a, b = 0, w, (a[0], a[1] % w), (b[0], b[1] % w)
        if (r1 - r0) * (c1 - c0) <= MAX_NODES:
            break
    path = _solve(body, lvl, r0, r1, c0, c1, a, b, prof, mode, wrap=wrap, env=env)
    if path is None:
        raise NoRoute("no passable route")
    if wrap:
        path = _unwrap(path, w)
    # Система отсчёта столбцов могла сдвинуться на целый оборот: подгоняем A и B под путь.
    ca += (path[0][1] - ca // s) * s
    cb += (path[-1][1] - cb // s) * s

    # 2. Уточнение: уровень за уровнем до самой подробной сетки.
    exact = True
    while lvl > 0:
        lf = lvl - 1
        path, ok = _refine(body, lvl, path, (ra >> lf, ca >> lf), (rb >> lf, cb >> lf), prof, mode, env)
        exact &= ok
        lvl = lf

    # 3. Точки пути: центры ячеек, концы ставим точно в выбранные места.
    lat = body.lat_rows(0, np.array([p[0] for p in path])).astype(float)
    lon = body.lon_cols(0, np.array([p[1] for p in path])).astype(float)
    lat[0], lat[-1] = lat1, lat2
    lon[0] = lon1 + 360.0 * round((lon[0] - lon1) / 360.0)
    lon[-1] = lon2 + 360.0 * round((lon[-1] - lon2) / 360.0)

    # 4. Сглаживание: ломаную по сетке заменяем дугами там, где это не дороже.
    if smooth and len(lat) > 2:
        lat, lon = _smooth(body, lat, lon, prof, mode, env)
    return _summary(body, lat, lon, lat1, lon1, lat2, lon2, prof, mode, exact)


def _drone_route(body: Body, la1: float, lo1: float, la2: float, lo2: float, prof: Profile, mode: str) -> dict:
    """Полёт по прямой (дуге большого круга) с шагом около 150 м."""
    dist = float(_haversine(body.radius, la1, lo1, la2, lo2))
    lat, lon = _arc(la1, lo1, la2, lo2, max(1, math.ceil(dist / 150.0)))
    return _summary(body, lat, lon, la1, lo1, la2, lo2, prof, mode, True)


def _haversine(radius, la1, lo1, la2, lo2):
    p1, p2 = np.radians(la1), np.radians(la2)
    x = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lo2 - lo1) / 2) ** 2
    return 2 * radius * np.arcsin(np.sqrt(np.clip(x, 0, 1)))


def _sample(body: Body, lat, lon):
    """Высота (плавно, по 4 соседним ячейкам) и уклон местности (ближайшая ячейка) в точках."""
    h, w = body.shape(0)
    fr = np.clip((90.0 - lat) / 180.0 * h - 0.5, 0.0, h - 1.0)
    fc = (lon + 180.0) / 360.0 * w - 0.5
    r0, c0 = np.floor(fr).astype(np.int64), np.floor(fc).astype(np.int64)
    r1 = np.minimum(r0 + 1, h - 1)
    tr, tc = fr - r0, fc - c0
    e, s = body.elev[0], body.slope[0]
    c0m, c1m = c0 % w, (c0 + 1) % w
    elev = ((1 - tr) * ((1 - tc) * e[r0, c0m] + tc * e[r0, c1m])
            + tr * ((1 - tc) * e[r1, c0m] + tc * e[r1, c1m]))
    rn = np.clip(np.rint(fr), 0, h - 1).astype(np.int64)
    slope = np.asarray(s[rn, np.rint(fc).astype(np.int64) % w], dtype=np.float64) * body.unit
    return np.asarray(elev, dtype=np.float64), slope


def _arc(la1, lo1, la2, lo2, k: int):
    """k+1 точек на дуге большого круга (кратчайшая линия на шаре) между двумя точками."""
    p1, l1, p2, l2 = map(math.radians, (la1, lo1, la2, lo2))
    a = np.array([math.cos(p1) * math.cos(l1), math.cos(p1) * math.sin(l1), math.sin(p1)])
    b = np.array([math.cos(p2) * math.cos(l2), math.cos(p2) * math.sin(l2), math.sin(p2)])
    om = math.acos(max(-1.0, min(1.0, float(a @ b))))
    t = np.linspace(0.0, 1.0, k + 1)[:, None]
    v = (1 - t) * a + t * b if om < 1e-9 else (np.sin((1 - t) * om) * a + np.sin(t * om) * b) / math.sin(om)
    lat = np.degrees(np.arcsin(np.clip(v[:, 2], -1, 1)))
    lon = np.degrees(np.unwrap(np.arctan2(v[:, 1], v[:, 0])))
    lon += lo1 - lon[0]                       # та же «развёртка» долготы, что у пути
    lat[0], lat[-1] = la1, la2
    lon[-1] = lo2 + 360.0 * round((lon[-1] - lo2) / 360.0)
    return lat, lon


def _steps_cost(body: Body, lat, lon, prof: Profile, mode: str, env):
    """Стоимость каждого шага ломаной по точкам (inf, если шаг слишком крутой)."""
    elev, slope = _sample(body, lat, lon)
    d = np.maximum(_haversine(body.radius, lat[:-1], lon[:-1], lat[1:], lon[1:]), 1e-3)
    with np.errstate(divide="ignore", over="ignore", invalid="ignore"):   # обрывы -> inf, это нормально
        cost, _, _, sdir = move_cost(d, np.diff(elev), slope[1:], prof, mode, body.gravity)
    if env is not None:
        cost = cost * env(lat[1:], lon[1:], elev[1:])
    bad = (sdir > prof.max_slope) | ~np.isfinite(cost)
    bad[:-1] |= slope[1:-1] > prof.max_slope  # конечная точка шага-финиша разрешена всегда
    return np.where(bad, np.inf, cost)


def _smooth(body: Body, lat, lon, prof: Profile, mode: str, env):
    """«Натягивание нити»: от текущей точки ищем самую дальнюю точку пути, до которой
    можно дойти по дуге не дороже, чем по ломаной. Проверяется та же стоимость и те же
    запреты по уклону, что и при поиске, поэтому дуга не срезает через крутые склоны."""
    n = len(lat)
    step = body.cell_m(0)
    seg = _steps_cost(body, lat, lon, prof, mode, env)
    seg = np.where(np.isfinite(seg), seg, 0.0)          # исходный путь считаем допустимым
    prefix = np.concatenate([[0.0], np.cumsum(seg)])
    cache: dict = {}

    def arc(i: int, j: int):
        if (i, j) not in cache:
            dist = float(_haversine(body.radius, lat[i], lon[i], lat[j], lon[j]))
            cache[(i, j)] = _arc(lat[i], lon[i], lat[j], lon[j], max(1, math.ceil(dist / step)))
        return cache[(i, j)]

    def ok(i: int, j: int) -> bool:
        if j == i + 1:
            return True
        la, lo = arc(i, j)
        return float(_steps_cost(body, la, lo, prof, mode, env).sum()) <= (prefix[j] - prefix[i]) * (1 + 1e-9)

    # Шаг 1. Жадно: от каждой опорной точки ищем самую дальнюю достижимую по дуге.
    anchors = [0]
    i = 0
    while i < n - 1:
        lo_j, span = i + 1, 2
        while i + span <= n - 1 and ok(i, i + span):   # ускоренный поиск: шаг удваивается
            lo_j, span = i + span, span * 2
        hi_j = min(i + span, n - 1)
        if hi_j > lo_j and ok(i, hi_j):
            lo_j = hi_j
        else:
            while hi_j - lo_j > 1:                      # деление пополам
                mid = (lo_j + hi_j) // 2
                if ok(i, mid):
                    lo_j = mid
                else:
                    hi_j = mid
        anchors.append(lo_j)
        cache.clear()
        i = lo_j

    # Шаг 2. Убираем лишние изломы: если из точки k-1 в точку k+1 по одной дуге не дороже,
    # чем через точку k, точка k не нужна. Повторяем, пока что-то убирается.
    def arc_pts(p, q):
        dist = float(_haversine(body.radius, p[0], p[1], q[0], q[1]))
        return _arc(p[0], p[1], q[0], q[1], max(1, math.ceil(dist / step)))

    def arc_cost(p, q) -> float:
        return float(_steps_cost(body, *arc_pts(p, q), prof, mode, env).sum())

    pts = [(float(lat[k]), float(lon[k])) for k in anchors]
    # raw[m] = True, если отрезок m это один исходный шаг по сетке: его не пересчитываем.
    raw = [b == a + 1 for a, b in zip(anchors[:-1], anchors[1:])]
    costs = [float(prefix[b] - prefix[a]) if r else arc_cost(pts[m], pts[m + 1])
             for m, (a, b, r) in enumerate(zip(anchors[:-1], anchors[1:], raw))]

    def merge(k: int, c: int, cost: float):
        """Заменяет точки k..c одной дугой k -> c."""
        del pts[k + 1:c]
        costs[k:c] = [cost]
        raw[k:c] = [False]

    def sweep() -> bool:
        removed, k = False, 1
        while k < len(pts) - 1:
            c = arc_cost(pts[k - 1], pts[k + 1])
            if c <= (costs[k - 1] + costs[k]) * (1 + 1e-9):
                merge(k - 1, k + 1, c)
                removed = True
            else:
                k += 1
        return removed

    for _ in range(8):
        if not sweep():
            break

    # Шаг 3. Дальние спрямления: соседние точки иногда нельзя соединить из-за одной
    # неровной ячейки, хотя длинная дуга мимо неё проходит. Пробуем дуги до конца пути,
    # до середины, до четверти и так далее (с ограничением на объём вычислений).
    budget = 3_000_000
    k = 0
    while k < len(pts) - 2 and budget > 0:
        c = len(pts) - 1
        while c > k + 1 and budget > 0:
            budget -= int(_haversine(body.radius, pts[k][0], pts[k][1], pts[c][0], pts[c][1]) / step) + 1
            cost = arc_cost(pts[k], pts[c])
            if cost <= sum(costs[k:c]) * (1 + 1e-9):
                merge(k, c, cost)
                break
            c = k + (c - k) // 2
        k += 1
    sweep()

    out_lat, out_lon = [np.array(pts[0][:1])], [np.array(pts[0][1:])]
    for p, q, r in zip(pts[:-1], pts[1:], raw):
        la, lo = (np.array([p[0], q[0]]), np.array([p[1], q[1]])) if r else arc_pts(p, q)
        out_lat.append(la[1:])
        out_lon.append(lo[1:])
    # Долготу делаем непрерывной (без скачков на 360° между соседними дугами).
    return np.concatenate(out_lat), np.unwrap(np.concatenate(out_lon), period=360.0)


def _summary(body: Body, lat, lon, lat1, lon1, lat2, lon2, prof: Profile, mode: str, exact: bool) -> dict:
    elev, slope = _sample(body, lat, lon)
    res = dict(
        body=body.name, profile=prof.key, mode=mode, exact=bool(exact),
        resolution_m=round(body.cell_m(0)),
        straight_m=float(_haversine(body.radius, lat1, lon1, lat2, lon2)),
        points=[[round(float(a), 5), round(float(o), 5)] for a, o in zip(lat, lon)],
        start_elev_m=float(elev[0]), end_elev_m=float(elev[-1]),
    )
    d = np.maximum(_haversine(body.radius, lat[:-1], lon[:-1], lat[1:], lon[1:]), 1e-3)
    if len(lat) < 2 or float(d.sum()) < 1.0:
        res.update(distance_m=0.0, time_s=0.0, energy_kwh=0.0, ascent_m=0.0, descent_m=0.0,
                   max_slope_deg=0.0, elevation=[[0.0, float(elev[0])]])
        return res

    dh = np.diff(elev)
    _, t, energy, sdir = move_cost(d, dh, slope[1:], prof, mode, body.gravity)
    dist3d = np.hypot(d, dh)
    cum = np.concatenate([[0.0], np.cumsum(dist3d)])
    pick = np.unique(np.linspace(0, len(lat) - 1, min(len(lat), 400)).astype(int))
    res.update(
        distance_m=float(dist3d.sum()),
        time_s=float(t.sum()),
        energy_kwh=float(energy.sum() / 3.6e6),
        ascent_m=float(dh[dh > 0].sum()),
        descent_m=float(-dh[dh < 0].sum()),
        max_slope_deg=float(sdir.max()),
        elevation=[[round(float(cum[i]) / 1000, 3), float(elev[i])] for i in pick],
    )
    # Данные по отрезкам для планировщика (сервер убирает их из ответа).
    res["_segments"] = dict(lat=lat, lon=lon, t=t, energy=energy, dist=dist3d, elev=elev)
    return res
