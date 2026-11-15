# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Screenshots of the Analog Atlas for the README and the demo deck: python tools/atlas_shots.py [scene ...]

Serves docs/atlas locally, drives headless Chrome and writes JPEGs to docs/demo/img/. Scenes: shackleton, jezero,
protonilus, marius, mobile.
"""
import asyncio
import json
import subprocess
import sys
import tempfile
import threading
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import websockets

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import cdp as shots  # noqa: E402

OUT = ROOT / "docs" / "demo" / "img"
OUT.mkdir(parents=True, exist_ok=True)
PORT = 8766


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


async def open_atlas(browser, target, w=1920, h=1080, dpr=1, mobile=False, only_new=False):
    p = await shots.new_page(browser, w, h, dpr, mobile)
    await p.goto(f"http://127.0.0.1:{PORT}/index.html#{target}", 1.0)
    await p.until("window.__atlas && window.__atlas.N() > 0 && window.__atlas.results().length > 0", 90)
    if only_new:
        await p.js("(()=>{const c=document.getElementById('onlyNew'); c.checked=true; c.dispatchEvent(new Event('change'));})()")
        await asyncio.sleep(0.5)
    await asyncio.sleep(3.5)                                  # let the map tiles load
    return p


async def snap(p, name, q=88):
    import base64
    r = await p.send("Page.captureScreenshot", format="jpeg", quality=q)
    (OUT / name).write_bytes(base64.b64decode(r["data"]))
    print("saved", name)


async def pick(p, n=0, zoom=None):
    await p.js(f"(()=>{{const a=window.__atlas; a.select(a.results()[{n}], true);}})()")
    await asyncio.sleep(5.0)


async def s_shackleton(b):
    p = await open_atlas(b, "shackleton")
    await pick(p, 0)
    await p.js("map.setView([25, 15], 2, {animate:false}); drawHeat()")
    await asyncio.sleep(2.0)
    await snap(p, "atlas_shackleton.jpg")


async def s_jezero(b):
    p = await open_atlas(b, "jezero")
    await pick(p, 0)
    await p.js("map.setView([25, 15], 2, {animate:false}); drawHeat()")
    await asyncio.sleep(2.0)
    await snap(p, "atlas_jezero.jpg")


async def s_protonilus(b):
    p = await open_atlas(b, "protonilus", only_new=True)
    await pick(p, 0)
    await p.js("map.setView([25, 40], 2, {animate:false}); drawHeat()")
    await asyncio.sleep(2.0)
    await snap(p, "atlas_protonilus.jpg")


async def s_marius(b):
    p = await open_atlas(b, "marius_hills")
    await pick(p, 0)
    await snap(p, "atlas_marius.jpg")


async def s_mobile(b):
    p = await open_atlas(b, "shackleton", 390, 844, 2, True)
    await snap(p, "atlas_mobile.jpg")


SCENES = dict(shackleton=s_shackleton, jezero=s_jezero, protonilus=s_protonilus, marius=s_marius, mobile=s_mobile)


async def main(names):
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Quiet, directory=str(ROOT / "docs" / "atlas")))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp()
    proc = subprocess.Popen([shots.CHROME, f"--remote-debugging-port={shots.PORT}", "--headless=new", f"--user-data-dir={prof}",
                             "--window-size=1920,1080", "--no-first-run", "--hide-scrollbars"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                v = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{shots.PORT}/json/version").read())
                break
            except Exception:
                await asyncio.sleep(0.5)
        b = shots.Page(await websockets.connect(v["webSocketDebuggerUrl"], max_size=2 ** 27))
        asyncio.create_task(b.run())
        for n in names:
            await SCENES[n](b)
    finally:
        proc.terminate()
        srv.shutdown()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or list(SCENES)))
