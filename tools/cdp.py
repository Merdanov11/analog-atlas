# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Minimal Chrome DevTools Protocol helper used by the screenshot and test scripts (headless Google Chrome)."""
import asyncio
import json
import time
import urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 9333


class Page:
    def __init__(self, ws):
        self.ws, self.i, self.pending = ws, 0, {}

    async def run(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if "id" in m and m["id"] in self.pending:
                self.pending[m["id"]].set_result(m)

    async def send(self, method, **params):
        self.i += 1
        fut = asyncio.get_event_loop().create_future()
        self.pending[self.i] = fut
        await self.ws.send(json.dumps({"id": self.i, "method": method, "params": params}))
        r = await asyncio.wait_for(fut, 120)
        if "error" in r:
            raise RuntimeError(r["error"])
        return r.get("result", {})

    async def js(self, expr, wait=True):
        r = await self.send("Runtime.evaluate", expression=expr, awaitPromise=wait, returnByValue=True)
        if "exceptionDetails" in r:
            raise RuntimeError(json.dumps(r["exceptionDetails"])[:400])
        return r["result"].get("value")

    async def goto(self, url, settle=1.5):
        await self.send("Page.navigate", url=url)
        await asyncio.sleep(settle)

    async def until(self, cond, timeout=60):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if await self.js(f"!!({cond})"):
                return True
            await asyncio.sleep(0.5)
        raise TimeoutError(cond)


async def new_page(browser, w=1920, h=1080, dpr=1, mobile=False):
    t = await browser.send("Target.createTarget", url="about:blank")
    info = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read())
    ws_url = next(x["webSocketDebuggerUrl"] for x in info if x["id"] == t["targetId"])
    import websockets
    p = Page(await websockets.connect(ws_url, max_size=2 ** 27))
    asyncio.create_task(p.run())
    await p.send("Page.enable")
    await p.send("Runtime.enable")
    await p.send("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=dpr, mobile=mobile)
    if mobile:
        await p.send("Emulation.setTouchEmulationEnabled", enabled=True)
    return p
