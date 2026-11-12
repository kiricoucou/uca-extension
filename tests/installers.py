"""Teste les installateurs (extension/installer-windows.bat, install-linux.sh, installer-mac.command) contre un serveur local,
sans ouvrir de navigateur ni toucher aux vrais profils : crochets de test des scripts (MYUCA_AUTO / MYUCA_NOLAUNCH / MYUCA_FFPROFILE /
MYUCA_CFGDIR pour Windows ; UCA_YES / UCA_NO_OPEN / UCA_BASE_URL pour Linux et macOS, avec des « stubs » open / osascript / defaults).

Usage : python -I -X utf8 tests/installers.py        (Windows : les 3 ; ailleurs : Linux et macOS seulement, via bash)
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8793
URL = f"http://localhost:{PORT}"
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("OK   " if ok else "FAIL ") + name + (f" : {detail}" if detail and not ok else ""))


def find_bash():
    """Git Bash sous Windows (le bash.exe de System32 est WSL : autres chemins), bash ailleurs."""
    if os.name == "nt":
        for c in ("C:/Program Files/Git/bin/bash.exe", "C:/Program Files (x86)/Git/bin/bash.exe"):
            if os.path.exists(c):
                return c
        return None
    return shutil.which("bash")


def version():
    return json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]


def test_windows(tmp):
    if os.name != "nt":
        return
    bat = ROOT / "extension" / "installer-windows.bat"
    s = bat.read_bytes().decode("utf-8").replace("\r\n", "\n")
    ps = tmp / "inst.ps1"
    ps.write_bytes(b"\xef\xbb\xbf" + s[s.index("\n#PS-START"):].encode("utf-8"))
    ff = tmp / "ff"; ff.mkdir()
    env = dict(os.environ, MYUCA_URL=URL, MYUCA_AUTO="1", MYUCA_NOLAUNCH="1", MYUCA_INSTALL=str(tmp / "inst"), MYUCA_DL=str(tmp / "dl"),
               MYUCA_BROWSERS="chrome,edge,brave,vivaldi,firefox", MYUCA_FFPROFILE=str(ff), MYUCA_FFEDITION="aurora", MYUCA_CFGDIR=str(tmp / "cfg"))
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", str(ps)], env=env, capture_output=True, text=True, timeout=180)
    check("windows : installateur (mode automatique) termine sans erreur", r.returncode == 0 and "AUTO OK" in r.stdout, (r.stdout + r.stderr)[-400:])
    check("windows : paquet Chrome installé", (tmp / "inst" / "chrome" / "manifest.json").exists())
    check("windows : paquet Firefox installé", (tmp / "inst" / "firefox" / "manifest.json").exists())
    check("windows : ZIP téléchargés dans le dossier choisi", (tmp / "dl" / "uca-extension-chrome.zip").exists())
    check("windows : version installée = version publiée", f'"version": "{version()}"' in (tmp / "inst" / "chrome" / "manifest.json").read_text(encoding="utf-8"))
    check("windows : .xpi + user.js dans le profil Firefox", (ff / "extensions").exists() and "signatures.required" in (ff / "user.js").read_text(encoding="utf-8"))
    check("windows : dossier mémorisé pour maj-extension.bat", (tmp / "cfg" / "dossier-extension.txt").exists())


def test_linux(tmp):
    bash = find_bash()
    if not bash:
        return
    home = tmp / "lhome"; (home / ".mozilla" / "firefox" / "abc.default").mkdir(parents=True)
    (home / ".mozilla" / "firefox" / "profiles.ini").write_text("[Install1]\nDefault=abc.default\n\n[Profile0]\nName=d\nIsRelative=1\nPath=abc.default\nDefault=1\n")
    bind = tmp / "lbin"; bind.mkdir()
    (bind / "firefox-developer-edition").write_text('#!/bin/sh\necho "Mozilla Firefox 130.0 Developer Edition"\n'); (bind / "firefox-developer-edition").chmod(0o755)
    env = dict(os.environ, HOME=home.as_posix(), PATH=bind.as_posix() + os.pathsep + os.environ["PATH"], UCA_YES="1", UCA_NO_OPEN="1", UCA_BASE_URL=URL + "/extension", UCA_DIR=(tmp / "lext").as_posix())
    r = subprocess.run([bash, (ROOT / "extension" / "install-linux.sh").as_posix()], env=env, capture_output=True, text=True, timeout=120)
    check("linux : installateur termine sans erreur", r.returncode == 0, (r.stdout + r.stderr)[-300:])
    check("linux : extension Chrome installée", (tmp / "lext" / "manifest.json").exists())
    check("linux : extension Firefox installée (.xpi permanent)", any((home / ".mozilla/firefox/abc.default/extensions").glob("*.xpi")))


def test_mac(tmp):
    bash = find_bash()
    if not bash:
        return
    home = tmp / "mhome"
    for a in ("Brave Browser.app", "Google Chrome.app", "Firefox Developer Edition.app"):
        (home / "Applications" / a).mkdir(parents=True)
    prof = home / "Library" / "Application Support" / "Firefox"; (prof / "Profiles" / "p1").mkdir(parents=True)
    (prof / "profiles.ini").write_text("[Install1]\nDefault=Profiles/p1\n")
    bind = tmp / "mbin"; bind.mkdir(); log = tmp / "mac-calls.log"
    for c in ("osascript", "open", "pbcopy"):
        (bind / c).write_text(f'#!/bin/sh\necho "{c} $*" >> "{log.as_posix()}"\n'); (bind / c).chmod(0o755)
    (bind / "defaults").write_text("#!/bin/sh\necho 157\n"); (bind / "defaults").chmod(0o755)
    (bind / "uname").write_text("#!/bin/sh\necho Darwin\n"); (bind / "uname").chmod(0o755)
    env = dict(os.environ, HOME=home.as_posix(), PATH=bind.as_posix() + os.pathsep + os.environ["PATH"], UCA_YES="1", UCA_BASE_URL=URL, UCA_FAKE_OS="Darwin")
    r = subprocess.run([bash, (ROOT / "extension" / "installer-mac.command").as_posix()], env=env, capture_output=True, text=True, timeout=120)
    check("mac : installateur termine sans erreur", r.returncode == 0, (r.stdout + r.stderr)[-300:])
    calls = log.read_text() if log.exists() else ""
    check("mac : Chrome ouvert en mode guidé (chrome://extensions + merci)", "-a Google Chrome --args chrome://extensions" in calls and "merci.html" in calls, calls[-300:])
    check("mac : Brave chargé avec --load-extension", "-n -a Brave Browser" in calls and "--load-extension=" in calls)
    check("mac : Firefox Developer Edition : .xpi dans le profil", any((prof / "Profiles" / "p1" / "extensions").glob("*.xpi")))


def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    tmp = Path(tempfile.mkdtemp(prefix="uca-inst-"))
    try:
        for fn in (test_windows, test_linux, test_mac):
            sub = tmp / fn.__name__; sub.mkdir()
            fn(sub)
    finally:
        srv.terminate(); shutil.rmtree(tmp, ignore_errors=True)
    for f in ("installer-mac.command", "install-linux.sh"):
        check(f"{f} : fins de ligne LF (pas de CRLF)", b"\r" not in (ROOT / "extension" / f).read_bytes())
    check("installer-windows.bat : fins de ligne CRLF", b"\r\n" in (ROOT / "extension" / "installer-windows.bat").read_bytes())
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
