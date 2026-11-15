// Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
// Падения и прыжки: вездеход не должен оказываться под грунтом (node tests/drop.test.js)
const C = require('../web/sim/core.js');
let fails = 0; const ok = (c, m, e = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m + (e ? '  [' + e + ']' : '')); };
function terr(fn, body) {
  const n = 500, res = 4, z = new Float32Array(n * n), x0 = -1000, y0 = -1000;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = fn(x0 + i * res, y0 + j * res);
  return new C.Terrain({ nx: n, ny: n, res, x0, y0, h0: 0, radius: 1737400, gravity: body === 'moon' ? 1.62 : 3.71, body, lat0: 0, lon0: 0, craters: [] }, z, { smallDensity: 0.6, rocks: 1 });
}
const env = { sunDir: [.5, .2, .8], sunEl: 50, tau: .4, storm: 0, wind: 3, r: 1, temp: 20 };
function depth(r, t) {
  const a = C.axes(r.q, {}); let d = 0;
  for (const hp of r.hullPts) d = Math.max(d, t.height(r.pos[0] + a.fx * hp[0] + a.lx * hp[1] + a.ux * hp[2], r.pos[1] + a.fy * hp[0] + a.ly * hp[1] + a.uy * hp[2]) - (r.pos[2] + a.fz * hp[0] + a.lz * hp[1] + a.uz * hp[2]));
  return d;
}
for (const body of ['moon', 'mars']) for (const dt of [0.01, 0.02]) {
  // 1. падение с высоты 6 м на крутой склон кратера (R=40, глубина 20 м)
  const crater = (x, y) => { const r = Math.hypot(x, y) / 40; return r < 1 ? -20 * (1 - r * r) + 2 * r ** 4 : 2 / r ** 3; };
  let t = terr(crater, body), r = new C.Rover(C.applyUpgrades(C.VEHICLES.rover_crew, {}), t); r.place(25, 0, 1.0); r.pos[2] += 6;
  let worst = 0; for (let i = 0; i < 1500; i++) { r.step(dt, env); worst = Math.max(worst, depth(r, t)); if (!Number.isFinite(r.pos[2])) break; }
  ok(Number.isFinite(r.pos[2]) && worst < 0.3 && r.pos[2] > t.height(r.pos[0], r.pos[1]) - 0.3, `${body} dt=${dt}: падение 6 м на стенку кратера`, `max под грунтом ${worst.toFixed(2)} м, fixes=${r.stats.fixes || 0}`);
  // 2. заезд в кратер на полном газу и выезд с другой стороны
  t = terr((x, y) => { const rr = Math.hypot(x, y - 120) / 30; return rr < 1 ? -12 * (1 - rr * rr) + 1.5 * rr ** 4 : 1.5 / rr ** 3; }, body);
  r = new C.Rover(C.applyUpgrades(C.VEHICLES.rover_crew, { motor: 4, tires: 4 }), t, { stability: false }); r.place(0, -60, 0);
  worst = 0; let bad = false;
  for (let i = 0; i < 6000; i++) { Object.assign(r.input, { throttle: 1, steer: 0 }); r.step(dt, env); worst = Math.max(worst, depth(r, t)); if (!Number.isFinite(r.pos[2])) { bad = true; break; } }
  ok(!bad && worst < 0.3, `${body} dt=${dt}: заезд в кратер на полном газу`, `max под грунтом ${worst.toFixed(2)} м, fixes=${r.stats.fixes || 0}, y=${r.pos[1].toFixed(0)}`);
  // 3. боком по склону 25 градусов (опрокидывание допускается, провал — нет)
  t = terr((x, y) => Math.tan(25 * Math.PI / 180) * x, body); r = new C.Rover(C.applyUpgrades(C.VEHICLES.rover_crew, {}), t, { stability: false }); r.place(0, 0, 0);
  worst = 0; for (let i = 0; i < 3000; i++) { Object.assign(r.input, { throttle: 0.7, steer: 0.5 }); r.step(dt, env); worst = Math.max(worst, depth(r, t)); }
  ok(Number.isFinite(r.pos[2]) && worst < 0.3, `${body} dt=${dt}: крутой склон боком, возможное опрокидывание`, `max под грунтом ${worst.toFixed(2)} м`);
}
console.log(fails ? `\n${fails} ПРОВАЛОВ` : '\nВсе проверки пройдены'); process.exit(fails ? 1 : 0);
