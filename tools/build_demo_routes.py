# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Builds the 7-slide demo deck (HTML and PDF) from docs/demo/index.template.html.

Usage:
    python tools/build_demo.py --members "Name One, Name Two" --repo https://github.com/your-account/routes-beyond-earth

Needs Google Chrome (headless) for the PDF. Output: docs/routes_beyond_earth/demo/index.html and docs/demo/RoutesBeyondEarth_Demo.pdf
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "docs" / "routes_beyond_earth" / "demo"
CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", default="[add team member names]")
    ap.add_argument("--repo", default="[add public repository link]")
    a = ap.parse_args()
    html = (DEMO / "index.template.html").read_text(encoding="utf-8")
    html = html.replace("{{MEMBERS}}", a.members).replace("{{REPO}}", a.repo)
    out_html = DEMO / "index.html"
    out_html.write_text(html, encoding="utf-8")
    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        print("Chrome not found: open docs/routes_beyond_earth/demo/index.html in a browser and print to PDF (page size 1920x1080 px, no margins).")
        return 1
    pdf = DEMO / "RoutesBeyondEarth_Demo.pdf"
    with tempfile.TemporaryDirectory() as prof:
        subprocess.run([chrome, "--headless=new", "--disable-gpu", f"--user-data-dir={prof}", "--no-pdf-header-footer",
                        f"--print-to-pdf={pdf}", "--virtual-time-budget=8000", out_html.as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    print("wrote", out_html, "and", pdf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
