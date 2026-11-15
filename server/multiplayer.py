# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Онлайн-режим симулятора: комнаты по небесным телам, обмен состоянием игроков в реальном времени.

Протокол (JSON по WebSocket):
  клиент -> сервер
    {t:"hello", name, kind, body}                       вход в комнату
    {t:"s", lat, lon, alt, hd, p, r, v, sa, st, b, cr}   состояние (10 раз в секунду)
    {t:"chat", text}                                    сообщение всем в комнате
    {t:"ping", lat, lon}                                метка на карте для всех
    {t:"give", to, amt}                                 передать запас энергии игроку
  сервер -> клиент
    {t:"welcome", id, online, hue}   {t:"join"|"leave", ...}   {t:"p", l:[...]}   {t:"chat"|"ping"|"give", ...}

Сервер ничего не вычисляет по физике: он только пересылает состояние и ограничивает частоту и размер сообщений.
Каждый клиент сам моделирует свою технику, поэтому игроки видят друг друга и толкаются, как в обычной сетевой игре.
"""
from __future__ import annotations

import asyncio
import json
import math
import random
import re
import time

from fastapi import WebSocket, WebSocketDisconnect

KINDS = {"rover_crew", "rover_robot", "walker", "drone"}
STALE_S = 15.0
TICK = 0.1
MAX_PLAYERS = 64


class Player:
    def __init__(self, ws: WebSocket, pid: str, name: str, kind: str, body: str):
        self.ws, self.id, self.name, self.kind, self.body = ws, pid, name, kind, body
        self.hue = random.randint(0, 359)
        self.state: dict = {}
        self.last = 0.0           # время последнего состояния
        self.sent = 0.0           # время последней отправки состояния другим
        self.last_chat = 0.0
        self.msgs = 0
        self.win = time.time()

    def card(self) -> dict:
        return dict(id=self.id, name=self.name, kind=self.kind, hue=self.hue)

    def public(self) -> dict:
        s = self.state
        return dict(id=self.id, n=self.name, k=self.kind, h=self.hue, lat=s.get("lat"), lon=s.get("lon"), alt=s.get("alt"),
                    hd=s.get("hd"), p=s.get("p"), r=s.get("r"), v=s.get("v"), sa=s.get("sa"), st=s.get("st"), b=s.get("b"), cr=s.get("cr"), th=s.get("th"))


class Hub:
    def __init__(self):
        self.rooms: dict[str, dict[str, Player]] = {"moon": {}, "mars": {}}
        self.task: asyncio.Task | None = None

    # ---------------------------------------------------------------- утилиты
    @staticmethod
    def clean_name(raw) -> str:
        s = re.sub(r"[^\w .\-+]", "", str(raw or ""), flags=re.UNICODE).strip()[:18]
        return s or "Pilot-%04d" % random.randint(0, 9999)

    @staticmethod
    def num(x, lo=-1e9, hi=1e9):
        try:
            v = float(x)
        except (TypeError, ValueError):
            return None
        return v if math.isfinite(v) and lo <= v <= hi else None

    async def send(self, p: Player, msg: dict):
        try:
            await p.ws.send_text(json.dumps(msg, separators=(",", ":")))
        except Exception:
            pass

    async def broadcast(self, body: str, msg: dict, skip: str | None = None):
        for p in list(self.rooms[body].values()):
            if p.id != skip:
                await self.send(p, msg)

    def list_players(self, body: str | None = None) -> list[dict]:
        now = time.time()
        out = []
        for b, room in self.rooms.items():
            if body and b != body:
                continue
            for p in room.values():
                if p.state.get("lat") is not None and now - p.last < STALE_S:
                    d = p.public(); d["body"] = b; out.append(d)
        return out

    def online(self, body: str | None = None) -> int:
        return sum(len(r) for b, r in self.rooms.items() if not body or b == body)

    # ---------------------------------------------------------------- цикл рассылки
    def start(self):
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self.loop())

    async def loop(self):
        while True:
            await asyncio.sleep(TICK)
            now = time.time()
            for body, room in self.rooms.items():
                if len(room) < 2:
                    continue
                live = [p for p in room.values() if p.state.get("lat") is not None and now - p.last < STALE_S]
                if not live:
                    continue
                payload = json.dumps({"t": "p", "l": [p.public() for p in live]}, separators=(",", ":"))
                for p in list(room.values()):
                    try:
                        await p.ws.send_text(payload)
                    except Exception:
                        pass

    # ---------------------------------------------------------------- соединение
    async def handle(self, ws: WebSocket):
        await ws.accept()
        self.start()
        me: Player | None = None
        try:
            while True:
                raw = await ws.receive_text()
                if len(raw) > 2000:
                    continue
                try:
                    m = json.loads(raw)
                except ValueError:
                    continue
                t = m.get("t")
                if me is None:
                    if t != "hello":
                        continue
                    body = m.get("body") if m.get("body") in self.rooms else "moon"
                    if len(self.rooms[body]) >= MAX_PLAYERS:
                        await ws.close(code=1013); return
                    pid = "%06x" % random.getrandbits(24)
                    kind = m.get("kind") if m.get("kind") in KINDS else "rover_crew"
                    me = Player(ws, pid, self.clean_name(m.get("name")), kind, body)
                    self.rooms[body][pid] = me
                    await self.send(me, dict(t="welcome", id=pid, name=me.name, hue=me.hue, online=len(self.rooms[body]),
                                             players=[p.card() for p in self.rooms[body].values() if p.id != pid]))
                    await self.broadcast(body, dict(t="join", **me.card()), skip=pid)
                    continue
                now = time.time()
                if now - me.win > 1.0:
                    me.win, me.msgs = now, 0
                me.msgs += 1
                if me.msgs > 40:                       # не больше 40 сообщений в секунду
                    continue
                if t == "s":
                    lat, lon = self.num(m.get("lat"), -90, 90), self.num(m.get("lon"), -720, 720)
                    if lat is None or lon is None:
                        continue
                    me.state = dict(lat=lat, lon=lon, alt=self.num(m.get("alt"), -2e4, 2e5), hd=self.num(m.get("hd"), -10, 10),
                                    p=self.num(m.get("p"), -4, 4), r=self.num(m.get("r"), -4, 4), v=self.num(m.get("v"), -200, 200),
                                    sa=self.num(m.get("sa"), -2, 2), th=self.num(m.get("th"), 0, 1), st=str(m.get("st", ""))[:12], b=self.num(m.get("b"), 0, 1),
                                    cr=bool(m.get("cr")))
                    me.last = now
                    if m.get("kind") in KINDS and m.get("kind") != me.kind:
                        me.kind = m["kind"]
                elif t == "chat":
                    text = re.sub(r"\s+", " ", str(m.get("text", ""))).strip()[:200]
                    if text and now - me.last_chat > 0.6:
                        me.last_chat = now
                        await self.broadcast(me.body, dict(t="chat", id=me.id, name=me.name, hue=me.hue, text=text, ts=int(now)))
                elif t == "ping":
                    lat, lon = self.num(m.get("lat"), -90, 90), self.num(m.get("lon"), -720, 720)
                    if lat is not None and lon is not None:
                        await self.broadcast(me.body, dict(t="ping", id=me.id, name=me.name, hue=me.hue, lat=lat, lon=lon, ts=int(now)))
                elif t == "give":
                    tgt = self.rooms[me.body].get(str(m.get("to")))
                    amt = self.num(m.get("amt"), 0, 50)
                    if tgt and amt:
                        await self.send(tgt, dict(t="give", **{"from": me.id}, name=me.name, amt=amt))
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            if me:
                self.rooms[me.body].pop(me.id, None)
                await self.broadcast(me.body, dict(t="leave", id=me.id, name=me.name))


hub = Hub()
