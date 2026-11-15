# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Builds the 7-slide demo deck (HTML and PDF) from docs/demo/index.template.html and the exported atlas data.

Usage:
    python tools/build_demo.py --members "Name One, Name Two" --repo https://github.com/ACCOUNT/analog-atlas --live https://ACCOUNT.github.io/analog-atlas/atlas/

Needs Google Chrome (headless) for the PDF. Output: docs/demo/index.html and docs/demo/AnalogAtlas_Demo.pdf
"""
import argparse
import base64
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "docs" / "demo"
DATA = ROOT / "docs" / "atlas" / "data"
CHROME_CANDIDATES = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
MOON, MARS = "shackleton", "protonilus"
PAIRS = {"a": MOON, "b": "jezero"}


def png_from_b64(b64: str, path: Path, size: int = 480) -> None:
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("L").resize((size, size), Image.BICUBIC)
    img.save(path, optimize=True)


def results(html: str) -> str:
    meta = json.loads((DATA / "meta.json").read_text())
    targets = {t["id"]: t for t in json.loads((DATA / "targets.json").read_text())}
    thumbs = json.loads((DATA / "thumbs.json").read_text())
    hl = json.loads((DATA / "highlights.json").read_text())
    val = json.loads((DATA / "validation.json").read_text()) if (DATA / "validation.json").exists() else {}

    def rows(tid):
        out = []
        for n, h in enumerate(hl[tid]["distinct"][:5], 1):
            st = '<span class="new">less-studied</span>' if h["known_km"] > 120 else '<span class="kn">near known site</span>'
            out.append(f'<tr><td>{n}</td><td>{h["country"]}<br><span class="small">{abs(h["lat"]):.1f}°{"S" if h["lat"] < 0 else "N"}, {abs(h["lon"]):.1f}°{"W" if h["lon"] < 0 else "E"}</span></td><td>{st}</td><td class="s">{h["total"] * 100:.0f}</td></tr>')
        return "".join(out)

    def headline(tid):
        ctr = []
        for h in hl[tid]["distinct"][:4]:
            if h["country"] not in ctr:
                ctr.append(h["country"])
        return ", ".join(ctr[:3])

    subs = {
        "@@N@@": f'{meta["n"]:,}', "@@N_K@@": f'{meta["n"] // 1000}k',
        "@@MOON_T@@": targets[MOON]["name"], "@@MARS_T@@": targets[MARS]["name"],
        "@@MOON_H@@": headline(MOON), "@@MARS_H@@": headline(MARS),
        "@@MOON_ROWS@@": rows(MOON), "@@MARS_ROWS@@": rows(MARS),
    }
    for key, tid in PAIRS.items():
        top = hl[tid]["distinct"][0]
        subs[f"@@PAIR_{key.upper()}_T@@"] = targets[tid]["name"] + (" (Moon)" if targets[tid]["body"] == "moon" else " (Mars)")
        subs[f"@@PAIR_{key.upper()}_E@@"] = f'{top["country"]} · score {top["total"] * 100:.0f}'
        (DEMO / "img").mkdir(exist_ok=True)
        png_from_b64(targets[tid]["thumb"], DEMO / "img" / f"pair_{key}_target.png")
        t = thumbs.get(str(top["i"]))
        if t:
            png_from_b64(t, DEMO / "img" / f"pair_{key}_earth.png")
    src = DEMO / "img" / "atlas_shackleton.jpg"
    if src.exists():                                           # map-only crop for the title slide
        Image.open(src).crop((433, 62, 1457, 1080)).save(DEMO / "img" / "atlas_map_only.jpg", quality=90)
    if val:
        worst = min(v["known_percentile"] for v in val.values())
        share = sum(v["known_in_top5"] / v["n_known"] for v in val.values()) / len(val) * 100
        subs["@@VALID@@"] = (f"for all {len(val)} targets the best score near a well-known analog site is in the top {100 - worst:.1f}% of all {meta['n']:,} windows, "
                             f"and on average {share:.0f}% of well-known sites have a window in the top 5%. New places appear next to them.")
    else:
        subs["@@VALID@@"] = "known analog sites are labelled and compared."
    for k, v in subs.items():
        html = html.replace(k, v)
    return html


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", default="[add team member names]")
    ap.add_argument("--repo", default="[add public repository link]")
    ap.add_argument("--live", default="[add link to the live tool]")
    a = ap.parse_args()
    html = (DEMO / "index.template.html").read_text(encoding="utf-8")
    html = html.replace("{{MEMBERS}}", a.members).replace("{{REPO}}", a.repo).replace("{{LIVE}}", a.live)
    html = results(html)
    out_html = DEMO / "index.html"
    out_html.write_text(html, encoding="utf-8")
    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        print("Chrome not found: open docs/demo/index.html in a browser and print to PDF (page size 1920x1080 px, no margins).")
        return 1
    pdf = DEMO / "AnalogAtlas_Demo.pdf"
    with tempfile.TemporaryDirectory() as prof:
        subprocess.run([chrome, "--headless=new", "--disable-gpu", f"--user-data-dir={prof}", "--no-pdf-header-footer",
                        f"--print-to-pdf={pdf}", "--virtual-time-budget=8000", out_html.as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    print("wrote", out_html, "and", pdf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
