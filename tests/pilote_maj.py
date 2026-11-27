"""L'outil de mise à jour se met à jour lui-même et bloque toute version périmée.

Un faux site local publie une version « 99.0 » (un petit script qui note qu'il a été lancé, avec ses arguments). Les
signatures sont faites avec la vraie clé du projet (keystore local) : le test est ignoré sans keystore. Windows : le vrai
.bat ; Linux / macOS : le script sous Git Bash ou bash. Aucune extension réelle n'est touchée.

Usage : python -I -X utf8 tests/pilote_maj.py
"""
import http.server
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KS = ROOT / "app" / "webview-app" / "keystore" / "keystore.properties"
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


def sign(path, mode="sign-pilot"):
    subprocess.run(["java", str(ROOT / "tools" / "SignBundle.java"), mode, str(path), str(path) + ".sig", str(KS)], check=True, stdout=subprocess.DEVNULL)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(folder):
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(folder)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/"


def wait(cond, seconds=40):
    for _ in range(seconds * 4):
        if cond():
            return True
        time.sleep(0.25)
    return False


def windows(site, base, tmp):
    src = (ROOT / "extension" / "maj-extension.bat").read_bytes()
    marker = tmp / "lance.txt"
    stub = ('@echo off\r\nrem faux pilote d\'essai\r\nset "MYUCA_PILOT_VERSION=99.0"\r\n>"' + str(marker) + '" echo %~nx0 %*\r\nexit /b 0\r\n').encode("ascii")
    published = site / "maj-extension.bat"

    def publish(content, signed=True, tamper=False):
        published.write_bytes(content)
        sig = Path(str(published) + ".sig")
        sig.unlink(missing_ok=True)
        if signed:
            sign(published)
        if tamper:
            published.write_bytes(content.replace(b"faux pilote", b"autre pilote"))

    def old_pilot(folder, name="maj-extension-v2.4.bat"):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(src)
        marker.unlink(missing_ok=True)
        return folder / name

    def run(bat, *args, **extra):
        env = dict(os.environ, MYUCA_NOPAUSE="1", MYUCA_NOINSTALL="1", MYUCA_NOLAUNCH="1", LOCALAPPDATA=str(tmp / "appdata"), APPDATA=str(tmp / "roaming"), MYUCA_PILOT_URL=base + "maj-extension.bat")
        env.update(extra)
        return subprocess.run(["cmd", "/c", str(bat), *args], env=env, capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=240)

    nowhere = str(tmp / "pas-d-extension")
    dl = tmp / "Mes Telechargements"
    publish(stub)
    old = old_pilot(dl)
    r = run(old, "/browser", "chrome", "/yes", nowhere)
    ran = marker.read_text(encoding="utf-8", errors="replace").strip() if marker.exists() else ""
    check("Windows : version plus récente publiée : la nouvelle est téléchargée et lancée avec les mêmes arguments", ran.startswith("maj-extension-v99.0.bat") and "/browser chrome /yes" in ran and nowhere in ran, f"rc={r.returncode} {ran!r} {r.stdout[-500:]!r}")
    check("Windows : l'ancien fichier est supprimé, le nouveau est à côté", wait(lambda: not old.exists()) and (dl / "maj-extension-v99.0.bat").exists(), str(sorted(p.name for p in dl.iterdir())))
    check("Windows : le résultat de la nouvelle version est transmis", r.returncode == 0, f"rc={r.returncode}")

    for title, kwargs in (("fichier modifié après signature", dict(tamper=True)), ("signature absente", dict(signed=False))):
        publish(stub, **kwargs)
        old = old_pilot(tmp / title.replace(" ", "_"))
        r = run(old, "/yes", nowhere)
        check(f"Windows : {title} : rien n'est exécuté, l'ancien outil est BLOQUÉ et gardé", r.returncode == 5 and not marker.exists() and old.exists() and "OUTIL BLOQUE" in r.stdout and "pas-d-extension" not in r.stdout.split("OUTIL BLOQUE")[1], f"rc={r.returncode} ran={marker.exists()} {r.stdout[-500:]!r}")

    old = old_pilot(tmp / "hors_ligne")
    r = run(old, "/yes", nowhere, MYUCA_PILOT_URL="http://127.0.0.1:9/maj-extension.bat")
    check("Windows : vérification impossible : bloqué, avec la raison", r.returncode == 5 and "Impossible" in r.stdout and old.exists(), f"rc={r.returncode} {r.stdout[-300:]!r}")

    publish(src, signed=False)
    r = run(old_pilot(tmp / "a_jour"), "/yes", nowhere)
    check("Windows : même version publiée : l'outil continue normalement", r.returncode == 2 and "OUTIL BLOQUE" not in r.stdout, f"rc={r.returncode} {r.stdout[-400:]!r}")
    publish(src.replace(b'MYUCA_PILOT_VERSION=2.', b'MYUCA_PILOT_VERSION=1.'), signed=False)
    r = run(old_pilot(tmp / "plus_vieux"), "/yes", nowhere)
    check("Windows : version publiée plus ancienne : jamais de retour en arrière", r.returncode == 2, f"rc={r.returncode}")

    publish(stub)
    gitdir = tmp / "projet"; (gitdir / ".git").mkdir(parents=True)
    old = old_pilot(gitdir / "extension", "maj-extension.bat")
    r = run(old, "/yes", nowhere)
    time.sleep(6)
    check("Windows : fichier d'un dossier git : remplacé par une copie temporaire, jamais supprimé", marker.exists() and old.exists(), f"{marker.exists()} {old.exists()} {r.stdout[-300:]!r}")

    # comme au double-clic : fenêtres seulement
    publish(stub, signed=False)
    shots = tmp / "photos"; shots.mkdir()
    env = {k: v for k, v in os.environ.items() if k not in ("MYUCA_NOPAUSE", "MYUCA_AUTO")}
    env.update(MYUCA_SHOTDIR=str(shots), MYUCA_NOINSTALL="1", MYUCA_NOLAUNCH="1", LOCALAPPDATA=str(tmp / "appdata"), MYUCA_PILOT_URL=base + "maj-extension.bat")
    old = old_pilot(tmp / "double_clic")
    subprocess.run(["cmd", "/c", str(old)], env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=240)
    check("Windows : blocage affiché dans une fenêtre", (shots / "resultat-error.png").exists() and not marker.exists(), str(sorted(p.name for p in shots.iterdir())))
    keep = os.environ.get("UCA_KEEP_SHOTS")
    if keep:
        shutil.copytree(shots, keep, dirs_exist_ok=True)

    publish(stub)
    old = old_pilot(tmp / "double_clic_maj")
    shutil.rmtree(shots); shots.mkdir()
    subprocess.run(["cmd", "/c", str(old)], env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=240)
    check("Windows : double-clic sur un outil périmé : remplacé, supprimé et nouvelle version lancée", wait(lambda: marker.exists()) and wait(lambda: not old.exists()), f"lancé={marker.exists()} ancien={old.exists()}")


def shell(site, base, tmp):
    bash = shutil.which("bash") if os.name != "nt" else r"C:\Program Files\Git\bin\bash.exe"
    if not bash or not Path(bash).exists():
        print("ignoré : bash introuvable")
        return

    def posix(p):
        s = str(p).replace("\\", "/")
        return "/" + s[0].lower() + s[2:] if os.name == "nt" else s

    src = (ROOT / "extension" / "maj-extension.sh").read_bytes()
    marker = tmp / "lance-sh.txt"
    stub = ('#!/usr/bin/env bash\n# faux pilote d\'essai\nPILOT_VERSION="99.0"\nprintf "%s\\n" "$*" > "' + posix(marker) + '"\n').encode("ascii")
    published = site / "maj-extension.sh"

    def publish(content, signed=True, tamper=False):
        published.write_bytes(content)
        Path(str(published) + ".sig").unlink(missing_ok=True)
        if signed:
            sign(published)
        if tamper:
            published.write_bytes(content.replace(b"faux pilote", b"autre pilote"))

    def run(script, *args, url=None):
        env = dict(os.environ, UCA_FAKE_OS="Linux", UCA_NOLAUNCH="1", UCA_NOINSTALL="1", HOME=posix(tmp / "home"), XDG_CONFIG_HOME=posix(tmp / "home" / ".config"), UCA_PILOT_URL=url or base + "maj-extension.sh")
        return subprocess.run([bash, posix(script), *args], env=env, capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=240)

    def old_pilot(folder):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "maj-extension-v2.4.sh").write_bytes(src)
        marker.unlink(missing_ok=True)
        return folder / "maj-extension-v2.4.sh"

    publish(stub)
    old = old_pilot(tmp / "linux ok")
    r = run(old, "--browser", "brave", "--yes", posix(tmp / "rien"))
    ran = marker.read_text(encoding="utf-8").strip() if marker.exists() else ""
    check("Linux / macOS : nouvelle version signée : téléchargée, ancienne supprimée, lancée avec les mêmes arguments", "--browser brave --yes" in ran and not old.exists() and (old.parent / "maj-extension-v99.0.sh").exists(), f"rc={r.returncode} {ran!r} {r.stdout[-400:]!r} {r.stderr[-300:]!r}")
    for title, kwargs in (("fichier modifié après signature", dict(tamper=True)), ("signature absente", dict(signed=False))):
        publish(stub, **kwargs)
        old = old_pilot(tmp / ("sh " + title))
        r = run(old, "--yes", posix(tmp / "rien"))
        check(f"Linux / macOS : {title} : bloqué, rien exécuté", r.returncode == 5 and not marker.exists() and old.exists() and "BLOQU" in r.stdout, f"rc={r.returncode} {r.stdout[-400:]!r}")
    old = old_pilot(tmp / "sh hors ligne")
    r = run(old, "--yes", posix(tmp / "rien"), url="http://127.0.0.1:9/x.sh")
    check("Linux / macOS : vérification impossible : bloqué", r.returncode == 5, f"rc={r.returncode} {r.stdout[-300:]!r}")
    publish(src, signed=False)
    r = run(old_pilot(tmp / "sh a jour"), "--yes", posix(tmp / "rien"))
    check("Linux / macOS : même version publiée : continue normalement", r.returncode == 2, f"rc={r.returncode} {r.stdout[-300:]!r}")


def main():
    if not KS.exists():
        print("ignoré : keystore absent (impossible de signer les pilotes d'essai)")
        sys.exit(0)
    for name in ("maj-extension.bat", "maj-extension.sh", "maj-extension.command"):
        sig = ROOT / "extension" / (name + ".sig")
        ok = sig.exists() and subprocess.run(["java", str(ROOT / "tools" / "SignBundle.java"), "verify-pilot", str(ROOT / "extension" / name), str(sig), str(KS)], capture_output=True).returncode == 0
        check(f"fichier publié {name} : signature présente et valable", ok)
    tmp = Path(tempfile.mkdtemp(prefix="uca-pilote-maj-"))
    site = tmp / "site"; site.mkdir()
    server, base = serve(site)
    try:
        if os.name == "nt":
            windows(site, base, tmp)
        shell(site, base, tmp)
    finally:
        server.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
