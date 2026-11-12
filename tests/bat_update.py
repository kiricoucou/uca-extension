"""Teste maj-extension.bat sans droits administrateur : dossier d'extension « ancien » dans un dossier temporaire,
le script télécharge le ZIP publié (HTTPS) et remplace les fichiers. Nécessite le réseau (GitHub Pages) ; sans réseau, ignoré.

Usage : python -I -X utf8 tests/bat_update.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def run(bat, cwd, *args):
    env = dict(os.environ, MYUCA_NOPAUSE="1", LOCALAPPDATA=str(cwd / "appdata"))
    return subprocess.run(["cmd", "/c", str(bat), *args], cwd=cwd, env=env, capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=180)


def main():
    if os.name != "nt":
        print("ignoré : Windows seulement"); return
    try:
        urllib.request.urlopen("https://kiricoucou.github.io/uca-extension/extension/uca-extension-chrome.zip", timeout=15).close()
    except Exception as e:
        print("ignoré : GitHub Pages injoignable", e); return
    src = (ROOT / "extension" / "maj-extension.bat").read_bytes()
    check("fin de ligne CRLF (obligatoire pour cmd)", src.count(b"\r\n") == src.count(b"\n"))
    check("aucun droit administrateur demandé", b"RunAs" not in src and b"-Verb" not in src and b"HKLM" not in src and b"schtasks" not in src)
    tmp = Path(tempfile.mkdtemp(prefix="uca-bat-"))
    try:
        ext = tmp / "ext dossier"  # espace dans le chemin : cas réel
        ext.mkdir()
        m = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8")); m["version"] = "1.0.0"
        (ext / "manifest.json").write_text(json.dumps(m), encoding="utf-8")
        (ext / "fichier-perso.txt").write_text("à garder", encoding="utf-8")
        (ext / "maj-extension.bat").write_bytes(src)
        r = run(ext / "maj-extension.bat", tmp)
        out = r.stdout + r.stderr
        new = json.loads((ext / "manifest.json").read_text(encoding="utf-8"))["version"]
        check("mise à jour réussie (code 0)", r.returncode == 0, out[-400:])
        check("version remplacée depuis le ZIP publié", new != "1.0.0", new)
        check("le dossier contient le code de l'extension", (ext / "background.js").exists() and (ext / "core").is_dir())
        check("fichier perso conservé", (ext / "fichier-perso.txt").exists())
        check("le script lui-même n'est pas écrasé", (ext / "maj-extension.bat").read_bytes() == src)
        check("dossier mémorisé pour les prochaines fois", (tmp / "appdata" / "MyUCA" / "dossier-extension.txt").exists())
        r2 = run(ext / "maj-extension.bat", tmp)
        check("2e lancement : déjà à jour", r2.returncode == 0 and "Deja a jour" in r2.stdout, r2.stdout[-300:])
        r3 = run(ext / "maj-extension.bat", tmp, "/force")
        check("/force réinstalle", r3.returncode == 0 and "OK :" in r3.stdout, r3.stdout[-300:])
        r4 = run(ext / "maj-extension.bat", tmp, str(tmp / "n-existe-pas"))
        check("mauvais dossier : échec propre, rien cassé", r4.returncode != 0 and (ext / "manifest.json").exists(), r4.stdout[-300:])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
