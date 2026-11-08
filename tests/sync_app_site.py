"""Synchronise les pages web de l'extension vers les pages embarquées dans l'app Android
(app/webview-app/app/src/main/assets/legacy-site) : core/*.js, designs/<design>/*.html|js.

Seuls les fichiers qui existent déjà côté app sont copiés (l'app n'embarque pas tout : pas de settings.html, etc.).
Exclus : core/demo.js (démo du site, version différente côté app), manifestes et service worker.

Usage : python -I -X utf8 tests/sync_app_site.py          copie ce qui a changé
        python -I -X utf8 tests/sync_app_site.py --check  ne copie rien, échoue s'il reste des écarts (CI)
Ensuite : recompiler l'APK (gradlew assembleRelease) et/ou tests/build_ota.py pour la mise à jour automatique.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "app" / "webview-app" / "app" / "src" / "main" / "assets" / "legacy-site"
EXCLUDE = {"core/demo.js"}


def candidates():
    for src in sorted(ROOT.glob("core/*.js")):
        yield src
    for src in sorted(ROOT.glob("designs/*/*")):
        if src.is_file() and src.suffix in (".html", ".js"):
            yield src


def main():
    check = "--check" in sys.argv
    changed = []
    for src in candidates():
        rel = src.relative_to(ROOT).as_posix()
        dst = SITE / rel
        if rel in EXCLUDE or not dst.exists():
            continue
        if src.read_bytes() != dst.read_bytes():
            changed.append(rel)
            if not check:
                shutil.copyfile(src, dst)
    for rel in changed:
        print(("ÉCART  " if check else "copié  ") + rel)
    print(f"{len(changed)} fichier(s) {'en écart' if check else 'synchronisé(s)'}.")
    if check and changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
