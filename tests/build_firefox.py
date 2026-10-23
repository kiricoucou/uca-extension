"""Construit le paquet Firefox de l'extension (manifest.firefox.json -> manifest.json) dans
dist/firefox/, puis un .zip prêt pour about:debugging ("Charger un module complémentaire
temporaire") ou pour un dépôt sur addons.mozilla.org.

Usage : python -I -X utf8 tests/build_firefox.py [--store]
  (sans option) : paquet de développement / installation manuelle (vérification des mises à jour via GitHub).
  --store       : paquet pour addons.mozilla.org (dist/uca-extension-firefox-store-<version>.zip) : pas de vérificateur
                  de mises à jour GitHub (le magasin met à jour tout seul), permissions réduites au strict nécessaire.
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
EXCLUDE_DIRS = {".git", ".github", ".claude", ".impeccable", "tests", "app", "dist", "store", "en", "__pycache__"}
EXCLUDE_FILES = {"manifest.firefox.json", ".gitignore", ".nojekyll", "app.webmanifest", "sw.js"}
# Pages du site public, à la racine seulement (designs/<id>/aide.html reste dans le paquet).
EXCLUDE_ROOT_FILES = {"index.html", "install.html", "aide.html", "404.html", "confidentialite.html", "site.css", "site-demo.js", "nouveautes.html", "sitemap.xml", "robots.txt"}
EXCLUDE_SUFFIXES = {".pyc"}


STORE_SITE = "https://kiricoucou.github.io/uca-extension/*"


def store_manifest(manifest: dict, firefox: bool) -> dict:
    """Manifeste du paquet des magasins : le strict nécessaire, rien pour le développement."""
    m = json.loads(json.dumps(manifest))
    # Les mises à jour passent par le magasin : plus d'accès à raw.githubusercontent.com.
    m["host_permissions"] = [h for h in m.get("host_permissions", []) if "githubusercontent" not in h]
    # Le pont avec l'app n'a de sens que sur le site publié (pas file://, ni localhost, réservés aux tests).
    for cs in m.get("content_scripts", []):
        cs["matches"] = [STORE_SITE]
    if firefox:
        gecko = m["browser_specific_settings"]["gecko"]
        gecko["strict_min_version"] = "140.0"  # première version qui connaît data_collection_permissions
        m["browser_specific_settings"]["gecko_android"] = {"strict_min_version": "142.0"}
    return m


def should_copy(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDE_DIRS for part in rel.parts):
        return False
    if rel.name in EXCLUDE_FILES:
        return False
    if len(rel.parts) == 1 and rel.name in EXCLUDE_ROOT_FILES:
        return False
    if rel.suffix in EXCLUDE_SUFFIXES:
        return False
    return True


def main():
    store = "--store" in sys.argv[1:]
    dist = ROOT / "dist" / ("firefox-store" if store else "firefox")
    if dist.exists():
        shutil.rmtree(dist)
    DIST = dist
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
    if store:
        manifest = store_manifest(manifest, firefox=True)
        (DIST / "store-build.txt").write_text("paquet des magasins : pas de vérification de mise à jour via GitHub\n", encoding="utf-8")
    (DIST / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    zip_path = ROOT / "dist" / f"uca-extension-firefox-{'store-' if store else ''}{manifest['version']}.zip"
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
