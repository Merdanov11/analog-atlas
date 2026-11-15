# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Assemble the clean, self-contained Analog Atlas repository (only the work done for this challenge).

Usage:  python tools/make_repo.py --out /Users/emir/Desktop/analog-atlas [--live URL] [--repo URL]
"""
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "atlas" / "data"

COPY = [
    "analogs/__init__.py", "analogs/config.py", "analogs/common.py", "analogs/targets.py", "analogs/earth.py", "analogs/score.py",
    "analogs/export.py", "analogs/validate.py", "tests/atlas_parity.py", "tools/atlas_shots.py", "tools/build_demo.py", "tools/cdp.py", "LICENSE",
    "docs/atlas", "docs/index.html", "docs/.nojekyll", "docs/demo", "docs/SUBMISSION.md", "docs/ARCHITECTURE.md", "docs/SI_DISCLOSURE.md",
]


def results_md() -> str:
    targets = {t["id"]: t for t in json.loads((DATA / "targets.json").read_text())}
    hl = json.loads((DATA / "highlights.json").read_text())
    val = json.loads((DATA / "validation.json").read_text()) if (DATA / "validation.json").exists() else {}
    lines = ["Best *less-studied* places (outside the area of every well-known analog site or region in our list), balanced weights (terrain 0.5, environment 0.3, ice/wind/volcanism 0.2), distinct places at least 100 km apart. Scores are 0 to 100. Explore every site and weighting in the live tool.", ""]
    lines += ["| Site | Best less-studied places (score) |", "|---|---|"]
    for tid, t in targets.items():
        top = hl[tid]["distinct"][:3]
        txt = "; ".join(f'{h["country"]} ({abs(h["lat"]):.1f}°{"S" if h["lat"] < 0 else "N"}, {abs(h["lon"]):.1f}°{"W" if h["lon"] < 0 else "E"}) {h["total"] * 100:.0f}' for h in top)
        lines.append(f'| {t["name"]} ({"Moon" if t["body"] == "moon" else "Mars"}) | {txt} |')
    if val:
        lines += ["", "**Sanity check.** For each target we compared the best score reached inside the area of any well-known analog site or region with all Earth windows:", "",
                  "| Site | Best well-known site (score) | Percentile of that score among all windows | Well-known sites in the top 5% |", "|---|---|---|---|"]
        for tid, v in val.items():
            lines.append(f'| {targets[tid]["name"]} | {v["best_known_site"]} ({v["best_known"] * 100:.0f}) | {v["known_percentile"]:.1f} | {v["known_in_top5"]} of {v["n_known"]} |')
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--live", default="[add the GitHub Pages link after publishing]")
    ap.add_argument("--repo", default="[add the repository link]")
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for rel in COPY:
        src = ROOT / rel
        if not src.exists():
            continue
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))
        else:
            shutil.copy2(src, dst)
    readme = (ROOT / "docs" / "README_ATLAS.md").read_text(encoding="utf-8").replace("{{LIVE}}", a.live).replace("{{RESULTS}}", results_md())
    (out / "README.md").write_text(readme, encoding="utf-8")
    (out / "requirements.txt").write_text("numpy\nscipy\nrasterio\npillow\nwebsockets\n", encoding="utf-8")
    (out / ".gitignore").write_text(".venv/\n__pycache__/\n*.pyc\n.DS_Store\n/data/\n", encoding="utf-8")
    (out / "analogs" / "__init__.py").write_text("", encoding="utf-8")
    print("repository written to", out)


if __name__ == "__main__":
    main()
