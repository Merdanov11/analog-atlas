// Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
/* Trip simulator: game loop, route stages, interface, vehicle upgrades. */
(function () {
'use strict';
const C = window.Core, $ = id => document.getElementById(id);
const clamp = C.clamp, D2R = C.D2R, R2D = C.R2D;

// ============================================================================= texts
const L = {
  en: {
    stage: 'Stage', toGo: 'to go', simTime: 'Mission time', local: 'Local time', credits: 'Credits', samples: 'Samples',
    heading: 'Heading', battery: 'Battery', suit: 'Suit', temp: 'Temp', damage: 'Damage', pitch: 'Pitch', roll: 'Roll', power: 'Power', solar: 'Solar',
    alt: 'Altitude', slip: 'Slip', weather: 'Weather', sun: 'Sun', ambient: 'Surface', dust: 'Dust τ', wind: 'Wind', vis: 'Visibility', dose: 'Dose',
    cam: ['Chase', 'Cockpit', 'Orbit'], camBtn: 'Camera', lights: 'Lights', garage: 'Garage', pause: 'Pause', resume: 'Resume', exit: 'Back to map',
    auto: 'Autopilot', cruise: 'Fast travel', start: 'Start mission', replay: 'Drive again', warpLim: 'CPU limit',
    clear: 'Clear', storm: 'Dust storm', calm: 'Calm', night: 'Night', day: 'Day', twilight: 'Twilight',
    briefTitle: 'Mission briefing', routeInfo: 'Route', dist: 'Distance', eta: 'Planner ETA', body: { moon: 'Moon', mars: 'Mars' },
    vehicle: 'Vehicle', veh: { rover_crew: 'Crewed rover', rover_robot: 'Robotic rover', walker: 'EVA astronaut', drone: 'Drone' },
    options: 'Options', traction: 'Traction control', stability: 'Stability assist', hillHold: 'Hill hold / park brake', dmgOn: 'Damage from impacts',
    weatherMode: 'Weather', wm: { calm: 'Calm', auto: 'Seasonal', stormy: 'Stormy' }, tod: 'Time of day', todv: { auto: 'Planned', morning: 'Morning', noon: 'Noon', evening: 'Evening', night: 'Night' }, controls: 'Controls',
    upgrades: 'Garage', buy: 'Buy', max: 'MAX', repair: 'Repair 25 %', repairHint: 'Park first', cleanP: 'Clean panels (X)', stopFirst: 'Stop the vehicle first',
    cantAfford: 'Not enough credits', bought: 'Upgrade installed', repaired: 'Repaired', cleaned: 'Panels cleaned',
    up: { motor: 'Motors', battery: 'Battery pack', solar: 'Solar array', tires: 'Tires', suspension: 'Suspension', thermal: 'Thermal kit', scanner: 'Hazard scanner', lights: 'Headlights', armor: 'Armor' },
    upd: { motor: '+22 % power, +7 % top speed', battery: '+30 % capacity', solar: '+35 % output', tires: '+7 % grip, less rolling drag', suspension: 'Softer ride, more travel',
           thermal: 'Better insulation, stronger heater', scanner: 'Shows steep slopes (1) and boulders (2) on the radar', lights: 'Longer, brighter beams for the night', armor: '−18 % impact damage' },
    lowBat: 'Battery low', critBat: 'Battery critical! Find sunlight or wait', flip: 'Overturned! Press R to right the vehicle', flipFee: 'Recovery fee',
    impact: 'Impact', destroyed: 'Vehicle destroyed', frozen: 'Systems frozen — wait for warmth', overheated: 'Overheated — wait to cool',
    stormOn: 'Dust storm: visibility and solar power drop', nightOn: 'Night is falling — headlights (L)', offRoute: 'Far from the route — return to the markers',
    stageDone: 'Checkpoint reached', sample: 'Sample collected', arrival: 'Destination reached!', apBlocked: 'Autopilot: no safe path — take the wheel', apOn: 'Autopilot on',
    apOff: 'Autopilot off', steep: 'Steep slope!', hazard: 'Hazard ahead', cold: 'Battery too cold: output reduced', hot: 'Battery too hot: output reduced',
    cruiseTitle: 'Fast travel in progress', cruiseSub: 'Autopilot drives the route; stops on arrival, a storm or when you press Stop', stop: 'Stop & take control',
    clock: 'Mission clock', distLeft: 'Distance left', cstate: 'State', reason: { move: 'Driving', night: 'Waiting for daylight', temp: 'Waiting: surface too hot/cold', charge: 'Recharging', storm: 'Waiting out a storm' },
    resultTitle: 'Mission report', ok: 'Mission complete', fail: 'Mission failed', earned: 'Credits earned', driven: 'Distance driven', time: 'Time', samplesGot: 'Samples',
    hint: 'W/S drive · A/D steer · Space brake', loading: 'Preparing terrain from NASA data…', noRoute: 'No route to drive. Build a route on the map first, then press “Drive”.',
    backMap: 'Open the map', loadErr: 'Could not load terrain', sectors: 'Loading next sector…', paused: 'Paused', setts: 'Settings',
    keys: [['W / S, ↑ / ↓', 'throttle / reverse'], ['A / D, ← / →', 'steer'], ['Space', 'brake'], ['T', 'autopilot'], ['[ ]', 'slower / faster time'], ['C', 'camera'],
           ['L', 'headlights'], ['X', 'clean panels'], ['R', 'right the vehicle'], ['G', 'garage'], ['P / Esc', 'pause'], ['Mouse drag / wheel', 'look / zoom']],
    droneKeys: [['W / S', 'forward / back'], ['A / D', 'turn'], ['Q / E', 'strafe'], ['Space / Shift', 'climb / descend'], ['T', 'autopilot (takeoff, fly, land)'], ['[ ]', 'time'], ['C', 'camera'], ['R', 'reset upright'], ['G', 'garage'], ['P / Esc', 'pause']],
    walkKeys: [['W A S D', 'walk'], ['Shift', 'bound (run)'], ['Space', 'jump'], ['Mouse drag', 'look around'], ['T', 'autopilot'], ['[ ]', 'time'], ['G', 'garage'], ['P / Esc', 'pause']],
    fleetKeys: [['V', 'get out / get in / board the drone'], ['H', 'summon the drone'], ['1 2 3', 'switch: vehicle / astronaut / drone']],
    exited: 'You stepped out of the vehicle', entered: 'Back in the vehicle', noCrew: 'This vehicle has no crew', stopFirst2: 'Stop the vehicle first', tooFarVeh: 'Get within 9 m of the vehicle',
    droneDeployed: 'Drone deployed next to you', droneComing: 'Drone is flying to you', droneArrived: 'Drone has landed beside you', boarded: 'You boarded the drone', disembarked: 'You stepped off the drone',
    needLanded: 'The drone must be landed', tooFarDrone: 'Get within 7 m of the drone', noVehicle: 'No vehicle in this mission', recalled: 'Brought back to you', recallFee: 'Recovery fee', alreadyDrone: 'Already flying the drone',
    flName: { vehicle: 'Vehicle', walker: 'Astronaut', drone: 'Drone' }, view3: 'Third person', view1: 'First person',
    agl: 'AGL', fuel: 'Fuel', netKeys: [['Enter', 'chat'], ['Tab', 'players'], ['B', 'drop a marker'], ['F', 'share energy']],
    online: 'Online', onlineOn: 'Join the shared world (see other players)', yourName: 'Your name', playersNow: n => `${n} online now`, playersNone: 'You are the first one here', netOff: 'offline',
    netOn: 'Online', chatPh: 'Message…', youJoined: n => `${n} joined`, youLeft: n => `${n} left`, pingFrom: n => `${n} dropped a marker`, gaveTo: (n, a, u) => `Gave ${a} ${u} to ${n}`, gotFrom: (n, a, u) => `${n} shared ${a} ${u} with you`,
    noNear: 'Nobody within 20 m', playersTitle: 'Players', bump: 'Collision', kindLabel: { rover_crew: 'rover', rover_robot: 'robot', walker: 'astronaut', drone: 'drone' },
    nearAssets: 'Real vehicles near the route', liveBadge: 'live NASA data', lastKnown: 'last known position', visited: 'Visited', sol: 'sol', windUnsafe: 'Wind too strong for flight!', autoLand: 'Low energy: landing', hoverLeft: 'Flight time left',
    liveNote: 'Positions of Perseverance and Curiosity come from NASA MMGIS (updated after each drive).', noAssets: 'No known vehicles within 25 km of the route.', ago: 'as of', vsp: 'Vertical',
    cloudy: 'haze',
  },
};
let lang = 'en';
const tr = () => L[lang];

// ============================================================================= saving
const SAVE_KEY = 'rbe-sim-v1';
let save = { credits: 600, up: {}, missions: 0 };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

// ============================================================================= route data
let ROUTE = null, routeObj = null, cfg = null, env = null, scene3 = null;
const settings = { tractionControl: true, stability: true, hillHold: true, damage: true, weather: 'auto', tod: 'auto', online: true, name: '' };
try { settings.name = localStorage.getItem('rbe-name') || ''; } catch (e) {}
if (!settings.name) settings.name = 'Pilot-' + String(Math.floor(Math.random() * 9000) + 1000);
let t0H = 0;   // offset of environment hours relative to mission start (time-of-day choice)
const baseCfg = prof => (prof === 'drone' ? C.droneConfig(ROUTE.body) : C.VEHICLES[prof]);
const makeCfg = prof => (prof === 'walker' ? Object.assign({}, C.VEHICLES.walker) : C.applyUpgrades(baseCfg(prof), save.up));
const WARPS = [0.25, 0.5, 1, 2, 4, 8, 16], CRUISE = [600, 3600, 14400, 43200];
let warpIdx = 2, cruiseIdx = 1;

function loadRoute() {
  try { ROUTE = JSON.parse(localStorage.getItem('rbe-sim-route')); } catch (e) { ROUTE = null; }
  if (!ROUTE || !ROUTE.data || !ROUTE.data.points || ROUTE.data.points.length < 2) return false;
  // The map passes a route id in the page address; a different id in storage means an old route, which must not be driven.
  const wanted = new URLSearchParams(location.search).get('r');
  if (wanted && ROUTE.id !== wanted) return false;
  const R = ROUTE.body === 'moon' ? 1737400 : 3396190, pts = ROUTE.data.points, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + C.Geo.dist(R, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  routeObj = { radius: R, points: pts, cum, elevation: ROUTE.data.elevation || [[0, 0], [cum[cum.length - 1] / 1000, 0]], profile: ROUTE.profile, body: ROUTE.body };
  return cum[cum.length - 1] > 5;
}
function posAt(s) {
  const c = routeObj.cum, p = routeObj.points; s = clamp(s, 0, c[c.length - 1]);
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const f = clamp((s - c[lo]) / Math.max(c[hi] - c[lo], 1e-6), 0, 1);
  return [p[lo][0] + (p[hi][0] - p[lo][0]) * f, p[lo][1] + (p[hi][1] - p[lo][1]) * f, lo];
}

// ============================================================================= stages
const STAGE_LEN = 1500, MARGIN = 650, STEP = 8;
let stages = [], stageIdx = 0, cur = null, nextLoad = null;
function buildStages() {
  const total = routeObj.cum[routeObj.cum.length - 1], n = Math.max(1, Math.ceil(total / STAGE_LEN)), len = total / n;
  stages = [];
  for (let k = 0; k < n; k++) stages.push({ k, s0: k * len, s1: (k + 1) * len, len });
}
function stageGeometry(st) {
  const R = routeObj.radius, [la0, lo0] = posAt(st.s0), total = routeObj.cum[routeObj.cum.length - 1];
  const sEnd = Math.min(total, st.s1 + 700), raw = [[la0, lo0]];
  const c = routeObj.cum, p = routeObj.points;
  for (let i = 0; i < c.length; i++) if (c[i] > st.s0 + 0.5 && c[i] < sEnd - 0.5) raw.push([p[i][0], p[i][1]]);
  const e = posAt(sEnd); raw.push([e[0], e[1]]);
  const loc = raw.map(q => C.Geo.toEnu(R, la0, lo0, q[0], q[1]));
  // densify the route to a STEP-metre step
  const dense = [[loc[0][0], loc[0][1]]];
  for (let i = 1; i < loc.length; i++) {
    const a = loc[i - 1], b = loc[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(d / STEP));
    for (let j = 1; j <= n; j++) dense.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
  }
  const endPt = C.Geo.toEnu(R, la0, lo0, ...posAt(Math.min(total, st.s1)).slice(0, 2));
  let endIdx = 0, bd = 1e18;
  dense.forEach((q, i) => { const d = (q[0] - endPt[0]) ** 2 + (q[1] - endPt[1]) ** 2; if (d < bd) { bd = d; endIdx = i; } });
  let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
  for (const q of dense) { xa = Math.min(xa, q[0]); xb = Math.max(xb, q[0]); ya = Math.min(ya, q[1]); yb = Math.max(yb, q[1]); }
  return { lat0: la0, lon0: lo0, dense, endIdx, end: [endPt[0], endPt[1]],
           box: [Math.floor(xa - MARGIN), Math.ceil(xb + MARGIN), Math.floor(ya - MARGIN), Math.ceil(yb + MARGIN)] };
}
async function fetchPatch(st, geo) {
  const b = geo.box, w = b[1] - b[0], h = b[3] - b[2];
  const res = (w / 4) * (h / 4) > 1.9e6 ? 5 : 4;
  const q = new URLSearchParams({ body: routeObj.body, lat0: geo.lat0, lon0: geo.lon0, x0: b[0], x1: b[1], y0: b[2], y1: b[3], res });
  const r = await fetch('/api/sim/patch?' + q);
  if (!r.ok) throw new Error('patch ' + r.status);
  const buf = await r.arrayBuffer(), dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'TRN1') throw new Error('bad patch');
  const hl = dv.getUint32(4, true), hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  return { hdr, z: new Float32Array(buf, 8 + hl, hdr.nx * hdr.ny) };
}
/** Prepares a stage: geometry, terrain, samples. prevInfo is the previous stage (for the chain of global coordinates). */
async function prepareStage(k, prevInfo) {
  const st = stages[k], geo = stageGeometry(st), { hdr, z } = await fetchPatch(st, geo);
  let gx0, gy0;
  if (prevInfo) {
    const o = C.Geo.toEnu(routeObj.radius, prevInfo.geo.lat0, prevInfo.geo.lon0, geo.lat0, geo.lon0);
    gx0 = prevInfo.terrain.gx0 + o[0]; gy0 = prevInfo.terrain.gy0 + o[1];
  } else { gx0 = routeObj.radius * geo.lon0 * D2R * Math.cos(geo.lat0 * D2R); gy0 = routeObj.radius * geo.lat0 * D2R; }
  const terrain = new C.Terrain(hdr, z, { gx0, gy0, smallDensity: 0.6 });
  const info = { st, geo, terrain, route: geo.dense, samples: [], done: false };
  // samples: two per stage, near the route, on a not-too-steep place
  for (let j = 0; j < 2; j++) {
    const i0 = Math.floor(geo.dense.length * (j ? 0.7 : 0.35)), p = geo.dense[Math.min(i0, geo.dense.length - 1)], q = geo.dense[Math.min(i0 + 2, geo.dense.length - 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1], dl = Math.hypot(dx, dy) || 1;
    for (let tries = 0; tries < 8; tries++) {
      const off = (30 + C.rnd(k, j * 9 + tries, 77) * 90) * (C.rnd(k, j + 40, 78) < 0.5 ? -1 : 1);
      const x = p[0] - dy / dl * off, y = p[1] + dx / dl * off;
      if (terrain.slopeDeg(x, y, 2) < 12 || tries === 7) { info.samples.push({ kind: 'sample', x, y, z: terrain.heightBase(x, y), key: k + ':' + j, done: false }); break; }
    }
  }
  return info;
}

// ============================================================================= game state
let fleet = { vehicle: null, walker: null, drone: null }, activeKey = 'vehicle';
let rover = null, isWalker = false, isDrone = false, running = false, paused = false, loadingStage = false;
let simT = 0, acc = 0, lastTs = 0, prevSnap = null, envNow = null, rll = [0, 0], tick = 0;
let pIdx = 0, offRoute = 0, apInfo = { on: false, st: {} }, lightsOn = false, creditCarry = 0, warpLimited = false;
const mission = { earned: 0, dist: 0, samples: 0, stages: 0, endedBy: '' };
const keys = {}, cam = { mode: 0, yaw: 0, pitch: 0.2, dist: 9, follow: 2.2, free: false };
let cruise = { active: false, cr: null, s0: 0, stormSeen: false };
const alertLast = {};

function say(text, kind, ttl, key) {
  const now = performance.now();
  if (key) { if (alertLast[key] && now - alertLast[key] < (ttl || 4500) * 1.6) return; alertLast[key] = now; }
  const box = $('alerts'), el = document.createElement('div');
  el.className = 'alert ' + (kind || ''); el.textContent = text; box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => el.remove(), ttl || 4500);
}
const fmtT = h => { h = Math.max(0, h); const d = Math.floor(h / 24), hh = Math.floor(h % 24), mm = Math.floor((h * 60) % 60); return (d ? d + 'd ' : '') + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
const fmtKm = m => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : Math.round(m) + ' m';

// ============================================================================= launch
function applyStatic() {
  const T = tr();
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set('kT', T.simTime); set('kLoc', T.local); set('kScore', T.credits); set('kSamples', T.samples); set('kHead', T.heading);
  set('kBat', isWalker ? T.suit : (isDrone && cfg.unit === 'kg') ? T.fuel : T.battery); set('kTmp', T.temp); set('kDmg', T.damage); set('kPit', T.pitch); set('kRol', T.roll);
  set('kPow', T.power); set('kSol', T.solar); set('kAlt', T.alt); set('kSlip', isDrone ? T.agl : T.slip);
  set('wTitle', T.weather); set('kSun', T.sun); set('kAmb', T.ambient); set('kTau', T.dust); set('kWind', T.wind); set('kVis', T.vis); set('kDose', T.dose);
  set('bCam', T.camBtn); set('bLight', T.lights); set('bGarage', T.garage); set('bPause', T.pause); set('bAuto', T.auto); set('bCruise', T.cruise);
  set('cTitle', T.cruiseTitle); set('cSub', T.cruiseSub); set('cStop', T.stop); set('kcT', T.clock); set('kcD', T.distLeft); set('kcB', T.battery); set('kcS', T.cstate);
  set('loadMsg', T.loading); set('hint', T.hint);
}

function showBrief() {
  const T = tr(), d = ROUTE.data, body = ROUTE.body, prof = ROUTE.profile;
  cfg = makeCfg(prof);
  const stats = prof === 'walker' ? `${T.suit}: ${cfg.batteryKwh} kWh · 3 km/h`
    : prof === 'drone' ? `${cfg.tpeak | 0} N · ${(cfg.vmax * 3.6).toFixed(0)} km/h · ${cfg.batteryKwh.toFixed(cfg.batteryKwh < 10 ? 1 : 0)} ${cfg.unit} · ${body === 'mars' ? 'rotor' : 'rocket'}`
    : `${(cfg.power / 1000).toFixed(1)} kW · ${(cfg.vmax * 3.6).toFixed(1)} km/h · ${cfg.batteryKwh.toFixed(cfg.batteryKwh < 10 ? 1 : 0)} kWh · ☀ ${cfg.solarKw.toFixed(1)} kW · μ ${cfg.mu.toFixed(2)}`;
  const chk = (id, label, v) => `<label class="chk"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${label}</label>`;
  const keys = ((prof === 'walker' ? T.walkKeys : prof === 'drone' ? T.droneKeys : T.keys).concat(T.fleetKeys, T.netKeys)).map(k => `<kbd>${k[0]}</kbd><span class="muted">${k[1]}</span>`).join('');
  $('brief').innerHTML = `<div class="panel">
    <h1>🛰 ${T.briefTitle}</h1><div class="muted">${T.body[body]} · ${T.veh[prof]}</div>
    <div class="cols" style="margin-top:14px">
      <div class="card"><div class="muted">${T.routeInfo}</div><div style="font-size:20px;font-weight:600">${fmtKm(d.distance_m)}</div>
        <div class="muted">${T.eta}: ${d.plan ? fmtT(d.plan.total_h) : '—'}</div><div class="muted">${(d.ascent_m | 0)} ↑ / ${(d.descent_m | 0)} ↓ m · ${d.max_slope_deg.toFixed(0)}°</div></div>
      <div class="card sel"><div class="muted">${T.vehicle}</div><div style="font-size:20px;font-weight:600">${T.veh[prof]}</div><div class="muted tab">${stats}</div>
        <div class="muted">${T.credits}: <b id="bCred">${save.credits}</b></div></div>
    </div>
    <h3>${T.options}</h3>
    <div class="cols"><div>${chk('oTc', T.traction, settings.tractionControl)}${chk('oSt', T.stability, settings.stability)}${chk('oHh', T.hillHold, settings.hillHold)}${chk('oDm', T.dmgOn, settings.damage)}</div>
      <div><div class="muted" style="margin-bottom:6px">${T.weatherMode}</div><div class="seg" id="oWx">${['calm', 'auto', 'stormy'].map(k => `<button data-v="${k}" class="${settings.weather === k ? 'on' : ''}">${T.wm[k]}</button>`).join('')}</div>
      <div class="muted" style="margin:10px 0 6px">${T.tod}</div><div class="seg" id="oTod">${['auto', 'morning', 'noon', 'evening', 'night'].map(k => `<button data-v="${k}" class="${settings.tod === k ? 'on' : ''}">${T.todv[k]}</button>`).join('')}</div></div></div>
    <h3>${T.online}</h3>
    <div class="cols"><div>${chk('oOn', T.onlineOn, settings.online)}<div class="muted" style="margin:8px 0 4px">${T.yourName}</div><input id="oName" class="inp" maxlength="18" value="${escapeHtml(settings.name)}"></div><div id="bOnline" class="muted">…</div></div>
    <h3>${T.nearAssets}</h3><div id="bNear" class="muted">…</div><div class="muted" style="font-size:12px;margin-top:4px">${T.liveNote}</div>
    <h3>${T.controls}</h3><div class="keys">${keys}</div>
    <div class="row" style="margin-top:20px;justify-content:flex-end;gap:10px">
      <button class="btn" id="bBackMap">${T.exit}</button><button class="btn" id="bBriefGarage">${T.garage}</button><button class="btn pri" id="bGo">${T.start}</button></div>
  </div>`;
  $('brief').hidden = false; briefExtras();
  $('oWx').onclick = e => { const b = e.target.closest('button'); if (!b) return; settings.weather = b.dataset.v; [...$('oWx').children].forEach(x => x.classList.toggle('on', x === b)); };
  $('oTod').onclick = e => { const b = e.target.closest('button'); if (!b) return; settings.tod = b.dataset.v; [...$('oTod').children].forEach(x => x.classList.toggle('on', x === b)); };
  $('bBackMap').onclick = closeSim; $('bBriefGarage').onclick = () => showGarage(true);
  $('bGo').onclick = () => {
    settings.online = $('oOn').checked; settings.name = ($('oName').value.trim() || settings.name).slice(0, 18); try { localStorage.setItem('rbe-name', settings.name); } catch (e) {}
    settings.tractionControl = $('oTc').checked; settings.stability = $('oSt').checked; settings.hillHold = $('oHh').checked; settings.damage = $('oDm').checked;
    $('brief').hidden = true; goFullscreen(); startMission();
  };
}

async function briefExtras() {
  const T = tr();
  try { const r = await (await fetch('/api/players?body=' + ROUTE.body)).json(); $('bOnline').textContent = r.online ? T.playersNow(r.online) : T.playersNone; } catch (e) { $('bOnline').textContent = ''; }
  await loadAssets();
  const near = nearbyAssets(25), box = $('bNear'); if (!box) return;
  box.innerHTML = near.length ? near.map(n => `<div>${n.a.kind === 'rover' ? '🤖' : '🛰'} <b>${escapeHtml(assetName(n.a))}</b> — ${fmtKm(n.d)} ${n.a.live ? `<span class="live">LIVE</span> ${T.sol} ${n.a.sol}, ${T.ago} ${n.a.as_of.slice(0, 10)}` : '· ' + T.lastKnown}</div>`).join('') : T.noAssets;
}

function closeSim() {
  persist(); if (net) net.close();
  if (window.parent !== window) window.parent.postMessage({ type: 'rbe-sim-close' }, '*'); else location.href = '/';
}

async function startMission() {
  const T = tr(); $('loading').hidden = false; $('loadMsg').textContent = T.loading;
  try {
    isWalker = ROUTE.profile === 'walker'; isDrone = ROUTE.profile === 'drone';
    cfg = makeCfg(ROUTE.profile);
    const hours = clamp(((ROUTE.data.plan && ROUTE.data.plan.total_h) || 24) * 1.6 + 72 + (settings.tod !== 'auto' ? (ROUTE.body === 'moon' ? 720 : 30) : 0), 96, 4000);
    const q = new URLSearchParams({ body: ROUTE.body, hours, n: 2001 }); if (ROUTE.start) q.set('start', ROUTE.start);
    const sun = await (await fetch('/api/sim/sun?' + q)).json();
    env = new C.Environment({ body: ROUTE.body, sunTrack: new C.SunTrack(sun), weather: settings.weather });
    t0H = 0;
    if (settings.tod !== 'auto') {   // pick the moment when the start point has the required local time
      const target = { morning: 8, noon: 12, evening: 17, night: 0.5 }[settings.tod], [sla, slo] = posAt(0), period = ROUTE.body === 'moon' ? 709 : 24.7;
      let bt = 0, bd = 99;
      for (let t = 0; t <= period; t += 0.1) { const lc = env.at(t, sla, slo).local, dd = Math.abs(((lc - target + 36) % 24) - 12); if (dd < bd) { bd = dd; bt = t; } }
      t0H = bt;
    }
    buildStages(); stageIdx = 0; nextLoad = null;
    await loadAssets();
    cur = await prepareStage(0, null);
    scene3 = new window.Scene3D($('gl'), ROUTE.body);
    window.addEventListener('resize', () => scene3.resize());
    scene3.setVehicle(cfg);
    const d0 = cur.route[0], d1 = cur.route[Math.min(4, cur.route.length - 1)], hdg = Math.atan2(d1[0] - d0[0], d1[1] - d0[1]);
    const key0 = ROUTE.profile === 'walker' ? 'walker' : ROUTE.profile === 'drone' ? 'drone' : 'vehicle';
    fleet = { vehicle: null, walker: null, drone: null }; fleet[key0] = makeEntity(key0, d0[0], d0[1], hdg);
    activate(key0, hdg);
    applyStage(cur);
    simT = 0; acc = 0; pIdx = 0; mission.earned = 0; mission.dist = 0; mission.samples = 0; mission.stages = 0;
    applyStatic();
    $('hud').hidden = false; $('loading').hidden = true; running = true; paused = false;
    $('bCruise').disabled = false;
    say(T.hint, '', 6000); lastTs = performance.now(); requestAnimationFrame(loop);
    updateEnv(); scene3.camInit = false;
    initNet(); updateNetBadge();
  } catch (e) {
    console.error(e); $('loadMsg').textContent = T.loadErr + ': ' + e.message;
    $('loading').innerHTML = `<div><div style="font-size:18px;margin-bottom:10px">${T.loadErr}</div><div class="muted">${e.message}</div><p><button class="btn" onclick="location.reload()">OK</button></p></div>`;
  }
}

function applyStage(info) {
  scene3.setTerrain(info.terrain);
  if (rover) rover.terrain = info.terrain;
  const last = info.st.k === stages.length - 1, items = [];
  items.push({ kind: 'beacon', x: info.geo.end[0], y: info.geo.end[1], z: info.terrain.heightBase(info.geo.end[0], info.geo.end[1]), final: last, done: false });
  for (const s of info.samples) items.push(s);
  info.beacon = items[0]; info.items = items;
  scene3.setMarkers(items); updateGuide(true);
  info.assetItems = stageAssets(info); scene3.setAssets(info.assetItems); scene3.clearPings(); pingMarks.length = 0;
  if (!isWalker && rover && rover.anchor) rover.anchor = null;
}
let guideAt = -99;
function updateGuide(force) {
  if (!cur || (!force && Math.abs(pIdx - guideAt) < 4)) return;
  guideAt = pIdx; const pts = [], t = cur.terrain, r = cur.route;
  for (let i = Math.max(0, pIdx); i < Math.min(r.length, pIdx + 70); i += 3) pts.push([r[i][0], r[i][1], t.heightBase(r[i][0], r[i][1])]);
  scene3.setGuide(pts);
}

// ============================================================================= vehicle fleet: get out, call a drone, switch vehicles
const curProf = () => (activeKey === 'walker' ? 'walker' : activeKey === 'drone' ? 'drone' : ROUTE.profile);
const profOf = k => (k === 'vehicle' ? ROUTE.profile : k);
function makeEntity(kind, x, y, hdg) {
  const terrain = cur.terrain, c = makeCfg(profOf(kind));
  const obj = kind === 'walker' ? new C.Walker(c, terrain) : kind === 'drone' ? new C.Drone(c, terrain, settings) : new C.Rover(c, terrain, settings);
  obj.place(x, y, hdg);
  if (kind !== 'walker') for (let i = 0; i < 80; i++) obj.step(0.01, null);      // let it settle onto the ground
  obj.vel = [0, 0, 0]; if (kind !== 'walker') obj.w = [0, 0, 0];
  return { kind, obj, cfg: c, lost: false, hidden: false, summon: null };
}
function nearestIdx() {
  const r = cur.route, p = rover.pos; let best = 0, bd = 1e18;
  for (let i = 0; i < r.length; i++) { const d = (r[i][0] - p[0]) ** 2 + (r[i][1] - p[1]) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
/** Passes control to vehicle kind. hdg is the camera heading for the astronaut. */
function activate(kind, hdg) {
  const f = fleet[kind]; if (!f) return;
  if (rover && rover.cmd) rover.cmd = null;
  activeKey = kind; rover = f.obj; cfg = f.cfg; isWalker = kind === 'walker'; isDrone = kind === 'drone';
  f.hidden = false; f.lost = false; f.summon = null;
  apInfo.on = false; apInfo.st = {}; $('bAuto').classList.remove('on');
  if (scene3) { scene3.setVehicle(cfg); scene3.cfgV = cfg; scene3.camInit = false; }
  if (isWalker) { cam.free = true; cam.mode = 0; cam.yaw = hdg != null ? hdg : rover.yaw; cam.pitch = 0.24; cam.dist = 6.5; }
  else { cam.free = false; cam.mode = 0; cam.yaw = 0; cam.pitch = 0.2; cam.dist = isDrone ? 8 : 9; }
  prevSnap = null; odoPrev = rover.odo; applyStatic();
  if (cur) { pIdx = nearestIdx(); guideAt = -99; updateGuide(true); }
  updateFleetUI();
}
const frontOf = (o, d) => { const a = isWalkerObj(o) ? { fx: Math.sin(o.yaw), fy: Math.cos(o.yaw), lx: -Math.cos(o.yaw), ly: Math.sin(o.yaw) } : C.axes(o.q, {}); return [o.pos[0] + a.fx * d, o.pos[1] + a.fy * d, a]; };
const isWalkerObj = o => !o.q;
function placeNear(f, dx, dy) { const hdg = isWalkerObj(rover) ? rover.yaw : rover.heading; f.obj.place(rover.pos[0] + dx, rover.pos[1] + dy, hdg); if (f.obj.vel) f.obj.vel = [0, 0, 0]; f.lost = false; f.hidden = false; f.summon = null; }
function sideOf(o, d) { const a = isWalkerObj(o) ? { lx: -Math.cos(o.yaw), ly: Math.sin(o.yaw) } : C.axes(o.q, {}); return [a.lx * d, a.ly * d]; }

function exitVehicle() {
  const T = tr(), v = fleet.vehicle;
  if (!v || rover !== v.obj) return;
  if (!v.cfg.crewed) { say(T.noCrew, 'warn', 2500); return; }
  if (Math.abs(rover.speed) > 1.5) { say(T.stopFirst2, 'warn', 2500); return; }
  const hdg = rover.heading, [sx, sy] = sideOf(rover, 3.3);
  if (!fleet.walker) fleet.walker = makeEntity('walker', rover.pos[0] + sx, rover.pos[1] + sy, hdg);
  else { fleet.walker.obj.place(rover.pos[0] + sx, rover.pos[1] + sy, hdg); fleet.walker.hidden = false; fleet.walker.lost = false; }
  activate('walker', hdg); say(T.exited, 'good', 2500);
}
function recallEntity(kind) {
  const T = tr(), f = fleet[kind]; if (!f) return;
  const [sx, sy] = sideOf(rover, kind === 'vehicle' ? -9 : -5);
  if (kind === 'vehicle' && f.lost) { const fee = Math.min(200, save.credits); save.credits -= fee; say(`${T.recalled}. ${T.recallFee} −${fee}`, 'warn', 3500); } else say(T.recalled, 'good', 2000);
  placeNear(f, sx, sy);
}
function enterVehicle() {
  const T = tr(), v = fleet.vehicle;
  if (!v) { say(T.noVehicle, 'warn', 2000); return; }
  if (v.lost) recallEntity('vehicle');
  if (Math.hypot(v.obj.pos[0] - rover.pos[0], v.obj.pos[1] - rover.pos[1]) > 9) { say(T.tooFarVeh, 'warn', 2500); return; }
  fleet.walker = null; activate('vehicle'); say(T.entered, 'good', 2000);
}
function summonDrone() {
  const T = tr();
  if (isDrone) { say(T.alreadyDrone, '', 1500); return; }
  const f = fleet.drone, hdg = isWalkerObj(rover) ? rover.yaw : rover.heading;
  if (!f) {
    const [fx, fy] = frontOf(rover, 7); fleet.drone = makeEntity('drone', fx, fy, hdg); say(T.droneDeployed, 'good', 3000); updateFleetUI(); return;
  }
  if (f.lost) { recallEntity('drone'); say(T.droneDeployed, 'good', 3000); updateFleetUI(); return; }
  const [sx, sy] = sideOf(rover, -6), tx = rover.pos[0] + sx, ty = rover.pos[1] + sy;
  f.summon = { route: [[tx, ty], [tx + 0.02, ty + 0.02]], st: { finalStage: true } }; say(T.droneComing, '', 3000);
}
function boardOrLeaveDrone() {
  const T = tr(), d = fleet.drone, w = fleet.walker;
  if (isWalker && d && w) {
    if (d.lost || Math.hypot(d.obj.pos[0] - rover.pos[0], d.obj.pos[1] - rover.pos[1]) > 7) { say(T.tooFarDrone, 'warn', 2500); return true; }
    if (!d.obj.landed) { say(T.needLanded, 'warn', 2500); return true; }
    w.hidden = true; d.obj.passenger = true; activate('drone'); say(T.boarded, 'good', 2500); return true;
  }
  if (isDrone && w && w.hidden) {
    if (!rover.landed) { say(T.needLanded, 'warn', 2500); return true; }
    const [sx, sy] = sideOf(rover, 2.2); w.obj.place(rover.pos[0] + sx, rover.pos[1] + sy, rover.heading); w.hidden = false; rover.passenger = false; activate('walker', rover.heading); say(T.disembarked, 'good', 2500); return true;
  }
  return false;
}
/** V key: get out of the vehicle, get back in, board the drone or leave it. */
function actionV() {
  if (boardOrLeaveDrone()) return;
  if (activeKey === 'vehicle') exitVehicle(); else if (activeKey === 'walker') enterVehicle();
}
/** Keys 1/2/3: hand over control (remote control of the rover or drone). */
function switchControl(kind) {
  const T = tr();
  if (activeKey === kind) return;
  if (kind === 'vehicle') { if (!fleet.vehicle) { say(T.noVehicle, 'warn', 2000); return; } if (fleet.vehicle.lost) recallEntity('vehicle'); activate('vehicle'); }
  else if (kind === 'walker') { if (!fleet.walker) { if (activeKey === 'vehicle') exitVehicle(); return; } if (fleet.walker.hidden) { boardOrLeaveDrone(); return; } if (fleet.walker.lost) recallEntity('walker'); activate('walker'); }
  else if (kind === 'drone') { if (!fleet.drone) { summonDrone(); if (fleet.drone) activate('drone'); return; } if (fleet.drone.lost) recallEntity('drone'); activate('drone'); }
}
function stepPassives(dt) {
  for (const k of ['vehicle', 'walker', 'drone']) {
    const f = fleet[k]; if (!f || f.obj === rover || f.lost || f.hidden) continue;
    const o = f.obj;
    if (k === 'vehicle') { o.input.throttle = 0; o.input.steer = 0; o.input.brake = 1; o.step(dt, envNow); }
    else if (k === 'walker') { Object.assign(o.input, { fwd: 0, strafe: 0, sprint: 0, jump: 0 }); o.step(dt, envNow); }
    else {
      if (f.summon) {
        const c = C.DroneAutopilot.control(o, cur.terrain, f.summon.route, f.summon.st, dt);
        if (!c && f.summon.st.parked) { f.summon = null; o.cmd = null; say(tr().droneArrived, 'good', 3000); }
      } else { o.cmd = null; Object.assign(o.input, { fwd: 0, strafe: 0, climb: 0, yaw: 0 }); }
      o.step(dt, envNow);
    }
    o.events.length = 0;
  }
  // an astronaut who boarded the drone flies with it
  if (fleet.walker && fleet.walker.hidden && fleet.drone) { const w = fleet.walker.obj, d = fleet.drone.obj; w.pos = d.pos.slice(); w.vel = [0, 0, 0]; }
}
const passiveList = () => ['vehicle', 'walker', 'drone'].filter(k => fleet[k] && fleet[k].obj !== rover && !fleet[k].lost).map(k => ({ kind: k, obj: fleet[k].obj, cfg: fleet[k].cfg, hidden: fleetHidden(k) }));
const fleetHidden = k => fleet[k].hidden;
function updateFleetUI() {
  const T = tr(), ico = { vehicle: '🚙', walker: '🧑‍🚀', drone: '🚁' };
  ['vehicle', 'walker', 'drone'].forEach((k, i) => {
    const b = $('fl' + (i + 1)); if (!b) return; const f = fleet[k];
    b.textContent = `${ico[k]} ${i + 1}`; b.title = T.flName[k] + (f && f.lost ? ' (far)' : '');
    b.classList.toggle('on', activeKey === k); b.style.opacity = f ? (f.lost ? 0.55 : 1) : 0.4;
  });
  const act = $('flAct'); if (act) act.textContent = 'V';
  updateTouchUI();
}

// ============================================================================= stages: transition
async function advanceStage() {
  if (loadingStage) return; loadingStage = true;
  const T = tr(), k = stageIdx + 1;
  try {
    if (!nextLoad) nextLoad = prepareStage(k, cur);
    const waiting = performance.now();
    const nxt = await nextLoad;
    const R = routeObj.radius, old = cur;
    for (const f of Object.values(fleet)) {            // move all vehicles to the new coordinate system, not only the active one
      if (!f || f.lost) continue; const o = f.obj, p = o.pos;
      const ll = C.Geo.toLatLon(R, old.geo.lat0, old.geo.lon0, p[0], p[1]);
      const alt = old.terrain.altitude(p[0], p[1], p[2]);
      const e = C.Geo.toEnu(R, nxt.geo.lat0, nxt.geo.lon0, ll[0], ll[1]);
      const z = alt - nxt.terrain.h0 - (e[0] * e[0] + e[1] * e[1]) / (2 * R);
      o.terrain = nxt.terrain; o.pos = [e[0], e[1], z]; o.anchor = null;
    }
    for (const f of Object.values(fleet)) if (f && f.obj !== rover && !f.hidden && Math.hypot(f.obj.pos[0] - rover.pos[0], f.obj.pos[1] - rover.pos[1]) > 1500) { f.lost = true; f.summon = null; }
    updateFleetUI();
    cur = nxt; stageIdx = k; nextLoad = null; pIdx = 0; guideAt = -99; apInfo.st = {}; prevSnap = null;
    applyStage(cur);
  } catch (err) { console.error(err); say(T.loadErr, 'bad', 6000); nextLoad = null; }
  loadingStage = false;
}
function stageProgress() {
  const r = cur.route, p = rover.pos; let best = pIdx, bd = 1e18;
  for (let i = Math.max(0, pIdx - 6); i < Math.min(r.length, pIdx + 70); i++) {
    const d = (r[i][0] - p[0]) ** 2 + (r[i][1] - p[1]) ** 2; if (d < bd) { bd = d; best = i; }
  }
  pIdx = best; offRoute = Math.sqrt(bd);
}
function routeS() { const e = Math.max(1, cur.geo.endIdx); return cur.st.s0 + clamp(pIdx / e, 0, 1) * cur.st.len; }
const totalLen = () => routeObj.cum[routeObj.cum.length - 1];

// ============================================================================= environment
function updateEnv() {
  const p = rover.pos, R = routeObj.radius;
  rll = C.Geo.toLatLon(R, cur.geo.lat0, cur.geo.lon0, p[0], p[1]);
  envNow = env.at(simT / 3600 + t0H, rll[0], rll[1]);
  envNow.windDir = 1.1 + 0.4 * Math.sin(simT / 5000);
  if (ROUTE.body === 'moon') {
    const b = C.Geo.basis(rll[0], rll[1]), E = [1, 0, 0];
    envNow.earthDir = [b.e[0] * E[0], b.n[0], b.u[0]];
    envNow.earthDir = [-Math.sin(rll[1] * D2R), -Math.sin(rll[0] * D2R) * Math.cos(rll[1] * D2R), Math.cos(rll[0] * D2R) * Math.cos(rll[1] * D2R)];
  }
}

// ============================================================================= loop
const joy = { active: false, id: null, x: 0, y: 0 };
function readInput() {
  const k = keys;
  const thr = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  const st = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
  const sh = !!(k.ShiftLeft || k.ShiftRight);
  let t2 = thr, s2 = st;
  if (joy.active) { const dz = 0.14, jx = Math.abs(joy.x) > dz ? joy.x : 0, jy = Math.abs(joy.y) > dz ? joy.y : 0; t2 = clamp(thr - jy, -1, 1); s2 = clamp(st - jx, -1, 1); }
  return { thr: t2, st: s2, brake: k.Space ? 1 : 0, shift: sh, any: !!(t2 || s2 || k.Space || (isDrone && (sh || k.KeyQ || k.KeyE))) };
}
function stepPhysics(dt) {
  const inp = readInput();
  if (isWalker) {
    rover.yaw = cam.yaw; rover.lockFace = cam.mode === 1;
    const wi = rover.input;
    wi.fwd = inp.thr; wi.strafe = -inp.st; wi.sprint = inp.shift ? 1 : 0; wi.jump = keys.Space ? 1 : 0;
    if (apInfo.on && !(inp.thr || wi.strafe)) {
      const r = cur.route, i = Math.min(r.length - 1, pIdx + 4), tgt = r[i];
      const dx = tgt[0] - rover.pos[0], dy = tgt[1] - rover.pos[1];
      cam.yaw = Math.atan2(dx, dy); rover.yaw = cam.yaw; wi.fwd = 1; wi.sprint = 0;
    } else if (apInfo.on && (inp.thr || wi.strafe)) setAuto(false);
  } else if (isDrone) {
    const di = rover.input;
    di.fwd = inp.thr; di.strafe = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0); di.climb = (keys.Space ? 1 : 0) - (inp.shift ? 1 : 0); di.yaw = inp.st;
    if (apInfo.on && !inp.any) {
      apInfo.st.finalStage = stageIdx === stages.length - 1;
      const c = C.DroneAutopilot.control(rover, cur.terrain, cur.route, apInfo.st, dt);
      if (!c && apInfo.st.parked) setAuto(false);
      else if (apInfo.st.landingNow && !apInfo.st.told) { apInfo.st.told = true; say(tr().autoLand, 'warn', 5000); }
    } else { if (apInfo.on && inp.any) setAuto(false); rover.cmd = null; }
  } else {
    const ri = rover.input;
    if (apInfo.on && !inp.any) {
      const c = C.Autopilot.control(rover, cur.terrain, cur.route, apInfo.st, dt);
      ri.throttle = c.throttle; ri.steer = c.steer; ri.brake = c.brake;
      if (c.blocked) { apInfo.blocked = (apInfo.blocked || 0) + dt; if (apInfo.blocked > 2.5) { say(tr().apBlocked, 'warn', 5000, 'apb'); setAuto(false); } } else apInfo.blocked = 0;
    } else {
      if (apInfo.on && inp.any) setAuto(false);
      ri.throttle = inp.thr; ri.steer = inp.st; ri.brake = inp.brake;
    }
  }
  applyRemoteForces(dt);
  rover.step(dt, envNow);
  stepPassives(dt);
  simT += dt;
}
function setAuto(on) {
  apInfo.on = on; if (touchDev) $('tbAuto').classList.toggle('on', on); apInfo.st = {}; apInfo.blocked = 0; $('bAuto').classList.toggle('on', on); if (isDrone && !on && rover) rover.cmd = null;
  say(on ? tr().apOn : tr().apOff, on ? 'good' : '', 2200);
}
function snapshot() { prevSnap = { pos: rover.pos.slice(), q: isWalker ? rover.q : { x: rover.q.x, y: rover.q.y, z: rover.q.z, w: rover.q.w } }; }

function loop(ts) {
  requestAnimationFrame(loop);
  if (!running) return;
  const real = Math.min((ts - lastTs) / 1000, 0.1); lastTs = ts;
  if (cruise.active) { cruiseFrame(real); return; }
  if (loadingStage) { return; }
  if (paused) { netFrame(real); renderFrame(real, 1); return; }
  const w = WARPS[warpIdx], dtFix = 0.01, t0 = performance.now(), budget = 12;
  acc += real * w; let steps = 0; warpLimited = false;
  while (acc >= dtFix) {
    if (isWalker) prevSnap = { pos: rover.pos.slice(), q: { x: 0, y: 0, z: 0, w: 1 } }; else snapshot();
    stepPhysics(dtFix); acc -= dtFix; steps++;
    if (steps % 10 === 0 && performance.now() - t0 > budget && !window.__noBudget) { warpLimited = acc > dtFix * 3; acc = Math.min(acc, dtFix); break; }
    if (rover.events.length) handleEvents();
    if (running === false) return;
  }
  if (rover.events.length) handleEvents();
  tick++;
  stageProgress(); updateEnv(); netFrame(real); gameplay(real);
  renderFrame(real, clamp(acc / dtFix, 0, 1));
  if (tick % 6 === 0) { updateHud(); drawMini(); }
}
function renderFrame(real, alpha) {
  scene3.frame({ rover, prev: prevSnap, alpha, env: envNow, cam, lights: lightsOn || (envNow && envNow.sunEl < 4 && cfgNeedsLights()),
                 realDt: real, now: performance.now() / 1000, spawnDust: WARPS[warpIdx] <= 4, walker: isWalker, drone: isDrone, remotes: remRender, passive: passiveList(),
                 earthDir: envNow && envNow.earthDir, earthUp: envNow && envNow.earthDir && envNow.earthDir[2] > 0, windDir: envNow ? envNow.windDir : 0 });
  if (scene3.vehicleGroup) scene3.vehicleGroup.visible = !(isWalker && cam.mode === 1);
}
const cfgNeedsLights = () => false;

function handleEvents() {
  const T = tr();
  for (const e of rover.events) {
    if (e.type === 'impact') { scene3.shake = Math.min(0.5, 0.1 + e.v * 0.08); if (e.dmg > 1.5 || isWalker) say(`${T.impact}: −${(e.dmg || e.v * 4).toFixed(0)} %`, 'warn', 2500, 'imp'); }
    else if (e.type === 'destroyed') endMission(false, 'destroyed');
    else if (e.type === 'frozen') say(T.frozen, 'bad', 6000);
    else if (e.type === 'overheated') say(T.overheated, 'bad', 6000);
    else if (e.type === 'dead') endMission(false, 'suit');
  }
  rover.events.length = 0;
}

// ============================================================================= game logic
let credFrac = 0, odoPrev = 0, warnT = 0, wasNight = null, stormPrev = 0, flipped = false;
function gameplay(real) {
  const T = tr();
  // credits for distance covered
  const dOdo = rover.odo - odoPrev; odoPrev = rover.odo;
  mission.dist += dOdo; credFrac += dOdo / 100 * 12;
  if (credFrac >= 1) { const c = Math.floor(credFrac); credFrac -= c; mission.earned += c; save.credits += c; }
  // spacesuit refill at checkpoints is in advanceStage
  // beacon and samples
  const p = rover.pos, items = cur.items || [];
  for (const it of items) {
    if (it.done) continue;
    const d = Math.hypot(p[0] - it.x, p[1] - it.y);
    if (it.kind === 'sample' && d < (isWalker ? 3.2 : isDrone ? 6.5 : 5.5) && (!isDrone || rover.agl() < 9)) { it.done = true; mission.samples++; mission.earned += 100; save.credits += 100; say(`${T.sample} +100`, 'good', 3000); }
  }
  const b = cur.beacon, lastStage = stageIdx === stages.length - 1;
  if (b && !b.done) {
    const d = Math.hypot(p[0] - b.x, p[1] - b.y), r = cur.route, ei = cur.geo.endIdx;
    let passed = false;
    if (!lastStage && ei > 1 && ei < r.length - 1) {
      const dx = r[ei + 1][0] - r[ei - 1][0], dy = r[ei + 1][1] - r[ei - 1][1], dl = Math.hypot(dx, dy) || 1;
      const along = ((p[0] - b.x) * dx + (p[1] - b.y) * dy) / dl, lat = Math.abs(-(p[0] - b.x) * dy / dl + (p[1] - b.y) * dx / dl);
      passed = along >= 0 && lat < 90 && d < 120;
    }
    const dronePassed = isDrone && d < (lastStage ? 14 : 30) && (!lastStage || rover.agl() < 3.5);
    if ((!isDrone && (d < (lastStage ? 10 : 16) || passed)) || dronePassed || (isDrone && !lastStage && passed)) {
      b.done = true;
      if (lastStage) { mission.earned += 500; save.credits += 500; endMission(true, 'arrival'); return; }
      mission.stages++; const bonus = 50 + (rover.damage < 5 ? 50 : 0); mission.earned += bonus; save.credits += bonus;
      say(`${T.stageDone} ${stageIdx + 1}/${stages.length}  +${bonus}`, 'good', 3500);
      if (isWalker) { rover.battery = Math.min(cfg.batteryKwh, rover.battery + cfg.batteryKwh * 0.5); }
      persist(); advanceStage(); return;
    }
  }
  // preload the next stage
  if (!nextLoad && stageIdx + 1 < stages.length && pIdx > cur.geo.endIdx * 0.5) {
    nextLoad = prepareStage(stageIdx + 1, cur); nextLoad.catch(() => { nextLoad = null; });
  }
  updateGuide(false);
  assetVisits();
  // warnings
  warnT -= real; if (warnT > 0) return; warnT = 0.5;
  const frac = rover.battery / cfg.batteryKwh;
  if (isDrone && ROUTE.body === 'mars' && envNow.wind > 14) say(T.windUnsafe, 'bad', 3500, 'wind');
  if (frac < 0.1) say(T.critBat, 'bad', 5000, 'bat2'); else if (frac < 0.2) say(T.lowBat, 'warn', 4500, 'bat1');
  if (!isWalker && !isDrone) {
    if (rover.temp < -30 && rover.status === 'ok') say(T.cold, 'warn', 4000, 'cold');
    if (rover.temp > 55 && rover.status === 'ok') say(T.hot, 'warn', 4000, 'hot');
    const tilt = Math.acos(clamp(rover.upZ, -1, 1)) * R2D;
    if (tilt > 30 && rover.upZ > 0.25) say(T.steep, 'warn', 1800, 'tilt');
    if (rover.flipTime > 2.2 && !flipped) { flipped = true; say(T.flip, 'bad', 9000); }
    if (rover.flipTime < 0.1) flipped = false;
  }
  const night = envNow.sunEl < 2;
  if (wasNight === false && night) say(T.nightOn, 'warn', 5000);
  wasNight = night;
  if (stormPrev < 0.15 && envNow.storm >= 0.15) say(T.stormOn, 'warn', 6000);
  stormPrev = envNow.storm;
  if (offRoute > 300) say(T.offRoute, 'warn', 4000, 'off');
  if (cfg.scanner >= 1 && !isWalker && !isDrone) {   // steep slope ahead
    const a = C.axes(rover.q, {}), tx = rover.pos[0] + a.fx * 18, ty = rover.pos[1] + a.fy * 18;
    if (cur.terrain.slopeDeg(tx, ty, 1.5) > 24 && Math.abs(rover.speed) > 1) say(T.hazard, 'warn', 1800, 'haz');
  }
}

function endMission(success, why) {
  if (!running) return; running = false; persist();
  const T = tr();
  $('hud').hidden = true;
  const msg = success ? T.ok : T.fail, why2 = why === 'destroyed' ? T.destroyed : why === 'suit' ? 'Suit power lost' : '';
  const durH = simT / 3600;
  $('end').innerHTML = `<div class="panel" style="max-width:560px"><h1>${success ? '🏁' : '💥'} ${msg}</h1><div class="muted">${why2}</div>
    <div class="cols" style="margin-top:16px"><div class="card"><div class="muted">${T.driven}</div><b style="font-size:20px">${fmtKm(mission.dist)}</b></div>
      <div class="card"><div class="muted">${T.time}</div><b style="font-size:20px">${fmtT(durH)}</b></div>
      <div class="card"><div class="muted">${T.samplesGot}</div><b style="font-size:20px">${mission.samples}</b></div>
      <div class="card"><div class="muted">${T.earned}</div><b style="font-size:20px;color:var(--amber)">+${mission.earned}</b></div></div>
    <div class="muted" style="margin-top:10px">${T.credits}: <b>${save.credits}</b> · ${T.damage}: ${rover.damage.toFixed(0)} %</div>
    <div class="row" style="margin-top:20px;justify-content:flex-end;gap:10px"><button class="btn" id="eGar">${T.garage}</button>
      <button class="btn" id="eRe">${T.replay}</button><button class="btn pri" id="eMap">${T.exit}</button></div></div>`;
  $('end').hidden = false;
  $('eMap').onclick = closeSim; $('eRe').onclick = () => location.reload(); $('eGar').onclick = () => showGarage(false, true);
  save.missions++; persist();
}

// ============================================================================= fast transfer (accelerated trip)
function startCruise() {
  if (cruise.active || !running || loadingStage) return;
  const s = routeS(); cruise.s0 = s;
  cruise.cr = new C.Cruise(routeObj, cfg, env, { s, t: simT / 3600 + t0H, battery: rover.battery, dust: rover.dust || 0 });
  cruise.active = true; cruise.stormSeen = false; cruise.shown = -1; setAuto(false);
  $('cruiseOv').hidden = false; $('cRv').textContent = isWalker ? '🧑‍🚀' : isDrone ? '🚁' : '🚙';
  cruiseUI();
}
function cruiseUI() { $('cWarp').textContent = '× ' + CRUISE[cruiseIdx].toLocaleString('en'); }
function cruiseFrame(real) {
  const cr = cruise.cr, T = tr(); let h = real * CRUISE[cruiseIdx] / 3600, guard = 0;
  while (h > 1e-9 && guard++ < 12) {
    const dt = Math.min(h, 0.05); cr.step(dt); h -= dt;
    if (cr.s >= cr.total - 1) { exitCruise(true); return; }
    const e = cr.env_;
    if (e && e.storm > 0.3 && !cruise.stormSeen && cfg.crewed) { cruise.stormSeen = true; say(T.stormOn, 'warn', 6000); }
  }
  const e = cr.env_ || { sunEl: 0 };
  $('cClock').textContent = fmtT(cr.t - t0H); $('cDist').textContent = fmtKm(cr.total - cr.s);
  $('cBat').textContent = (100 * cr.battery / cfg.batteryKwh).toFixed(0) + ' %';
  $('cState').textContent = T.reason[cr.reason] || cr.reason;
  const f = cr.s / cr.total; $('cDone').style.width = (f * 100) + '%'; $('cRv').style.left = (f * 100) + '%';
  $('cTitle').textContent = T.cruiseTitle;
}
async function exitCruise(arrived) {
  if (!cruise.active) return; const cr = cruise.cr, T = tr(); cruise.active = false;
  $('cruiseOv').hidden = true; $('fade').style.opacity = 1; $('loading').hidden = false; $('loadMsg').textContent = T.sectors;
  const total = cr.total, travelled = Math.max(0, cr.s - cruise.s0);
  mission.dist += travelled; const c = Math.floor(travelled / 100 * 4); mission.earned += c; save.credits += c;
  try {
    const k = clamp(Math.floor(Math.min(cr.s, total - 0.01) / stages[0].len), 0, stages.length - 1);
    if (k !== stageIdx || arrived) { cur = await prepareStage(k, null); stageIdx = k; nextLoad = null; }
    scene3.camInit = false;
    const [la, lo, idx] = posAt(cr.s), [la2, lo2] = posAt(Math.min(total, cr.s + 20));
    const R = routeObj.radius, p = C.Geo.toEnu(R, cur.geo.lat0, cur.geo.lon0, la, lo), q = C.Geo.toEnu(R, cur.geo.lat0, cur.geo.lon0, la2, lo2);
    let hdg = Math.atan2(q[0] - p[0], q[1] - p[1]); if (!Number.isFinite(hdg)) hdg = 0;
    rover.terrain = cur.terrain; rover.place(p[0], p[1], hdg);
    for (let i = 0; i < 90 && !isWalker; i++) rover.step(0.01, null);
    rover.vel = [0, 0, 0]; rover.w = [0, 0, 0];
    rover.battery = cr.battery; rover.dust = cr.dust; simT = (cr.t - t0H) * 3600; prevSnap = null; pIdx = 0; guideAt = -99; apInfo.st = {};
    if (isWalker) { cam.yaw = hdg; }
    if (!isWalker) rover.temp = clamp(cr.env_ ? cr.env_.temp * 0.55 - 15 : 10, -40, 45);
    for (const f of Object.values(fleet)) if (f && f.obj !== rover) { const k = f.kind === 'vehicle' ? -6 : f.kind === 'drone' ? 6 : 3; placeNear(f, Math.cos(hdg) * k, -Math.sin(hdg) * k); }
    odoPrev = rover.odo; applyStage(cur); stageProgress(); updateEnv(); updateFleetUI();
    if (arrived) { mission.earned += 500; save.credits += 500; endMission(true, 'arrival'); }
  } catch (err) { console.error(err); say(T.loadErr, 'bad', 6000); }
  $('loading').hidden = true; $('fade').style.opacity = 0; lastTs = performance.now(); acc = 0;
}

// ============================================================================= online: other players
let net = null, remRender = [], remLocal = [], netT = 0, collCool = 0, netStatus = 'off';
const KIND_ICON = { rover_crew: '🚙', rover_robot: '🤖', walker: '🧑‍🚀', drone: '🚁' };
const unitOf = () => (isDrone && cfg.unit === 'kg' ? 'kg' : 'kWh');

function qFromEuler(hd, pitch, roll) {
  const cp = Math.cos(pitch), f = [Math.sin(hd) * cp, Math.cos(hd) * cp, Math.sin(pitch)], l0 = [-Math.cos(hd), Math.sin(hd), 0];
  const u0 = [f[1] * l0[2] - f[2] * l0[1], f[2] * l0[0] - f[0] * l0[2], f[0] * l0[1] - f[1] * l0[0]], cr = Math.cos(roll), sr = Math.sin(roll);
  const l = [l0[0] * cr + u0[0] * sr, l0[1] * cr + u0[1] * sr, l0[2] * cr + u0[2] * sr], u = [u0[0] * cr - l0[0] * sr, u0[1] * cr - l0[1] * sr, u0[2] * cr - l0[2] * sr];
  return C.qFromAxes(f, l, u);
}
function initNet() {
  if (!settings.online || net) return;
  net = new window.Net(); netStatus = 'connecting';
  net.on.status = st => { netStatus = st === 'open' ? 'on' : st; updateNetBadge(); };
  net.on.welcome = m => { netStatus = 'on'; updateNetBadge(); chatLine(null, tr().playersNow(m.online), 'sys'); };
  net.on.join = m => { chatLine(null, tr().youJoined(m.name), 'sys'); updateNetBadge(); };
  net.on.leave = m => { chatLine(null, tr().youLeft(m.name), 'sys'); updateNetBadge(); };
  net.on.chat = m => chatLine(m.name, m.text, 'msg', m.hue);
  net.on.ping = m => {
    if (!cur || !scene3) return;
    const R = routeObj.radius, e = C.Geo.toEnu(R, cur.geo.lat0, cur.geo.lon0, m.lat, m.lon), t = cur.terrain;
    if (e[0] < t.x0 || e[0] > t.x1 || e[1] < t.y0 || e[1] > t.y1) return;
    pingMarks.push({ x: e[0], y: e[1], hue: m.hue, name: m.name, born: performance.now() }); scene3.addPing(e[0], e[1], t.heightBase(e[0], e[1]), m.hue, m.name);
    say(tr().pingFrom(m.name), 'good', 3000);
  };
  net.on.give = m => { const a = Math.min(m.amt, cfg.batteryKwh - rover.battery); rover.battery += Math.max(0, a); say(tr().gotFrom(m.name, a.toFixed(isDrone && cfg.unit === 'kg' ? 1 : 2), unitOf()), 'good', 4500); };
  net.connect({ name: settings.name, kind: curProf(), body: ROUTE.body });
}
const pingMarks = [];
function netFrame(real) {
  const now = performance.now();
  // other players in the current coordinate system
  remRender.length = 0; remLocal.length = 0;
  if (net && net.connected && cur) {
    const R = routeObj.radius, t = cur.terrain;
    for (const p of net.players.values()) {
      const s = net.sample(p, now); if (!s || s.cr) continue;
      const e = C.Geo.toEnu(R, cur.geo.lat0, cur.geo.lon0, s.lat, s.lon), x = e[0], y = e[1];
      if (x < t.x0 + 5 || x > t.x1 - 5 || y < t.y0 + 5 || y > t.y1 - 5) continue;
      const z = s.alt - t.h0 - (x * x + y * y) / (2 * R);
      remRender.push({ id: s.id, name: s.name, kind: s.kind, hue: s.hue, x, y, z, q: qFromEuler(s.hd, s.p, s.r), hd: s.hd, steer: s.sa, speed: s.v, thrust: s.th });
      remLocal.push({ id: s.id, x, y, z, vx: Math.sin(s.hd) * s.v, vy: Math.cos(s.hd) * s.v, r: s.kind === 'rover_crew' ? 2.1 : s.kind === 'rover_robot' ? 1.4 : s.kind === 'walker' ? 0.6 : 1.0, name: s.name });
    }
  }
  // send own state ~10 times per second (less often during a "transfer")
  netT -= real;
  if (net && net.connected && rover && cur && netT <= 0) {
    netT = cruise.active ? 0.5 : 0.1;
    let st;
    if (cruise.active && cruise.cr) { const pp = posAt(cruise.cr.s); st = { lat: pp[0], lon: pp[1], alt: 0, hd: 0, p: 0, r: 0, v: 0, sa: 0, th: 0, st: 'cruise', b: cruise.cr.battery / cfg.batteryKwh, cr: true, kind: curProf() }; }
    else {
      const p = rover.pos, a = isWalker ? null : C.axes(rover.q, {});
      st = { lat: rll[0], lon: rll[1], alt: cur.terrain.altitude(p[0], p[1], p[2]), hd: isWalker ? rover.face : rover.heading, p: a ? Math.asin(clamp(a.fz, -1, 1)) : 0, r: a ? Math.atan2(a.lz, a.uz) : 0,
             v: rover.speed, sa: rover.steerAngle || 0, th: isDrone ? (rover.stats.thrustPct || 0) : 0, st: String(rover.status || 'ok'), b: clamp(rover.battery / cfg.batteryKwh, 0, 1), cr: false, kind: curProf() };
    }
    net.state(st);
  }
  // expired player markers
  for (let i = pingMarks.length - 1; i >= 0; i--) if (now - pingMarks[i].born > 90000) pingMarks.splice(i, 1);
  if (netShown) renderPlayerList();
}
/** Collisions: other players' vehicles are moving obstacles for us. Each client computes its own reaction, so both feel the bump. */
function applyRemoteForces(dt) {
  rover.extF = null; collCool -= dt;
  if (!remLocal.length || WARPS[warpIdx] > 4 || isWalker) return;
  const p = rover.pos, v = rover.vel, me = isDrone ? 1.0 : cfg.crewed ? 2.1 : 1.4, m = isDrone ? rover.mass : cfg.mass;
  let fx = 0, fy = 0, worst = 0;
  for (const o of remLocal) {
    const dx = p[0] - o.x, dy = p[1] - o.y, dist = Math.hypot(dx, dy), rs = me + o.r;
    if (dist >= rs || dist < 1e-3 || Math.abs(p[2] - o.z) > 2.4) continue;
    const nx = dx / dist, ny = dy / dist, ov = rs - dist, closing = -((v[0] - o.vx) * nx + (v[1] - o.vy) * ny);
    const f = m * (45 * ov + 7 * Math.max(0, closing)); fx += nx * f; fy += ny * f; worst = Math.max(worst, closing);
  }
  if (fx || fy) rover.extF = [fx, fy, 0];
  if (worst > 2 && collCool <= 0 && settings.damage) {
    collCool = 0.6; const dmg = 2.2 * (worst - 2) * (worst - 2) * (cfg.armor != null ? cfg.armor : 1);
    rover.damage = Math.min(100, rover.damage + dmg); rover.events.push({ type: 'impact', v: worst, dmg });
  }
}
function nearestRemote(maxD) {
  let best = null, bd = maxD; const p = rover.pos;
  for (const o of remLocal) { const d = Math.hypot(p[0] - o.x, p[1] - o.y, (p[2] - o.z) * 0.5); if (d < bd) { bd = d; best = o; } }
  return best;
}
function shareEnergy() {
  const T = tr(), o = nearestRemote(20);
  if (!o) { say(T.noNear, 'warn', 2000, 'noNear'); return; }
  const amt = isDrone ? (cfg.unit === 'kg' ? 4 : 0.08) : isWalker ? 0.1 : cfg.crewed ? 3 : 0.15;
  if (rover.battery < amt * 2) { say(T.lowBat, 'warn', 2000); return; }
  rover.battery -= amt; net.give(o.id, amt); say(T.gaveTo(o.name, amt, unitOf()), 'good', 3500);
}
function dropPing() {
  if (!net || !net.connected) return;
  const a = isWalker ? { fx: Math.sin(rover.yaw), fy: Math.cos(rover.yaw) } : C.axes(rover.q, {}), x = rover.pos[0] + a.fx * 25, y = rover.pos[1] + a.fy * 25;
  const ll = C.Geo.toLatLon(routeObj.radius, cur.geo.lat0, cur.geo.lon0, x, y); net.ping(ll[0], ll[1]);
}
// ---- chat and player list
let netShown = false, chatOpen = false;
function chatLine(name, text, kind, hue) {
  const box = $('chatLog'); if (!box) return;
  const d = document.createElement('div'); d.className = 'cl ' + (kind || '');
  d.innerHTML = name ? `<b style="color:hsl(${hue == null ? 200 : hue},85%,66%)"></b> <span></span>` : '<span></span>';
  if (name) d.querySelector('b').textContent = name + ':';
  d.querySelector('span').textContent = text; box.appendChild(d);
  while (box.children.length > 40) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight; $('chat').classList.add('show'); clearTimeout(chatLine.t); chatLine.t = setTimeout(() => { if (!chatOpen) $('chat').classList.remove('show'); }, 12000);
}
function openChat(on) {
  chatOpen = on; const inp = $('chatIn'); inp.hidden = !on; $('chat').classList.toggle('show', on || $('chatLog').children.length > 0);
  if (on) { inp.value = ''; inp.focus(); for (const k in keys) keys[k] = false; } else inp.blur();
}
function updateNetBadge() {
  const T = tr(), b = $('netBadge'); if (!b) return;
  b.hidden = !settings.online;
  const on = net && net.connected;
  b.innerHTML = `<span class="dot ${on ? 'on' : ''}"></span> ${on ? T.netOn + ': ' + net.online : T.netOff}`;
}
function renderPlayerList() {
  const T = tr(), box = $('plist'); if (!box) return;
  const now = performance.now(), me = rover ? rover.pos : [0, 0, 0];
  let html = `<div class="muted" style="margin-bottom:6px">${T.playersTitle}${net ? ' · ' + net.online : ''}</div>`;
  html += `<div class="prow"><i style="background:hsl(${net && net.hue != null ? net.hue : 200},85%,60%)"></i><b>${escapeHtml(net && net.name ? net.name : settings.name)}</b> ${KIND_ICON[curProf()] || ''}<span class="muted">(you)</span></div>`;
  if (net) for (const p of net.players.values()) {
    const s = net.sample(p, now); let dist = '';
    if (s && cur) { const R = routeObj.radius, e = C.Geo.toEnu(R, cur.geo.lat0, cur.geo.lon0, s.lat, s.lon); dist = fmtKm(Math.hypot(e[0] - me[0], e[1] - me[1])); }
    html += `<div class="prow"><i style="background:hsl(${p.hue},85%,60%)"></i><b>${escapeHtml(p.name)}</b> ${KIND_ICON[p.kind] || ''}<span class="muted">${dist}${s && s.cr ? ' · ' + T.cruise : ''}${s && s.b != null ? ' · 🔋' + Math.round(s.b * 100) + '%' : ''}</span></div>`;
  }
  box.innerHTML = html;
}
const escapeHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function togglePlayers() { netShown = !netShown; $('plist').hidden = !netShown; if (netShown) renderPlayerList(); }

// ============================================================================= real vehicles
let assetsAll = [];
const visitedAssets = new Set();
async function loadAssets() {
  try { const r = await fetch('/api/assets?body=' + ROUTE.body); if (r.ok) assetsAll = await r.json(); } catch (e) { assetsAll = []; }
}
function assetName(a) { return a[lang] || a.en; }
function assetSub(a) {
  const T = tr();
  return a.live ? `${T.sol} ${a.sol} · ${T.liveBadge}` : T.lastKnown;
}
/** Vehicles that fall on the current terrain patch. */
function stageAssets(info) {
  const R = routeObj.radius, t = info.terrain, out = [];
  for (const a of assetsAll) {
    const e = C.Geo.toEnu(R, info.geo.lat0, info.geo.lon0, a.lat, a.lon);
    if (e[0] < t.x0 + 30 || e[0] > t.x1 - 30 || e[1] < t.y0 + 30 || e[1] > t.y1 - 30) continue;
    out.push({ id: a.id, a, x: e[0], y: e[1], z: t.heightBase(e[0], e[1]), hd: (a.heading_deg || 0) * D2R, kind: a.kind === 'rover' ? 'rover' : 'lander', name: assetName(a), live: a.live, sub: assetSub(a) });
  }
  return out;
}
function assetVisits() {
  const items = cur.assetItems || [], p = rover.pos, T = tr();
  for (const it of items) {
    if (visitedAssets.has(it.id) || simT < 25) continue;       // a vehicle at the start point does not count as visited
    if (Math.hypot(p[0] - it.x, p[1] - it.y) < (it.live ? 16 : 12) && (!isDrone || rover.agl() < 30)) {
      visitedAssets.add(it.id); mission.earned += 300; save.credits += 300;
      say(`${T.visited}: ${it.name}${it.live ? ' (' + T.liveBadge + ', ' + T.sol + ' ' + it.a.sol + ')' : ''}  +300`, 'good', 6000);
    }
  }
}
/** For the briefing: real vehicles near the route. */
function nearbyAssets(maxKm) {
  const R = routeObj.radius, out = [];
  for (const a of assetsAll) {
    let best = 1e12;
    for (const q of routeObj.points) best = Math.min(best, C.Geo.dist(R, q[0], q[1], a.lat, a.lon));
    if (best <= maxKm * 1000) out.push({ a, d: best });
  }
  return out.sort((x, y) => x.d - y.d).slice(0, 6);
}

// ============================================================================= interface
const el = {};
function updateHud() {
  const T = tr(), r = rover, e = envNow; if (!e) return;
  const sp = r.speed, kmh = Math.abs(sp) * 3.6;
  $('speed').innerHTML = (kmh < 10 ? kmh.toFixed(1) : Math.round(kmh)) + `<small>km/h · ${Math.abs(sp).toFixed(1)} m/s</small>`;
  const hd = ((r.heading * R2D) % 360 + 360) % 360, dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  $('vHead').textContent = `${Math.round(hd)}° ${dirs[Math.round(hd / 45) % 8]}`;
  const bf = clamp(r.battery / cfg.batteryKwh, 0, 1);
  $('bBat').style.width = (bf * 100) + '%'; $('bBat').parentElement.className = 'bar ' + (bf < 0.1 ? 'red' : bf < 0.25 ? 'amber' : '');
  $('vBat').textContent = `${(bf * 100).toFixed(0)}% · ${r.battery.toFixed(r.battery < 10 ? 2 : 0)}${isDrone ? ' ' + cfg.unit : ''}`;
  if (isWalker) { $('bTmp').style.width = '0'; $('vTmp').textContent = '—'; }
  else { $('bTmp').style.width = clamp((r.temp + 60) / 160, 0, 1) * 100 + '%'; $('vTmp').textContent = r.temp.toFixed(0) + ' °C' + (r.heater ? ' ♨' : ''); }
  $('bDmg').style.width = r.damage + '%'; $('vDmg').textContent = r.damage.toFixed(0) + ' %';
  const pit = isWalker ? 0 : Math.asin(clamp(C.axes(r.q, {}).fz, -1, 1)) * R2D, rol = isWalker ? 0 : Math.asin(clamp(C.axes(r.q, {}).lz, -1, 1)) * R2D;
  $('vPit').textContent = pit.toFixed(0) + '°'; $('vRol').textContent = rol.toFixed(0) + '°';
  const moonDrone = isDrone && cfg.unit === 'kg';
  $('vPow').textContent = moonDrone ? ((r.stats.fuelFlow || 0) * 3600).toFixed(0) + ' kg/h' : ((r.stats.power || 0) / 1000).toFixed(1) + ' kW';
  $('vSol').textContent = moonDrone ? '+' + (r.stats.solar || 0).toFixed(1) + ' kg/h' : ((r.stats.solar || 0) / 1000).toFixed(1) + ' kW' + (r.inShadow ? ' ☁' : '');
  $('vAlt').textContent = Math.round(cur.terrain.altitude(r.pos[0], r.pos[1], r.pos[2])) + ' m' + (isDrone ? ` · ↕ ${r.vel[2].toFixed(1)}` : '');
  $('vSlip').textContent = isWalker ? '—' : isDrone ? Math.max(0, r.agl()).toFixed(0) + ' m' : Math.round(clamp(r.stats.slip, 0, 1.5) * 100) + ' %';
  // stage
  const total = totalLen(), s = routeS();
  $('mTitle').textContent = `${T.stage} ${stageIdx + 1}/${stages.length} · ${fmtKm(Math.max(0, total - s))} ${T.toGo}`;
  $('mSub').textContent = `${T.body[ROUTE.body]} · ${T.veh[curProf()]}` + (apInfo.on ? ` · ${T.auto}` : '');
  $('mProg').style.width = (s / total * 100) + '%';
  $('mClock').textContent = fmtT(simT / 3600) + ':' + String(Math.floor(simT % 60)).padStart(2, '0'); $('mLocal').textContent = fmtT(e.local);
  $('mCredits').textContent = save.credits; $('mSamples').textContent = mission.samples;
  const w = WARPS[warpIdx]; $('warpVal').textContent = '× ' + w + (warpLimited ? ' ⚠' : '');
  // weather
  const phase = e.sunEl > 6 ? T.day : e.sunEl > -6 ? T.twilight : T.night;
  $('wIcon').textContent = e.storm > 0.15 ? '🌪' : e.sunEl > 6 ? '☀' : e.sunEl > -6 ? '🌅' : '🌙';
  $('vSun').textContent = `${e.sunEl.toFixed(0)}° · ${phase}`; $('vAmb').textContent = e.temp.toFixed(0) + ' °C';
  $('vTau').textContent = ROUTE.body === 'mars' ? e.tau.toFixed(2) + (e.storm > 0.15 ? ' ⚠' : '') : '—';
  $('vWind').textContent = ROUTE.body === 'mars' ? e.wind.toFixed(0) + ' m/s' : '—';
  $('vVis').textContent = ROUTE.body === 'mars' ? (e.visibility > 20000 ? '>20 km' : fmtKm(e.visibility)) : '∞';
  $('vDose').textContent = (r.dose || 0).toFixed(2) + ' mSv';
  $('bLight').classList.toggle('on', lightsOn); $('hint').textContent = (loadingStage ? T.sectors : '');
}

const mini = { cv: null, off: null, lastT: 0, range: 300 };
function drawMini() {
  if (!mini.cv) { mini.cv = $('mini'); mini.ctx = mini.cv.getContext('2d'); mini.off = document.createElement('canvas'); mini.off.width = mini.off.height = 110; mini.octx = mini.off.getContext('2d'); }
  const ctx = mini.ctx, W = mini.cv.width, c = W / 2, t = cur.terrain, p = rover.pos, rng = mini.range, N = 110;
  // terrain (north at top) as a shaded map
  const img = mini.octx.createImageData(N, N), cell = rng * 2 / N, sd = envNow.sunDir, lx = sd[0], ly = sd[1];
  const hazard = cfg.scanner >= 1 && !isWalker;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = p[0] - rng + (i + 0.5) * cell, y = p[1] + rng - (j + 0.5) * cell;
    const dx = (t.grid(x + cell, y) - t.grid(x - cell, y)) / (2 * cell), dy = (t.grid(x, y + cell) - t.grid(x, y - cell)) / (2 * cell);
    let sh = clamp(0.55 + 2.2 * (-dx * lx - dy * ly) * 0.6, 0.1, 1);
    const hgt = clamp((t.grid(x, y) - p[2]) / 60, -1, 1), k = (j * N + i) * 4;
    let rr = (60 + 110 * sh) * (1 + 0.1 * hgt), gg = (65 + 100 * sh) * (1 + 0.05 * hgt), bb = (80 + 90 * sh);
    if (ROUTE.body === 'mars') { rr *= 1.12; bb *= 0.7; gg *= 0.9; }
    if (hazard) { const sl = Math.atan(Math.hypot(dx, dy)) * R2D; if (sl > 18) { rr = 255; gg *= 0.4; bb *= 0.4; } else if (sl > 12) { rr = Math.min(255, rr + 60); gg *= 0.8; } }
    img.data[k] = rr; img.data[k + 1] = gg; img.data[k + 2] = bb; img.data[k + 3] = 255;
  }
  mini.octx.putImageData(img, 0, 0);
  const hdg = isWalker ? rover.yaw : rover.heading, sc = W / (rng * 2);
  ctx.save(); ctx.clearRect(0, 0, W, W); ctx.beginPath(); ctx.arc(c, c, c - 2, 0, 7); ctx.clip();
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, W, W);
  ctx.translate(c, c); ctx.rotate(-hdg);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(mini.off, -W / 2, -W / 2, W, W);
  const X = x => (x - p[0]) * sc, Y = y => -(y - p[1]) * sc;
  // craters
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
  for (const cr of t.craters) { if (Math.abs(cr[0] - p[0]) > rng + cr[2] || Math.abs(cr[1] - p[1]) > rng + cr[2]) continue; ctx.beginPath(); ctx.arc(X(cr[0]), Y(cr[1]), cr[2] * sc, 0, 7); ctx.stroke(); }
  // boulders (scanner 2)
  if (cfg.scanner >= 2 && !isWalker) { ctx.fillStyle = '#ff7a59'; t.forEachRock(p[0] - rng, p[0] + rng, p[1] - rng, p[1] + rng, (x, y, r) => { if (r > 0.6 && (x - p[0]) ** 2 + (y - p[1]) ** 2 < rng * rng) { ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(2, r * sc * 1.3), 0, 7); ctx.fill(); } }); }
  // route
  ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 3.2; ctx.beginPath();
  const r = cur.route; let started = false;
  for (let i = Math.max(0, pIdx - 4); i < r.length; i++) { const x = X(r[i][0]), y = Y(r[i][1]); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); if (Math.hypot(x, y) > W) break; }
  ctx.stroke();
  for (const it of cur.items || []) {
    if (it.done) continue; const x = X(it.x), y = Y(it.y);
    let dx = x, dy = y; const dd = Math.hypot(dx, dy), lim = c - 14;
    if (dd > lim) { dx *= lim / dd; dy *= lim / dd; }
    ctx.fillStyle = it.kind === 'beacon' ? (it.final ? '#2dd4bf' : '#ffb020') : '#35e3ff';
    ctx.beginPath(); if (it.kind === 'beacon') ctx.rect(dx - 6, dy - 6, 12, 12); else ctx.arc(dx, dy, 5, 0, 7); ctx.fill();
  }
  // real vehicles and other players
  for (const it of cur.assetItems || []) {
    const x = X(it.x), y = Y(it.y); let dx = x, dy = y; const dd = Math.hypot(dx, dy), lim = c - 16; if (dd > lim) { dx *= lim / dd; dy *= lim / dd; }
    ctx.save(); ctx.translate(dx, dy); ctx.rotate(Math.PI / 4); ctx.fillStyle = it.live ? '#ff7a59' : '#35e3ff'; ctx.fillRect(-6, -6, 12, 12); ctx.restore();
  }
  for (const o of remRender) {
    const x = X(o.x), y = Y(o.y); let dx = x, dy = y; const dd = Math.hypot(dx, dy), lim = c - 14; if (dd > lim) { dx *= lim / dd; dy *= lim / dd; }
    ctx.fillStyle = `hsl(${o.hue},85%,60%)`; ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(dx, dy, 8, 0, 7); ctx.stroke(); ctx.fill();
  }
  for (const pm of pingMarks) { const x = X(pm.x), y = Y(pm.y); ctx.strokeStyle = `hsl(${pm.hue},85%,60%)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.stroke(); }
  ctx.restore();
  // north and the rover
  ctx.save(); ctx.translate(c, c);
  ctx.save(); ctx.rotate(-hdg); ctx.fillStyle = '#e8eefb'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -c + 26); ctx.restore();
  ctx.fillStyle = '#2dd4bf'; ctx.strokeStyle = '#04201c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(11, 13); ctx.lineTo(0, 7); ctx.lineTo(-11, 13); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(130,160,220,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c, c, c - 2, 0, 7); ctx.stroke();
}

// ----------------------------------------------------------------------------- garage
function showGarage(fromBrief, afterEnd) {
  const T = tr(), host = $('garage'), canBuyHere = true;
  const items = Object.keys(C.UPGRADES).filter(k => !(ROUTE.profile === 'walker' && k !== 'lights' && k !== 'scanner')).map(k => {
    const u = C.UPGRADES[k], lv = save.up[k] || 0, max = lv >= u.levels, cost = max ? 0 : u.cost[lv];
    return `<div class="up"><div><b>${T.up[k]}</b> <span class="muted">${lv}/${u.levels}</span><div class="muted" style="font-size:12px">${T.upd[k]}</div>
      <div class="lv">${Array.from({ length: u.levels }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
      <button class="btn ${max ? '' : 'pri'}" data-k="${k}" ${max ? 'disabled' : ''}>${max ? T.max : T.buy + ' · ' + cost}</button></div>`;
  }).join('');
  const cfgNow = makeCfg(ROUTE.profile);
  const extra = running && rover ? `<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn" id="gRep">${T.repair} · 120</button><button class="btn" id="gClean">${T.cleanP}</button></div>` : '';
  host.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h1>🔧 ${T.upgrades}</h1><div style="text-align:right"><div class="muted">${T.credits}</div><b id="gCred" style="font-size:22px;color:var(--amber)">${save.credits}</b></div></div>
    <div class="muted tab">${ROUTE.profile === 'walker' ? '' : `${(cfgNow.power / 1000).toFixed(1)} kW · ${(cfgNow.vmax * 3.6).toFixed(1)} km/h · ${cfgNow.batteryKwh.toFixed(cfgNow.batteryKwh < 10 ? 1 : 0)} kWh · ☀ ${cfgNow.solarKw.toFixed(1)} kW · μ ${cfgNow.mu.toFixed(2)}`}</div>
    <div class="cols" style="margin-top:14px">${items}</div>${extra}
    <div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn pri" id="gClose">${T.resume}</button></div></div>`;
  host.hidden = false;
  host.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.k) buyUpgrade(b.dataset.k, fromBrief, afterEnd);
    else if (b.id === 'gRep') { if (rover.speed > 0.5) say(T.stopFirst, 'warn'); else if (save.credits < 120) say(T.cantAfford, 'warn'); else { save.credits -= 120; rover.damage = Math.max(0, rover.damage - 25); say(T.repaired, 'good'); persist(); showGarage(fromBrief); } }
    else if (b.id === 'gClean') { rover.cleanPanels(); say(T.cleaned, 'good'); }
    else if (b.id === 'gClose') { host.hidden = true; if (fromBrief) showBrief(); else if (afterEnd) $('end').hidden = false; else if (paused) $('pause').hidden = false; }
  };
}
function buyUpgrade(k, fromBrief, afterEnd) {
  const T = tr(), u = C.UPGRADES[k], lv = save.up[k] || 0;
  if (lv >= u.levels) return;
  if (save.credits < u.cost[lv]) { say(T.cantAfford, 'warn'); return; }
  save.credits -= u.cost[lv]; save.up[k] = lv + 1; persist();
  if (running && rover) {
    for (const f of Object.values(fleet)) {
      if (!f || f.kind === 'walker') continue;
      const old = f.obj.cfg; f.cfg = makeCfg(profOf(f.kind)); f.obj.cfg = f.cfg;
      if (f.cfg.batteryKwh > old.batteryKwh) f.obj.battery += (f.cfg.batteryKwh - old.batteryKwh) * 0.6;
      if (f.obj === rover) { cfg = f.cfg; scene3.cfgV = cfg; }
    }
  }
  say(T.bought, 'good', 2500); showGarage(fromBrief, afterEnd);
}

// ----------------------------------------------------------------------------- pause
function showPause(on) {
  const T = tr(); paused = on;
  if (!on) { $('pause').hidden = true; $('garage').hidden = true; lastTs = performance.now(); return; }
  const wm = settings;
  $('pause').innerHTML = `<div class="panel" style="max-width:520px"><h1>⏸ ${T.paused}</h1>
    <h3>${T.setts}</h3>${['tractionControl:traction', 'stability:stability', 'hillHold:hillHold', 'damage:dmgOn'].map(s => { const [k, l] = s.split(':'); return `<label class="chk"><input type="checkbox" data-s="${k}" ${wm[k] ? 'checked' : ''}> ${T[l]}</label>`; }).join('')}
    <div class="row" style="margin-top:20px;gap:10px;justify-content:flex-end"><button class="btn" id="pExit">${T.exit}</button><button class="btn" id="pGar">${T.garage}</button><button class="btn pri" id="pRes">${T.resume}</button></div></div>`;
  $('pause').hidden = false;
  $('pause').onclick = ev => {
    const b = ev.target.closest('button'), c = ev.target.closest('input[data-s]');
    if (c) { settings[c.dataset.s] = c.checked; if (!isWalker) Object.assign(rover.opts, settings); }
    if (!b) return;
    if (b.id === 'pRes') showPause(false); else if (b.id === 'pExit') closeSim(); else if (b.id === 'pGar') { $('pause').hidden = true; showGarage(false); }
  };
}

// ============================================================================= controls
function bindInput() {
  const prevent = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'BracketLeft', 'BracketRight']);
  window.addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (prevent.has(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (!running) return;
    const T = tr();
    if (e.repeat) return;
    switch (e.code) {
      case 'Escape': case 'KeyP': if (!$('garage').hidden) { $('garage').hidden = true; if (paused) $('pause').hidden = false; } else if (!cruise.active) showPause(!paused); break;
      case 'KeyG': if (!cruise.active) { if (!paused) showPause(true); $('pause').hidden = true; showGarage(false); } break;
      case 'BracketLeft': if (cruise.active) { cruiseIdx = Math.max(0, cruiseIdx - 1); cruiseUI(); } else warpIdx = Math.max(0, warpIdx - 1); break;
      case 'BracketRight': if (cruise.active) { cruiseIdx = Math.min(CRUISE.length - 1, cruiseIdx + 1); cruiseUI(); } else warpIdx = Math.min(WARPS.length - 1, warpIdx + 1); break;
      case 'KeyT': if (!cruise.active && !paused) setAuto(!apInfo.on); break;
      case 'KeyC': cam.mode = (cam.mode + 1) % 3; if (!isWalker) cam.yaw = 0; say(isWalker ? [T.view3, T.view1, T.cam[2]][cam.mode] : T.cam[cam.mode], '', 1500, 'cam'); break;
      case 'KeyL': lightsOn = !lightsOn; break;
      case 'KeyX': if (!cruise.active && !isWalker) { rover.cleanPanels(); say(T.cleaned, 'good', 2000); } break;
      case 'KeyR': if (!cruise.active && !isWalker && rover.upZ < 0.4) {
        const fee = Math.min(150, save.credits); save.credits -= fee; rover.rightVehicle(); say(`${T.flipFee} −${fee}`, 'warn', 3500); } break;
      case 'KeyV': actionV(); break;
      case 'KeyH': if (!cruise.active) summonDrone(); break;
      case 'Digit1': switchControl('vehicle'); break;
      case 'Digit2': switchControl('walker'); break;
      case 'Digit3': switchControl('drone'); break;
      case 'Enter': openChat(true); break;
      case 'Tab': togglePlayers(); break;
      case 'KeyB': dropPing(); break;
      case 'KeyF': if (!cruise.active && net) shareEnergy(); break;
      case 'KeyM': mini.range = mini.range >= 600 ? 150 : mini.range * 2; break;
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  $('chatIn').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const v = $('chatIn').value.trim(); if (v && net) net.chat(v); openChat(false); }
    else if (e.key === 'Escape') openChat(false);
  });
  $('plist').hidden = true;
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  let drag = null;
  const cv = $('gl');
  cv.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('mouseup', () => { drag = null; });
  window.addEventListener('mousemove', e => {
    if (!drag || !running) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
    if (isWalker) { cam.yaw += dx * 0.004; cam.pitch = cam.mode === 1 ? clamp(cam.pitch - dy * 0.004, -1.2, 1.2) : clamp(cam.pitch + dy * 0.004, 0.06, 1.3); }
    else { cam.yaw -= dx * 0.005; cam.pitch = clamp(cam.pitch + dy * 0.004, -0.2, 1.35); }
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), isWalker ? 2.5 : 4, 45); }, { passive: false });
  cv.addEventListener('dblclick', () => { cam.yaw = isWalker ? cam.yaw : 0; cam.pitch = isWalker ? 0 : 0.2; cam.dist = 9; });
  $('mini').addEventListener('click', () => { mini.range = mini.range >= 600 ? 150 : mini.range * 2; });
  $('bCam').onclick = () => { cam.mode = (cam.mode + 1) % 3; if (!isWalker) cam.yaw = 0; };
  [1, 2, 3].forEach(i => { $('fl' + i).onclick = () => switchControl(['vehicle', 'walker', 'drone'][i - 1]); }); $('flAct').onclick = actionV;
  $('bLight').onclick = () => { lightsOn = !lightsOn; };
  $('bGarage').onclick = () => { if (!paused) showPause(true); $('pause').hidden = true; showGarage(false); };
  $('bPause').onclick = () => showPause(!paused);
  $('bAuto').onclick = () => { if (!cruise.active) setAuto(!apInfo.on); };
  $('bCruise').onclick = () => startCruise();
  $('wSlow').onclick = () => { warpIdx = Math.max(0, warpIdx - 1); };
  $('wFast').onclick = () => { warpIdx = Math.min(WARPS.length - 1, warpIdx + 1); };
  $('cSlow').onclick = () => { cruiseIdx = Math.max(0, cruiseIdx - 1); cruiseUI(); };
  $('cFast').onclick = () => { cruiseIdx = Math.min(CRUISE.length - 1, cruiseIdx + 1); cruiseUI(); };
  $('cStop').onclick = () => exitCruise(false);
}

// ============================================================================= page start
// ---------------------------------------------------------------------------- phone: joystick, buttons, camera gestures
const touchDev = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
/** setPointerCapture may throw (finger already lifted, synthetic event); this must not break the game. */
function capture(el, id) { try { el.setPointerCapture(id); } catch (e) {} }
function bindTouch() {
  if (!touchDev) return;
  document.body.classList.add('touch'); $('touchUI').hidden = false;
  const J = $('joy'), K = $('joyKnob');
  const upd = e => {
    const r = J.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width * 0.4;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = dx; joy.y = dy; K.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  };
  J.addEventListener('pointerdown', e => { e.preventDefault(); joy.active = true; joy.id = e.pointerId; capture(J, e.pointerId); upd(e); });
  J.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.id) upd(e); });
  const end = e => { if (e.pointerId === joy.id) { joy.active = false; joy.x = joy.y = 0; K.style.transform = 'translate(0,0)'; } };
  J.addEventListener('pointerup', end); J.addEventListener('pointercancel', end);
  const hold = (id, code) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); keys[code] = true; capture(b, e.pointerId); b.classList.add('on'); });
    const up = () => { keys[code] = false; b.classList.remove('on'); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); };
  const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); if (running) fn(); });
  hold('tbMain', 'Space'); hold('tbDown', 'ShiftLeft');
  tap('tbV', actionV); tap('tbH', () => { if (!cruise.active) summonDrone(); });
  tap('tbCam', () => { cam.mode = (cam.mode + 1) % 3; if (!isWalker) cam.yaw = 0; });
  tap('tbAuto', () => { if (!cruise.active && !paused) setAuto(!apInfo.on); });
  tap('tbCruise', startCruise); tap('tbPause', () => showPause(!paused)); tap('tbChat', () => openChat(true));
  // camera: one finger rotates, two zoom
  const cv = $('gl'), ptrs = new Map(); let pinch = 0;
  cv.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); capture(cv, e.pointerId); pinch = 0; });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p || !running) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) cam.dist = clamp(cam.dist * (pinch / d), isWalker ? 2.5 : 4, 45); pinch = d; return;
    }
    if (isWalker) { cam.yaw += dx * 0.006; cam.pitch = cam.mode === 1 ? clamp(cam.pitch - dy * 0.006, -1.2, 1.2) : clamp(cam.pitch + dy * 0.006, 0.06, 1.3); }
    else { cam.yaw -= dx * 0.007; cam.pitch = clamp(cam.pitch + dy * 0.006, -0.2, 1.35); }
  });
  const up = e => { ptrs.delete(e.pointerId); pinch = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  document.addEventListener('gesturestart', e => e.preventDefault());
}
function updateTouchUI() {
  if (!touchDev) return;
  $('tbMain').textContent = isWalker ? '⤒' : isDrone ? '⬆' : '🛑';
  $('tbDown').textContent = isWalker ? '🏃' : '⬇'; $('tbDown').style.visibility = isWalker || isDrone ? 'visible' : 'hidden';
  $('tbAuto').classList.toggle('on', apInfo.on);
}
function goFullscreen() {
  if (!touchDev) return;
  const safe = f => { try { const r = f(); if (r && r.catch) r.catch(() => {}); } catch (e) {} };   // "Permissions check failed" errors must not surface
  const el = document.documentElement;
  safe(() => (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el));
  safe(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'));
}

function boot() {
  bindInput(); bindTouch();
  if (!loadRoute()) {
    $('loading').innerHTML = `<div style="max-width:420px;padding:20px"><div style="font-size:20px;margin-bottom:10px">🛰</div><div>${tr().noRoute}</div><p><button class="btn pri" id="nm">${tr().backMap}</button></p></div>`;
    $('nm').onclick = closeSim; return;
  }
  isWalker = ROUTE.profile === 'walker';
  applyStatic(); $('loading').hidden = true; showBrief();
}
window.addEventListener('message', () => {});
window.__sim = { get net() { return net; }, get remotes() { return remRender; }, get assets() { return cur && cur.assetItems; }, get ap() { return apInfo; }, get stageIdx() { return stageIdx; }, get rover() { return rover; }, get cur() { return cur; }, get env() { return envNow; }, get scene() { return scene3; }, mission, cam, warp: i => { warpIdx = i; }, startCruise, exitCruise };
boot();
})();
