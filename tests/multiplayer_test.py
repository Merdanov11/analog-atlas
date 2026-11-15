# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Multiplayer server check with two bots: python tests/multiplayer_test.py (server on :8000)."""
import asyncio, json, sys
import websockets

URL = "ws://127.0.0.1:8000/ws/sim"
ok_all = True
def check(c, msg, extra=""):
    global ok_all
    ok_all &= bool(c); print(("PASS " if c else "FAIL ") + msg + (f"  [{extra}]" if extra else ""))

async def recv_until(ws, pred, timeout=3.0):
    end = asyncio.get_event_loop().time() + timeout
    while True:
        left = end - asyncio.get_event_loop().time()
        if left <= 0: return None
        try: m = json.loads(await asyncio.wait_for(ws.recv(), left))
        except asyncio.TimeoutError: return None
        if pred(m): return m

async def main():
    a = await websockets.connect(URL); b = await websockets.connect(URL)
    await a.send(json.dumps({"t": "hello", "name": "Alice<script>", "kind": "rover_crew", "body": "mars"}))
    wa = await recv_until(a, lambda m: m["t"] == "welcome")
    check(wa and wa["name"] == "Alicescript", "welcome and name sanitising", str(wa and wa["name"]))
    await b.send(json.dumps({"t": "hello", "name": "Bob", "kind": "drone", "body": "mars"}))
    wb = await recv_until(b, lambda m: m["t"] == "welcome")
    check(wb and wb["online"] == 2 and len(wb["players"]) == 1, "the second player sees the first", str(wb and wb["online"]))
    ja = await recv_until(a, lambda m: m["t"] == "join")
    check(ja and ja["name"] == "Bob" and ja["kind"] == "drone", "the first received join")
    # states
    for i in range(5):
        await a.send(json.dumps({"t": "s", "lat": -4.59 + i * 1e-4, "lon": 137.44, "alt": -4500.0, "hd": 1.0, "p": 0.1, "r": 0.0, "v": 2.5, "sa": 0.2, "st": "ok", "b": 0.9, "cr": False}))
        await b.send(json.dumps({"t": "s", "lat": -4.60, "lon": 137.45, "alt": -4480.0, "hd": 2.0, "p": 0.0, "r": 0.0, "v": 5, "th": 0.4, "st": "ok", "b": 0.5}))
        await asyncio.sleep(0.12)
    pa = await recv_until(a, lambda m: m["t"] == "p" and any(x["id"] == wb["id"] and x["k"] == "drone" for x in m["l"]))
    check(pa is not None, "Alice receives Bob's state")
    if pa:
        bob = [x for x in pa["l"] if x["id"] == wb["id"]][0]
        check(abs(bob["lat"] + 4.60) < 1e-6 and bob["th"] == 0.4 and bob["n"] == "Bob", "state fields preserved", json.dumps(bob)[:90])
    # garbage data
    await a.send(json.dumps({"t": "s", "lat": "NaN", "lon": 1e30})); await a.send("not json"); await a.send(json.dumps({"t": "chat", "text": "x" * 500}))
    ch = await recv_until(b, lambda m: m["t"] == "chat")
    check(ch and len(ch["text"]) == 200 and ch["name"] == "Alicescript", "chat: truncation to 200 characters", str(ch and len(ch["text"])))
    await a.send(json.dumps({"t": "ping", "lat": -4.5, "lon": 137.5}))
    pg = await recv_until(b, lambda m: m["t"] == "ping")
    check(pg and pg["lat"] == -4.5, "the marker arrives")
    await a.send(json.dumps({"t": "give", "to": wb["id"], "amt": 2.5}))
    gv = await recv_until(b, lambda m: m["t"] == "give")
    check(gv and gv["amt"] == 2.5 and gv["from"] == wa["id"], "energy transfer reaches the recipient")
    # a player in another room is not visible
    c = await websockets.connect(URL); await c.send(json.dumps({"t": "hello", "name": "Moony", "kind": "walker", "body": "moon"}))
    await recv_until(c, lambda m: m["t"] == "welcome"); 
    await c.send(json.dumps({"t": "chat", "text": "hello moon"}))
    leak = await recv_until(a, lambda m: m["t"] == "chat" and m["text"] == "hello moon", 1.0)
    check(leak is None, "rooms are isolated (Moon/Mars)")
    # REST
    import urllib.request
    r = json.loads(urllib.request.urlopen("http://127.0.0.1:8000/api/players?body=mars").read())
    check(r["online"] == 2 and len(r["players"]) >= 1, "REST /api/players", str(r["online"]))
    await b.close()
    lv = await recv_until(a, lambda m: m["t"] == "leave")
    check(lv and lv["name"] == "Bob", "leave on disconnect")
    await a.close(); await c.close()
    print("\nAll checks passed" if ok_all else "\nTHERE ARE FAILURES"); sys.exit(0 if ok_all else 1)
asyncio.run(main())
