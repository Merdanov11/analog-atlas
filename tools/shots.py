# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Screenshots for the presentation: python tools/shots.py [name ...]
Starts headless Chrome (CDP) and captures the map and the simulator at 1920x1080 / mobile size. The server must be running on :8000."""
import asyncio, base64, json, subprocess, sys, tempfile, time, urllib.request
import websockets

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = "http://127.0.0.1:8000"
OUT = __import__("pathlib").Path(__file__).resolve().parent.parent / "web" / "img"
PORT = 9333

class Page:
    def __init__(self, ws): self.ws, self.i, self.pending = ws, 0, {}
    async def run(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if "id" in m and m["id"] in self.pending: self.pending[m["id"]].set_result(m)
    async def send(self, method, **params):
        self.i += 1; fut = asyncio.get_event_loop().create_future(); self.pending[self.i] = fut
        await self.ws.send(json.dumps({"id": self.i, "method": method, "params": params}))
        r = await asyncio.wait_for(fut, 120)
        if "error" in r: raise RuntimeError(r["error"])
        return r.get("result", {})
    async def js(self, expr, wait=True):
        r = await self.send("Runtime.evaluate", expression=expr, awaitPromise=wait, returnByValue=True)
        if "exceptionDetails" in r: raise RuntimeError(json.dumps(r["exceptionDetails"])[:400])
        return r["result"].get("value")
    async def goto(self, url, settle=1.5):
        await self.send("Page.navigate", url=url); await asyncio.sleep(settle)
    async def shot(self, name, q=88):
        r = await self.send("Page.captureScreenshot", format="jpeg", quality=q)
        (OUT / name).write_bytes(base64.b64decode(r["data"])); print("saved", name)
    async def until(self, cond, timeout=60):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if await self.js(f"!!({cond})"): return True
            await asyncio.sleep(0.5)
        raise TimeoutError(cond)

async def new_page(browser, w=1920, h=1080, dpr=1, mobile=False):
    t = await browser.send("Target.createTarget", url="about:blank")
    info = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read())
    ws_url = next(x["webSocketDebuggerUrl"] for x in info if x["id"] == t["targetId"])
    p = Page(await websockets.connect(ws_url, max_size=2**27)); asyncio.create_task(p.run())
    await p.send("Page.enable"); await p.send("Runtime.enable")
    await p.send("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=dpr, mobile=mobile)
    if mobile:
        await p.send("Emulation.setUserAgentOverride", userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")
        await p.send("Emulation.setTouchEmulationEnabled", enabled=True)
    return p

SET_ROUTE = """(async()=>{const q=new URLSearchParams({body:'%(body)s',lat1:%(a0)s,lon1:%(a1)s,lat2:%(b0)s,lon2:%(b1)s,profile:'%(prof)s',mode:'fast'});
 const d=await fetch('/api/route?'+q).then(r=>r.json()); localStorage.setItem('rbe-sim-route',JSON.stringify({body:'%(body)s',profile:'%(prof)s',mode:'fast',start:'',lang:'%(lang)s',data:d}));
 localStorage.setItem('rbe-name','%(name)s'); localStorage.setItem('rbe-lang','%(lang)s'); return d.distance_m})()"""
KEY = "(c,d)=>window.dispatchEvent(new KeyboardEvent(d?'keydown':'keyup',{code:c,bubbles:true}))"

async def start_sim(p, body, prof, a, b, tod="noon", name="Pilot", online=False, lang="en", warp_ms=0):
    await p.goto(BASE + "/", 0.5)
    await p.js(SET_ROUTE % dict(body=body, prof=prof, a0=a[0], a1=a[1], b0=b[0], b1=b[1], name=name, lang=lang))
    await p.goto(BASE + "/sim.html", 2.5)
    await p.js(f"(()=>{{document.querySelector('#oTod [data-v={tod}]').click();document.getElementById('oOn').checked={'true' if online else 'false'};window.__noBudget=true;document.getElementById('bGo').click();}})()")
    await p.until("window.__sim && window.__sim.rover && !document.getElementById('hud').hidden", 120)
    await asyncio.sleep(1.5)

async def keys(p, seq):   # seq: [("KeyW", True), ("wait", 2.0)]
    for c, v in seq:
        if c == "wait": await asyncio.sleep(v)
        else: await p.js(f"({KEY})('{c}',{str(v).lower()})")

async def warp(p, idx, secs):
    await p.js(f"window.__sim.warp({idx})"); await asyncio.sleep(secs); await p.js("window.__sim.warp(2)")

MARS_A, MARS_B = (-4.826, 137.389), (-4.80, 137.43)
MOON_A, MOON_B = (20.19, 30.77), (20.26, 30.86)

async def main(names):
    prof_dir = tempfile.mkdtemp()
    proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={prof_dir}", "--window-size=1920,1080",
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", "--mute-audio", "--no-first-run", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version"); break
            except Exception: time.sleep(0.5)
        v = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version").read())
        browser = Page(await websockets.connect(v["webSocketDebuggerUrl"], max_size=2**27)); asyncio.create_task(browser.run())
        for n in names: await SHOTS[n](browser)
    finally:
        proc.terminate()

async def climb(p, agl, speed=0, timeout=120):
    """Climbs to height agl and (if speed>0) accelerates forward; then restores normal time."""
    await keys(p, [("Space", True)]); await p.js("window.__sim.warp(6)")
    await p.until(f"window.__sim.rover.agl() > {agl}", timeout); await keys(p, [("Space", False)])
    if speed:
        await keys(p, [("KeyW", True)]); await p.until(f"window.__sim.rover.speed > {speed}", timeout)
    await p.js("window.__sim.warp(2)"); await asyncio.sleep(1.0)
HIDE_HUD = "document.getElementById('hud').hidden=true"
async def s_rover_mars(browser):
    p = await new_page(browser); await start_sim(p, "mars", "rover_crew", MARS_A, MARS_B, "noon", "Pilot")
    await keys(p, [("KeyW", True), ("wait", 0.2)]); await warp(p, 5, 6); await keys(p, [("KeyW", False)]); await p.shot("sim_mars_rover.jpg")
    await p.js(HIDE_HUD); await asyncio.sleep(0.6); await p.shot("sim_mars_rover_clean.jpg")
async def s_rover_moon(browser):
    p = await new_page(browser); await start_sim(p, "moon", "rover_crew", MOON_A, MOON_B, "evening", "Pilot")
    await keys(p, [("KeyW", True)]); await warp(p, 5, 8); await keys(p, [("KeyW", False)])
    await p.js(HIDE_HUD); await asyncio.sleep(0.8); await p.shot("sim_moon_rover_clean.jpg")
async def s_astro(browser):
    p = await new_page(browser); await start_sim(p, "moon", "walker", MOON_A, (20.21, 30.80), "morning", "Pilot")
    await keys(p, [("KeyW", True), ("ShiftLeft", True)]); await warp(p, 3, 5); await p.js("window.__sim.warp(2)"); await asyncio.sleep(1.0)
    await p.js(HIDE_HUD); await asyncio.sleep(0.4); await p.shot("sim_astronaut_clean.jpg")
async def s_astro_mars(browser):
    p = await new_page(browser); await start_sim(p, "mars", "walker", MARS_A, (-4.81, 137.40), "noon", "Pilot")
    await keys(p, [("KeyW", True), ("ShiftLeft", True)]); await warp(p, 3, 5); await p.js("window.__sim.warp(2)"); await asyncio.sleep(1.0)
    await p.js(HIDE_HUD); await asyncio.sleep(0.4); await p.shot("sim_astronaut_mars_clean.jpg")
async def s_mobile_mars(browser):
    p = await new_page(browser, 390, 844, 3, True); await start_sim(p, "mars", "rover_crew", MARS_A, MARS_B, "noon", "Pilot")
    await p.js("window.__noBudget=true"); await asyncio.sleep(1.5); await p.shot("mobile_hud_mars.jpg")
async def s_drone_mars(browser):
    p = await new_page(browser); await start_sim(p, "mars", "drone", MARS_A, MARS_B, "noon", "Pilot")
    await climb(p, 14, 5); await p.js("(()=>{const c=window.__sim.cam; c.pitch=0.5; c.dist=11;})()"); await asyncio.sleep(2.0)
    await p.shot("sim_drone_mars.jpg"); await p.js(HIDE_HUD); await asyncio.sleep(0.5); await p.shot("sim_drone_mars_clean.jpg")
async def s_hopper(browser):
    p = await new_page(browser); await start_sim(p, "moon", "drone", MOON_A, MOON_B, "morning", "Pilot")
    await climb(p, 22, 6); await p.js("(()=>{const c=window.__sim.cam; c.pitch=0.45; c.dist=14;})()"); await asyncio.sleep(2.0)
    await p.js(HIDE_HUD); await asyncio.sleep(0.5); await p.shot("sim_hopper_clean.jpg")
async def s_fleet(browser):
    p = await new_page(browser); await start_sim(p, "mars", "rover_crew", MARS_A, MARS_B, "noon", "Pilot")
    await keys(p, [("KeyV", True), ("KeyV", False), ("wait", 1.0), ("KeyH", True), ("KeyH", False), ("wait", 4)])
    await p.js("(()=>{const c=window.__sim.cam; c.yaw=-2.2; c.pitch=0.25; c.dist=7;})()"); await asyncio.sleep(1.5)
    await p.js(HIDE_HUD); await asyncio.sleep(0.4); await p.shot("sim_fleet_clean.jpg")
async def s_multi(browser):
    bob = await new_page(browser); await start_sim(bob, "mars", "rover_crew", MARS_A, MARS_B, "noon", "Bob", online=True)
    await keys(bob, [("KeyW", True)]); await warp(bob, 4, 3); await keys(bob, [("KeyW", False)])
    alice = await new_page(browser); await start_sim(alice, "mars", "drone", MARS_A, MARS_B, "noon", "Alice", online=True)
    await climb(alice, 9); await alice.js("(()=>{const c=window.__sim.cam; c.yaw=0.5; c.pitch=0.85; c.dist=15;})()")
    await bob.js("window.__sim.net.chat('Heading to Valles Marineris, follow me!')"); await asyncio.sleep(0.5)
    await alice.js("window.__sim.net.chat('Copy that, flying ahead as scout.')"); await bob.js("window.__sim.net.ping(-4.79, 137.43)"); await asyncio.sleep(2.5)
    await keys(alice, [("Tab", True), ("Tab", False), ("wait", 1.5)])
    await alice.shot("sim_multiplayer.jpg")
async def s_map_plan(browser):
    p = await new_page(browser); await p.goto(BASE + "/", 6)
    await p.js("(async()=>{openDir();setPoint('a',{lat:-4.59,lng:137.44,name:'Gale crater'});setPoint('b',{lat:18.4,lng:77.4,name:'Jezero crater'});})()", wait=False)
    await p.until("!document.getElementById('result').hidden", 90); await asyncio.sleep(9); await p.shot("map_plan.jpg")
async def s_map_layers(browser):
    p = await new_page(browser); await p.goto(BASE + "/", 6)
    await p.js("(async()=>{openDir();setPoint('a',{lat:-4.59,lng:137.44,name:'Gale crater'});setPoint('b',{lat:18.4,lng:77.4,name:'Jezero crater'});})()", wait=False)
    await p.until("!document.getElementById('result').hidden", 90); await asyncio.sleep(6)
    await p.js("(()=>{state.overlay='themis_day'; state.ovAlpha=0.62; setTiles(); document.getElementById('layerPop').style.display='block';})()", wait=False)
    await asyncio.sleep(9); await p.shot("map_layers.jpg")
async def s_map_live(browser):
    p = await new_page(browser); await p.goto(BASE + "/", 6); await asyncio.sleep(3)
    await p.js("(()=>{const a=state.live[0]; showCard(a); viewer.camera.flyTo({destination: Cesium.Cartesian3.fromDegrees(a.lon, a.lat, 90000, ell), duration: 0.1});})()", wait=False)
    await asyncio.sleep(12); await p.shot("map_live.jpg")
async def s_mobile(browser):
    p = await new_page(browser, 390, 844, 3, True); await start_sim(p, "moon", "rover_crew", MOON_A, MOON_B, "morning", "Pilot")
    await p.js("window.__noBudget=true"); await asyncio.sleep(1.5); await p.shot("mobile_hud.jpg")
SHOTS = dict(rover_mars=s_rover_mars, rover_moon=s_rover_moon, astro=s_astro, drone_mars=s_drone_mars, hopper=s_hopper, fleet=s_fleet, multi=s_multi, astro_mars=s_astro_mars, mobile_mars=s_mobile_mars, map_plan=s_map_plan, map_layers=s_map_layers, map_live=s_map_live, mobile=s_mobile)
if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or list(SHOTS)))
