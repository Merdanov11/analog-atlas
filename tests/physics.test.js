// Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
// Rover physics checks without graphics: node tests/physics.test.js
const C = require('../web/sim/core.js');
let fails = 0;
const ok = (c, msg, extra = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + msg + (extra ? '  [' + extra + ']' : '')); };

function makeTerrain(fn, body = 'moon', n = 400, res = 4, opt = {}) {
  const z = new Float32Array(n * n), x0 = -n * res / 2, y0 = -n * res / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = fn(x0 + i * res, y0 + j * res);
  const hdr = { nx: n, ny: n, res, x0, y0, h0: 0, radius: body === 'moon' ? 1737400 : 3396190, gravity: body === 'moon' ? 1.62 : 3.71,
                body, lat0: 0, lon0: 0, craters: [] };
  return new C.Terrain(hdr, z, Object.assign({ smallDensity: 0, rocks: 0 }, opt));
}
const env = { sunDir: [0.5, 0.2, 0.8], sunEl: 50, tau: 0.4, storm: 0, wind: 3, r: 1, temp: 20 };
function run(rover, secs, dt, input, hook) {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) { Object.assign(rover.input, typeof input === 'function' ? input(i * dt) : input); rover.step(dt, env); if (hook) hook(rover, i * dt); }
}
const finite = r => [...r.pos, ...r.vel, ...r.w, r.q.w, r.q.x, r.q.y, r.q.z].every(Number.isFinite);
const crewCfg = body => C.applyUpgrades(C.VEHICLES.rover_crew, {});

for (const body of ['moon', 'mars']) {
  console.log('\n== ' + body);
  const g = body === 'moon' ? 1.62 : 3.71;
  // 1. at rest on flat ground
  let t = makeTerrain(() => 0, body), r = new C.Rover(crewCfg(), t); r.place(0, 0, 0);
  run(r, 6, 1 / 100, {});
  const sag = r.pos[2];
  ok(finite(r) && Math.abs(r.speed) < 0.02 && Math.abs(r.pos[0]) < 0.3 && Math.abs(r.pos[1]) < 0.3, 'at rest on a flat surface', `z=${sag.toFixed(3)} v=${r.speed.toFixed(4)} drift=${Math.hypot(r.pos[0], r.pos[1]).toFixed(3)}`);
  ok(r.wheels.every(w => w.contact), 'all wheels touch the ground');
  const staticN = r.wheels.reduce((s, w) => s + w.Fn, 0);
  ok(Math.abs(staticN / (r.cfg.mass * g) - 1) < 0.05, 'sum of normal reactions = weight', `ratio=${(staticN / (r.cfg.mass * g)).toFixed(3)}`);
  // 2. acceleration
  const start = r.pos[1]; let vmaxSeen = 0;
  run(r, 25, 1 / 100, { throttle: 1 }, rr => { vmaxSeen = Math.max(vmaxSeen, rr.speed); });
  ok(finite(r) && vmaxSeen > r.cfg.vmax * 0.7 && vmaxSeen < r.cfg.vmax * 1.12, 'acceleration to the speed limit', `vmax=${vmaxSeen.toFixed(2)} (limit ${r.cfg.vmax})`);
  ok(Math.abs(r.pos[0]) < 1.5, 'drives straight', `lateral=${r.pos[0].toFixed(2)}`);
  // 3. braking
  const v0 = r.speed; run(r, 12, 1 / 100, { brake: 1 });
  ok(r.speed < 0.1, 'braking to a stop', `${v0.toFixed(2)}->${r.speed.toFixed(3)}`);
  // 4. climbing 12 degrees
  t = makeTerrain((x, y) => Math.tan(12 * Math.PI / 180) * (y + 800), body); r = new C.Rover(crewCfg(), t); r.place(0, -200, 0);
  run(r, 30, 1 / 100, { throttle: 1 });
  ok(finite(r) && r.pos[1] > -170, 'climbing a 12° slope', `dy=${(r.pos[1] + 200).toFixed(1)} v=${r.speed.toFixed(2)}`);
  // 5. holds still on a 15° slope
  t = makeTerrain((x, y) => Math.tan(15 * Math.PI / 180) * y, body); r = new C.Rover(crewCfg(), t); r.place(0, 0, 0);
  run(r, 10, 1 / 100, {}); const y1 = r.pos[1]; run(r, 20, 1 / 100, {});
  ok(finite(r) && Math.abs(r.pos[1] - y1) < 0.3, 'parking on a 15° slope (hill hold)', `slide=${(r.pos[1] - y1).toFixed(3)}`);
  // 6. a turn on the move does not roll the rover over
  t = makeTerrain(() => 0, body); r = new C.Rover(crewCfg(), t); r.place(0, 0, 0);
  run(r, 12, 1 / 100, { throttle: 1 }); let maxTilt = 0;
  run(r, 15, 1 / 100, { throttle: 0.6, steer: 1 }, rr => { maxTilt = Math.max(maxTilt, Math.acos(rr.upZ) * 57.3); });
  ok(finite(r) && maxTilt < 15, 'sharp turn without rolling over (stabilisation)', `tilt=${maxTilt.toFixed(1)}°`);
  // 7. larger step: stability at dt=1/50
  t = makeTerrain((x, y) => 0.4 * Math.sin(x / 7) * Math.cos(y / 9), body); r = new C.Rover(crewCfg(), t); r.place(0, 0, 0.3);
  run(r, 40, 1 / 50, { throttle: 0.7, steer: 0.25 });
  ok(finite(r) && Math.acos(r.upZ) * 57.3 < 60 && r.damage < 100, 'stability at a 1/50 step on undulating terrain', `damage=${r.damage.toFixed(1)}`);
  // 8. a 0.6 m step
  t = makeTerrain((x, y) => (y > 40 ? 0.6 : 0), body); r = new C.Rover(crewCfg(), t); r.place(0, 0, 0);
  run(r, 25, 1 / 100, { throttle: 1 });
  ok(finite(r), 'driving onto a 0.6 m step without blowing up', `y=${r.pos[1].toFixed(1)} dmg=${r.damage.toFixed(1)}`);
  // 9. ramp: a jump
  t = makeTerrain((x, y) => (y > 30 && y < 36 ? (y - 30) * 0.35 : 0), body); r = new C.Rover(crewCfg(), t); r.place(0, 0, 0);
  let air = 0, maxz = 0; run(r, 14, 1 / 100, { throttle: 1 }, (rr) => { if (rr.stats.contacts === 0) air += 0.01; maxz = Math.max(maxz, rr.pos[2]); });
  ok(finite(r), 'ramp', `in the air ${air.toFixed(2)} s, damage ${r.damage.toFixed(1)}%`);
  // 10. energy: the battery drains
  ok(r.stats.power > 1000, 'power consumption is computed', `P=${r.stats.power.toFixed(0)} W`);
}

// walking robot
{
  console.log('\n== robot');
  const t = makeTerrain(() => 0, 'mars'), r = new C.Rover(C.applyUpgrades(C.VEHICLES.rover_robot, {}), t); r.place(0, 0, 0);
  run(r, 5, 1 / 100, {});
  let ok1 = finite(r) && Math.abs(r.speed) < 0.01; ok(ok1, 'robot at rest', `z=${r.pos[2].toFixed(3)}`);
  run(r, 40, 1 / 100, { throttle: 1 });
  ok(finite(r) && r.speed > 0.2 && r.speed < 0.38, 'robot accelerates (6 wheels)', `v=${r.speed.toFixed(3)}`);
}
// pedestrian
{
  console.log('\n== walker');
  const t = makeTerrain(() => 0, 'moon'), w = new C.Walker(C.VEHICLES.walker, t); w.place(0, 0, 0);
  for (let i = 0; i < 500; i++) { w.input.fwd = 1; w.step(0.01, env); }
  ok(Number.isFinite(w.pos[1]) && w.speed > 0.9 && w.speed < 1.2, 'walking', `v=${w.speed.toFixed(2)}`);
  w.input.jump = 1; w.step(0.01, env); w.input.jump = 0; let zmax = 0; for (let i = 0; i < 600; i++) { w.step(0.01, env); zmax = Math.max(zmax, w.pos[2]); }
  ok(zmax > 0.8 && zmax < 2.5 && w.onGround, 'jump on the Moon (low gravity)', `h=${zmax.toFixed(2)} m`);
}
// terrain and autopilot
{
  console.log('\n== terrain + autopilot');
  const t = makeTerrain((x, y) => 0.5 * Math.sin(x / 80) + 0.3 * Math.cos(y / 60), 'moon', 400, 4, { smallDensity: 1, rocks: 1 });
  let min = 1e9, max = -1e9, bad = 0;
  for (let i = 0; i < 20000; i++) { const x = (Math.random() - 0.5) * 1000, y = (Math.random() - 0.5) * 1000, h = t.height(x, y); if (!Number.isFinite(h)) bad++; min = Math.min(min, h); max = Math.max(max, h); }
  ok(bad === 0 && max - min < 40, 'heights are finite, small craters and rocks added', `range=${(max - min).toFixed(1)}`);
  const t0 = process.hrtime.bigint(); let acc = 0; for (let i = 0; i < 200000; i++) acc += t.height(i * 0.01 % 500, i * 0.013 % 500); const us = Number(process.hrtime.bigint() - t0) / 1e3 / 200000;
  ok(us < 8, 'speed of height()', `${us.toFixed(2)} us`);
  const r = new C.Rover(crewCfg(), t); r.place(0, -300, 0);
  const route = []; for (let k = 0; k <= 60; k++) route.push([0, -300 + k * 10]);
  const st = {}; let blocked = 0, ap0 = process.hrtime.bigint();
  run(r, 200, 1 / 50, {}, (rr, tt) => { const c = C.Autopilot.control(rr, t, route, st, 1 / 50); Object.assign(rr.input, { throttle: c.throttle, steer: c.steer, brake: c.brake }); if (c.blocked) blocked++; });
  const wallMs = Number(process.hrtime.bigint() - ap0) / 1e6;
  ok(finite(r) && r.pos[1] > -120 && Math.abs(r.pos[0]) < 20, 'autopilot follows the route', `y=${r.pos[1].toFixed(0)} x=${r.pos[0].toFixed(1)} dmg=${r.damage.toFixed(1)} blocked=${blocked} wall=${wallMs.toFixed(0)}ms per 200 s`);
}
console.log(fails ? `\n${fails} FAILURES` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
