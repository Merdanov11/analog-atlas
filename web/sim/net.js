// Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
/* Сетевой клиент симулятора: WebSocket к /ws/sim, интерполяция положений чужих игроков. */
(function (root) {
'use strict';
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

class Net {
  constructor() {
    this.ws = null; this.id = null; this.name = ''; this.hue = 200; this.connected = false; this.online = 1;
    this.players = new Map();        // id -> { id, name, kind, hue, s0, s1 }
    this.on = {};                     // обработчики: join, leave, chat, ping, give, status
    this.hello = null; this.retry = 0; this.closed = false; this._t = 0;
  }
  emit(ev, a, b) { if (this.on[ev]) this.on[ev](a, b); }
  connect(hello) {
    this.hello = hello; this.closed = false; this._open();
  }
  _open() {
    if (this.closed) return;
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    let ws;
    try { ws = new WebSocket(proto + location.host + '/ws/sim'); } catch (e) { this.emit('status', 'error'); return; }
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.retry = 0; ws.send(JSON.stringify(Object.assign({ t: 'hello' }, this.hello))); this.emit('status', 'open'); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this._msg(m); };
    ws.onclose = () => {
      this.connected = false; this.players.clear(); this.emit('status', 'closed');
      if (!this.closed && this.retry < 8) setTimeout(() => this._open(), Math.min(1000 * 2 ** this.retry++, 10000));
    };
    ws.onerror = () => {};
  }
  _msg(m) {
    const now = performance.now();
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.name = m.name; this.hue = m.hue; this.online = m.online;
        for (const p of m.players || []) if (!this.players.has(p.id)) this.players.set(p.id, { id: p.id, name: p.name, kind: p.kind, hue: p.hue, s0: null, s1: null });
        this.emit('welcome', m); break;
      case 'join': this.players.set(m.id, { id: m.id, name: m.name, kind: m.kind, hue: m.hue, s0: null, s1: null }); this.online = this.players.size + 1; this.emit('join', m); break;
      case 'leave': this.players.delete(m.id); this.online = this.players.size + 1; this.emit('leave', m); break;
      case 'p':
        for (const it of m.l) {
          if (it.id === this.id) continue;
          let p = this.players.get(it.id);
          if (!p) { p = { id: it.id, name: it.n, kind: it.k, hue: it.h, s0: null, s1: null }; this.players.set(it.id, p); }
          p.name = it.n; p.kind = it.k; p.hue = it.h;
          p.s0 = p.s1; p.s1 = Object.assign({ t: now }, it);
        }
        this.online = this.players.size + 1; break;
      case 'chat': this.emit('chat', m); break;
      case 'ping': this.emit('ping', m); break;
      case 'give': this.emit('give', m); break;
    }
  }
  send(o) { if (this.connected && this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  /** Состояние раз в ~100 мс; s: { lat, lon, alt, hd, p, r, v, sa, th, st, b, cr, kind } */
  state(s) { this.send(Object.assign({ t: 's' }, s)); }
  chat(text) { this.send({ t: 'chat', text }); }
  ping(lat, lon) { this.send({ t: 'ping', lat, lon }); }
  give(to, amt) { this.send({ t: 'give', to, amt }); }
  close() { this.closed = true; if (this.ws) this.ws.close(); }
  /** Положение игрока в момент now с задержкой интерполяции 120 мс. Возвращает null, если данных нет или они устарели. */
  sample(p, now) {
    const s1 = p.s1, s0 = p.s0; if (!s1 || s1.lat == null) return null;
    if (now - s1.t > 4000) return null;
    let a = 1; const tr = now - 120;
    if (s0 && s1.t > s0.t) a = Math.max(0, Math.min(1.35, (tr - s0.t) / (s1.t - s0.t)));
    const A = s0 || s1, f = (k) => (A[k] == null || s1[k] == null ? s1[k] : A[k] + (s1[k] - A[k]) * a);
    return { id: p.id, name: p.name, kind: p.kind, hue: p.hue, lat: f('lat'), lon: f('lon'), alt: f('alt') == null ? 0 : f('alt'), hd: A.hd == null ? s1.hd : A.hd + wrapAngle(s1.hd - A.hd) * a,
             p: f('p') || 0, r: f('r') || 0, v: s1.v || 0, sa: s1.sa || 0, th: s1.th || 0, b: s1.b, cr: s1.cr, st: s1.st };
  }
}
root.Net = Net;
})(window);
