// Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
/* Графика симулятора (Three.js r128): небо, рельеф кольцами разной подробности, камни, модель вездехода,
   пыль, маяки и образцы. Мир z-вверх (x восток, y север), как и в core.js. */
(function (root) {
'use strict';
const C = root.Core, T = root.THREE;
T.Object3D.DefaultUp.set(0, 0, 1);
const clamp = C.clamp, D2R = C.D2R;

const RINGS = [
  { s: 1, n: 128, snap: 16, bias: 0.0, detail: true, shadow: true },
  { s: 4, n: 96, snap: 64, bias: 0.35, detail: true },
  { s: 16, n: 96, snap: 256, bias: 1.4 },
  { s: 64, n: 96, snap: 1024, bias: 5.5 },
];
const PALETTE = {
  moon: { a: [0.50, 0.49, 0.47], b: [0.30, 0.30, 0.31], tint: [1, 1, 1] },
  mars: { a: [0.62, 0.34, 0.20], b: [0.42, 0.25, 0.17], tint: [1.06, 0.95, 0.86] },
};

function noiseTexture(size, seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size);
  const rnd = (x, y, o) => (C.hash2(x, y, seed + o) & 0xFFFF) / 65535;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < 5; o++) {
      const f = 1 << o, px = (x * f) / size * 8, py = (y * f) / size * 8;
      const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
      const w = size ? 8 * f : 1;
      const m = k => ((k % w) + w) % w;
      const a = rnd(m(ix), m(iy), o), b = rnd(m(ix + 1), m(iy), o), c = rnd(m(ix), m(iy + 1), o), d = rnd(m(ix + 1), m(iy + 1), o);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      v += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy); tot += amp; amp *= 0.55;
    }
    v = v / tot;
    const g8 = Math.round(clamp(0.78 + (v - 0.5) * 0.7, 0, 1) * 255), i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g8; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new T.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.anisotropy = 4; tex.encoding = T.sRGBEncoding;
  return tex;
}
function glowTexture(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(cv);
}
function earthTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#1f4f9a'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#3f7d3a';
  for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse((i * 97) % 256, 20 + (i * 53) % 90, 6 + (i * 7) % 16, 4 + (i * 5) % 10, i, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse((i * 61) % 256, (i * 37) % 128, 10 + (i * 3) % 18, 3 + (i % 4), i, 0, 7); g.fill(); }
  g.fillRect(0, 0, 256, 7); g.fillRect(0, 121, 256, 7);
  return new T.CanvasTexture(cv);
}

class Ring {
  constructor(def, mat) {
    this.def = def; this.cx = 1e9; this.cy = 1e9;
    const n = def.n, n1 = n + 1;
    this.geo = new T.BufferGeometry();
    this.pos = new Float32Array(n1 * n1 * 3); this.nor = new Float32Array(n1 * n1 * 3);
    this.col = new Float32Array(n1 * n1 * 3); this.uv = new Float32Array(n1 * n1 * 2); this.H = new Float32Array(n1 * n1);
    const idx = new Uint32Array(n * n * 6); let k = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
    this.geo.setIndex(new T.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new T.BufferAttribute(this.nor, 3));
    this.geo.setAttribute('color', new T.BufferAttribute(this.col, 3));
    this.geo.setAttribute('uv', new T.BufferAttribute(this.uv, 2));
    this.mesh = new T.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = !!def.detail; this.mesh.castShadow = !!def.shadow;
  }
  need(x, y) {
    const sn = this.def.snap, cx = Math.round(x / sn) * sn, cy = Math.round(y / sn) * sn;
    return cx !== this.cx || cy !== this.cy ? [cx, cy] : null;
  }
  update(terrain, cx, cy, pal) {
    const d = this.def, n = d.n, n1 = n + 1, s = d.s, half = n * s / 2, x0 = cx - half, y0 = cy - half;
    this.cx = cx; this.cy = cy;
    const H = this.H, pos = this.pos, nor = this.nor, col = this.col, uv = this.uv;
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
      const x = x0 + i * s, y = y0 + j * s, k = j * n1 + i;
      // Крупные кольца усредняют высоту по четырём точкам: иначе мелкий рельеф «мерцает» решёткой.
      let h;
      if (d.detail) h = terrain.heightBase(x, y);
      else { const q = s * 0.3; h = (terrain.grid(x - q, y - q) + terrain.grid(x + q, y - q) + terrain.grid(x - q, y + q) + terrain.grid(x + q, y + q)) * 0.25; }
      h -= d.bias;
      if (i === 0 || j === 0 || i === n || j === n) h -= 0.5 * s + 0.4;       // «юбка» скрывает швы между кольцами
      H[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = h;
      uv[k * 2] = x / 13; uv[k * 2 + 1] = y / 13;
    }
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
      const k = j * n1 + i, il = i > 0 ? k - 1 : k, ir = i < n ? k + 1 : k, jd = j > 0 ? k - n1 : k, ju = j < n ? k + n1 : k;
      const dx = (H[il] - H[ir]) / ((ir - il) * s || 1), dy = (H[jd] - H[ju]) / (((ju - jd) / n1) * s || 1);
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      nor[k * 3] = dx * inv; nor[k * 3 + 1] = dy * inv; nor[k * 3 + 2] = inv;
      // цвет: тёмные ложбины, светлые свежие склоны, пятна другого грунта
      const x = pos[k * 3], y = pos[k * 3 + 1], steep = 1 - inv;
      // Длина волны шума растёт вместе с шагом сетки кольца, иначе вдали получается «шахматка».
      const pw = Math.max(55, s * 7), fw = Math.max(9, s * 2.6);
      const patch = 0.5 + 0.5 * C.vnoise((x + terrain.gx0) / pw, (y + terrain.gy0) / pw, 8);
      const fine = C.vnoise((x + terrain.gx0) / fw, (y + terrain.gy0) / fw, 9);
      const m = clamp(patch + 0.12 * fine, 0, 1), br = (0.82 + 0.34 * fine * 0.5) * (1 + 1.6 * Math.max(0, steep - 0.04) * (s > 3 ? 0.45 : 1));
      for (let c = 0; c < 3; c++) col[k * 3 + c] = clamp((pal.a[c] * (1 - m) + pal.b[c] * m) * pal.tint[c] * br, 0, 1);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true; this.geo.attributes.uv.needsUpdate = true;
  }
}

// ----------------------------------------------------------------------------- частицы
class Dust {
  constructor(scene, max, size, color) {
    this.max = max; this.i = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.alpha = new Float32Array(max);
    this.geo = new T.BufferGeometry();
    this.geo.setAttribute('position', new T.BufferAttribute(this.p, 3));
    this.mat = new T.PointsMaterial({ size, map: glowTexture('rgba(255,255,255,.9)', 'rgba(255,255,255,0)'), color, transparent: true, opacity: 0.3,
                                       depthWrite: false, sizeAttenuation: true });
    this.pts = new T.Points(this.geo, this.mat); this.pts.frustumCulled = false; scene.add(this.pts);
    for (let k = 0; k < max; k++) { this.life[k] = 0; this.p[k * 3 + 2] = -1e5; }
  }
  emit(x, y, z, vx, vy, vz, life) {
    const k = this.i; this.i = (this.i + 1) % this.max;
    this.p[k * 3] = x; this.p[k * 3 + 1] = y; this.p[k * 3 + 2] = z;
    this.v[k * 3] = vx; this.v[k * 3 + 1] = vy; this.v[k * 3 + 2] = vz; this.life[k] = life;
  }
  update(dt, g, drag, windX, windY, terrain) {
    const p = this.p, v = this.v, L = this.life;
    for (let k = 0; k < this.max; k++) {
      if (L[k] <= 0) continue;
      L[k] -= dt;
      if (L[k] <= 0) { p[k * 3 + 2] = -1e5; continue; }
      v[k * 3 + 2] -= g * dt;
      const dr = Math.exp(-drag * dt);
      v[k * 3] = (v[k * 3] - windX) * dr + windX; v[k * 3 + 1] = (v[k * 3 + 1] - windY) * dr + windY; v[k * 3 + 2] *= dr;
      p[k * 3] += v[k * 3] * dt; p[k * 3 + 1] += v[k * 3 + 1] * dt; p[k * 3 + 2] += v[k * 3 + 2] * dt;
      const gh = terrain.grid(p[k * 3], p[k * 3 + 1]);
      if (p[k * 3 + 2] < gh + 0.03) { p[k * 3 + 2] = gh + 0.03; v[k * 3] *= 0.4; v[k * 3 + 1] *= 0.4; v[k * 3 + 2] = Math.abs(v[k * 3 + 2]) * 0.15; }
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ----------------------------------------------------------------------------- сцена
class Scene3D {
  constructor(canvas, body) {
    this.body = body; this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.low = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.low ? 1.25 : 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.outputEncoding = T.sRGBEncoding;
    this.scene = new T.Scene(); this.scene.background = new T.Color(0x000000);
    this.camera = new T.PerspectiveCamera(62, 1, 0.25, 60000);
    this.scene.fog = new T.FogExp2(0xc8a07c, 0);
    this.pal = PALETTE[body];
    this.mars = body === 'mars';
    this.tex = noiseTexture(256, body === 'mars' ? 4 : 2);
    this.terrainMat = new T.MeshStandardMaterial({ vertexColors: true, map: this.tex, roughness: 1, metalness: 0 });
    this.rings = RINGS.map(d0 => { const d = this.low ? Object.assign({}, d0, { n: Math.round(d0.n * 0.75) }) : d0; const r = new Ring(d, this.terrainMat); this.scene.add(r.mesh); return r; });
    this._makeLights(); this._makeSky(); this._makeRocks();
    this.dust = new Dust(this.scene, 1100, this.mars ? 1.0 : 0.8, this.mars ? 0xa8785a : 0x9d9a94);
    this.wind = new Dust(this.scene, 500, 0.9, 0xc79266);
    this.vehicleGroup = null; this.markers = new T.Group(); this.scene.add(this.markers);
    this.guide = null; this.rocksAt = [1e9, 1e9]; this.terrain = null; this.camPos = new T.Vector3(); this.camInit = false;
    this.shake = 0; this.nightK = 0;
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  _makeLights() {
    this.sun = new T.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(this.low ? 1024 : 2048, this.low ? 1024 : 2048);
    const c = this.sun.shadow.camera; c.left = c.bottom = -48; c.right = c.top = 48; c.near = 1; c.far = 500;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.12;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.hemi = new T.HemisphereLight(0xffffff, 0x80766c, 0.2); this.hemi.position.set(0, 0, 1); this.scene.add(this.hemi);
  }
  _makeSky() {
    const geo = new T.SphereGeometry(45000, 32, 16);
    this.skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: new T.Vector3(0, 0, 1) }, mars: { value: this.mars ? 1 : 0 }, day: { value: 1 }, dust: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 sunDir; uniform float mars; uniform float day; uniform float dust;
        void main(){
          vec3 d = normalize(vDir); float el = max(d.z, 0.0);
          vec3 hor = mix(vec3(0.84,0.64,0.47), vec3(0.66,0.47,0.34), clamp(dust,0.0,1.0));
          vec3 zen = mix(vec3(0.52,0.40,0.31), vec3(0.60,0.42,0.31), clamp(dust,0.0,1.0));
          vec3 col = mix(hor, zen, pow(el, 0.42));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(0.35,0.5,0.8) * pow(s, 30.0) * (1.0 - dust*0.6) * 0.55 + vec3(1.0,0.85,0.6) * pow(s, 8.0) * 0.12;
          float twi = exp(-pow((sunDir.z)/0.16, 2.0)) * pow(max(dot(normalize(vec2(d.x,d.y)), normalize(vec2(sunDir.x,sunDir.y)+1e-4)),0.0), 2.0) * exp(-el*3.5);
          col += vec3(0.12,0.22,0.5) * twi * 1.4;
          col *= day * 0.9 * mars;
          col = pow(col, vec3(1.0/2.2));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new T.Mesh(geo, this.skyMat); this.sky.frustumCulled = false; this.sky.renderOrder = -10; this.scene.add(this.sky);
    // звёзды
    const N = 2800, sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - u * u), k = 0.55 + Math.random() * 0.45;
      sp[i * 3] = r * Math.cos(a) * 42000; sp[i * 3 + 1] = r * Math.sin(a) * 42000; sp[i * 3 + 2] = u * 42000;
      const tnt = Math.random(); sc[i * 3] = k * (0.8 + 0.2 * tnt); sc[i * 3 + 1] = k * 0.9; sc[i * 3 + 2] = k * (1 - 0.2 * tnt);
    }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('color', new T.BufferAttribute(sc, 3));
    this.stars = new T.Points(sg, new T.PointsMaterial({ size: 1.9, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -9; this.scene.add(this.stars);
    // Солнце
    const ang = this.mars ? 0.35 : 0.53;
    this.sunDisc = new T.Mesh(new T.CircleGeometry(40000 * Math.tan(ang * D2R / 2), 24), new T.MeshBasicMaterial({ color: 0xffffff, fog: false, depthWrite: false }));
    this.sunGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture('rgba(255,244,220,.9)', 'rgba(255,230,190,0)'), blending: T.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
    this.sunGlow.scale.set(5200, 5200, 1); this.sunDisc.renderOrder = -8; this.sunGlow.renderOrder = -8;
    this.scene.add(this.sunDisc); this.scene.add(this.sunGlow);
    if (!this.mars) {
      this.earth = new T.Mesh(new T.SphereGeometry(40000 * Math.tan(0.95 * D2R), 32, 20), new T.MeshStandardMaterial({ map: earthTexture(), roughness: 1, emissive: 0x0a1a33, fog: false }));
      this.earth.renderOrder = -8; this.scene.add(this.earth);
    }
  }
  _makeRocks() {
    this.maxRocks = this.low ? 1200 : 2600;
    const g = new T.IcosahedronGeometry(1, 1);
    this.rocks = new T.InstancedMesh(g, new T.MeshStandardMaterial({ color: this.mars ? 0x4d3226 : 0x5f5b55, roughness: 1, flatShading: true }), this.maxRocks);
    this.rocks.castShadow = true; this.rocks.receiveShadow = true; this.rocks.frustumCulled = false; this.rocks.count = 0;
    this.scene.add(this.rocks);
  }
  setTerrain(t) {
    this.terrain = t; this.rocksAt = [1e9, 1e9];
    for (const r of this.rings) { r.cx = r.cy = 1e9; }
    if (this.dust) for (let k = 0; k < this.dust.max; k++) this.dust.life[k] = 0;
  }
  _updateRocks(x, y) {
    const t = this.terrain; if (Math.hypot(x - this.rocksAt[0], y - this.rocksAt[1]) < 18) return;
    this.rocksAt = [x, y];
    const R = 110, m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
    let n = 0;
    t.forEachRock(x - R, x + R, y - R, y + R, (rx, ry, r) => {
      if (n >= this.maxRocks || (rx - x) ** 2 + (ry - y) ** 2 > R * R) return;
      const seed = (Math.floor(rx * 13) ^ Math.floor(ry * 7)) >>> 0, a = (seed & 255) / 255 * 6.28, b = ((seed >> 8) & 255) / 255;
      e.set(0, 0, a); q.setFromEuler(e); s.set(r, r, 0.5 * r);          // форма и размер те же, что у камня в физике
      p.set(rx, ry, t.heightBase(rx, ry));
      m.compose(p, q, s); this.rocks.setMatrixAt(n++, m);
    });
    this.rocks.count = n; this.rocks.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- модели техники
  /** Собирает трёхмерную модель техники. Возвращает { group, wheelMeshes, headL, rotors, nozzles, nozzlePts }. */
  makeModel(cfg, remote) {
    const g = new T.Group(), out = { group: g, wheelMeshes: [], headL: [], rotors: [], nozzles: [], nozzlePts: [] };
    const dark = new T.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.6, metalness: 0.5 });
    const light = new T.MeshStandardMaterial({ color: 0xcfd5de, roughness: 0.5, metalness: 0.3 });
    const gold = new T.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.85 });
    const panel = new T.MeshStandardMaterial({ color: 0x14224a, roughness: 0.3, metalness: 0.6, emissive: 0x050a1c });
    const tire = new T.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9 });
    const rimMat = new T.MeshStandardMaterial({ color: 0xb6bcc6, roughness: 0.4, metalness: 0.7 });
    const lampMat = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c8, emissiveIntensity: 2 });
    const box = (w, l, h, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, l, h), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    if (cfg.key === 'walker') { out.rig = this._walkerModel(g); }
    else if (cfg.drone) { this._droneModel(g, cfg, out, { dark, light, gold, panel, rimMat, lampMat, box }); }
    else {
      const [hx, hy, hz, ho] = cfg.hull, crew = cfg.crewed;
      box(hx * 2, hy * 2, hz * 0.8, dark, 0, 0, ho - 0.1);
      box(hx * 1.9, hy * 1.9, 0.06, light, 0, 0, ho + hz * 0.35);
      // солнечная панель
      box(hx * 1.5, hy * 1.7, 0.05, panel, crew ? -hx * 0.15 : -hx * 0.35, 0, ho + hz * 0.35 + 0.08);
      for (let i = -3; i <= 3; i++) box(0.015, hy * 1.7, 0.01, rimMat, (crew ? -hx * 0.15 : -hx * 0.35) + i * hx * 0.2, 0, ho + hz * 0.35 + 0.115);
      if (crew) {
        box(0.9, 1.5, 0.12, light, 0.55, 0, ho + 0.15); // сиденья
        box(0.1, 1.5, 0.5, light, 0.1, 0, ho + 0.4);
        const dish = new T.Mesh(new T.ConeGeometry(0.42, 0.28, 24, 1, true), gold); dish.rotation.x = -Math.PI / 2; dish.rotation.y = 0.35;
        dish.position.set(-hx * 0.78, 0, ho + 1.15); dish.castShadow = true; g.add(dish);
        box(0.05, 0.05, 1.0, light, -hx * 0.78, 0, ho + 0.7);
        for (const sgn of [-1, 1]) box(0.1, 0.34, 0.12, lampMat, hx + 0.02, sgn * hy * 0.65, ho + 0.1);
        box(0.7, 0.5, 0.42, dark, hx * 0.55, 0, ho + hz * 0.35 + 0.28);   // приборная стойка
      } else {
        box(0.12, 0.12, 1.1, light, hx * 0.5, 0, ho + hz * 0.4 + 0.55);   // мачта
        box(0.34, 0.5, 0.22, dark, hx * 0.5, 0, ho + hz * 0.4 + 1.15);
        const eye = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.1, 12), lampMat); eye.rotation.z = Math.PI / 2; eye.position.set(hx * 0.5 + 0.2, 0.12, ho + hz * 0.4 + 1.18); g.add(eye);
        box(0.5, 0.35, 0.3, gold, -hx * 0.95, 0, ho - 0.05);                 // РИТЭГ
        box(0.9, 0.08, 0.08, dark, hx * 0.85, 0.15, ho - 0.12);              // манипулятор
        for (const sgn of [-1, 1]) box(0.1, 0.3, 0.1, lampMat, hx + 0.02, sgn * hy * 0.5, ho + 0.05);
      }
      // колёса
      for (let i = 0; i < cfg.mounts.length; i++) {
        const w = new T.Group(), spin = new T.Group();
        const cyl = new T.Mesh(new T.CylinderGeometry(cfg.wheelR, cfg.wheelR, cfg.wheelW, 28), tire); cyl.castShadow = true; spin.add(cyl);
        const rim = new T.Mesh(new T.CylinderGeometry(cfg.wheelR * 0.62, cfg.wheelR * 0.62, cfg.wheelW + 0.02, 20), rimMat); spin.add(rim);
        for (let k = 0; k < 16; k++) {
          const gr = new T.Mesh(new T.BoxGeometry(0.06, cfg.wheelW * 1.05, 0.05), tire);
          const a = k / 16 * Math.PI * 2; gr.position.set(Math.sin(a) * cfg.wheelR, 0, Math.cos(a) * cfg.wheelR); gr.rotation.y = a; spin.add(gr);
        }
        const mt = cfg.mounts[i]; w.position.set(mt[0], mt[1], mt[2] - cfg.L0);
        w.add(spin); g.add(w); out.wheelMeshes.push({ w, spin });
      }
      // фары
      if (!remote) for (const sgn of [-1, 1]) {
        const sp = new T.SpotLight(0xfff1d0, 0, 60, 0.55, 0.6, 1.2); sp.position.set(cfg.hull[0], sgn * cfg.hull[1] * 0.6, cfg.hull[3] + 0.1);
        sp.target.position.set(cfg.hull[0] + 25, sgn * 1.5, -4); g.add(sp); g.add(sp.target); out.headL.push(sp);
      }
    }
    return out;
  }
  setVehicle(cfg) {
    if (this.vehicleGroup) { this.scene.remove(this.vehicleGroup); }
    const m = this.makeModel(cfg, false);
    this.wheelMeshes = m.wheelMeshes; this.headL = m.headL; this.rotors = m.rotors; this.nozzles = m.nozzles; this.nozzlePts = m.nozzlePts; this.rig = m.rig;
    this.vehicleGroup = m.group; this.scene.add(m.group); this.cfgV = cfg;
  }
  _droneModel(g, cfg, out, M) {
    const { dark, light, gold, panel, rimMat, lampMat, box } = M;
    const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    // опоры (посадочные «лапы»)
    for (const l of cfg.legs) {
      const leg = add(new T.CylinderGeometry(0.025, 0.03, 0.42, 6), dark, l[0] * 0.8, l[1] * 0.8, l[2] + 0.2);
      leg.rotation.set(l[1] > 0 ? -0.35 : 0.35, l[0] > 0 ? 0.35 : -0.35, 0);
      add(new T.CylinderGeometry(0.1, 0.1, 0.03, 12), dark, l[0], l[1], l[2] + 0.015);
    }
    if (cfg.kind === 'rotor') {
      add(new T.BoxGeometry(0.5, 0.5, 0.26), gold, 0, 0, 0);
      add(new T.BoxGeometry(0.46, 0.46, 0.04), panel, 0, 0, 0.16);                                   // солнечная панель
      add(new T.CylinderGeometry(0.03, 0.03, 0.35, 6), light, 0, 0, 0.35).rotation.x = 0;
      const eye = add(new T.SphereGeometry(0.06, 10, 8), lampMat, 0.26, 0, -0.04);
      const R = cfg.rotorR, n = cfg.rotors, armR = 0.62;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + Math.PI / n, px = Math.cos(a) * armR, py = Math.sin(a) * armR;
        const arm = add(new T.BoxGeometry(armR, 0.035, 0.035), dark, px / 2, py / 2, 0.05); arm.rotation.z = a;
        add(new T.CylinderGeometry(0.055, 0.055, 0.1, 10), light, px, py, 0.1).rotation.x = Math.PI / 2;
        const rot = new T.Group(); rot.position.set(px, py, 0.2); rot.userData.dir = i % 2 ? 1 : -1;
        for (let b = 0; b < 2; b++) { const bl = new T.Mesh(new T.BoxGeometry(R * 2 * 0.62, 0.07, 0.006), new T.MeshStandardMaterial({ color: 0x20242b, roughness: 0.7 })); bl.rotation.z = b * Math.PI / 2; bl.castShadow = true; rot.add(bl); }
        const disc = new T.Mesh(new T.CircleGeometry(R * 0.62, 24), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false }));
        rot.add(disc); g.add(rot); out.rotors.push(rot);
      }
    } else {   // ракетный «прыгун»
      add(new T.CylinderGeometry(0.42, 0.46, 0.62, 18), light, 0, 0, 0.1).rotation.x = Math.PI / 2;
      add(new T.CylinderGeometry(0.43, 0.43, 0.06, 18), gold, 0, 0, -0.02).rotation.x = Math.PI / 2;
      add(new T.BoxGeometry(0.7, 0.7, 0.04), panel, 0, 0, 0.44);                                       // панель сверху
      add(new T.CylinderGeometry(0.02, 0.02, 0.6, 6), light, -0.2, 0, 0.74);
      const dish = add(new T.ConeGeometry(0.22, 0.12, 16, 1, true), gold, -0.2, 0, 1.05); dish.rotation.x = -Math.PI / 2;
      add(new T.SphereGeometry(0.07, 10, 8), lampMat, 0.44, 0, 0.1);
      const glowMat = () => new T.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, fog: false });
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = sx * 0.34, ny = sy * 0.34;
        add(new T.CylinderGeometry(0.05, 0.11, 0.22, 10), dark, nx, ny, -0.22).rotation.x = Math.PI / 2;
        const glow = new T.Mesh(new T.ConeGeometry(0.1, 0.9, 10, 1, true), glowMat()); glow.rotation.x = -Math.PI / 2; glow.position.set(nx, ny, -0.74); glow.visible = false; g.add(glow);
        out.nozzles.push(glow); out.nozzlePts.push([nx, ny, -0.33]);
      }
    }
  }
  /** Космонавт в скафандре: шлем с золотым визором, ранец, руки и ноги с локтями и коленями. Лицом к +x, начало у ступней. */
  _walkerModel(g) {
    const suit = new T.MeshStandardMaterial({ color: 0xeceff4, roughness: 0.75, metalness: 0.05 });
    const grey = new T.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.6, metalness: 0.3 });
    const dark = new T.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.8 });
    const orange = new T.MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.6 });
    const gold = new T.MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.12, metalness: 0.95 });
    const mk = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || g).add(m); return m; };
    const cyl = (r1, r2, h, mat, x, y, z, parent) => { const m = mk(new T.CylinderGeometry(r1, r2, h, 14).rotateX(Math.PI / 2), mat, x, y, z, parent); return m; };
    const H = 0.92;                                                        // высота бёдер
    // верхняя часть тела вращается вокруг бёдер (наклон при беге, покачивание)
    const upper = new T.Group(); upper.position.z = H; g.add(upper);
    cyl(0.23, 0.2, 0.5, suit, 0, 0, 0.3, upper);                           // грудь
    cyl(0.2, 0.19, 0.18, grey, 0, 0, 0.02, upper);                         // пояс
    mk(new T.BoxGeometry(0.1, 0.3, 0.22), orange, 0.2, 0, 0.36, upper);   // панель управления на груди
    mk(new T.BoxGeometry(0.28, 0.44, 0.58), suit, -0.3, 0, 0.36, upper);    // ранец жизнеобеспечения
    mk(new T.BoxGeometry(0.06, 0.4, 0.1), grey, -0.46, 0, 0.5, upper);
    cyl(0.012, 0.012, 0.5, dark, -0.34, 0.14, 0.88, upper);                // антенна
    cyl(0.11, 0.12, 0.06, grey, 0, 0, 0.58, upper);                        // шея
    mk(new T.SphereGeometry(0.215, 22, 16), suit, 0, 0, 0.78, upper);      // шлем
    const visor = mk(new T.SphereGeometry(0.175, 20, 14), gold, 0.085, 0, 0.78, upper); visor.scale.set(0.8, 1.05, 0.92);
    cyl(0.225, 0.225, 0.04, grey, 0, 0, 0.67, upper);                      // кольцо шлема
    mk(new T.BoxGeometry(0.05, 0.1, 0.03), dark, 0.2, 0.0, 0.93, upper);   // фонарь
    // руки: плечо -> локоть -> перчатка
    const arms = [];
    for (const sy of [1, -1]) {
      const sh = new T.Group(); sh.position.set(0, sy * 0.3, 0.5); upper.add(sh);
      mk(new T.SphereGeometry(0.09, 12, 10), grey, 0, 0, 0, sh);
      cyl(0.075, 0.07, 0.32, suit, 0, 0, -0.17, sh);
      const el = new T.Group(); el.position.z = -0.33; sh.add(el);
      mk(new T.SphereGeometry(0.07, 10, 8), grey, 0, 0, 0, el);
      cyl(0.065, 0.06, 0.28, suit, 0, 0, -0.15, el);
      mk(new T.SphereGeometry(0.085, 12, 10), orange, 0, 0, -0.33, el);        // перчатка
      arms.push({ p: sh, e: el, side: sy });
    }
    // ноги: бедро -> колено -> ботинок
    const legs = [];
    for (const sy of [1, -1]) {
      const hip = new T.Group(); hip.position.set(0, sy * 0.115, H); g.add(hip);
      cyl(0.105, 0.09, 0.46, suit, 0, 0, -0.23, hip);
      const kn = new T.Group(); kn.position.z = -0.46; hip.add(kn);
      mk(new T.SphereGeometry(0.09, 10, 8), grey, 0, 0, 0, kn);
      cyl(0.09, 0.08, 0.4, suit, 0, 0, -0.2, kn);
      mk(new T.BoxGeometry(0.3, 0.13, 0.11), dark, 0.05, 0, -0.43, kn);        // ботинок
      mk(new T.BoxGeometry(0.1, 0.13, 0.04), orange, 0.13, 0, -0.37, kn);
      legs.push({ p: hip, k: kn, side: sy });
    }
    return { upper, arms, legs, phase: 0, H };
  }
  /** Анимация космонавта. Фаза шага растёт пропорционально пройденному пути (ступня не скользит). Три режима:
      ходьба, бег (согнутые руки, подъём колен, наклон вперёд) и прыжок: взлёт с вытянутым телом, группировка в полёте,
      амортизация при приземлении. speed — м/с по земле, air — в полёте, vz — вертикальная скорость, low — малая гравитация. */
  _animWalker(rig, dt, speed, air, low, vz) {
    if (!rig) return;
    vz = vz || 0;
    // приземление: короткая «просадка» с согнутыми коленями
    if (rig.wasAir && !air) rig.land = 0.28;
    rig.wasAir = air; rig.land = Math.max(0, (rig.land || 0) - dt);
    const lk = rig.land / 0.28, landDip = Math.sin(Math.min(1, lk) * Math.PI) * 0.16;
    const moving = speed > 0.12, run = Math.min(1, Math.max(0, (speed - 1.5) / 1.2));
    const S = Math.min(1.25, 0.32 + 0.45 * speed);                                     // длина шага, м
    if (moving && !air) rig.phase += speed * dt * Math.PI / S * (1 + 0.25 * run);
    const ph = rig.phase, sw = Math.sin(ph), cw = Math.cos(ph), L = 0.88;
    const A = moving ? Math.min(0.78, Math.asin(Math.min(0.95, S / (2 * L)))) : 0;       // размах бедра
    let bob = moving && !air ? Math.abs(cw) * (0.022 + 0.04 * run) * (low ? 2 : 1) : 0;
    let lean = Math.min(0.32, 0.04 * speed + 0.12 * run), crouch = 0;
    if (air) { bob = 0; lean = vz > 0 ? 0.04 : 0.12; }
    rig.upper.position.z = rig.H - (moving ? 0.03 : 0) - landDip + bob + (!moving && !air ? 0.006 * Math.sin(performance.now() / 700) : 0);
    rig.upper.rotation.y += (lean - rig.upper.rotation.y) * Math.min(1, dt * 9);
    rig.upper.rotation.z = air ? 0 : 0.045 * sw * Math.min(1, speed);
    for (const Lg of rig.legs) {
      const side = Lg.side, s = side * sw;
      let hip, knee;
      if (air) {
        if (vz > 0.3) { hip = side * 0.12 + 0.25; knee = 0.25; }                       // толчок: ноги вытянуты, одна чуть впереди
        else { hip = -(0.55 + side * 0.18); knee = 0.55 + 0.25 * (side > 0 ? 1 : 0); }  // снижение: ноги вперёд, колени согнуты, готов к приземлению
      } else {
        hip = -s * A;                                                                   // бедро вперёд-назад
        const swingFwd = Math.max(0, side * cw);                                        // фаза переноса: колено сгибается
        knee = moving ? 0.1 + (0.45 + 0.9 * run) * swingFwd * Math.min(1, speed / 0.8) : 0.02;
      }
      knee += landDip * 4.5;                                                            // амортизация
      Lg.p.rotation.y = hip - landDip * 1.2; Lg.k.rotation.y = knee;
    }
    for (const Am of rig.arms) {
      const side = Am.side;
      if (air) { Am.p.rotation.y = vz > 0 ? -1.15 : -0.5 - 0.25 * side; Am.e.rotation.y = -0.35; Am.p.rotation.x = side * 0.5; }
      else {
        const s = -side * sw;
        Am.p.rotation.y = s * A * (0.8 + 0.4 * run);                                    // руки навстречу ногам
        Am.e.rotation.y = -(0.25 + 0.55 * Math.min(1, speed / 1.2) + 0.8 * run);        // при беге локти согнуты почти под прямым углом
        Am.p.rotation.x = side * (0.06 + 0.06 * Math.min(1, speed));
      }
    }
  }

  // ---------------------------------------------------------------- маяки и образцы
  setMarkers(items) {
    this.markers.clear(); this.markerObjs = [];
    for (const it of items) {
      const g = new T.Group();
      if (it.kind === 'beacon') {
        const col = it.final ? 0x2dd4bf : 0xffb020;
        const pillar = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 80, 16, 1, true).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
        pillar.position.z = 40; g.add(pillar);
        const ring = new T.Mesh(new T.TorusGeometry(5, 0.22, 8, 40), new T.MeshBasicMaterial({ color: col, fog: false }));
        ring.position.z = 0.4; g.add(ring);
        const post = new T.Mesh(new T.CylinderGeometry(0.18, 0.25, 3, 8).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: 0xdfe6f0, emissive: col, emissiveIntensity: 0.7 }));
        post.position.z = 1.5; post.castShadow = true; g.add(post);
      } else {
        const m = new T.Mesh(new T.OctahedronGeometry(0.45), new T.MeshStandardMaterial({ color: 0x35e3ff, emissive: 0x35e3ff, emissiveIntensity: 1.4, roughness: 0.3 }));
        m.position.z = 1.1; g.add(m); g.userData.spin = m;
        const ring = new T.Mesh(new T.TorusGeometry(1.0, 0.04, 6, 28), new T.MeshBasicMaterial({ color: 0x35e3ff, fog: false })); ring.position.z = 0.15; g.add(ring);
      }
      g.position.set(it.x, it.y, it.z); it.obj = g; this.markers.add(g); this.markerObjs.push(it);
    }
  }
  setGuide(points) {   // путевые вехи вдоль маршрута (x, y, z)
    if (this.guide) { this.scene.remove(this.guide); this.guide.dispose && this.guide.dispose(); }
    const n = Math.min(points.length, 400);
    const g = new T.InstancedMesh(new T.BoxGeometry(0.16, 0.16, 1.7), new T.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffb020, emissiveIntensity: 0.9 }), Math.max(n, 1));
    const m = new T.Matrix4();
    for (let i = 0; i < n; i++) { m.makeTranslation(points[i][0], points[i][1], points[i][2] + 0.85); g.setMatrixAt(i, m); }
    g.count = n; g.frustumCulled = false; g.instanceMatrix.needsUpdate = true; this.guide = g; this.scene.add(g);
  }

  // ---------------------------------------------------------------- кадр
  /** S: rover, prev {pos,q}, alpha, env, cam {mode, yaw, pitch, dist}, lights, warp, realDt, wind, now */
  frame(S) {
    const t = this.terrain; if (!t) return;
    const r = S.rover, env = S.env, dt = S.realDt;
    // интерполяция положения между шагами физики
    const rq = S.walker ? { x: 0, y: 0, z: 0, w: 1 } : r.q;      // у пешехода нет кватерниона: он поворачивается только по курсу
    const a = S.alpha != null ? S.alpha : 1, pp = S.prev ? S.prev.pos : r.pos, pq = S.prev && S.prev.q ? S.prev.q : rq;
    const px = pp[0] + (r.pos[0] - pp[0]) * a, py = pp[1] + (r.pos[1] - pp[1]) * a, pz = pp[2] + (r.pos[2] - pp[2]) * a;
    let qx = pq.x + (rq.x - pq.x) * a, qy = pq.y + (rq.y - pq.y) * a, qz = pq.z + (rq.z - pq.z) * a, qw = pq.w + (rq.w - pq.w) * a;
    if (pq.x * rq.x + pq.y * rq.y + pq.z * rq.z + pq.w * rq.w < 0) { qx = rq.x; qy = rq.y; qz = rq.z; qw = rq.w; }
    const qn = 1 / Math.hypot(qx, qy, qz, qw);
    // рельеф
    for (const ring of this.rings) { const n = ring.need(px, py); if (n) ring.update(t, n[0], n[1], this.pal); }
    this._updateRocks(px, py);
    // свет и небо
    this._lighting(env, px, py, pz, S);
    // техника
    const vg = this.vehicleGroup;
    if (vg) {
      vg.position.set(px, py, pz); vg.quaternion.set(qx * qn, qy * qn, qz * qn, qw * qn);
      if (S.walker) { vg.rotation.set(0, 0, 0); vg.quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2 - r.face); }
      const cfg = this.cfgV;
      if (cfg && cfg.mounts) for (let i = 0; i < this.wheelMeshes.length; i++) {
        const wh = r.wheels[i], mt = cfg.mounts[i], wm = this.wheelMeshes[i];
        wm.w.position.set(mt[0], mt[1], mt[2] - (wh.l != null ? wh.l : cfg.L0));
        wm.w.rotation.z = wh.steerNow || 0; wm.spin.rotation.y = wh.spin || 0;
      }
      if (this.headL) for (const sp of this.headL) sp.intensity = S.lights ? (cfg.lights || 0) * 2.2 + 3 : 0, sp.distance = 40 + (cfg.lights || 0) * 28;
    }
    if (S.walker && this.rig) this._animWalker(this.rig, dt, Math.hypot(r.vel[0], r.vel[1]), !r.onGround, t.g < 2.5, r.vel[2]);
    this._droneFx(S, r, px, py, pz, dt);
    this._passive(S, dt);
    if (this.pings) for (let i = this.pings.length - 1; i >= 0; i--) { const pg = this.pings[i]; pg.g.children[1].rotation.z += dt * 1.2; if (performance.now() - pg.born > 90000) { this.scene.remove(pg.g); this.pings.splice(i, 1); } }
    this._syncRemotes(S, dt);
    this._labels(px, py, pz);
    // маяки
    if (this.markerObjs) for (const it of this.markerObjs) {
      if (it.obj.userData.spin) { it.obj.userData.spin.rotation.z += dt * 1.6; it.obj.userData.spin.position.z = 1.1 + 0.12 * Math.sin(S.now * 2 + it.x); }
      it.obj.visible = !it.done;
    }
    // пыль из-под колёс
    const g = t.g, drag = this.mars ? 1.3 : 0.0, wk = env ? Math.min(env.wind || 0, 30) : 0, wa = S.windDir || 0;
    const wvx = Math.sin(wa) * wk * (this.mars ? 0.25 : 0), wvy = Math.cos(wa) * wk * (this.mars ? 0.25 : 0);
    if (S.spawnDust && !S.walker && dt > 0) {
      const sp = Math.abs(r.speed);
      for (const wh of r.wheels) {
        if (!wh.contact || sp < 0.5) continue;
        const rate = Math.min(1, (sp * 0.18 + Math.abs(wh.slip) * 0.7)) * 60 * dt;
        let cnt = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
        const mt = this.cfgV.mounts[this.rovWheelIndex(r, wh)], ax = C.axes(r.q, {});
        const wx = px + ax.fx * mt[0] + ax.lx * mt[1] - ax.ux * 0.4 * 0, wy = py + ax.fy * mt[0] + ax.ly * mt[1];
        const gz = t.grid(wx, wy) + 0.1;
        while (cnt-- > 0) {
          const k = this.mars ? 1.0 : 2.3, up = (this.mars ? 0.5 : 1.5) * (0.4 + Math.random());
          this.dust.emit(wx, wy, gz, -ax.fx * sp * 0.5 * (0.3 + Math.random()) + (Math.random() - 0.5) * k, -ax.fy * sp * 0.5 * (0.3 + Math.random()) + (Math.random() - 0.5) * k, up, (this.mars ? 3.2 : 2.6) * (0.6 + Math.random()));
        }
      }
    }
    this.dust.update(Math.min(dt, 0.05), g, drag, wvx, wvy, t);
    // ветровая пыль (Марс, буря)
    if (this.mars && wk > 9) {
      const cnt = Math.min(6, Math.floor((wk - 8) * 0.5) + (Math.random() < 0.5 ? 1 : 0));
      for (let i = 0; i < cnt; i++) this.wind.emit(px + (Math.random() - 0.5) * 70 - wvx * 3, py + (Math.random() - 0.5) * 70 - wvy * 3, t.grid(px, py) + Math.random() * 6, wvx * 2.2, wvy * 2.2, 0.2, 2.2);
    }
    this.wind.update(Math.min(dt, 0.05), 0, 0.3, wvx * 2.2, wvy * 2.2, t);
    this._camera(S, px, py, pz, qx * qn, qy * qn, qz * qn, qw * qn);
    this.renderer.render(this.scene, this.camera);
  }
  /** Остальные машины «парка»: ровер, космонавт, дрон, которыми игрок сейчас не управляет. S.passive: [{ kind, obj, cfg, hidden }] */
  _passive(S, dt) {
    if (!this.passiveModels) this.passiveModels = new Map();
    const list = S.passive || [], want = new Set();
    for (const it of list) {
      const key = it.kind + ':' + it.cfg.key; want.add(key);
      let m = this.passiveModels.get(key);
      if (!m) { m = this.makeModel(it.cfg, true); this.scene.add(m.group); this.passiveModels.set(key, m); }
      const o = it.obj; m.group.visible = !it.hidden;
      if (it.hidden) continue;
      m.group.position.set(o.pos[0], o.pos[1], o.pos[2]);
      if (it.kind === 'walker') { m.group.quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2 - (o.face != null ? o.face : o.yaw)); this._animWalker(m.rig, dt, Math.hypot(o.vel[0], o.vel[1]), !o.onGround, this.terrain.g < 2.5, o.vel[2]); }
      else m.group.quaternion.set(o.q.x, o.q.y, o.q.z, o.q.w);
      const cfg = it.cfg;
      if (cfg.mounts) m.wheelMeshes.forEach((w, i) => { const wh = o.wheels[i], mt = cfg.mounts[i]; if (!wh) return; w.w.position.set(mt[0], mt[1], mt[2] - (wh.l != null ? wh.l : cfg.L0)); w.w.rotation.z = wh.steerNow || 0; w.spin.rotation.y = wh.spin || 0; });
      if (m.rotors) for (const ro of m.rotors) ro.rotation.z += dt * ((o.stats.thrustPct || 0) > 0.02 ? 25 + 90 * o.stats.thrustPct : 0) * ro.userData.dir;
      if (m.nozzles) for (const nz of m.nozzles) { const th = o.stats.thrustPct || 0; nz.visible = th > 0.03; nz.scale.set(1, 1, 0.4 + 1.6 * th); }
    }
    for (const [k, m] of [...this.passiveModels]) if (!want.has(k)) { this.scene.remove(m.group); this.passiveModels.delete(k); }
  }

  /** Метка игрока: светящийся столб на 90 секунд. */
  addPing(x, y, z, hue, name) {
    if (!this.pings) this.pings = [];
    const g = new T.Group(), col = new T.Color(`hsl(${hue},85%,60%)`);
    const pillar = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 70, 14, 1, true).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    pillar.position.z = 35; g.add(pillar);
    const ring = new T.Mesh(new T.TorusGeometry(2.4, 0.15, 8, 32), new T.MeshBasicMaterial({ color: col, fog: false })); ring.position.z = 0.3; g.add(ring);
    g.position.set(x, y, z); this.scene.add(g); this.pings.push({ g, born: performance.now() });
  }
  clearPings() { if (this.pings) for (const p of this.pings) this.scene.remove(p.g); this.pings = []; }
  rovWheelIndex(r, wh) { return r.wheels.indexOf(wh); }

  // ---------------------------------------------------------------- подписи, чужие игроки, настоящие аппараты
  /** Табличка с именем над техникой; hue — цвет игрока, live — значок «живые данные NASA». */
  makeLabel(text, hue, live, sub) {
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 96;
    const g = cv.getContext('2d'); g.font = '600 34px system-ui, sans-serif';
    const w = Math.min(372, g.measureText(text).width + 48 + (live ? 74 : 0));
    g.fillStyle = 'rgba(10,16,32,.82)'; g.beginPath(); g.roundRect ? g.roundRect(6, 8, w, sub ? 80 : 60, 18) : g.rect(6, 8, w, sub ? 80 : 60); g.fill();
    g.fillStyle = hue == null ? '#2dd4bf' : `hsl(${hue},85%,60%)`; g.fillRect(6, 8, 10, sub ? 80 : 60);
    g.fillStyle = '#e8eefb'; g.fillText(text, 28, 52);
    if (live) { g.fillStyle = '#ff7a59'; g.font = '700 22px system-ui, sans-serif'; g.fillText('LIVE', w - 52, 48); }
    if (sub) { g.fillStyle = '#94a3c0'; g.font = '400 22px system-ui, sans-serif'; g.fillText(sub, 28, 78); }
    const tex = new T.CanvasTexture(cv);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    sp.userData.aspect = 4; sp.renderOrder = 20; return sp;
  }
  _labels(px, py, pz) {
    const cam = this.camera.position;
    const upd = (sp, x, y, z) => {
      const d = Math.hypot(cam.x - x, cam.y - y, cam.z - z), k = Math.max(0.9, d * 0.04);
      sp.scale.set(3.2 * k, 0.8 * k, 1);
    };
    if (this.remote) for (const e of this.remote.values()) { upd(e.label, e.group.position.x, e.group.position.y, e.group.position.z + 2.6); e.label.position.set(e.group.position.x, e.group.position.y, e.group.position.z + 2.6 + Math.min(4, Math.hypot(cam.x - e.group.position.x, cam.y - e.group.position.y) * 0.01)); }
    if (this.assetObjs) for (const e of this.assetObjs) { upd(e.label, e.x, e.y, e.z); e.label.position.set(e.x, e.y, e.z + 4.2); }
  }
  /** list: [{id, name, kind, hue, x, y, z, q:{x,y,z,w}, steer, speed, thrust}] — положения чужих игроков в текущей системе координат. */
  _syncRemotes(S, dt) {
    const list = S.remotes || [], want = new Set();
    if (!this.remote) this.remote = new Map();
    for (const it of list) {
      want.add(it.id);
      let e = this.remote.get(it.id);
      if (!e || e.kind !== it.kind) {
        if (e) { this.scene.remove(e.group); this.scene.remove(e.label); }
        const cfg = it.kind === 'drone' ? C.droneConfig(this.mars ? 'mars' : 'moon') : it.kind === 'walker' ? C.VEHICLES.walker : C.VEHICLES[it.kind] || C.VEHICLES.rover_crew;
        const m = this.makeModel(cfg, true), label = this.makeLabel(it.name, it.hue, false);
        // цветная метка игрока: тонкий столб над техникой
        const tag = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.6, 6).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: new T.Color(`hsl(${it.hue},85%,60%)`), fog: false }));
        tag.position.z = (cfg.drone ? 0.9 : 2.2); m.group.add(tag);
        this.scene.add(m.group); this.scene.add(label);
        e = { id: it.id, kind: it.kind, cfg, rig: m.rig, group: m.group, wheels: m.wheelMeshes, rotors: m.rotors, nozzles: m.nozzles, label, spin: 0 };
        this.remote.set(it.id, e);
      }
      e.group.position.set(it.x, it.y, it.z); e.group.quaternion.set(it.q.x, it.q.y, it.q.z, it.q.w);
      if (it.kind === 'walker') { e.group.quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2 - it.hd); this._animWalker(e.rig, dt, it.speed || 0, false, this.terrain.g < 2.5); }
      e.spin += (it.speed || 0) / Math.max(e.cfg.wheelR || 0.4, 0.1) * dt;
      if (e.cfg.mounts) e.wheels.forEach((w, i) => { w.spin.rotation.y = e.spin; w.w.rotation.z = (e.cfg.steer[i] || 0) * (it.steer || 0); });
      if (e.rotors) for (const ro of e.rotors) ro.rotation.z += dt * (it.thrust > 0.02 ? 25 + 90 * it.thrust : 0) * ro.userData.dir;
      if (e.nozzles) for (const nz of e.nozzles) { nz.visible = it.thrust > 0.03; nz.scale.set(1, 1, 0.4 + 1.6 * it.thrust); }
    }
    for (const [id, e] of [...this.remote]) if (!want.has(id)) { this.scene.remove(e.group); this.scene.remove(e.label); this.remote.delete(id); }
  }
  /** Настоящие аппараты (посадочные станции и марсоходы) в текущей системе координат. items: [{x, y, z, hd, kind, name, live, sub}] */
  setAssets(items) {
    if (this.assetObjs) for (const e of this.assetObjs) { this.scene.remove(e.group); this.scene.remove(e.label); }
    this.assetObjs = [];
    for (const it of items) {
      const g = new T.Group();
      if (it.kind === 'rover') {
        const m = this.makeModel(C.VEHICLES.rover_robot, true); g.add(m.group);
        const cfg = C.VEHICLES.rover_robot; m.group.position.z = cfg.wheelR + cfg.L0 - cfg.mounts[0][2] * 0 + 0.05;
      } else this._landerModel(g);
      // кольцо на земле, чтобы заметить издалека
      const ring = new T.Mesh(new T.TorusGeometry(it.live ? 7 : 5, 0.18, 8, 44), new T.MeshBasicMaterial({ color: it.live ? 0xff7a59 : 0x35e3ff, fog: false }));
      ring.position.z = 0.3; g.add(ring);
      g.position.set(it.x, it.y, it.z); g.rotation.z = Math.PI / 2 - (it.hd || 0);
      const label = this.makeLabel(it.name, null, !!it.live, it.sub);
      this.scene.add(g); this.scene.add(label);
      this.assetObjs.push({ group: g, label, x: it.x, y: it.y, z: it.z });
    }
  }
  _landerModel(g) {
    const light = new T.MeshStandardMaterial({ color: 0xcfd5de, roughness: 0.5, metalness: 0.3 }), gold = new T.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.85 });
    const dark = new T.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.6, metalness: 0.5 }), panel = new T.MeshStandardMaterial({ color: 0x14224a, roughness: 0.3, metalness: 0.6 });
    const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    add(new T.CylinderGeometry(1.1, 1.3, 0.9, 6), gold, 0, 0, 1.15).rotation.x = Math.PI / 2;
    add(new T.CylinderGeometry(1.15, 1.15, 0.08, 6), light, 0, 0, 1.65).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5, x = Math.cos(a) * 1.9, y = Math.sin(a) * 1.9; const leg = add(new T.CylinderGeometry(0.05, 0.05, 1.6, 6), dark, x * 0.8, y * 0.8, 0.8); leg.rotation.set(Math.sin(a) * 0.55, -Math.cos(a) * 0.55, 0); add(new T.CylinderGeometry(0.28, 0.28, 0.05, 12), dark, x, y, 0.03); }
    add(new T.BoxGeometry(2.3, 0.9, 0.05), panel, 0, 1.8, 1.4); add(new T.BoxGeometry(2.3, 0.9, 0.05), panel, 0, -1.8, 1.4);
    add(new T.CylinderGeometry(0.03, 0.03, 1.2, 6), light, 0.4, 0.3, 2.3);
    const dish = add(new T.ConeGeometry(0.3, 0.14, 16, 1, true), gold, 0.4, 0.3, 2.95); dish.rotation.x = -Math.PI / 2;
  }

  // ---------------------------------------------------------------- эффекты дрона: роторы, факелы, пыль
  _droneFx(S, r, px, py, pz, dt) {
    if (!S.drone || !r.cfg || !dt) return;
    const t = this.terrain, thr = clamp(r.stats.thrustPct || 0, 0, 1), ax = C.axes(r.q, {});
    if (this.rotors) for (const ro of this.rotors) ro.rotation.z += dt * (thr > 0.02 ? 25 + 90 * thr : 0) * ro.userData.dir;
    if (this.nozzles && this.nozzles.length) {
      for (const nz of this.nozzles) { nz.visible = thr > 0.03; nz.scale.set(1, 1, 0.4 + 1.8 * thr); nz.material.opacity = 0.5 + 0.4 * thr; }
      if (thr > 0.03 && S.spawnDust) {
        if (!this.plume) this.plume = new Dust(this.scene, 700, 0.8, 0xffd9a0);
        if (!this.plumeInit) { this.plume.mat.blending = T.AdditiveBlending; this.plume.mat.opacity = 0.3; this.plumeInit = true; }
        for (const np of this.nozzlePts) {
          const wx = px + ax.fx * np[0] + ax.lx * np[1] + ax.ux * np[2], wy = py + ax.fy * np[0] + ax.ly * np[1] + ax.uy * np[2], wz = pz + ax.fz * np[0] + ax.lz * np[1] + ax.uz * np[2];
          const n = Math.floor(thr * 4 + Math.random());
          for (let i = 0; i < n; i++) this.plume.emit(wx, wy, wz, -ax.ux * (16 + Math.random() * 6) + (Math.random() - 0.5) * 2, -ax.uy * (16 + Math.random() * 6) + (Math.random() - 0.5) * 2, -ax.uz * (16 + Math.random() * 6), 0.22);
        }
      }
    }
    if (this.plume) this.plume.update(Math.min(dt, 0.05), 0, 0, 0, 0, t);
    // пыль, поднятая струёй у земли
    const agl = r.stats.agl;
    if (thr > 0.15 && agl < 12 && S.spawnDust) {
      const k = (1 - agl / 12) * thr, rate = k * 70 * dt, gz = t.grid(px, py) + 0.15;
      let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      while (n-- > 0) {
        const a = Math.random() * 6.283, sp = (this.mars ? 3 : 7) * (0.4 + Math.random());
        this.dust.emit(px + Math.cos(a) * 0.6, py + Math.sin(a) * 0.6, gz, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * (this.mars ? 1.2 : 2.5), (this.mars ? 3.4 : 2.8) * (0.6 + Math.random()));
      }
    }
  }

  _lighting(env, px, py, pz, S) {
    if (!env) return;
    const sd = env.sunDir, sinEl = sd[2], mars = this.mars;
    const dayK = C.smooth((sinEl + 0.06) / 0.2);                // 0 ночью, 1 днём
    const atm = mars ? Math.exp(-Math.max(env.tau, 0.1) / Math.max(sinEl, 0.1)) * 1.7 : 1;
    this.sun.position.set(px + sd[0] * 250, py + sd[1] * 250, pz + sd[2] * 250); this.sun.target.position.set(px, py, pz);
    this.sun.intensity = (mars ? 2.5 * Math.min(atm, 1) : 3.3) * C.smooth(sinEl / 0.08);
    this.sun.color.setRGB(1, mars ? 0.88 : 0.98, mars ? 0.74 : 0.94);
    this.sun.castShadow = sinEl > 0.01;
    // ощущение сумерек: размытие света при низком Солнце
    const nightK = 1 - dayK; this.nightK = nightK;
    const amb = mars ? (0.06 + 0.62 * dayK) * (1 + 0.45 * Math.min(env.tau, 3) / 3) : 0.045 + 0.1 * dayK + (S.earthUp ? 0.012 : 0);
    this.hemi.intensity = amb;
    this.hemi.color.setRGB(mars ? 0.95 : 0.85, mars ? 0.78 : 0.85, mars ? 0.66 : 0.95); this.hemi.groundColor.setRGB(0.55, 0.42, 0.34);
    this.renderer.toneMappingExposure = 1.0 + 1.6 * nightK;
    // небо
    this.skyMat.uniforms.sunDir.value.set(sd[0], sd[1], sd[2]);
    this.skyMat.uniforms.day.value = mars ? Math.max(dayK, 0.04 * Math.exp(-Math.abs(sinEl) * 8)) : 0;
    this.skyMat.uniforms.dust.value = mars ? Math.min(1, env.tau / 3) : 0;
    this.sky.position.set(px, py, pz); this.stars.position.set(px, py, pz);
    this.stars.material.opacity = mars ? clamp(1.05 - dayK * 1.3, 0, 1) : 1;
    // Солнце
    const vis = sinEl > -0.05;
    this.sunDisc.visible = this.sunGlow.visible = vis;
    this.sunDisc.position.set(px + sd[0] * 40000, py + sd[1] * 40000, pz + sd[2] * 40000); this.sunDisc.lookAt(px, py, pz);
    this.sunGlow.position.copy(this.sunDisc.position);
    this.sunGlow.material.opacity = mars ? 0.5 * Math.min(atm, 1) + 0.15 : 0.85;
    this.sunDisc.material.color.setRGB(1, 0.97, 0.9);
    // Земля на лунном небе
    if (this.earth) {
      const e = S.earthDir;
      this.earth.visible = !!e && e[2] > -0.04;
      if (e) this.earth.position.set(px + e[0] * 40000, py + e[1] * 40000, pz + e[2] * 40000);
    }
    // туман (Марс)
    if (mars) {
      const vis2 = Math.max(env.visibility, 150);
      this.scene.fog.density = 2.4 / vis2;
      const k = Math.max(dayK, 0.05), tauK = Math.min(1, env.tau / 3);
      this.scene.fog.color.setRGB((0.78 - 0.1 * tauK) * k, (0.58 - 0.1 * tauK) * k * 0.95, (0.42 - 0.06 * tauK) * k * 0.9);
      this.scene.background.copy(this.scene.fog.color);
    } else this.scene.fog.density = 0;
  }

  _camera(S, px, py, pz, qx, qy, qz, qw) {
    const cam = this.camera, c = S.cam, t = this.terrain, walker = S.walker;
    const hdg = walker ? S.rover.yaw : S.rover.heading;
    if (!this.camInit) { this.camYaw = hdg; this.camInit = true; }
    let d = hdg - this.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.camYaw += d * Math.min(1, (S.realDt || 0.016) * (c.follow != null ? c.follow : 2.2));
    const yaw = (c.mode === 2 || walker && c.free ? c.yaw : this.camYaw + c.yaw);
    const fx = Math.sin(yaw), fy = Math.cos(yaw);
    let cx, cy, cz, lx, ly, lz;
    if (c.mode === 1) {      // из кабины
      const ax = C.axes({ x: qx, y: qy, z: qz, w: qw }, {});
      const hx = this.cfgV && this.cfgV.hull ? this.cfgV.hull[0] * 0.35 : 0.3, hz = this.cfgV && this.cfgV.hull ? this.cfgV.hull[3] + 0.95 : 1.7;
      cx = px + ax.fx * hx + ax.ux * hz; cy = py + ax.fy * hx + ax.uy * hz; cz = pz + ax.fz * hx + ax.uz * hz;
      const yy = hdg + c.yaw * 0.6;
      lx = cx + (Math.sin(yy) * 20) ; ly = cy + Math.cos(yy) * 20; lz = cz + ax.fz * 20 * 0.85 + ax.uz * 0 - c.pitch * 12;
      this.camera.fov = 72;
    } else if (walker && c.mode === 1) {
      cx = px; cy = py; cz = pz + 1.72;
      lx = cx + fx * 20 * Math.cos(c.pitch); ly = cy + fy * 20 * Math.cos(c.pitch); lz = cz + Math.sin(c.pitch) * 20;
      this.camera.fov = 70;
    } else {
      const dist = c.dist, pitch = walker ? Math.max(c.pitch, 0.06) : c.mode === 2 ? Math.max(c.pitch, 0.1) : c.pitch, hOff = walker ? 1.5 : 1.1;
      cx = px - fx * dist * Math.cos(pitch); cy = py - fy * dist * Math.cos(pitch); cz = pz + hOff + dist * Math.sin(pitch);
      lx = px + fx * 3; ly = py + fy * 3; lz = pz + (walker ? 1.3 : 0.9);
      this.camera.fov = 62;
    }
    if (!(c.mode === 1 || walker)) {
      // «Пружинная штанга»: если между вездеходом и камерой оказался гребень кратера или склон, камера подтягивается ближе,
      // чтобы рельеф не закрывал технику (иначе вездеход выглядит провалившимся под землю).
      const tx = px, ty = py, tz = pz + (walker ? 1.5 : 1.1), dx = cx - tx, dy = cy - ty, dz = cz - tz;
      let tHit = 1;
      for (let i = 1; i <= 20; i++) {
        const k = i / 20, gx = tx + dx * k, gy = ty + dy * k;
        if (tz + dz * k < t.heightBase(gx, gy) + 0.6) { tHit = Math.max((i - 1) / 20 - 0.05, 0.12); break; }
      }
      if (tHit < 1) { cx = tx + dx * tHit; cy = ty + dy * tHit; cz = tz + dz * tHit + (1 - tHit) * 1.4; }
      const g = t.heightBase(cx, cy) + 0.7; if (cz < g) cz = g;
    }
    if (this.camInit2 && !(c.mode === 1 || walker)) {
      const k = 1 - Math.exp(-(S.realDt || 0.016) * 9);
      this.camPos.x += (cx - this.camPos.x) * k; this.camPos.y += (cy - this.camPos.y) * k; this.camPos.z += (cz - this.camPos.z) * k;
    } else { this.camPos.set(cx, cy, cz); this.camInit2 = true; }
    // тряска при ударах
    this.shake = Math.max(0, this.shake - (S.realDt || 0.016) * 2.5);
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * this.shake, this.camPos.y + (Math.random() - 0.5) * this.shake, this.camPos.z + (Math.random() - 0.5) * this.shake);
    cam.up.set(0, 0, 1);
    cam.lookAt(lx, ly, lz);
    cam.updateProjectionMatrix();
  }
}

root.Scene3D = Scene3D;
})(typeof self !== 'undefined' ? self : this);
