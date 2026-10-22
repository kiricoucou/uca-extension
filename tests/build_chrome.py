"""Construit le paquet Chrome/Edge de l'extension (manifest.json tel quel) dans dist/chrome-<version>.zip,
avec les mêmes exclusions que le paquet Firefox (tests, app téléphone, pages du site, dépôt git...).

Usage : python -I -X utf8 tests/build_chrome.py [--store]   (--store : paquet du Chrome Web Store, voir build_firefox.py)
"""
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_firefox import ROOT, should_copy, store_manifest  # noqa: E402


def main():
    store = "--store" in sys.argv[1:]
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    zip_path = out / f"uca-extension-chrome-{'store-' if store else ''}{manifest['version']}.zip"
    n = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for src in sorted(ROOT.rglob("*")):
            if not src.is_file() or not should_copy(src):
                continue
            rel = src.relative_to(ROOT)
            if rel.as_posix() == "manifest.json" and store:
                z.writestr("manifest.json", json.dumps(store_manifest(manifest, firefox=False), indent=2, ensure_ascii=False) + "\n")
            else:
                z.write(src, rel)
            n += 1
        if store:
            z.writestr("store-build.txt", "paquet des magasins : pas de vérification de mise à jour via GitHub\n")
            n += 1
    print(f"paquet : {zip_path} ({n} fichiers, {zip_path.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
