"""Create a new merge game from the starter.

Usage:
  py -3 platform/new_game.py berry-lab
  py -3 platform/new_game.py berry-lab "Ягодная лавка"
"""

import json
import re
import shutil
import sys
from pathlib import Path

import art

ROOT = Path(__file__).resolve().parents[1]


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: py -3 platform/new_game.py <slug> [title]")
    slug = sys.argv[1]
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise SystemExit("slug must be lowercase latin, digits and hyphens")
    dest = ROOT / "games" / slug
    if dest.exists():
        raise SystemExit(f"already exists: games/{slug}")
    shutil.copytree(ROOT / "templates" / "merge" / "starter", dest)
    meta_path = dest / "game.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["id"] = slug
    if len(sys.argv) > 2:
        meta["title"]["ru"] = sys.argv[2]
        meta["title"]["en"] = sys.argv[2]
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    content = json.loads((dest / "content" / "game.json").read_text(encoding="utf-8"))
    art.generate(dest / "theme" / "images", len(content["items"]), "shapes", art.hue_from_slug(slug))
    print(f"created games/{slug}")
    print("replace theme/images, names in content/game.json, and the level goals before upload")


if __name__ == "__main__":
    main()
