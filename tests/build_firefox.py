"""Construit le paquet Firefox de l'extension (manifest.firefox.json -> manifest.json) dans
dist/firefox/, puis un .zip prêt pour about:debugging ("Charger un module complémentaire
temporaire") ou pour un dépôt sur addons.mozilla.org.

Usage : python -I -X utf8 tests/build_firefox.py
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "firefox"

# Fichiers/dossiers de dev jamais envoyés dans le paquet de l'extension (tests, app téléphone,
# dépôt git, scratch...). Tout le reste de la racine est inclus.
EXCLUDE_DIRS = {".git", ".github", ".claude", ".impeccable", "tests", "app", "dist", "__pycache__"}
EXCLUDE_FILES = {"manifest.firefox.json", ".gitignore", ".nojekyll", "app.webmanifest", "sw.js"}
EXCLUDE_SUFFIXES = {".pyc"}


def should_copy(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDE_DIRS for part in rel.parts):
        return False
    if rel.name in EXCLUDE_FILES:
        return False
    if rel.suffix in EXCLUDE_SUFFIXES:
        return False
    return True


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    for src in ROOT.rglob("*"):
        if src.is_dir():
            continue
        if not should_copy(src):
            continue
        rel = src.relative_to(ROOT)
        dest = DIST / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)

    manifest = json.loads((ROOT / "manifest.firefox.json").read_text(encoding="utf-8"))
    (DIST / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    zip_path = ROOT / "dist" / f"uca-extension-firefox-{manifest['version']}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in DIST.rglob("*"):
            if f.is_file():
                z.write(f, f.relative_to(DIST))

    n = sum(1 for _ in DIST.rglob("*") if _.is_file())
    print(f"dossier : {DIST} ({n} fichiers)")
    print(f"paquet  : {zip_path} ({zip_path.stat().st_size // 1024} Ko)")
    print("Charger : about:debugging#/runtime/this-firefox -> Charger un module complémentaire temporaire -> manifest.json du dossier,")
    print("ou déposer le .zip sur https://addons.mozilla.org/developers/addon/submit/")


if __name__ == "__main__":
    main()
