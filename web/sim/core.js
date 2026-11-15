// Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
/* Ядро симулятора: геометрия планеты, рельеф, физика вездехода и пешехода, среда, автопилот.
   Файл не зависит от браузера (работает и в Node), поэтому физику можно проверять тестами.
   Системы координат: мир = локальная плоскость ENU (x восток, y север, z вверх), метры.
   Тело вездехода: x вперёд, y влево, z вверх. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ======================================================================= геометрия планеты
const Geo = {
  basis(lat0, lon0) {
    const p = lat0 * D2R, l = lon0 * D2R;
    return {
      e: [-Math.sin(l), Math.cos(l), 0],
      n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
      u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
    };
  },
  /** Точка (lat, lon) -> [x, y, z] в локальной системе с началом в (lat0, lon0). */
  toEnu(R, lat0, lon0, lat, lon) {
    const b = Geo.basis(lat0, lon0), p = lat * D2R, l = lon * D2R;
    const vx = Math.cos(p) * Math.cos(l), vy = Math.cos(p) * Math.sin(l), vz = Math.sin(p);
    return [R * (vx * b.e[0] + vy * b.e[1]), R * (vx * b.n[0] + vy * b.n[1] + vz * b.n[2]),
            R * (vx * b.u[0] + vy * b.u[1] + vz * b.u[2] - 1)];
  },
  /** Точка над плоскостью (x, y) -> [lat, lon] в градусах. */
  toLatLon(R, lat0, lon0, x, y) {
    const b = Geo.basis(lat0, lon0), up = Math.sqrt(Math.max(R * R - x * x - y * y, 1));
    const vx = x * b.e[0] + y * b.n[0] + up * b.u[0];
    const vy = x * b.e[1] + y * b.n[1] + up * b.u[1];
    const vz = x * b.e[2] + y * b.n[2] + up * b.u[2];
    return [Math.asin(clamp(vz / R, -1, 1)) * R2D, Math.atan2(vy, vx) * R2D];
  },
  dist(R, la1, lo1, la2, lo2) {
    const p1 = la1 * D2R, p2 = la2 * D2R, dl = (lo2 - lo1) * D2R;
    const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(clamp(a, 0, 1)));
  },
  wrap180: x => ((x + 180) % 360 + 360) % 360 - 180,
};

// ======================================================================= хеш и шум
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 0x2545F491)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85EBCA6B);
  h ^= h >>> 15;
  return h >>> 0;
}
const rnd = (ix, iy, seed) => (hash2(ix, iy, seed) & 0xFFFFFF) / 16777216;
function vnoise(x, y, seed) {   // значение шума в диапазоне -1..1
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = rnd(ix, iy, seed), b = rnd(ix + 1, iy, seed), c = rnd(ix, iy + 1, seed), d = rnd(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}

// ======================================================================= рельеф
// Мелкие кратеры (дополняют серверные, что от 16 м): диаметр 2-16 м; степенной закон N(>D) ~ D^-2.
const SMALL_BANDS = [[2, 4], [4, 8], [8, 16]];
const SATURATION = 0.012;

class Terrain {
  /** hdr и z — ответ /api/sim/patch. opt: gx0, gy0 (глобальные координаты начала куска, для кратеров и камней). */
  constructor(hdr, z, opt = {}) {
    this.nx = hdr.nx; this.ny = hdr.ny; this.res = hdr.res; this.x0 = hdr.x0; this.y0 = hdr.y0;
    this.h0 = hdr.h0; this.R = hdr.radius; this.g = hdr.gravity; this.body = hdr.body;
    this.lat0 = hdr.lat0; this.lon0 = hdr.lon0;
    this.x1 = this.x0 + (this.nx - 1) * this.res; this.y1 = this.y0 + (this.ny - 1) * this.res;
    this.z = z; this.craters = hdr.craters || [];
    this.gx0 = opt.gx0 || 0; this.gy0 = opt.gy0 || 0;
    this.seed = opt.seed != null ? opt.seed : (hdr.body === 'moon' ? 11 : 23);
    this.smallK = (opt.smallDensity != null ? opt.smallDensity : 0.6) * (hdr.body === 'mars' ? 0.9 : 1);
    this.rockK = opt.rocks != null ? opt.rocks : 1;
    this._cc = new Map(); this._rc = new Map();
  }

  /** Высота по сетке сервера (билинейно); за краем куска значение продолжается. */
  grid(x, y) {
    let fx = (x - this.x0) / this.res, fy = (y - this.y0) / this.res;
    if (fx < 0) fx = 0; else if (fx > this.nx - 1.001) fx = this.nx - 1.001;
    if (fy < 0) fy = 0; else if (fy > this.ny - 1.001) fy = this.ny - 1.001;
    // Бикубическая (Catmull-Rom) интерполяция: поверхность гладкая, без «граней» билинейной сетки.
    const nx = this.nx, ny = this.ny, z = this.z, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const i0 = ix > 0 ? ix - 1 : 0, i2 = ix + 1, i3 = ix + 2 < nx ? ix + 2 : nx - 1;
    const r = (j) => {
      const o = j * nx, p0 = z[o + i0], p1 = z[o + ix], p2 = z[o + i2], p3 = z[o + i3];
      return p1 + 0.5 * tx * (p2 - p0 + tx * (2 * p0 - 5 * p1 + 4 * p2 - p3 + tx * (3 * (p1 - p2) + p3 - p0)));
    };
    const j0 = iy > 0 ? iy - 1 : 0, j2 = iy + 1, j3 = iy + 2 < ny ? iy + 2 : ny - 1;
    const q0 = r(j0), q1 = r(iy), q2 = r(j2), q3 = r(j3);
    return q1 + 0.5 * ty * (q2 - q0 + ty * (2 * q0 - 5 * q1 + 4 * q2 - q3 + ty * (3 * (q1 - q2) + q3 - q0)));
  }
  micro(x, y) {   // рябь грунта: сантиметры-дециметры
    const gx = x + this.gx0, gy = y + this.gy0;
    return 0.09 * vnoise(gx / 6, gy / 6, 1) + 0.04 * vnoise(gx / 2.5, gy / 2.5, 2) + 0.016 * vnoise(gx, gy, 3);
  }
  _craterCell(b, ci, cj) {
    const key = ((ci + 1048576) * 2097152 + (cj + 1048576)) * 4 + b;
    let c = this._cc.get(key);
    if (c) return c;
    const [dlo, dhi] = SMALL_BANDS[b], s = 4 * dhi;
    const per = 0.75 * 1.54 * SATURATION * this.smallK * (dlo / 1000) ** -2 * (s / 1000) ** 2;
    const mod = clamp(1 + 0.9 * vnoise((ci + 0.5) * s / 300, (cj + 0.5) * s / 300, 700 + b), 0.15, 2.2);
    const out = [];
    for (let slot = 0; slot < 2; slot++) {
      const seed = this.seed * 1000 + b * 10 + slot;
      if (rnd(ci, cj, seed) >= clamp(per * mod / 2, 0, 1)) continue;
      const u1 = rnd(ci, cj, seed + 1), u2 = rnd(ci, cj, seed + 2), u3 = rnd(ci, cj, seed + 3), u4 = rnd(ci, cj, seed + 4);
      const D = dlo * Math.pow(1 - 0.75 * u3, -0.5), degr = 0.2 + 0.5 * Math.pow(1 - u4, 2.5);
      out.push((ci + u1) * s, (cj + u2) * s, D / 2, (this.body === 'mars' ? 0.12 : 0.15) * D * degr, 0.04 * D * degr);
    }
    c = Float64Array.from(out);
    if (this._cc.size > 30000) this._cc.clear();
    this._cc.set(key, c);
    return c;
  }
  craterH(x, y) {
    const gx = x + this.gx0, gy = y + this.gy0;
    let h = 0;
    for (let b = 0; b < 3; b++) {
      const s = 4 * SMALL_BANDS[b][1], reach = 1.75 * SMALL_BANDS[b][1];
      const i0 = Math.floor((gx - reach) / s), i1 = Math.floor((gx + reach) / s);
      const j0 = Math.floor((gy - reach) / s), j1 = Math.floor((gy + reach) / s);
      for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
        const c = this._craterCell(b, ci, cj);
        for (let k = 0; k < c.length; k += 5) {
          const dx = gx - c[k], dy = gy - c[k + 1], R = c[k + 2];
          const r2 = (dx * dx + dy * dy) / (R * R);
          if (r2 > 12.25) continue;
          const r = Math.sqrt(r2);
          h += r <= 1 ? -c[k + 3] * (1 - r2) + c[k + 4] * r2 * r2 : c[k + 4] / (r2 * r);
        }
      }
    }
    return h;
  }
  _rockCell(ci, cj) {
    const key = (ci + 1048576) * 2097152 + (cj + 1048576);
    let c = this._rc.get(key);
    if (c) return c;
    const s = 6, mod = clamp(1 + 0.8 * vnoise((ci + 0.5) * s / 120, (cj + 0.5) * s / 120, 900), 0.1, 2.0);
    const lam = 2.2 * this.rockK * mod, out = [];
    for (let slot = 0; slot < 4; slot++) {
      const seed = this.seed * 77 + slot * 5;
      if (rnd(ci, cj, seed) >= clamp(lam / 4, 0, 1)) continue;
      const u1 = rnd(ci, cj, seed + 1), u2 = rnd(ci, cj, seed + 2), u3 = rnd(ci, cj, seed + 3);
      const r = 0.11 * Math.pow(1 - u3 * (1 - Math.pow(0.11 / 1.3, 2.2)), -1 / 2.2);
      out.push((ci + u1) * s, (cj + u2) * s, r);
    }
    c = Float64Array.from(out);
    if (this._rc.size > 30000) this._rc.clear();
    this._rc.set(key, c);
    return c;
  }
  rockH(x, y) {
    if (this.rockK <= 0) return 0;
    const gx = x + this.gx0, gy = y + this.gy0;
    let h = 0;
    const i0 = Math.floor((gx - 1.7) / 6), i1 = Math.floor((gx + 1.7) / 6);
    const j0 = Math.floor((gy - 1.7) / 6), j1 = Math.floor((gy + 1.7) / 6);
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
      const c = this._rockCell(ci, cj);
      for (let k = 0; k < c.length; k += 3) {
        const dx = gx - c[k], dy = gy - c[k + 1], r = c[k + 2], q = 1 - (dx * dx + dy * dy) / (r * r);
        if (q > 0) h = Math.max(h, 0.5 * r * Math.pow(q, 0.75));   // наполовину вросший камень: пологий, чтобы не цеплять колёса
      }
    }
    return h;
  }
  /** Камни в прямоугольнике: callback(x, y, r). Нужен рендеру. */
  forEachRock(xa, xb, ya, yb, cb) {
    if (this.rockK <= 0) return;
    const i0 = Math.floor((xa + this.gx0) / 6), i1 = Math.floor((xb + this.gx0) / 6);
    const j0 = Math.floor((ya + this.gy0) / 6), j1 = Math.floor((yb + this.gy0) / 6);
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
      const c = this._rockCell(ci, cj);
      for (let k = 0; k < c.length; k += 3) {
        const x = c[k] - this.gx0, y = c[k + 1] - this.gy0;
        if (x >= xa && x < xb && y >= ya && y < yb) cb(x, y, c[k + 2]);
      }
    }
  }
  heightBase(x, y) { return this.grid(x, y) + this.micro(x, y) + this.craterH(x, y); }
  height(x, y) { return this.heightBase(x, y) + this.rockH(x, y); }
  /** Нормаль поверхности (единичный вектор) в out. */
  normal(x, y, out, e = 0.35) {
    const dx = this.height(x - e, y) - this.height(x + e, y), dy = this.height(x, y - e) - this.height(x, y + e);
    const k = 1 / Math.sqrt(dx * dx + dy * dy + 4 * e * e);
    out[0] = dx * k; out[1] = dy * k; out[2] = 2 * e * k;
    return out;
  }
  /** Уклон (градусы) на масштабе step метров. */
  slopeDeg(x, y, step = 1.5) {
    const dx = (this.height(x + step, y) - this.height(x - step, y)) / (2 * step);
    const dy = (this.height(x, y + step) - this.height(x, y - step)) / (2 * step);
    return Math.atan(Math.hypot(dx, dy)) * R2D;
  }
  /** Абсолютная высота над базовой сферой, м (для табло). */
  altitude(x, y, z) { return this.h0 + z + (x * x + y * y) / (2 * this.R); }
}

// ======================================================================= кватернионы
const qmul = (a, b) => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
function qnorm(q) { const k = 1 / Math.hypot(q.w, q.x, q.y, q.z); q.w *= k; q.x *= k; q.y *= k; q.z *= k; return q; }
/** Оси тела в мире: столбцы матрицы вращения. */
function axes(q, o) {
  const { x, y, z, w } = q;
  o.fx = 1 - 2 * (y * y + z * z); o.fy = 2 * (x * y + w * z); o.fz = 2 * (x * z - w * y);       // вперёд
  o.lx = 2 * (x * y - w * z); o.ly = 1 - 2 * (x * x + z * z); o.lz = 2 * (y * z + w * x);       // влево
  o.ux = 2 * (x * z + w * y); o.uy = 2 * (y * z - w * x); o.uz = 1 - 2 * (x * x + y * y);       // вверх
  return o;
}
/** Кватернион по трём осям (вперёд, влево, вверх), ортонормальным. */
function qFromAxes(f, l, u) {
  const m00 = f[0], m10 = f[1], m20 = f[2], m01 = l[0], m11 = l[1], m21 = l[2], m02 = u[0], m12 = u[1], m22 = u[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = { w: s / 4, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s }; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = { w: (m21 - m12) / s, x: s / 4, y: (m01 + m10) / s, z: (m02 + m20) / s }; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: s / 4, z: (m12 + m21) / s }; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: s / 4 }; }
  return qnorm(q);
}

// ======================================================================= конфигурации техники
/** Базовые параметры; уровни улучшений применяются в applyUpgrades. Согласованы с правилами планировщика сервера. */
const VEHICLES = {
  rover_crew: {
    key: 'rover_crew', crewed: true, mass: 1500, wheelR: 0.42, wheelW: 0.34, wheelI: 9, L0: 0.42, droop: 0.18,
    mounts: [[1.2, 1.1, 0.12], [1.2, -1.1, 0.12], [-1.2, 1.1, 0.12], [-1.2, -1.1, 0.12]],
    steer: [1, 1, -0.45, -0.45], steerMax: 34 * D2R,
    hull: [1.7, 1.15, 0.40, 0.14], cgDrop: 0, freq: 1.45, zeta: 0.68,
    vmax: 3.9, power: 12000, tpeak: 650, brakeT: 900, mu: 0.58, crr: 0.15, aux: 1.0,
    batteryKwh: 120, solarKw: 10, tMin: -180, tMax: 120, shield: 0.6, daylightOnly: false,
    thermC: 420e3, thermK: 1.7, heaterW: 600, shiftH: 10,
  },
  rover_robot: {
    key: 'rover_robot', crewed: false, mass: 900, wheelR: 0.26, wheelW: 0.22, wheelI: 1.6, L0: 0.32, droop: 0.16,
    mounts: [[1.0, 0.85, 0.08], [1.0, -0.85, 0.08], [0, 0.9, 0.08], [0, -0.9, 0.08], [-1.0, 0.85, 0.08], [-1.0, -0.85, 0.08]],
    steer: [1, 1, 0, 0, -1, -1], steerMax: 38 * D2R,
    hull: [0.95, 0.7, 0.26, 0.1], cgDrop: 0, freq: 1.3, zeta: 0.7,
    vmax: 0.32, power: 520, tpeak: 105, brakeT: 160, mu: 0.55, crr: 0.15, aux: 0.1,
    batteryKwh: 1.5, solarKw: 0.6, tMin: -100, tMax: 60, shield: 1, daylightOnly: true,
    thermC: 90e3, thermK: 0.5, heaterW: 70, shiftH: 5,
  },
  walker: { key: 'walker', crewed: true, mass: 200, aux: 0.12, batteryKwh: 1.2, solarKw: 0, tMin: -130, tMax: 110, shield: 1, daylightOnly: true, shiftH: 7 },
};

const UPGRADES = {
  motor:   { levels: 4, cost: [400, 900, 1700, 3000] },
  battery: { levels: 4, cost: [350, 800, 1500, 2600] },
  solar:   { levels: 4, cost: [300, 700, 1300, 2300] },
  tires:   { levels: 4, cost: [300, 650, 1200, 2100] },
  suspension: { levels: 4, cost: [350, 750, 1400, 2400] },
  thermal: { levels: 4, cost: [300, 650, 1100, 1900] },
  scanner: { levels: 3, cost: [500, 1100, 2200] },
  lights:  { levels: 3, cost: [200, 500, 1000] },
  armor:   { levels: 4, cost: [450, 950, 1700, 2900] },
};

function applyUpgrades(base, up) {
  const c = JSON.parse(JSON.stringify(base)), L = k => (up && up[k]) || 0;
  c.power *= 1 + 0.22 * L('motor'); c.tpeak *= 1 + 0.15 * L('motor'); c.vmax *= 1 + 0.07 * L('motor');
  c.batteryKwh *= 1 + 0.30 * L('battery');
  c.solarKw *= 1 + 0.35 * L('solar');
  c.mu *= 1 + 0.07 * L('tires'); c.crr *= 1 - 0.05 * L('tires');
  c.zeta = Math.min(0.9, c.zeta + 0.06 * L('suspension')); c.droop += 0.03 * L('suspension'); c.travelBonus = 0.04 * L('suspension');
  c.thermK *= 1 - 0.14 * L('thermal'); c.heaterW *= 1 + 0.15 * L('thermal'); c.thermLevel = L('thermal');
  c.scanner = L('scanner'); c.lights = L('lights'); c.armor = 1 - 0.18 * L('armor');
  c.up = Object.assign({}, up);
  return c;
}

// ======================================================================= среда: Солнце, температура, бури
function conditions(body, sun, lat, lon) {
  const h = Geo.wrap180(lon - sun.lon), phi = lat * D2R, dec = sun.lat * D2R, hr = h * D2R;
  const sinEl = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hr);
  const elev = Math.asin(clamp(sinEl, -1, 1)) * R2D, local = ((12 + h / 15) % 24 + 24) % 24;
  let temp;
  if (body === 'moon') {
    const night = Math.max(40, 95 * Math.pow(Math.max(Math.cos(phi), 1e-3), 0.15));
    if (sinEl > 0) temp = Math.max(392 * Math.pow(sinEl, 0.25), night + (h > 0 ? 25 : 0));
    else { const p = Math.min(1, (((h - 90) % 360 + 360) % 360) / 180); temp = night + 25 * (1 - p); }
  } else {
    const czNoon = Math.cos((lat - sun.lat) * D2R);
    if (czNoon <= 0.02) temp = 148;
    else {
      const tmax = Math.max(150, 301 * Math.pow(czNoon, 0.25) * Math.sqrt(1.524 / sun.r));
      const tmin = Math.max(148, tmax - 105 * Math.sqrt(czNoon));
      let s;
      if (local >= 6 && local <= 13) s = Math.sin(Math.PI / 2 * (local - 6) / 7);
      else if (local > 13 && local <= 18) s = 0.35 + 0.65 * Math.cos(Math.PI / 2 * (local - 13) / 5);
      else s = 0.35 * Math.exp(-(((local - 18) % 24 + 24) % 24) / 4);
      temp = tmin + (tmax - tmin) * s;
    }
  }
  return { elev, temp: temp - 273.15, local, hourAngle: h };
}
const dustTau = (ls, lat) => {
  const season = ls > 180 && ls < 360 ? Math.pow(Math.sin((ls - 180) * D2R), 0.7) : 0;
  return 0.35 + 0.75 * season * (1 - 0.3 * lat / 90) * (0.6 + 0.4 * Math.cos(lat * D2R));
};
const stormProbPerSol = (ls, lat) => {
  const season = ls > 180 && ls < 360 ? Math.sin((ls - 180) * D2R) : 0;
  return 0.002 + 0.02 * season * (1 - 0.3 * lat / 90) + (ls >= 180 && ls <= 330 ? 0.0011 : 0);
};

/** Положение Солнца по таблице подсолнечной точки (ответ /api/sim/sun), линейная интерполяция по часам. */
class SunTrack {
  constructor(data) { this.d = data; this.step = data.hours / (data.n - 1); }
  at(hours) {
    const d = this.d, f = hours / this.step, last = d.n - 1;
    let i = Math.floor(f), t = f - i;
    if (i < 0) { i = 0; t = 0; }
    if (i >= last) {                                   // за пределами таблицы продолжаем по последнему наклону
      const lo = d.lon[last] - d.lon[last - 1];
      return { lat: d.lat[last], lon: d.lon[last] + lo * (f - last), r: d.r[last], ls: d.ls[last] == null ? null : d.ls[last] + 0.0 };
    }
    return { lat: lerp(d.lat[i], d.lat[i + 1], t), lon: lerp(d.lon[i], d.lon[i + 1], t), r: lerp(d.r[i], d.r[i + 1], t),
             ls: d.ls[i] == null ? null : lerp(d.ls[i], d.ls[i + 1], t) };
  }
}

class Environment {
  /** opts: body, sunTrack, weather: 'calm' | 'auto' | 'stormy' */
  constructor(opts) {
    this.body = opts.body; this.track = opts.sunTrack; this.weather = opts.weather || 'auto';
    this.mult = { calm: 0, auto: 8, stormy: 45 }[this.weather];
    this.seed = opts.seed || 5;
    this.solHours = 24.66;
  }
  /** Состояние среды в момент t (часы от старта) в точке (lat, lon). */
  at(t, lat, lon) {
    const sun = this.track.at(t), c = conditions(this.body, sun, lat, lon);
    const phi = lat * D2R, dec = sun.lat * D2R, hr = c.hourAngle * D2R;
    // Азимут Солнца от севера по часовой стрелке.
    const az = Math.atan2(Math.sin(hr), Math.cos(hr) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
    const el = c.elev * D2R, ce = Math.cos(el);
    const out = { sunEl: c.elev, sunAz: az * R2D, local: c.local, temp: c.temp, ls: sun.ls, r: sun.r,
                  sunDir: [ce * Math.sin(az), ce * Math.cos(az), Math.sin(el)], tau: 0, storm: 0, wind: 0, visibility: 1e9 };
    if (this.body === 'mars') {
      const base = sun.ls == null ? 0.4 : dustTau(sun.ls, lat);
      const storm = this.stormLevel(t, sun.ls == null ? 0 : sun.ls, lat);
      out.storm = storm.level; out.tau = base + storm.tau;
      out.wind = 3 + 4 * Math.abs(vnoise(t * 0.7, 3, this.seed)) + 22 * storm.level * (0.6 + 0.4 * Math.abs(vnoise(t * 5, 9, this.seed)));
      out.visibility = 30000 / (1 + 14 * Math.pow(Math.max(out.tau - 0.35, 0), 1.2));
    }
    return out;
  }
  stormLevel(t, ls, lat) {
    let p = clamp(stormProbPerSol(ls, lat) * this.mult, 0, 0.9);
    if (this.weather === 'stormy') p = Math.max(p, 0.55);   // «бурная» погода: бури круглый год
    if (p <= 0) return { level: 0, tau: 0 };
    let best = 0, tauAdd = 0;
    const sol = Math.floor(t / this.solHours);
    for (let n = sol - 3; n <= sol; n++) {
      if (rnd(n, 17, this.seed) >= p) continue;
      const start = (n + rnd(n, 18, this.seed)) * this.solHours, dur = 14 + 60 * rnd(n, 19, this.seed);
      const peak = 1.3 + 3.2 * rnd(n, 20, this.seed), u = (t - start) / dur;
      if (u < 0 || u > 1) continue;
      const shape = smooth(u / 0.25) * (1 - smooth((u - 0.6) / 0.4));
      if (shape > best) { best = shape; tauAdd = peak * shape; }
    }
    return { level: best, tau: tauAdd };
  }
}

// ======================================================================= тень рельефа
function inShadow(terrain, x, y, z, sunDir) {
  if (sunDir[2] <= 0.02) return true;
  const hx = sunDir[0], hy = sunDir[1], hz = sunDir[2];
  let d = 3, step = 3;
  for (let i = 0; i < 40; i++) {
    const px = x + hx * d, py = y + hy * d;
    if (px < terrain.x0 || px > terrain.x1 || py < terrain.y0 || py > terrain.y1) return false;
    if (terrain.height(px, py) > z + hz * d + 0.3) return true;
    d += step; step *= 1.08;
    if (z + hz * d > 600) break;
  }
  return false;
}

// ======================================================================= грунт (механика колеса на сыпучем грунте)
/** Параметры реголита по Бекеру-Вонгу и Яноши-Ханамото. Луна: Heiken et al. 1991; Марс: данные MER/Spirit (Richter 2006, Arvidson 2004).
    kc, kphi — модули давления-осадки, n — показатель, c — сцепление (Па), phi — угол трения, K — модуль сдвига (м). */
const SOIL = {
  moon: { n: 1.0, kc: 1400, kphi: 1.6e6, c: 170, phi: 35, K: 0.018 },
  mars: { n: 0.9, kc: 1800, kphi: 2.2e6, c: 500, phi: 31, K: 0.020 },
};
const jh = x => (x < 1e-3 ? 0.5 * x - x * x / 6 : 1 - (1 - Math.exp(-x)) / x);                 // кривая сдвиг-напряжение, 0..1
const jhd = x => { if (x < 1e-3) return 0.5 - x / 3; const e = Math.exp(-x); return (1 - e) / (x * x) - e / x; };

// ======================================================================= вездеход
class Rover {
  constructor(cfg, terrain, opts = {}) {
    this.cfg = cfg; this.terrain = terrain;
    this.opts = Object.assign({ tractionControl: true, stability: true, hillHold: true, damage: true }, opts);
    this.pos = [0, 0, 0]; this.vel = [0, 0, 0]; this.q = { w: 1, x: 0, y: 0, z: 0 }; this.w = [0, 0, 0];
    const m = cfg.mass, hx = cfg.hull[0] * 2, hy = cfg.hull[1] * 2, hz = cfg.hull[2] * 2;
    this.I = [m / 12 * (hy * hy + hz * hz) * 1.4, m / 12 * (hx * hx + hz * hz) * 1.4, m / 12 * (hx * hx + hy * hy) * 1.3];
    this.wheels = cfg.mounts.map((mt, i) => ({ m: mt, steer: cfg.steer[i] || 0, omega: 0, contact: false, comp: 0, Fn: 0, slip: 0, grip: 1 }));
    // Точки корпуса для проверки касания грунта.
    const [a, b, c, o] = cfg.hull;
    this.hullPts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) this.hullPts.push([sx * a, sy * b, o + sz * c]);
    this.hullPts.push([0, 0, o - c], [a, 0, o - c], [-a, 0, o - c], [0, b, o - c], [0, -b, o - c]);
    this.input = { throttle: 0, steer: 0, brake: 0 };
    this.throttle = 0; this.steerAngle = 0;
    this.battery = cfg.batteryKwh; this.temp = 15; this.dust = 0; this.damage = 0; this.dose = 0;
    this.heater = false; this.park = false; this.time = 0; this.odo = 0;
    this.impactCool = 0; this.flipTime = 0; this.status = 'ok'; this.events = [];
    this.stats = { power: 0, solar: 0, speed: 0, slip: 0, contacts: 0, maxImpact: 0, wheelSlipMax: 0 };
    this._ax = {}; this._n = [0, 0, 1]; this._tm = 0;
  }

  /** Ставит вездеход на грунт в точке (x, y) носом на азимут heading (радианы от севера по часовой). */
  place(x, y, heading) {
    const t = this.terrain, n = t.normal(x, y, [0, 0, 1], 1.2);
    let fx = Math.sin(heading), fy = Math.cos(heading), fz = 0;
    const d = fx * n[0] + fy * n[1];
    fx -= n[0] * d; fy -= n[1] * d; fz -= n[2] * d;
    const k = 1 / Math.hypot(fx, fy, fz); fx *= k; fy *= k; fz *= k;
    const l = [n[1] * fz - n[2] * fy, n[2] * fx - n[0] * fz, n[0] * fy - n[1] * fx];
    this.q = qFromAxes([fx, fy, fz], l, n);
    const rest = this.cfg.wheelR + this.cfg.L0 + 0.12 - this.cfg.mounts[0][2];
    this.pos = [x, y, t.height(x, y) + rest]; this.vel = [0, 0, 0]; this.w = [0, 0, 0];
    for (const wh of this.wheels) wh.omega = 0;
    this.flipTime = 0;
  }
  get heading() { const a = axes(this.q, this._ax); return Math.atan2(a.fx, a.fy); }
  get speed() { const a = axes(this.q, this._ax); return this.vel[0] * a.fx + this.vel[1] * a.fy + this.vel[2] * a.fz; }
  get upZ() { return axes(this.q, this._ax).uz; }

  step(dt, env) {
    const cfg = this.cfg, t = this.terrain, g = t.g, m = cfg.mass, wheels = this.wheels;
    const a = axes(this.q, this._ax), p = this.pos, v = this.vel, om = this.w;
    const inp = this.input;
    // ---- органы управления: плавное изменение, ограничения помощников
    const spd = this.speed, aspd = Math.abs(spd);
    let thr = inp.throttle, brk = inp.brake;
    this.throttle += clamp(thr - this.throttle, -4 * dt, 3 * dt);
    const dead = this.battery <= 0.0005 || this.status === 'destroyed' || this.status === 'frozen' || this.status === 'overheated';
    let steerCmd = inp.steer;
    if (this.opts.stability) {
      const gl = Math.max(g, 1.2), kmax = 0.5 * gl / Math.max(spd * spd, 1);
      const wb = 2.4, dmax = Math.atan(kmax * wb) / cfg.steerMax;
      steerCmd = clamp(steerCmd, -Math.max(dmax, 0.12), Math.max(dmax, 0.12));
    }
    const sT = steerCmd * cfg.steerMax / (1 + 0.02 * aspd * aspd);
    this.steerAngle += clamp(sT - this.steerAngle, -1.6 * dt, 1.6 * dt);
    let throttle = dead ? 0 : this.throttle;
    if (this.opts.stability && a.uz < 0.93) throttle *= clamp((a.uz - 0.66) / 0.27, 0, 1);   // сильный крен: не добавлять газ
    this.park = this.opts.hillHold && Math.abs(inp.throttle) < 0.03 && brk < 0.05 && aspd < 0.3;
    const brakeCmd = Math.max(brk, this.park ? 1 : 0);

    // ---- потери мощности по температуре, повреждениям и заряду
    let derate = 1;
    if (this.temp < -30) derate *= clamp(1 - (-30 - this.temp) / 60, 0.25, 1);
    if (this.temp > 55) derate *= clamp(1 - (this.temp - 55) / 25, 0.2, 1);
    derate *= 1 - 0.5 * this.damage / 100;
    const pLimit = cfg.power * derate;

    // ---- силы
    let Fx = 0, Fy = 0, Fz = -m * g, Tx = 0, Ty = 0, Tz = 0;
    let pMech = 0, contacts = 0, slipMax = 0, closeMax = 0;
    const halfW = 0.5 * cfg.wheelW, Rw = cfg.wheelR, droopL = cfg.L0 + cfg.droop, Lmin = cfg.L0 - 0.16 - (cfg.travelBonus || 0);
    const kS = (m / wheels.length) * Math.pow(2 * Math.PI * cfg.freq, 2);
    const cS = 2 * cfg.zeta * Math.sqrt(kS * (m / wheels.length));
    const nrm = this._n;
    const nOn = wheels.length;
    for (let i = 0; i < nOn; i++) {
      const wh = wheels[i], mt = wh.m;
      // Точка крепления подвески в мире.
      const mx = p[0] + a.fx * mt[0] + a.lx * mt[1] + a.ux * mt[2];
      const my = p[1] + a.fy * mt[0] + a.ly * mt[1] + a.uy * mt[2];
      const mz = p[2] + a.fz * mt[0] + a.lz * mt[1] + a.uz * mt[2];
      // Направление колеса (с углом поворота) в плоскости тела.
      const del = wh.steer * this.steerAngle, cd = Math.cos(del), sd = Math.sin(del);
      let wfx = a.fx * cd + a.lx * sd, wfy = a.fy * cd + a.ly * sd, wfz = a.fz * cd + a.lz * sd;
      let contact = false, comp = 0, l = droopL, hx = mx, hy = my;
      if (a.uz > 0.15) {
        const hh = Math.hypot(wfx, wfy) || 1, ex = wfx / hh, ey = wfy / hh;
        l = droopL;
        for (let it = 0; it < 3; it++) {
          hx = mx - a.ux * l; hy = my - a.uy * l;
          let E = -1e9;
          for (const d of [-0.75 * Rw, 0, 0.75 * Rw]) {
            const e = t.height(hx + ex * d, hy + ey * d) + Math.sqrt(Rw * Rw - d * d);
            if (e > E) E = e;
          }
          // Боковые точки: камень сбоку от колеса тоже поднимает его (колесо шириной wheelW).
          for (const sd2 of [-halfW, halfW]) { const e = t.height(hx - ey * sd2, hy + ex * sd2) + Rw; if (e > E) E = e; }
          E -= wh.sink || 0;                                   // колесо тонет в рыхлом грунте
          const ln = (mz - E) / a.uz;
          if (ln >= droopL) { l = droopL; break; }
          l = Math.max(ln, Lmin - 0.35);
          if (it === 0) contact = true;
        }
        contact = l < droopL - 1e-5;
        comp = droopL - l;
      }
      let Fn = 0;
      wh.contact = contact; wh.comp = comp; wh.l = Math.max(l, Lmin - 0.2); wh.steerNow = del;
      if (contact) {
        contacts++;
        const lc = Math.max(l, Lmin - 0.35);
        const hx2 = mx - a.ux * lc, hy2 = my - a.uy * lc, hz2 = mz - a.uz * lc;
        t.normal(hx2, hy2, nrm);
        // Скорость точки контакта.
        const px = hx2 - nrm[0] * Rw, py = hy2 - nrm[1] * Rw, pz = hz2 - nrm[2] * Rw;
        const rx = px - p[0], ry = py - p[1], rz = pz - p[2];
        const vx = v[0] + om[1] * rz - om[2] * ry, vy = v[1] + om[2] * rx - om[0] * rz, vz = v[2] + om[0] * ry - om[1] * rx;
        const vn = vx * nrm[0] + vy * nrm[1] + vz * nrm[2];
        Fn = kS * comp + cS * (vn < 0 ? -vn : -1.6 * vn);
        if (l < Lmin) { Fn += kS * 22 * (Lmin - l); closeMax = Math.max(closeMax, -vn); }
        if (Fn < 0) Fn = 0;
        wh.Fn = Fn;
        // Оси трения в плоскости касания.
        let fx = wfx - nrm[0] * (wfx * nrm[0] + wfy * nrm[1] + wfz * nrm[2]);
        let fy = wfy - nrm[1] * (wfx * nrm[0] + wfy * nrm[1] + wfz * nrm[2]);
        let fz = wfz - nrm[2] * (wfx * nrm[0] + wfy * nrm[1] + wfz * nrm[2]);
        const fk = 1 / (Math.hypot(fx, fy, fz) || 1); fx *= fk; fy *= fk; fz *= fk;
        const lx = nrm[1] * fz - nrm[2] * fy, ly = nrm[2] * fx - nrm[0] * fz, lz = nrm[0] * fy - nrm[1] * fx;
        const vf = vx * fx + vy * fy + vz * fz, vl = vx * lx + vy * ly + vz * lz;
        // Свойства грунта: мягкие участки вязнут сильнее.
        const soft = 0.5 + 0.5 * vnoise((px + t.gx0) / 14, (py + t.gy0) / 14, 31);
        // Осадка колеса по Бекеру: Fn ~ b*k*z^(n+0.5)*sqrt(D). Рыхлые участки мягче; тяжёлая техника тонет глубже.
        const soil = SOIL[t.body] || SOIL.moon, bW = cfg.wheelW, Dw = 2 * Rw;
        const kEff = soil.kphi * (1 - 0.6 * soft) + soil.kc / bW;
        let zs = Math.pow(Math.max(Fn, 1) / (bW * kEff * Math.sqrt(Dw) * 0.55), 1 / (soil.n + 0.5));
        zs = Math.min(zs, 0.4 * Rw);
        // Для высоты колеса берём осадку от статической нагрузки (а не мгновенной): иначе обратная связь «давление-осадка» раскачивает подвеску.
        wh.sink = Math.min(0.08, 0.4 * Rw, Math.pow((m * g / nOn) / (bW * kEff * Math.sqrt(Dw) * 0.55), 1 / (soil.n + 0.5)));
        const Lc = Math.max(Math.sqrt(Dw * zs), 0.04);                             // длина пятна контакта
        const Rc = bW * kEff * Math.pow(zs, soil.n + 1) / (soil.n + 1);            // сопротивление выдавливания колеи
        const crr = Rc / Math.max(Fn, 1) + 0.02 * (cfg.crr / 0.15);                // + гистерезис шины
        const tanPhi = Math.tan(soil.phi * D2R * (1 - 0.1 * soft)) * (cfg.mu / 0.58);
        const muFn = Fn * tanPhi + soil.c * bW * Lc;                               // предельная сила сцепления (трение + сцепление грунта)
        const Lk = Lc / soil.K;
        // Момент двигателя: ограничен пиком, мощностью и предельной скоростью колеса.
        const wspd = wh.omega * Rw;
        let T = throttle * cfg.tpeak * (cfg.tpeak > 0 ? derate : 0);
        const vlim = cfg.vmax * (inp.boost ? 1 : 1);
        if (T * wspd > 0) {
          const fAbs = Math.abs(wspd);
          T *= clamp((vlim * 1.04 - fAbs) / (0.12 * vlim + 0.05), 0, 1);
          const pw = pLimit / nOn;
          if (fAbs > 0.02) T = Math.sign(T) * Math.min(Math.abs(T), pw / (fAbs / Rw));
        }
        const kappa = clamp((wh.omega * Rw - vf) / Math.max(Math.abs(vf), 0.6), -1.5, 1.5);
        if (this.opts.tractionControl && T * (vf >= 0 ? 1 : -1) > 0 && Math.abs(kappa) > 0.22) {
          T *= 1 / (1 + (Math.abs(kappa) - 0.22) * 7);
        }
        // Сила тяги по Яноши-Ханамото: растёт с проскальзыванием и насыщается на пределе сцепления.
        const xk = Math.abs(kappa) * Lk;
        let Fxw = Math.sign(kappa) * muFn * jh(xk);
        const dF = muFn * Lk * jhd(xk) * Rw / Math.max(Math.abs(vf), 0.6);
        // Ролики тормоза и сопротивление качению.
        const roll = crr * Fn * Math.tanh(vf / 0.06);
        const Tnet = T - Rw * (Fxw + roll);
        // Неявный шаг по скорости колеса (линеаризация силы сцепления): устойчив при большой жёсткости контакта.
        const dw = dt * Tnet / (cfg.wheelI + dt * Rw * dF);
        wh.omega += dw;
        Fxw += dF * dw;
        Fxw = clamp(Fxw, -muFn, muFn);
        // Тормоз — сухое трение: гасит скорость колеса, но не может развернуть его.
        const db = dt * cfg.brakeT * brakeCmd / cfg.wheelI;
        if (db > 0) wh.omega -= Math.sign(wh.omega) * Math.min(Math.abs(wh.omega), db);
        pMech += T * wh.omega;
        let Fyw = -Math.sign(vl) * muFn * jh(6.8 * Math.abs(vl) / (Math.abs(vf) + 0.5));
        const tot = Math.hypot(Fxw, Fyw);
        if (tot > muFn && tot > 0) { const s = muFn / tot; Fxw *= s; Fyw *= s; }
        const Fxr = Fxw;
        wh.slip = kappa; slipMax = Math.max(slipMax, Math.abs(kappa));
        const FX = nrm[0] * Fn + fx * Fxr + lx * Fyw, FY = nrm[1] * Fn + fy * Fxr + ly * Fyw, FZ = nrm[2] * Fn + fz * Fxr + lz * Fyw;
        Fx += FX; Fy += FY; Fz += FZ;
        Tx += ry * FZ - rz * FY; Ty += rz * FX - rx * FZ; Tz += rx * FY - ry * FX;
      } else {
        // Колесо в воздухе: свободно вращается, подчиняясь двигателю и тормозу.
        const wspd = wh.omega * Rw;
        let T = throttle * cfg.tpeak * derate;
        if (T * wspd > 0) T *= clamp((cfg.vmax * 1.04 - Math.abs(wspd)) / (0.12 * cfg.vmax + 0.05), 0, 1);
        wh.omega += dt * T / cfg.wheelI;
        const dbA = dt * cfg.brakeT * brakeCmd / cfg.wheelI;
        wh.omega -= Math.sign(wh.omega) * Math.min(Math.abs(wh.omega), dbA);
        wh.Fn = 0; wh.slip = 0;
        pMech += T * wh.omega * 0.1;
      }
    }

    for (const wh of wheels) wh.spin = (wh.spin || 0) + wh.omega * dt;

    // ---- касание корпуса о грунт
    for (let k = 0; k < this.hullPts.length; k++) {
      const hp = this.hullPts[k];
      const wx = p[0] + a.fx * hp[0] + a.lx * hp[1] + a.ux * hp[2];
      const wy = p[1] + a.fy * hp[0] + a.ly * hp[1] + a.uy * hp[2];
      const wz = p[2] + a.fz * hp[0] + a.lz * hp[1] + a.uz * hp[2];
      const pen = t.height(wx, wy) - wz;
      if (pen <= 0) continue;
      t.normal(wx, wy, nrm);
      const rx = wx - p[0], ry = wy - p[1], rz = wz - p[2];
      const vx = v[0] + om[1] * rz - om[2] * ry, vy = v[1] + om[2] * rx - om[0] * rz, vz = v[2] + om[0] * ry - om[1] * rx;
      const vn = vx * nrm[0] + vy * nrm[1] + vz * nrm[2];
      let Fn = m * 260 * Math.min(pen, 1.0) * (1 + pen / 0.25) + m * 22 * Math.max(0, -vn);
      closeMax = Math.max(closeMax, -vn);
      // Трение скольжения о грунт.
      const tx = vx - nrm[0] * vn, ty = vy - nrm[1] * vn, tz = vz - nrm[2] * vn, tl = Math.hypot(tx, ty, tz);
      const fr = 0.45 * Fn * Math.tanh(tl / 0.05) / (tl || 1);
      const FX = nrm[0] * Fn - tx * fr, FY = nrm[1] * Fn - ty * fr, FZ = nrm[2] * Fn - tz * fr;
      Fx += FX; Fy += FY; Fz += FZ;
      Tx += ry * FZ - rz * FY; Ty += rz * FX - rx * FZ; Tz += rx * FY - ry * FX;
    }

    // ---- атмосфера Марса: ничтожное сопротивление (плотность ~0.015 кг/м3)
    if (t.body === 'mars') {
      const rho = 0.020 * Math.exp(-Math.max(t.altitude(p[0], p[1], p[2]), -8000) / 11100), sp = Math.hypot(v[0], v[1], v[2]);
      const f = -0.5 * rho * 4.5 * sp;
      Fx += f * v[0]; Fy += f * v[1]; Fz += f * v[2];
    }
    if (this.extF) { Fx += this.extF[0]; Fy += this.extF[1]; Fz += this.extF[2]; }
    // Мягкая граница зоны: у края куска рельефа вездеход отталкивается.
    const edge = 90;
    const ox = Math.max(0, t.x0 + edge - p[0]) - Math.max(0, p[0] - (t.x1 - edge));
    const oy = Math.max(0, t.y0 + edge - p[1]) - Math.max(0, p[1] - (t.y1 - edge));
    Fx += ox * m * 2.2 * (1 + Math.abs(ox) / 30); Fy += oy * m * 2.2 * (1 + Math.abs(oy) / 30);

    // ---- сила покоя: «якорь» удерживает остановившийся вездеход на склоне (трение покоя)
    if ((this.park || (brk > 0.3 && this.opts.hillHold)) && contacts >= 3 && aspd < 0.3 && !dead) {
      if (!this.anchor) this.anchor = [p[0], p[1], p[2]];
      const an = this.anchor, ks = m * 45, cs = 2 * 0.8 * Math.sqrt(ks * m);
      let dx = p[0] - an[0], dy = p[1] - an[1], dz = p[2] - an[2];
      const du = dx * a.ux + dy * a.uy + dz * a.uz, vu = v[0] * a.ux + v[1] * a.uy + v[2] * a.uz;
      dx -= a.ux * du; dy -= a.uy * du; dz -= a.uz * du;
      let sx = -ks * dx - cs * (v[0] - a.ux * vu), sy = -ks * dy - cs * (v[1] - a.uy * vu), sz = -ks * dz - cs * (v[2] - a.uz * vu);
      let fN = 0; for (const wh of wheels) fN += wh.Fn;
      const lim = 0.85 * cfg.mu * 0.7 * fN, mag = Math.hypot(sx, sy, sz);
      if (mag > lim) {
        const k = lim / mag; sx *= k; sy *= k; sz *= k;
        an[0] = p[0] + sx / ks; an[1] = p[1] + sy / ks; an[2] = p[2] + sz / ks;   // якорь сползает: вездеход скользит
      }
      Fx += sx; Fy += sy; Fz += sz;
    } else this.anchor = null;

    // ---- интегрирование тела
    v[0] += Fx / m * dt; v[1] += Fy / m * dt; v[2] += Fz / m * dt;
    // угловое: в системе тела
    const wbx = a.fx * om[0] + a.fy * om[1] + a.fz * om[2], wby = a.lx * om[0] + a.ly * om[1] + a.lz * om[2], wbz = a.ux * om[0] + a.uy * om[1] + a.uz * om[2];
    const tbx = a.fx * Tx + a.fy * Ty + a.fz * Tz, tby = a.lx * Tx + a.ly * Ty + a.lz * Tz, tbz = a.ux * Tx + a.uy * Ty + a.uz * Tz;
    const I = this.I;
    const dwx = (tbx - (I[2] - I[1]) * wby * wbz) / I[0], dwy = (tby - (I[0] - I[2]) * wbz * wbx) / I[1], dwz = (tbz - (I[1] - I[0]) * wbx * wby) / I[2];
    const nbx = wbx + dwx * dt, nby = wby + dwy * dt, nbz = wbz + dwz * dt;
    om[0] = a.fx * nbx + a.lx * nby + a.ux * nbz; om[1] = a.fy * nbx + a.ly * nby + a.uy * nbz; om[2] = a.fz * nbx + a.lz * nby + a.uz * nbz;
    // ограничители от численных выбросов
    const vmag = Math.hypot(v[0], v[1], v[2]); if (vmag > 60) { const s = 60 / vmag; v[0] *= s; v[1] *= s; v[2] *= s; }
    const wmag = Math.hypot(om[0], om[1], om[2]); if (wmag > 12) { const s = 12 / wmag; om[0] *= s; om[1] *= s; om[2] *= s; }
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    const q = this.q, hw = 0.5 * dt;
    const dq = qmul({ w: 0, x: om[0], y: om[1], z: om[2] }, q);
    q.w += dq.w * hw; q.x += dq.x * hw; q.y += dq.y * hw; q.z += dq.z * hw; qnorm(q);

    // ---- страховка от проваливания: штрафная сила не успела остановить корпус -> выталкиваем по нормали
    this._safety(dt);

    // ---- повреждения от ударов и опрокидывание
    this.impactCool -= dt;
    this.stats.maxImpact = Math.max(this.stats.maxImpact * Math.exp(-dt), closeMax);
    if (closeMax > 1.6 && this.impactCool <= 0 && this.opts.damage) {
      const dmg = 3.2 * (closeMax - 1.6) * (closeMax - 1.6) * (cfg.armor != null ? cfg.armor : 1);
      this.damage = Math.min(100, this.damage + dmg);
      this.impactCool = 0.35;
      this.events.push({ type: 'impact', v: closeMax, dmg });
      if (this.damage >= 100) { this.status = 'destroyed'; this.events.push({ type: 'destroyed' }); }
    }
    if (a.uz < 0.25) this.flipTime += dt; else this.flipTime = Math.max(0, this.flipTime - dt * 2);

    // ---- энергия, тепло, пыль
    const Pel = pMech > 0 ? pMech / 0.88 : pMech * 0.4;
    this.stats.speed = this.speed; this.stats.contacts = contacts; this.stats.slip = slipMax;
    this._pMech = pMech; this._Pel = Pel;
    this._acc = (this._acc || 0) + dt;
    this.time += dt;
    this.odo += Math.abs(this.speed) * dt;
    this._pelAcc = (this._pelAcc || 0) + Pel * dt;
    if (this._acc >= 0.25) this._slow(this._acc, env);
    return this;
  }

  /** Жёсткая проверка после шага: ни одна опорная точка корпуса не должна уходить под грунт глубже 15 см.
      Если ушла (удар на большой скорости, большой шаг времени) — позиционная коррекция и погашение скорости «внутрь». */
  _safety(dt) {
    const t = this.terrain, p = this.pos, v = this.vel, om = this.w, cfg = this.cfg;
    if (!Number.isFinite(p[0] + p[1] + p[2] + v[0] + v[1] + v[2] + this.q.w + this.q.x + om[0])) {
      const g = this._good; this.stats.fixes = (this.stats.fixes || 0) + 1;
      if (g) { this.pos = g.pos.slice(); this.q = Object.assign({}, g.q); this.vel = [0, 0, 0]; this.w = [0, 0, 0]; }
      else this.place(0, 0, 0);
      return;
    }
    const a = axes(this.q, this._ax2 || (this._ax2 = {})), nrm = this._n2 || (this._n2 = [0, 0, 1]);
    let worst = 0, wx = 0, wy = 0;
    const pts = this.safePts || (this.safePts = this.hullPts.concat(cfg.mounts ? cfg.mounts.map(m => [m[0], m[1], m[2]]) : []));
    for (let k = 0; k < pts.length; k++) {
      const hp = pts[k];
      const x = p[0] + a.fx * hp[0] + a.lx * hp[1] + a.ux * hp[2], y = p[1] + a.fy * hp[0] + a.ly * hp[1] + a.uy * hp[2];
      const z = p[2] + a.fz * hp[0] + a.lz * hp[1] + a.uz * hp[2], pen = t.height(x, y) - z;
      if (pen > worst) { worst = pen; wx = x; wy = y; }
    }
    // центр масс под землёй — крайний случай: поднимаем целиком
    const gc = t.height(p[0], p[1]);
    if (p[2] < gc - 0.25) { p[2] = gc + 0.6; if (v[2] < 0) v[2] = 0; this.stats.fixes = (this.stats.fixes || 0) + 1; }
    else if (worst > 0.15) {
      t.normal(wx, wy, nrm);
      const c = worst - 0.08;
      p[0] += nrm[0] * c; p[1] += nrm[1] * c; p[2] += nrm[2] * c;
      const vin = v[0] * nrm[0] + v[1] * nrm[1] + v[2] * nrm[2];
      if (vin < 0) { v[0] -= nrm[0] * vin; v[1] -= nrm[1] * vin; v[2] -= nrm[2] * vin; }
      om[0] *= 0.9; om[1] *= 0.9; om[2] *= 0.9;
      this.stats.fixes = (this.stats.fixes || 0) + 1;
    } else if (worst <= 0.02) {
      this._goodT = (this._goodT || 0) + dt;
      if (this._goodT > 0.5) { this._goodT = 0; this._good = { pos: p.slice(), q: Object.assign({}, this.q) }; }
    }
  }

  /** Медленные процессы (каждые ~0,25 с модельного времени): батарея, тепло, пыль. */
  _slow(dt, env) {
    const cfg = this.cfg, t = this.terrain, p = this.pos;
    const pel = this._pelAcc / dt; this._acc = 0; this._pelAcc = 0;
    let solar = 0;
    if (env && cfg.solarKw > 0) {
      const a = axes(this.q, this._ax);
      const cosI = Math.max(0, env.sunDir[0] * a.ux + env.sunDir[1] * a.uy + env.sunDir[2] * a.uz);
      const shadow = inShadow(t, p[0], p[1], p[2] + 0.8, env.sunDir);
      const atm = t.body === 'mars' ? Math.exp(-Math.max(env.tau, 0.1) / Math.max(env.sunEl > 0 ? Math.sin(env.sunEl * D2R) : 0, 0.12)) * 1.6 : 1;
      const inten = 1361 / (env.r * env.r) / 1361;
      solar = cfg.solarKw * 1000 * inten * cosI * (shadow ? 0.08 : 1) * Math.min(atm, 1) * (1 - 0.65 * this.dust);
      this.inShadow = shadow;
    }
    // Нагрев/охлаждение корпуса: приёмник тепла — смесь грунта и холодного неба.
    let heater = 0;
    if (env) {
      const sink = env.temp * 0.55 + (t.body === 'moon' ? -45 : -35) * 0.45;
      const rad = this.temp > 40 ? 3.2 * (this.temp - 40) : 0;           // радиаторы
      const loss = cfg.thermK * (this.temp - sink) + rad;
      const waste = Math.max(0, pel) * 0.12 + cfg.aux * 1000 * 0.6;
      const target = cfg.crewed ? 10 : -15;
      if (this.temp < target && this.battery > 0.01) { heater = cfg.heaterW; this.heater = true; } else this.heater = false;
      this.temp += (waste + heater - loss) / cfg.thermC * dt;
      this.temp = clamp(this.temp, -250, 300);
      if (this.temp < -60 && this.status === 'ok') { this.status = 'frozen'; this.events.push({ type: 'frozen' }); }
      if (this.temp > 85 && this.status === 'ok') { this.status = 'overheated'; this.events.push({ type: 'overheated' }); }
      if ((this.status === 'frozen' && this.temp > -45) || (this.status === 'overheated' && this.temp < 70)) this.status = 'ok';
    }
    const draw = pel + cfg.aux * 1000 * (this.battery > 0 ? 1 : 0) + heater - solar;
    this.battery = clamp(this.battery - draw * dt / 3.6e6, 0, cfg.batteryKwh);
    this.stats.power = pel + cfg.aux * 1000 + heater; this.stats.solar = solar;
    // Пыль на панелях: от движения, от бури; ветер на Марсе понемногу сдувает.
    if (env) {
      this.dust += Math.min(Math.abs(this.speed), 6) * 4e-5 * dt * 0.25 + (env.storm || 0) * 3e-4 * dt * 0.25;
      if (t.body === 'mars') this.dust -= (env.wind > 14 ? 1.2e-4 : 1.2e-5) * dt * 0.25;
      this.dust = clamp(this.dust, 0, 1);
      if (cfg.crewed) this.dose += (t.body === 'moon' ? 1.37 : 0.8) / 24 / 3600 * dt * cfg.shield;
    }
    if (this.battery <= 0 && this.stats.solar <= 1) { /* обесточен: ждём солнца */ }
  }

  cleanPanels() { this.dust = Math.max(0, this.dust * 0.12); this.battery = Math.max(0, this.battery - 0.02); }

  /** Переворот: плавно ставит вездеход на колёса (платная услуга). */
  rightVehicle() {
    const h = this.heading;
    this.place(this.pos[0], this.pos[1], h);
    this.pos[2] += 0.8; this.flipTime = 0;
  }
}
// множитель сцепления среды (резерв для будущих условий); сейчас 1
function env_mu(env) { return 1; }

// ======================================================================= пешеход
class Walker {
  constructor(cfg, terrain) {
    this.cfg = cfg; this.terrain = terrain; this.pos = [0, 0, 0]; this.vel = [0, 0, 0]; this.yaw = 0; this.face = 0; this.lockFace = false;
    this.input = { fwd: 0, strafe: 0, sprint: 0, jump: 0 };
    this.onGround = true; this.battery = cfg.batteryKwh; this.damage = 0; this.dose = 0; this.status = 'ok'; this.time = 0; this.odo = 0;
    this.temp = 20; this.dust = 0; this.events = []; this._n = [0, 0, 1];
    this.stats = { power: 0, solar: 0, speed: 0 };
  }
  place(x, y, heading) { this.pos = [x, y, this.terrain.height(x, y)]; this.yaw = heading; this.face = heading; this.vel = [0, 0, 0]; }
  get heading() { return this.yaw; }
  get speed() { return Math.hypot(this.vel[0], this.vel[1]); }
  step(dt, env) {
    const t = this.terrain, g = t.g, p = this.pos, v = this.vel, inp = this.input;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const dead = this.battery <= 0.0005 || this.status === 'dead';
    const wx = (inp.fwd * sy + inp.strafe * cy), wy = (inp.fwd * cy - inp.strafe * sy);
    const wl = Math.hypot(wx, wy) || 1;
    const n = t.normal(p[0], p[1], this._n, 0.5), slope = Math.acos(clamp(n[2], -1, 1)) * R2D;
    const top = (inp.sprint ? 2.3 : 1.1) * (dead ? 0.15 : 1);
    // Склон замедляет подъём, спуск тоже требует осторожности; на крутом склоне грунт осыпается.
    const gradeAlong = (wx / wl) * (-n[0] / n[2]) + (wy / wl) * (-n[1] / n[2]);
    const sf = clamp(1 - 2.2 * Math.max(gradeAlong, 0) - 0.5 * Math.max(-gradeAlong, 0), 0.12, 1.1) * (slope > 28 ? 0.3 : 1);
    const dvx = wx / wl * top * sf * (Math.abs(inp.fwd) + Math.abs(inp.strafe) > 0 ? 1 : 0);
    const dvy = wy / wl * top * sf * (Math.abs(inp.fwd) + Math.abs(inp.strafe) > 0 ? 1 : 0);
    if (this.onGround) {
      const k = Math.min(1, dt * 6);
      v[0] += (dvx - v[0]) * k; v[1] += (dvy - v[1]) * k;
      if (slope > 30) { v[0] += n[0] * g * 0.6 * dt; v[1] += n[1] * g * 0.6 * dt; }   // сползание
      // скорость вдоль поверхности
      const vn = v[0] * n[0] + v[1] * n[1];
      v[2] = -(n[0] * v[0] + n[1] * v[1]) / n[2] - 0.0 * vn;
      if (inp.jump && !dead) { v[2] = 2.2 * Math.sqrt(g / 1.62); this.onGround = false; }
    } else {
      v[2] -= g * dt;
      const k = Math.min(1, dt * 0.6);
      v[0] += (dvx - v[0]) * k; v[1] += (dvy - v[1]) * k;
    }
    // Корпус поворачивается в сторону движения (как в играх от третьего лица); от первого лица смотрит туда же, куда камера.
    const hsp = Math.hypot(v[0], v[1]);
    if (this.lockFace) this.face = this.yaw;
    else if (hsp > 0.2) { let d = Math.atan2(v[0], v[1]) - this.face; d = Math.atan2(Math.sin(d), Math.cos(d)); this.face += d * Math.min(1, dt * 8); }
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    const gh = t.height(p[0], p[1]);
    if (p[2] <= gh + (this.onGround ? 0.12 : 0)) {
      if (!this.onGround && v[2] < -3.2) {          // жёсткое приземление
        this.damage = Math.min(100, this.damage + (-v[2] - 3.2) * 12); this.events.push({ type: 'impact', v: -v[2] });
        if (this.damage >= 100) { this.status = 'dead'; this.events.push({ type: 'destroyed' }); }
      }
      p[2] = gh; this.onGround = true; if (v[2] < 0) v[2] = 0;
    } else if (this.onGround && p[2] > gh + 0.25) this.onGround = false;
    this.time += dt; this.odo += Math.hypot(v[0], v[1]) * dt;
    const spd = this.speed;
    // скафандр: потребление растёт с нагрузкой
    const drawW = this.cfg.aux * 1000 * (1 + 2.4 * (spd / 1.5) ** 2) * (this.onGround ? 1 : 0.8);
    this.battery = Math.max(0, this.battery - drawW * dt / 3.6e6);
    this.stats.power = drawW; this.stats.speed = spd;
    if (this.battery <= 0 && this.status === 'ok') { this.status = 'dead'; this.events.push({ type: 'dead' }); }
    if (env) this.dose += (t.body === 'moon' ? 1.37 : 0.8) / 24 / 3600 * dt * this.cfg.shield;
  }
  cleanPanels() {}
  rightVehicle() {}
}

// ======================================================================= дрон
/** Конфигурации дронов. Марс: многороторный вертолёт по мотивам Ingenuity и концепции Mars Science Helicopter
    (подъёмная сила падает вместе с плотностью атмосферы). Луна: атмосферы нет, роторы бесполезны, поэтому
    ракетный «прыгун» с запасом топлива (концепт, а не существующий аппарат). */
function droneConfig(body) {
  const base = {
    key: 'drone', drone: true, crewed: false, wheelR: 0, mounts: null, steer: [], steerMax: 0.5, mu: 0.6, crr: 0, zeta: 0.5, freq: 2,
    legs: [[0.55, 0.55, -0.34], [0.55, -0.55, -0.34], [-0.55, 0.55, -0.34], [-0.55, -0.55, -0.34]],
    tMin: -90, tMax: 45, shield: 1, daylightOnly: true, thermC: 40e3, thermK: 0.3, heaterW: 40, shiftH: 0.12, brakeT: 0,
  };
  if (body === 'moon') return Object.assign(base, {
    kind: 'hopper', mass: 140, dry: 80, batteryKwh: 60, unit: 'kg', isp: 290, tpeak: 560, power: 0, vmax: 24, vz: 6, tilt: 32 * D2R, angMax: 3.2,
    inertia: [42, 42, 30], hull: [0.8, 0.8, 0.38, 0.14], aux: 0.08, solarKw: 0.4, refuelKgPerH: 6, cruiseAGL: 45, yawMax: 0.7, cda: 0.5,
    thrTau: 0.05, rotors: 0, rotorR: 0, tmaxRho: false, flat: 0, fuelNote: 'kg', cruiseUse: 290, chargeRate: 6, speedAp: 8.3,
  });
  return Object.assign(base, {
    kind: 'rotor', mass: 30, dry: 30, batteryKwh: 0.9, unit: 'kWh', tpeak: 215, power: 7000, vmax: 9, vz: 3, tilt: 27 * D2R, angMax: 6,
    inertia: [5, 5, 9], hull: [0.75, 0.75, 0.22, 0.05], aux: 0.04, solarKw: 0.25, cruiseAGL: 14, yawMax: 0.9, cda: 0.55,
    thrTau: 0.12, rotors: 6, rotorR: 0.55, tmaxRho: true, fm: 0.6, cruiseUse: 5.2, chargeRate: 0.25, speedAp: 8.3,
  });
}

class Drone {
  constructor(cfg, terrain, opts = {}) {
    this.cfg = cfg; this.terrain = terrain; this.opts = Object.assign({ damage: true, assist: true }, opts);
    this.pos = [0, 0, 0]; this.vel = [0, 0, 0]; this.q = { w: 1, x: 0, y: 0, z: 0 }; this.w = [0, 0, 0];
    this.input = { fwd: 0, strafe: 0, climb: 0, yaw: 0 }; this.cmd = null;       // cmd: {vx, vy, vz, yaw} — команда автопилота
    this.battery = cfg.batteryKwh; this.damage = 0; this.dose = 0; this.dust = 0; this.temp = 0; this.status = 'ok';
    this.thrust = 0; this.landed = true; this.altTarget = null; this.time = 0; this.odo = 0; this.events = []; this.impactCool = 0;
    this.heater = false; this.park = false; this.wheels = []; this.flipTime = 0; this._ax = {}; this._n = [0, 0, 1]; this._acc = 0; this._eAcc = 0;
    this.stats = { power: 0, solar: 0, speed: 0, slip: 0, contacts: 0, maxImpact: 0, thrustPct: 0, agl: 0, vz: 0, rho: 0, fixes: 0 };
    this.pts = [];
    const [a, b, c, o] = cfg.hull;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) this.pts.push([sx * a, sy * b, o + sz * c]);
    this.legIdx = this.pts.length;                  // после корпуса идут опоры
    for (const l of cfg.legs) this.pts.push(l.slice());
  }
  get mass() { return this.cfg.unit === 'kg' ? this.cfg.dry + this.battery : this.cfg.mass; }
  place(x, y, heading) {
    const t = this.terrain;
    this.q = qFromAxes([Math.sin(heading), Math.cos(heading), 0], [-Math.cos(heading), Math.sin(heading), 0], [0, 0, 1]);
    this.pos = [x, y, t.height(x, y) + 0.34 - t.g / 800]; this.vel = [0, 0, 0]; this.w = [0, 0, 0]; this.landed = true; this.thrust = 0; this.altTarget = null;
  }
  get heading() { const a = axes(this.q, this._ax); return Math.atan2(a.fx, a.fy); }
  get speed() { return Math.hypot(this.vel[0], this.vel[1]); }
  get upZ() { return axes(this.q, this._ax).uz; }
  agl() { return this.pos[2] - 0.34 - this.terrain.height(this.pos[0], this.pos[1]); }
  /** Наибольшая безопасная скорость снижения на данной высоте: успеть погасить её тягой до касания. */
  vSafeDown() {
    const aUp = Math.max(0.3, this.cfg.tpeak * (1 - 0.5 * this.damage / 100) / this.mass - this.terrain.g);
    return clamp(0.3 + Math.sqrt(0.5 * aUp * Math.max(this.agl(), 0)), 0.3, this.cfg.vz * 0.8);
  }

  step(dt, env) {
    const cfg = this.cfg, t = this.terrain, g = t.g, p = this.pos, v = this.vel, om = this.w, a = axes(this.q, this._ax);
    const m = this.mass, moon = cfg.unit === 'kg', inp = this.input, hd = Math.atan2(a.fx, a.fy);
    const dead = this.battery <= (moon ? 0.01 : 0.001) || this.status === 'destroyed';
    const alt = t.altitude(p[0], p[1], p[2]);
    const rho = moon ? 0 : 0.020 * Math.exp(-clamp(alt, -8000, 20000) / 11100);
    this.stats.rho = rho;
    // ---- желаемая скорость (из команд игрока или автопилота)
    let vdx, vdy, vdz, yawRate;
    if (this.cmd) { vdx = this.cmd.vx; vdy = this.cmd.vy; vdz = this.cmd.vz; yawRate = this.cmd.yaw * cfg.yawMax; }
    else {
      const f = clamp(inp.fwd, -1, 1) * cfg.vmax, s = clamp(inp.strafe, -1, 1) * cfg.vmax * 0.8;
      vdx = Math.sin(hd) * f + Math.cos(hd) * s; vdy = Math.cos(hd) * f - Math.sin(hd) * s;
      if (Math.abs(inp.climb) > 0.05) { vdz = inp.climb > 0 ? inp.climb * cfg.vz : inp.climb * cfg.vz * 0.7; this.altTarget = null; }
      else {
        if (this.altTarget == null) this.altTarget = p[2] + (v[2] > 0 ? v[2] * v[2] / (1.7 * g) : 0);   // тормозной путь вверх под действием тяжести
        const err = this.altTarget - p[2];
        vdz = err > 0 ? Math.min(0.9 * err, Math.sqrt(2 * 0.8 * g * err)) : Math.max(0.9 * err, -1.5);
        if (this.agl() < 0.45 && Math.abs(inp.fwd) < 0.05 && Math.abs(inp.strafe) < 0.05) { vdz = -0.4; this.altTarget = null; }   // у самой земли без команд — садимся
      }
      yawRate = clamp(inp.yaw, -1, 1) * cfg.yawMax;
      // помощник посадки: у земли скорость снижения ограничивается, чтобы не разбить опоры
      if (this.opts.assist && vdz < 0) vdz = Math.max(vdz, -this.vSafeDown());
    }
    // ---- внешний контур: ускорение -> вектор тяги
    const wind = env && !moon ? [Math.sin(env.windDir || 0) * (env.wind || 0), Math.cos(env.windDir || 0) * (env.wind || 0)] : [0, 0];
    let adx = 1.25 * (vdx - v[0]), ady = 1.25 * (vdy - v[1]), adz = 3.2 * (vdz - v[2]);
    const idle = this.landed && vdz <= 0.05 && Math.hypot(vdx, vdy) < 0.05 && !this.cmd;
    // допустимый наклон: горизонтальное ускорение не больше (g + ускорение вверх) * tan(tilt)
    const tz = Math.max(g + adz, 0.2 * g), ahMax = tz * Math.tan(cfg.tilt), ah = Math.hypot(adx, ady);
    if (ah > ahMax) { adx *= ahMax / ah; ady *= ahMax / ah; }
    let tx = m * adx, ty = m * ady, tzv = m * (g + adz);
    if (tzv < 0.15 * m * g) tzv = 0.15 * m * g;
    let Tmag = Math.hypot(tx, ty, tzv);
    const ud = [tx / Tmag, ty / Tmag, tzv / Tmag];
    // доступная тяга: у ротора зависит от плотности атмосферы и эффекта земли; у ракетного двигателя постоянна
    let ge = 1; const agl = this.agl();
    if (!moon) ge = 1 + 0.16 * Math.exp(-Math.max(agl, 0) / (2 * cfg.rotorR));
    let Tmax = cfg.tpeak * (moon ? 1 : clamp(rho / 0.017, 0.12, 2.6)) * ge;
    let derate = 1 - 0.5 * this.damage / 100;
    if (!moon && this.temp < -40) derate *= 0.8;
    Tmax *= derate;
    let Tcmd = clamp(Tmag, 0, Tmax);
    if (dead || idle) Tcmd = 0;
    // отклик двигателя
    const tau = cfg.thrTau, kk = 1 - Math.exp(-dt / tau);
    this.thrust += (Tcmd - this.thrust) * kk;
    if (dead) this.thrust *= 0.9;
    // ---- внутренний контур: ориентация (ось «вверх» к направлению тяги) и рыскание
    const ux = a.ux, uy = a.uy, uz = a.uz;
    const ex = uy * ud[2] - uz * ud[1], ey = uz * ud[0] - ux * ud[2], ez = ux * ud[1] - uy * ud[0];      // u × ud
    let wcx0 = 5.2 * ex, wcy0 = 5.2 * ey, wcz0 = 5.2 * ez;
    const wl = Math.hypot(wcx0, wcy0, wcz0); if (wl > 1.4) { const k = 1.4 / wl; wcx0 *= k; wcy0 *= k; wcz0 *= k; }     // не раскачиваем аппарат: угловая скорость ограничена
    const wc = [wcx0, wcy0, wcz0];
    const nu = om[0] * ux + om[1] * uy + om[2] * uz;                                                       // скорость вращения вокруг оси «вверх»
    const wcx = wc[0] + ux * yawRate, wcy = wc[1] + uy * yawRate, wcz = wc[2] + uz * yawRate;
    const kd = 9;
    const awx = kd * (wcx - om[0]), awy = kd * (wcy - om[1]), awz = kd * (wcz - om[2]);
    // в системе тела, ограничение по моменту
    let abx = a.fx * awx + a.fy * awy + a.fz * awz, aby = a.lx * awx + a.ly * awy + a.lz * awz, abz = a.ux * awx + a.uy * awy + a.uz * awz;
    const am = cfg.angMax * (this.thrust > 1 || moon ? 1 : 0.15);
    abx = clamp(abx, -am, am); aby = clamp(aby, -am, am); abz = clamp(abz, -am * 0.6, am * 0.6);
    if (dead || this.landed && idle) { abx = aby = abz = 0; }
    const Ix = cfg.inertia[0], Iy = cfg.inertia[1], Iz = cfg.inertia[2];
    const tbx = Ix * abx, tby = Iy * aby, tbz = Iz * abz;
    // ---- силы
    const T = this.thrust;
    let Fx = a.ux * T, Fy = a.uy * T, Fz = a.uz * T - m * g;
    if (!moon) {
      const rx = v[0] - wind[0], ry = v[1] - wind[1], rz = v[2], rs = Math.hypot(rx, ry, rz), fd = -0.5 * rho * cfg.cda * rs;
      Fx += fd * rx; Fy += fd * ry; Fz += fd * rz;
    }
    if (this.extF) { Fx += this.extF[0]; Fy += this.extF[1]; Fz += this.extF[2]; }
    let Tx = 0, Ty = 0, Tz = 0, contacts = 0, closeMax = 0, legHit = 0, bodyHit = 0;
    const nrm = this._n, mu = cfg.mu;
    for (let k = 0; k < this.pts.length; k++) {
      const hp = this.pts[k];
      const wx = p[0] + a.fx * hp[0] + a.lx * hp[1] + a.ux * hp[2], wy = p[1] + a.fy * hp[0] + a.ly * hp[1] + a.uy * hp[2], wz = p[2] + a.fz * hp[0] + a.lz * hp[1] + a.uz * hp[2];
      const pen = t.height(wx, wy) - wz;
      if (pen <= 0) continue;
      t.normal(wx, wy, nrm);
      const rx = wx - p[0], ry = wy - p[1], rz = wz - p[2];
      const vx = v[0] + om[1] * rz - om[2] * ry, vy = v[1] + om[2] * rx - om[0] * rz, vz = v[2] + om[0] * ry - om[1] * rx, vn = vx * nrm[0] + vy * nrm[1] + vz * nrm[2];
      const isLeg = k >= this.legIdx;
      const Fn = Math.max(0, m * (isLeg ? 200 : 260) * Math.min(pen, 0.8) * (1 + pen / 0.3) + m * (isLeg ? 12 : 22) * (vn < 0 ? -vn : -0.6 * vn));
      closeMax = Math.max(closeMax, -vn); if (isLeg) { legHit++; contacts++; } else bodyHit = Math.max(bodyHit, -vn);
      const tx = vx - nrm[0] * vn, ty = vy - nrm[1] * vn, tz = vz - nrm[2] * vn, tl = Math.hypot(tx, ty, tz), fr = mu * Fn * Math.tanh(tl / 0.05) / (tl || 1);
      const FX = nrm[0] * Fn - tx * fr, FY = nrm[1] * Fn - ty * fr, FZ = nrm[2] * Fn - tz * fr;
      Fx += FX; Fy += FY; Fz += FZ; Tx += ry * FZ - rz * FY; Ty += rz * FX - rx * FZ; Tz += rx * FY - ry * FX;
    }
    // посадка: опоры стоят, тяга выключена -> «якорь» удерживает от скольжения
    const wasLanded = this.landed;
    this.landed = legHit >= 2 && Math.hypot(v[0], v[1], v[2]) < 0.6 && vdz <= 0.05 && (!this.cmd || this.cmd.landing);
    if (this.landed && idle && !dead) {
      if (!this.anchor) this.anchor = [p[0], p[1], p[2]];
      const an = this.anchor, ks = m * 40, cs = 2 * 0.8 * Math.sqrt(ks * m);
      Fx += -ks * (p[0] - an[0]) - cs * v[0]; Fy += -ks * (p[1] - an[1]) - cs * v[1];
    } else this.anchor = null;
    if (this.landed) this.altTarget = null;
    // ---- интегрирование
    v[0] += Fx / m * dt; v[1] += Fy / m * dt; v[2] += Fz / m * dt;
    const wbx = a.fx * om[0] + a.fy * om[1] + a.fz * om[2], wby = a.lx * om[0] + a.ly * om[1] + a.lz * om[2], wbz = a.ux * om[0] + a.uy * om[1] + a.uz * om[2];
    const gbx = a.fx * Tx + a.fy * Ty + a.fz * Tz, gby = a.lx * Tx + a.ly * Ty + a.lz * Tz, gbz = a.ux * Tx + a.uy * Ty + a.uz * Tz;
    const dwx = (tbx + gbx - (Iz - Iy) * wby * wbz) / Ix, dwy = (tby + gby - (Ix - Iz) * wbz * wbx) / Iy, dwz = (tbz + gbz - (Iy - Ix) * wbx * wby) / Iz;
    const nbx = wbx + dwx * dt, nby = wby + dwy * dt, nbz = wbz + dwz * dt;
    om[0] = a.fx * nbx + a.lx * nby + a.ux * nbz; om[1] = a.fy * nbx + a.ly * nby + a.uy * nbz; om[2] = a.fz * nbx + a.lz * nby + a.uz * nbz;
    const vm = Math.hypot(v[0], v[1], v[2]); if (vm > 120) { const s2 = 120 / vm; v[0] *= s2; v[1] *= s2; v[2] *= s2; }
    const wm = Math.hypot(om[0], om[1], om[2]); if (wm > 14) { const s2 = 14 / wm; om[0] *= s2; om[1] *= s2; om[2] *= s2; }
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    const q = this.q, hw = 0.5 * dt, dq = qmul({ w: 0, x: om[0], y: om[1], z: om[2] }, q);
    q.w += dq.w * hw; q.x += dq.x * hw; q.y += dq.y * hw; q.z += dq.z * hw; qnorm(q);
    this._safety(dt);
    // ---- повреждения
    this.impactCool -= dt;
    this.stats.maxImpact = Math.max(this.stats.maxImpact * Math.exp(-dt), closeMax);
    if (this.opts.damage && this.impactCool <= 0 && (closeMax > 2.2 || bodyHit > 0.8)) {
      const dmg = (6 * Math.max(closeMax - 2.2, 0) ** 2 + 14 * Math.max(bodyHit - 0.8, 0)) * (cfg.armor != null ? cfg.armor : 1);
      this.damage = Math.min(100, this.damage + dmg); this.impactCool = 0.4; this.events.push({ type: 'impact', v: closeMax, dmg });
      if (this.damage >= 100) { this.status = 'destroyed'; this.events.push({ type: 'destroyed' }); }
    }
    if (a.uz < 0.2) this.flipTime += dt; else this.flipTime = Math.max(0, this.flipTime - dt * 2);
    // ---- расход
    let Pel = cfg.aux * 1000;
    if (moon) { const md = T / (cfg.isp * 9.80665); this.battery = Math.max(0, this.battery - md * dt); this.stats.fuelFlow = md; }
    else if (T > 0.5) {
      const Ar = cfg.rotors * Math.PI * cfg.rotorR * cfg.rotorR, Ph = Math.pow(T, 1.5) / (Math.sqrt(2 * Math.max(rho, 0.004) * Ar) * cfg.fm);
      Pel += Ph / 0.85 + 0.0 * cfg.power;
    }
    this.time += dt; this.odo += Math.hypot(v[0], v[1]) * dt;
    this.stats.contacts = contacts; this.stats.speed = this.speed; this.stats.thrustPct = Tmax > 0 ? T / Tmax : 0; this.stats.agl = agl; this.stats.vz = v[2];
    this._eAcc += Pel * dt; this._acc += dt;
    if (this._acc >= 0.25) this._slow(this._acc, env, rho);
    return this;
  }

  _safety(dt) {
    const t = this.terrain, p = this.pos, v = this.vel, om = this.w;
    if (!Number.isFinite(p[0] + p[1] + p[2] + v[0] + v[1] + v[2] + this.q.w + this.q.x + om[0])) {
      this.stats.fixes++; const g = this._good; if (g) { this.pos = g.pos.slice(); this.q = Object.assign({}, g.q); this.vel = [0, 0, 0]; this.w = [0, 0, 0]; } else this.place(0, 0, 0); return;
    }
    const a = axes(this.q, this._ax2 || (this._ax2 = {})), nrm = this._n2 || (this._n2 = [0, 0, 1]);
    let worst = 0, wx = 0, wy = 0;
    for (const hp of this.pts) {
      const x = p[0] + a.fx * hp[0] + a.lx * hp[1] + a.ux * hp[2], y = p[1] + a.fy * hp[0] + a.ly * hp[1] + a.uy * hp[2], z = p[2] + a.fz * hp[0] + a.lz * hp[1] + a.uz * hp[2];
      const pen = t.height(x, y) - z; if (pen > worst) { worst = pen; wx = x; wy = y; }
    }
    if (worst > 0.15) {
      t.normal(wx, wy, nrm); const c = worst - 0.06;
      p[0] += nrm[0] * c; p[1] += nrm[1] * c; p[2] += nrm[2] * c;
      const vin = v[0] * nrm[0] + v[1] * nrm[1] + v[2] * nrm[2]; if (vin < 0) { v[0] -= nrm[0] * vin; v[1] -= nrm[1] * vin; v[2] -= nrm[2] * vin; }
      om[0] *= 0.9; om[1] *= 0.9; om[2] *= 0.9; this.stats.fixes++;
    } else if (worst <= 0.02) { this._goodT = (this._goodT || 0) + dt; if (this._goodT > 0.5) { this._goodT = 0; this._good = { pos: p.slice(), q: Object.assign({}, this.q) }; } }
  }

  _slow(dt, env, rho) {
    const cfg = this.cfg, t = this.terrain, p = this.pos, moon = cfg.unit === 'kg';
    const pel = this._eAcc / dt; this._acc = 0; this._eAcc = 0;
    let solar = 0;
    if (env) {
      const a = axes(this.q, this._ax), cosI = Math.max(0, env.sunDir[0] * a.ux + env.sunDir[1] * a.uy + env.sunDir[2] * a.uz);
      const shadow = this.landed ? inShadow(t, p[0], p[1], p[2] + 0.4, env.sunDir) : false;
      const atm = moon ? 1 : Math.min(1, Math.exp(-Math.max(env.tau, 0.1) / Math.max(env.sunEl > 0 ? Math.sin(env.sunEl * D2R) : 0, 0.12)) * 1.6);
      solar = cfg.solarKw * 1000 / (env.r * env.r) * cosI * (shadow ? 0.08 : 1) * atm * (1 - 0.65 * this.dust);
      this.inShadow = shadow;
      this.temp += ((env.temp * 0.35 + 12) - this.temp) * Math.min(1, dt / 600) + (pel > 100 ? 0.002 * dt : 0);
      this.dust = clamp(this.dust + (env.storm || 0) * 3e-4 * dt * 0.25 - (env.wind > 14 ? 1e-4 : 1e-5) * dt * 0.25, 0, 1);
      this.dose += (t.body === 'moon' ? 1.37 : 0.8) / 24 / 3600 * dt;
    }
    if (moon) {
      // концепт: узел ISRU добывает топливо из реголита днём, пока дрон стоит
      const gain = this.landed ? cfg.refuelKgPerH * Math.max(0, env ? env.sunDir[2] : 0) * dt / 3600 : 0;
      this.battery = clamp(this.battery + gain, 0, cfg.batteryKwh); this.stats.solar = gain * 3600 / dt; this.stats.power = pel;
    } else {
      this.battery = clamp(this.battery + (solar - pel) * dt / 3.6e6, 0, cfg.batteryKwh); this.stats.solar = solar; this.stats.power = pel;
    }
  }
  cleanPanels() { this.dust = Math.max(0, this.dust * 0.12); }
  rightVehicle() { const h = this.heading; this.place(this.pos[0], this.pos[1], h); this.pos[2] += 0.8; }
}

/** Автопилот дрона: взлёт, полёт над маршрутом на безопасной высоте с огибанием рельефа, посадка в конце. */
const DroneAutopilot = {
  control(d, terrain, route, st, dt) {
    const cfg = d.cfg, p = d.pos;
    let best = st.idx || 0, bd = 1e18;
    for (let i = Math.max(0, best - 3); i < Math.min(route.length, best + 80); i++) { const q = (route[i][0] - p[0]) ** 2 + (route[i][1] - p[1]) ** 2; if (q < bd) { bd = q; best = i; } }
    st.idx = best; st.offRoute = Math.sqrt(bd);
    const v = Math.hypot(d.vel[0], d.vel[1]), look = clamp(30 + 5 * v, 35, 160);
    let acc = 0, ti = best;
    while (ti < route.length - 1 && acc < look) { acc += Math.hypot(route[ti + 1][0] - route[ti][0], route[ti + 1][1] - route[ti][1]); ti++; }
    const tgt = route[ti], dx = tgt[0] - p[0], dy = tgt[1] - p[1], dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
    // рельеф впереди: нужная высота = максимум высоты на пути + запас
    const ahead = clamp(10 + 9 * v, 25, 300); let zmax = terrain.height(p[0], p[1]);
    for (let s = 6; s <= ahead; s += 6) zmax = Math.max(zmax, terrain.height(p[0] + ux * s, p[1] + uy * s));
    const finalIdx = route.length - 1, toEnd = Math.hypot(route[finalIdx][0] - p[0], route[finalIdx][1] - p[1]);
    const lowEnergy = d.battery < 0.13 * cfg.batteryKwh;
    let altT = zmax + cfg.cruiseAGL, vh = cfg.vmax * (cfg.unit === 'kg' ? 0.62 : 0.85);
    const ahMax = terrain.g * Math.tan(cfg.tilt) * 0.6;                      // горизонтальное торможение ограничено наклоном
    if (st.finalStage) vh = Math.min(vh, Math.sqrt(2 * ahMax * Math.max(toEnd - 12, 0)) + 0.6);   // профиль торможения до точки посадки
    const landing = st.land || lowEnergy || (st.finalStage && toEnd < 25 + 3 * v);
    if (landing) {
      const gz = terrain.height(p[0], p[1]);
      altT = gz + (d.agl() > 8 ? 3.34 : 0.2);                 // цель чуть ниже касания: прижимаемся к грунту, а не зависаем
      vh = st.finalStage && !lowEnergy ? clamp(toEnd * 0.35, 0.0, cfg.vmax * 0.6) : 0;
      if (lowEnergy) st.landingNow = true;
      if (v > 4 && d.agl() > 6) altT = Math.max(altT, p[2]);   // пока не погасили скорость, не снижаемся
      if (d.agl() < 1.5) vh = 0;                              // над самой землёй горизонтальную скорость гасим
    }
    if (p[2] < altT - 6) vh *= clamp(1 - (altT - p[2] - 6) / 12, 0.1, 1);       // сначала набираем высоту
    let vz = clamp(0.8 * (altT - p[2]), -cfg.vz * 0.7, cfg.vz);
    if (landing) vz = clamp(0.8 * (altT - p[2]), -d.vSafeDown(), 0.3);
    if (landing && d.landed) { d.cmd = null; st.cmd = null; st.parked = true; return null; }   // сели: двигатели выключаем
    let e = Math.atan2(dx, dy) - d.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
    const toward = landing && vh < 0.2 ? 0 : 1;
    const speedF = Math.abs(e) > 0.9 ? 0.2 : 1;
    st.cmd = { vx: ux * vh * speedF * toward, vy: uy * vh * speedF * toward, vz, yaw: clamp(-e * 1.4, -1, 1), landing, target: tgt };
    // yaw: положительный = влево (против часовой); e>0 значит цель справа -> отрицательный yaw
    d.cmd = st.cmd;
    return st.cmd;
  },
};

// ======================================================================= автопилот
/** Локальный планировщик: по уклонам вокруг строит карту проходимости 4 м, ищет путь A* к точке маршрута впереди
    (обходя кратеры и валуны) и ведёт технику по нему «погоней за точкой». */
const Autopilot = {
  plan(rover, terrain, route, st) {
    const cell = 4, H = 24, N = 2 * H + 1, p = rover.pos, lim = st.limit;
    const cx = Math.round(p[0] / cell) * cell, cy = Math.round(p[1] / cell) * cell;
    const slope = new Float32Array(N * N), cost = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = cx + (i - H) * cell, y = cy + (j - H) * cell, k = j * N + i;
      const sl = terrain.slopeDeg(x, y, 2.5);
      slope[k] = sl;
      cost[k] = sl > lim * 1.05 ? 0 : 1 + 5 * (sl / lim) * (sl / lim);
    }
    // Валуны: ячейка 4 м крупнее многих камней, поэтому отмечаем их отдельно с запасом на колею.
    terrain.forEachRock(cx - (H + 2) * cell, cx + (H + 2) * cell, cy - (H + 2) * cell, cy + (H + 2) * cell, (rx, ry, rr) => {
      const h = 0.5 * rr; if (h < 0.14) return;
      const rad = rr + (h > 0.3 ? 1.6 : 1.1), i0 = Math.max(0, Math.floor((rx - rad - cx) / cell + H)), i1 = Math.min(N - 1, Math.ceil((rx + rad - cx) / cell + H));
      const j0 = Math.max(0, Math.floor((ry - rad - cy) / cell + H)), j1 = Math.min(N - 1, Math.ceil((ry + rad - cy) / cell + H));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (Math.hypot(cx + (i - H) * cell - rx, cy + (j - H) * cell - ry) > rad + 0.6 * cell) continue;
        const k = j * N + i; if (h > 0.3) cost[k] = 0; else if (cost[k] > 0) cost[k] += 8;
      }
    });
    const si = Math.round((p[1] - cy) / cell + H) * N + Math.round((p[0] - cx) / cell + H);
    cost[si] = Math.max(cost[si], 1);
    // цель: самая дальняя точка маршрута, которая ещё лежит в окне
    const inWin = q => Math.abs(q[0] - cx) <= (H - 2) * cell && Math.abs(q[1] - cy) <= (H - 2) * cell;
    let gk = -1, gx = 0, gy = 0;
    for (let k = st.idx; k < route.length; k++) { if (inWin(route[k])) { gk = k; gx = route[k][0]; gy = route[k][1]; } else if (gk >= 0) break; }
    if (gk < 0) {   // маршрут вне окна: идём в его сторону
      const q = route[Math.min(route.length - 1, st.idx + 10)], dx = q[0] - cx, dy = q[1] - cy, m = Math.max(Math.abs(dx), Math.abs(dy), 1) / ((H - 2) * cell);
      gx = cx + dx / m; gy = cy + dy / m;
    }
    const gi = clamp(Math.round((gx - cx) / cell + H), 1, N - 2), gj = clamp(Math.round((gy - cy) / cell + H), 1, N - 2), goal = gj * N + gi;
    // A*
    const g = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
    const heap = [[0, si]]; g[si] = 0;
    const hf = k => { const dx = Math.abs((k % N) - gi), dy = Math.abs(((k / N) | 0) - gj); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
    const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const pa = (i - 1) >> 1; if (heap[pa][0] <= heap[i][0]) break; [heap[pa], heap[i]] = [heap[i], heap[pa]]; i = pa; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let best = si, bestH = hf(si), reached = false;
    while (heap.length) {
      const [, k] = pop(); if (done[k]) continue; done[k] = 1;
      if (k === goal) { best = k; reached = true; break; }
      const h = hf(k); if (h < bestH) { bestH = h; best = k; }
      const ki = k % N, kj = (k / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ki + di, nj = kj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni; if (cost[nk] === 0 || done[nk]) continue;
        if (di && dj && (cost[kj * N + ni] === 0 || cost[nj * N + ki] === 0)) continue;   // не срезаем углы
        const ng = g[k] + cost[nk] * (di && dj ? 1.4142 : 1) + 0.02 * Math.hypot(cx + (ni - H) * cell - gx, cy + (nj - H) * cell - gy) / cell;
        if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(ng + hf(nk) * 1.05, nk); }
      }
    }
    const path = []; for (let k = best; k !== -1; k = from[k]) path.push([cx + ((k % N) - H) * cell, cy + (((k / N) | 0) - H) * cell, slope[k]]);
    path.reverse();
    st.path = path; st.reached = reached; st.partial = !reached && bestH > 3;
  },

  /** Команды управления; st хранит состояние между вызовами. */
  control(rover, terrain, route, st, dt) {
    const cfg = rover.cfg, p = rover.pos, hdg = rover.heading, v = rover.speed;
    let best = st.idx || 0, bd = 1e18;
    for (let i = Math.max(0, best - 3); i < Math.min(route.length, best + 60); i++) {
      const d = (route[i][0] - p[0]) ** 2 + (route[i][1] - p[1]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    st.idx = best; st.offRoute = Math.sqrt(bd); st.limit = (cfg.crewed ? 20 : 15) * 0.85;
    st.replan = (st.replan || 0) - dt;
    if (!st.path || st.replan <= 0) { this.plan(rover, terrain, route, st); st.replan = 1.5; st.pi = 0; }
    const path = st.path, wb = 2.4;
    // ближайшая точка пути, затем точка на расстоянии упреждения
    let pi = st.pi || 0, pd = 1e18;
    for (let i = Math.max(0, pi - 2); i < Math.min(path.length, pi + 8); i++) { const d = (path[i][0] - p[0]) ** 2 + (path[i][1] - p[1]) ** 2; if (d < pd) { pd = d; pi = i; } }
    st.pi = pi;
    const Ld = clamp(5 + 2.5 * Math.max(v, 0) * (cfg.vmax > 1 ? 1 : 0.2), 6, 20);
    let acc = 0, ti = pi, worst = 0;
    while (ti < path.length - 1 && acc < Ld) { acc += Math.hypot(path[ti + 1][0] - path[ti][0], path[ti + 1][1] - path[ti][1]); ti++; worst = Math.max(worst, path[ti][2]); }
    for (let i = ti; i < Math.min(path.length, ti + 4); i++) worst = Math.max(worst, path[i][2]);
    const tgt = path[ti] || [p[0], p[1]];
    const dx = tgt[0] - p[0], dy = tgt[1] - p[1], dist = Math.hypot(dx, dy);
    let e = Math.atan2(dx, dy) - hdg; e = Math.atan2(Math.sin(e), Math.cos(e));
    const delta = -Math.atan(2 * wb * Math.sin(e) / Math.max(dist, 3));
    const steer = clamp(delta / cfg.steerMax, -1, 1);
    const vmaxAp = cfg.vmax * 0.8;
    let vt = vmaxAp * clamp(1.15 - worst / st.limit, 0.15, 1) * clamp(1 - Math.abs(steer) * 0.55, 0.3, 1);
    if (Math.abs(e) > 1.2) vt = Math.min(vt, vmaxAp * 0.3);             // разворот на месте не нужен: едем медленно
    const noPath = path.length < 3 || (st.partial && ti >= path.length - 1);
    if (noPath) vt = 0;
    const err = vt - v;
    const brake = err < -0.4 * Math.max(vt, 0.2) ? clamp(-err / Math.max(vt, 0.5), 0, 1) : 0;
    st.cmd = { throttle: brake > 0 ? 0 : clamp(err * 0.9, -1, 1), steer, brake, blocked: noPath, target: tgt, speedTarget: vt };
    return st.cmd;
  },
};

// ======================================================================= режим «ускоренная поездка»
/** Приближённая модель движения по маршруту без физики: для быстрого перелёта между участками.
    Использует тот же профиль и тот же сценарий ограничений, что и планировщик сервера. */
class Cruise {
  constructor(route, cfg, env, opts = {}) {
    this.R = route.radius; this.pts = route.points; this.cum = route.cum; this.total = route.cum[route.cum.length - 1];
    this.elev = route.elevation;              // [[км, высота]]
    this.cfg = cfg; this.env = env; this.prof = route.profile; this.body = route.body;
    this.s = opts.s || 0; this.t = opts.t || 0; this.battery = opts.battery != null ? opts.battery : cfg.batteryKwh;
    this.speedMult = 1 + 0.07 * ((cfg.up && cfg.up.motor) || 0);
    this.reason = 'move'; this.charging = false; this.dust = opts.dust || 0; this.moveH = 0; this.waitH = 0;
    this.k = { rover_crew: [3, 1], rover_robot: [3, 1], walker: [3.5, 2] }[cfg.key] || [3, 1];
    this.flat = cfg.drone ? 8.3 : ({ rover_crew: 2.78, rover_robot: 0.0417, walker: 0.833 }[cfg.key] || 2);
  }
  posAt(s) {
    const c = this.cum; let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const f = clamp((s - c[lo]) / Math.max(c[hi] - c[lo], 1e-6), 0, 1), a = this.pts[lo], b = this.pts[hi];
    return { lat: lerp(a[0], b[0], f), lon: lerp(a[1], b[1], f), idx: lo, f };
  }
  grade(s) {
    const e = this.elev, km = s / 1000; let lo = 0, hi = e.length - 1;
    if (hi < 1) return 0;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (e[m][0] <= km) lo = m; else hi = m; }
    const d = Math.max((e[hi][0] - e[lo][0]) * 1000, 1);
    return (e[hi][1] - e[lo][1]) / d;
  }
  /** Шаг dt часов. Возвращает {moved, reason}. */
  step(dtH) {
    const cfg = this.cfg, pos = this.posAt(this.s), env = this.env.at(this.t, pos.lat, pos.lon);
    const g = this.body === 'moon' ? 1.62 : 3.71;
    let reason = 'move';
    const gr = this.grade(this.s);
    if (cfg.daylightOnly && env.sunEl <= 0) reason = 'night';
    else if (env.temp < cfg.tMin || env.temp > cfg.tMax) reason = 'temp';
    else if (this.body === 'mars' && env.tau > 3.2 && !cfg.crewed) reason = 'storm';
    const need = 0.12 * cfg.batteryKwh;
    if (cfg.batteryKwh > 0 && cfg.solarKw >= 0) {
      if (this.battery < 0.1 * cfg.batteryKwh) this.charging = true;
      if (this.charging && this.battery >= 0.8 * cfg.batteryKwh) this.charging = false;
      if (this.charging && reason === 'move' && cfg.solarKw > 0) reason = 'charge';
    }
    let v = 0, power = cfg.aux * 1000;
    if (cfg.drone && reason === 'move') {
      v = this.flat * this.speedMult * Math.exp(-(gr > 0 ? 0.3 : 0.1) * Math.abs(gr));
      const dtD = dtH; this.s = Math.min(this.total, this.s + v * dtD * 3600);
      const sinD = Math.max(0, Math.sin(env.sunEl * D2R)), atmD = this.body === 'mars' ? Math.min(1, Math.exp(-Math.max(env.tau, 0.1) / Math.max(sinD, 0.12)) * 1.6) : 1;
      this.battery = clamp(this.battery + (cfg.chargeRate * sinD / (env.r * env.r) * atmD * (1 - 0.65 * this.dust) - cfg.cruiseUse) * dtD, 0, cfg.batteryKwh);
      this.t += dtD; this.moveH += dtD; this.reason = reason; this.env_ = env; this.gradeNow = gr;
      return { moved: v * dtD * 3600, reason, env };
    }
    if (cfg.drone) {   // стоянка: зарядка/дозаправка днём
      const sinD = Math.max(0, Math.sin(env.sunEl * D2R)), atmD = this.body === 'mars' ? Math.min(1, Math.exp(-Math.max(env.tau, 0.1) / Math.max(sinD, 0.12)) * 1.6) : 1;
      this.battery = clamp(this.battery + (cfg.chargeRate * sinD / (env.r * env.r) * atmD * (1 - 0.65 * this.dust) - cfg.aux * (this.body === 'mars' ? 1 : 0)) * dtH, 0, cfg.batteryKwh);
      this.t += dtH; this.waitH += dtH; this.reason = reason; this.env_ = env; this.gradeNow = gr; this.dust = clamp(this.dust + (env.storm || 0) * 1.2e-3 * dtH, 0, 1);
      return { moved: 0, reason, env };
    }
    if (reason === 'move') {
      v = this.flat * this.speedMult * Math.exp(-(gr > 0 ? this.k[0] : this.k[1]) * Math.abs(gr));
      v = Math.max(v, this.flat * 0.05);
      power += cfg.mass * g * v * (cfg.crr + Math.max(gr, 0)) + (cfg.thermLevel ? 0 : 0);
    }
    const dt = dtH * 3600;
    this.s = Math.min(this.total, this.s + v * dt);
    // солнечная генерация (в среднем по горизонтальной поверхности)
    const sinEl = Math.max(0, Math.sin(env.sunEl * D2R));
    const atm = this.body === 'mars' ? Math.min(1, Math.exp(-Math.max(env.tau, 0.1) / Math.max(sinEl, 0.12)) * 1.6) : 1;
    const solar = cfg.solarKw * 1000 * sinEl / (env.r * env.r) * atm * (1 - 0.65 * this.dust);
    this.battery = clamp(this.battery + (solar - power) * dt / 3.6e6, 0, cfg.batteryKwh);
    this.dust = clamp(this.dust + (env.storm || 0) * 1.2e-3 * dtH, 0, 1);
    this.t += dtH;
    if (reason === 'move') this.moveH += dtH; else this.waitH += dtH;
    this.reason = reason; this.env_ = env; this.gradeNow = gr;
    return { moved: v * dt, reason, env };
  }
}

return { Geo, Terrain, Rover, Walker, Drone, DroneAutopilot, droneConfig, Autopilot, Cruise, Environment, SunTrack, VEHICLES, UPGRADES, applyUpgrades,
         conditions, inShadow, axes, qFromAxes, qmul, hash2, rnd, vnoise, clamp, lerp, smooth, dustTau, stormProbPerSol, D2R, R2D };
});
