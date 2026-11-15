// Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
// Stress test: random drives over real terrain (patches are taken from the running server).
// Looking for falls through the ground: node tests/stress.js [number of drives] [dt]
const C = require('../web/sim/core.js');
const N = +process.argv[2] || 30, DT = +process.argv[3] || 0.01;
const SPOTS = [['moon', -5.0, 20.0], ['moon', 20.19, 30.77], ['moon', -80.1, 1.4], ['moon', 12.0, -40.0], ['mars', -4.59, 137.44], ['mars', 18.4, 77.4], ['mars', -14.5, 175.4], ['mars', 40.0, -110.0]];
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
async function patch(body, lat0, lon0, box) {
  const q = new URLSearchParams({ body, lat0, lon0, x0: box[0], x1: box[1], y0: box[2], y1: box[3], res: 4, density: process.env.DENSITY || 1 });
  const buf = Buffer.from(await (await fetch('http://127.0.0.1:8000/api/sim/patch?' + q)).arrayBuffer());
  const hl = buf.readUInt32LE(4), hdr = JSON.parse(buf.slice(8, 8 + hl).toString());
  const ab = buf.buffer.slice(buf.byteOffset + 8 + hl, buf.byteOffset + buf.length);
  return { hdr, z: new Float32Array(ab) };
}
const env = { sunDir: [0.5, 0.2, 0.8], sunEl: 50, tau: 0.4, storm: 0, wind: 3, r: 1, temp: 20 };
(async () => {
  let bad = 0, runs = 0, worst = 0;
  const stats = { fixes: 0, maxUnderHub: 0, maxUnderHull: 0, nan: 0, flips: 0, maxDepthCom: 0 };
  for (let n = 0; n < N; n++) {
    const [body, lat, lon] = SPOTS[n % SPOTS.length], prof = n % 5 === 4 ? 'rover_robot' : 'rover_crew';
    const { hdr, z } = await patch(body, lat, lon, [-1200, 1200, -1200, 1200]);
    const t = new C.Terrain(hdr, z, { gx0: n * 1000, gy0: n * 777, smallDensity: 0.6 });
    const cfg = C.applyUpgrades(C.VEHICLES[prof], process.env.MAXUP ? { motor: 4, tires: 4, battery: 4, suspension: 4 } : {}), r = new C.Rover(cfg, t, { stability: process.env.NOSTAB ? false : n % 3 !== 0, tractionControl: true, hillHold: true, damage: true });
    const x0 = (rnd() - 0.5) * 600, y0 = (rnd() - 0.5) * 600; r.place(x0, y0, rnd() * 6.28);
    let flipped = false, maxTilt = 0, steer = 0, thr = 1, tNext = 0, under = 0, firstBad = null, sink = 0;
    const secs = 150, steps = Math.round(secs / DT);
    for (let i = 0; i < steps; i++) {
      const tt = i * DT;
      if (tt > tNext) { tNext = tt + 0.5 + rnd() * 3; steer = rnd() < 0.4 ? 0 : (rnd() * 2 - 1); thr = rnd() < 0.15 ? -0.5 : (0.5 + rnd() * 0.5); }
      Object.assign(r.input, { throttle: thr, steer, brake: 0 });
      r.step(DT, env);
      if (!Number.isFinite(r.pos[0] + r.pos[1] + r.pos[2] + r.q.w)) { stats.nan++; firstBad = firstBad || ['NaN', tt]; break; }
      // check: the centre, wheels and hull points must not go below the ground
      const a = C.axes(r.q, {});
      const gcom = t.height(r.pos[0], r.pos[1]);
      stats.maxDepthCom = Math.max(stats.maxDepthCom, gcom - r.pos[2]);
      let deepest = 0;
      for (const hp of r.hullPts) {
        const wx = r.pos[0] + a.fx * hp[0] + a.lx * hp[1] + a.ux * hp[2], wy = r.pos[1] + a.fy * hp[0] + a.ly * hp[1] + a.uy * hp[2], wz = r.pos[2] + a.fz * hp[0] + a.lz * hp[1] + a.uz * hp[2];
        deepest = Math.max(deepest, t.height(wx, wy) - wz);
      }
      stats.maxUnderHull = Math.max(stats.maxUnderHull, deepest);
      const tl = Math.acos(a.uz) * 57.3; maxTilt = Math.max(maxTilt, tl); if (tl > 70 && !flipped) { flipped = true; stats.flips++; }
      if (deepest > 0.45 || gcom - r.pos[2] > 0.5) { under++; if (!firstBad) firstBad = ['UNDER', +tt.toFixed(2), body, +deepest.toFixed(2), 'v', +r.speed.toFixed(1), 'pos', r.pos.map(v => +v.toFixed(1)), 'upz', +a.uz.toFixed(2)]; }
      if (r.pos[2] < gcom - 3) break;
    }
    stats.fixes += r.stats.fixes || 0; (stats.tilts = stats.tilts || []).push(Math.round(maxTilt));
    runs++;
    if (under || firstBad) { bad++; console.log('run', n, body, prof, 'BAD', JSON.stringify(firstBad), 'underSteps', under); }
  }
  console.log(`runs=${runs} bad=${bad}`, JSON.stringify(stats));
  process.exit(bad ? 1 : 0);
})();
