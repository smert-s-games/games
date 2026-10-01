"""Build a Yandex Games archive from a template and a game folder.

Usage:
  py -3 platform/build.py garden-merge
  py -3 platform/build.py
"""

import html
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAFE_NAME = re.compile(r"^[A-Za-z0-9._/-]+$")


def fail(message):
    raise SystemExit(message)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing file: {path.relative_to(ROOT)}")
    except json.JSONDecodeError as err:
        fail(f"bad json {path.relative_to(ROOT)}: {err}")


def validate(game_dir, content):
    contract = read_json(ROOT / "templates" / "merge" / "contract.json")
    items = content.get("items") or []
    if len(items) < 3:
        fail("content needs at least 3 items")
    for index, item in enumerate(items, start=1):
        name = item.get("name") or {}
        if not name.get("ru") or not name.get("en"):
            fail(f"item {index} needs name.ru and name.en")
        image = game_dir / "theme" / "images" / f"item-{index}.png"
        if not image.is_file() or image.stat().st_size == 0:
            fail(f"missing {image.relative_to(ROOT)}")
    background = game_dir / "theme" / "images" / "bg.png"
    if not background.is_file():
        fail(f"missing {background.relative_to(ROOT)}")

    for relative in contract["files"]:
        if not (game_dir / relative).is_file():
            fail(f"missing {relative}")

    theme = read_json(game_dir / "theme" / "theme.json")
    for key in contract["themeKeys"]:
        if key not in theme:
            fail(f"theme.json missing {key}")

    bundles = {}
    for code in ("ru", "en"):
        bundles[code] = read_json(game_dir / "theme" / "texts" / f"{code}.json")
        missing = [key for key in contract["textKeys"] if key not in bundles[code]]
        if missing:
            fail(f"texts/{code}.json missing {', '.join(missing)}")

    for level_number, level in enumerate(content.get("levels") or [], start=1):
        goal = level.get("goalTier")
        if not isinstance(goal, int) or goal < 2 or goal > len(items):
            fail(f"level {level_number} goalTier is out of range")
        cols = level.get("cols")
        rows = level.get("rows")
        if not isinstance(cols, int) or not isinstance(rows, int) or not (3 <= cols <= 8 and 3 <= rows <= 8):
            fail(f"level {level_number} grid must be from 3x3 to 8x8")
        if not isinstance(level.get("moves"), int) or level["moves"] < 1:
            fail(f"level {level_number} needs moves")
        for tier in list(level.get("spawn") or []) + list(level.get("seed") or []):
            if not isinstance(tier, int) or tier < 1 or tier >= goal:
                fail(f"level {level_number} spawn/seed tier {tier} must be below the goal")
    return theme


def theme_style(theme):
    mapping = {
        "background": "--background",
        "board": "--board",
        "cell": "--cell",
        "accent": "--accent",
        "text": "--text",
        "hudText": "--hud-text",
        "danger": "--danger",
    }
    parts = []
    for key, css_name in mapping.items():
        if key in theme:
            parts.append(f"{css_name}: {theme[key]};")
    return " ".join(parts)


def build(slug):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        fail(f"bad game id: {slug}")
    game_dir = ROOT / "games" / slug
    if not game_dir.is_dir():
        fail(f"no game folder games/{slug}")
    meta = read_json(game_dir / "game.json")
    if meta.get("template") != "merge":
        fail("this builder currently supports template merge")
    if meta.get("id") != slug:
        fail("game.json id must match the folder name")
    content = read_json(game_dir / "content" / "game.json")
    theme = validate(game_dir, content)

    out = ROOT / "dist" / slug
    if out.exists():
        shutil.rmtree(out)
    (out / "js").mkdir(parents=True)
    shutil.copy(ROOT / "platform" / "yandex.js", out / "js" / "yandex.js")
    for name in ("merge.js", "view.js", "main.js"):
        shutil.copy(ROOT / "templates" / "merge" / "engine" / name, out / "js" / name)
    shutil.copy(ROOT / "templates" / "merge" / "shell.css", out / "shell.css")
    shutil.copytree(game_dir / "content", out / "content")
    shutil.copytree(game_dir / "theme", out / "theme")

    title = (meta.get("title") or {}).get("ru") or (meta.get("title") or {}).get("en") or slug
    page = (ROOT / "templates" / "merge" / "index.html").read_text(encoding="utf-8")
    page = page.replace("{{TITLE}}", html.escape(title))
    page = page.replace("{{GAME_ID}}", slug)
    page = page.replace("{{TITLE_JSON}}", json.dumps(meta.get("title") or {"ru": title}, ensure_ascii=False))
    page = page.replace("{{THEME_STYLE}}", theme_style(theme))
    (out / "index.html").write_text(page, encoding="utf-8")

    for path in out.rglob("*"):
        if path.is_file():
            relative = path.relative_to(out).as_posix()
            if not SAFE_NAME.fullmatch(relative):
                fail(f"file name must be latin without spaces: {relative}")

    size = sum(path.stat().st_size for path in out.rglob("*") if path.is_file())
    if size > 100 * 1024 * 1024:
        fail("unpacked game is over 100 MB")

    zip_path = ROOT / "dist" / f"{slug}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in out.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(out).as_posix())
    names = zipfile.ZipFile(zip_path).namelist()
    if "index.html" not in names:
        fail("archive root is missing index.html")
    if any(name == "sdk.js" or name.endswith("/sdk.js") for name in names):
        fail("do not put sdk.js into the archive; Yandex serves /sdk.js")
    print(f"{slug}: {out} ({size} bytes) -> {zip_path}")


def main():
    if len(sys.argv) > 1:
        build(sys.argv[1])
        return
    games = sorted(path.name for path in (ROOT / "games").iterdir() if path.is_dir())
    if not games:
        fail("games folder is empty")
    for slug in games:
        build(slug)


if __name__ == "__main__":
    main()
