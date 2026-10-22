"""Construit le paquet Chrome/Edge de l'extension (manifest.json tel quel) dans dist/chrome-<version>.zip,
avec les mêmes exclusions que le paquet Firefox (tests, app téléphone, pages du site, dépôt git...).

Usage : python -I -X utf8 tests/build_chrome.py
"""
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_firefox import ROOT, should_copy  # noqa: E402


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    zip_path = out / f"uca-extension-chrome-{manifest['version']}.zip"
    n = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for src in sorted(ROOT.rglob("*")):
            if src.is_file() and should_copy(src):
                z.write(src, src.relative_to(ROOT))
                n += 1
    print(f"paquet : {zip_path} ({n} fichiers, {zip_path.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
