// Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
// Проверки дрона без графики: node tests/drone.test.js
const C = require('../web/sim/core.js');
let fails = 0; const ok = (c, m, e = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m + (e ? '  [' + e + ']' : '')); };
function terr(fn, body) {
  const n = 500, res = 4, z = new Float32Array(n * n), x0 = -1000, y0 = -1000;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = fn(x0 + i * res, y0 + j * res);
  return new C.Terrain({ nx: n, ny: n, res, x0, y0, h0: body === 'mars' ? -2500 : 0, radius: body === 'moon' ? 1737400 : 3396190, gravity: body === 'moon' ? 1.62 : 3.71, body, lat0: 0, lon0: 0, craters: [] }, z, { smallDensity: 0, rocks: 0 });
}
const env = { sunDir: [.5, .2, .8], sunEl: 50, tau: .4, storm: 0, wind: 3, windDir: 1, r: 1, temp: 0 };
const fin = d => [...d.pos, ...d.vel, ...d.w, d.q.w].every(Number.isFinite);
for (const body of ['mars', 'moon']) {
  console.log('\n== ' + body);
  const t = terr((x, y) => 0.5 * Math.sin(x / 60) + 0.002 * y, body), cfg = C.droneConfig(body), d = new C.Drone(cfg, t);
  d.place(0, 0, 0);
  for (let i = 0; i < 300; i++) d.step(0.01, env);
  ok(fin(d) && d.landed && d.speed < 0.05 && Math.abs(d.vel[2]) < 0.05, 'стоит на опорах', `z=${d.pos[2].toFixed(2)} agl=${d.agl().toFixed(2)}`);
  // взлёт и висение
  d.input.climb = 1; for (let i = 0; i < 500; i++) d.step(0.01, env); d.input.climb = 0;
  for (let i = 0; i < 800; i++) d.step(0.01, env);
  const agl1 = d.agl();
  ok(fin(d) && agl1 > 4 && Math.abs(d.vel[2]) < 0.4, 'взлёт и висение', `agl=${agl1.toFixed(1)} vz=${d.vel[2].toFixed(2)} thr=${(d.stats.thrustPct * 100).toFixed(0)}%`);
  const e0 = d.battery; for (let i = 0; i < 3000; i++) d.step(0.01, env);
  const used = e0 - d.battery;
  ok(used > 0, 'расход при висении за 30 с', `${used.toFixed(4)} ${cfg.unit}; ожидаемо за час ${(used * 120).toFixed(2)} ${cfg.unit}`);
  // горизонтальный полёт
  d.input.fwd = 1; let vmaxSeen = 0, tilt = 0; for (let i = 0; i < 2500; i++) { d.step(0.01, env); vmaxSeen = Math.max(vmaxSeen, d.speed); tilt = Math.max(tilt, Math.acos(d.upZ) * 57.3); }
  ok(fin(d) && vmaxSeen > cfg.vmax * 0.8 && vmaxSeen < cfg.vmax * 1.3, 'разгон до предельной скорости', `v=${vmaxSeen.toFixed(1)} из ${cfg.vmax}, наклон ${tilt.toFixed(0)}°`);
  d.input.fwd = 0; for (let i = 0; i < 4000; i++) d.step(0.01, env);
  ok(d.speed < 0.5, 'торможение до зависания', `v=${d.speed.toFixed(2)}`);
  // посадка
  d.input.climb = -1; for (let i = 0; i < 6000 && !d.landed; i++) d.step(0.01, env); d.input.climb = 0;
  for (let i = 0; i < 400; i++) d.step(0.01, env);
  ok(d.landed && d.damage < 5, 'мягкая посадка', `damage=${d.damage.toFixed(1)} vz=${d.vel[2].toFixed(2)}`);
  // падение с высоты при отказе (топливо/батарея 0)
  const d2 = new C.Drone(cfg, t); d2.place(0, 0, 0); d2.pos[2] += 25; d2.battery = 0; for (let i = 0; i < 2500; i++) d2.step(0.01, env);
  ok(fin(d2) && d2.damage > 20 && d2.pos[2] > t.height(d2.pos[0], d2.pos[1]) - 0.3, 'падение при отказе: повреждения, но не под землёй', `damage=${d2.damage.toFixed(0)}`);
  // автопилот по маршруту с холмом
  const hill = terr((x, y) => 30 * Math.exp(-((x - 0) ** 2 + (y - 250) ** 2) / 4000), body), d3 = new C.Drone(cfg, hill); d3.place(0, -100, 0);
  const route = []; for (let k = 0; k <= 60; k++) route.push([0, -100 + k * 12]);
  const st = { finalStage: true }; let aglMin = 1e9, secs = 0;
  for (let i = 0; i < 24000; i++) { DroneAutopilot = C.DroneAutopilot; C.DroneAutopilot.control(d3, hill, route, st, 0.01); d3.step(0.01, env); secs += 0.01; if (d3.agl() < aglMin && secs > 15 && d3.pos[1] < 590) aglMin = d3.agl(); if (d3.landed && secs > 30 && d3.pos[1] > 600) break; }
  ok(fin(d3) && d3.pos[1] > 560 && d3.landed && d3.damage < 5, 'автопилот: взлёт, перелёт через холм, посадка', `y=${d3.pos[1].toFixed(0)} t=${secs.toFixed(0)}с minAGL=${aglMin.toFixed(1)} dmg=${d3.damage.toFixed(1)} ${cfg.unit} left=${d3.battery.toFixed(3)}`);
}
console.log(fails ? `\n${fails} ПРОВАЛОВ` : '\nВсе проверки пройдены'); process.exit(fails ? 1 : 0);
