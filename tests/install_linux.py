"""extension/install-linux.sh : installe l'extension (Chrome-like et Firefox) sans sudo, depuis des paquets servis en local.
Faux Firefox (release et Developer Edition) et faux profil dans un HOME temporaire ; aucune boîte de dialogue (UCA_YES=1).

Usage : python -I -X utf8 tests/install_linux.py        (nécessite bash)
"""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "extension" / "install-linux.sh"
def find_bash():
    """Git Bash de préférence sous Windows (le « bash » du PATH peut être WSL, qui ne comprend pas les chemins Windows)."""
    for c in (r"C:\Program Files\Gitinash.exe", r"C:\Program Files (x86)\Gitinash.exe"):
        if os.path.exists(c):
            return c
    return shutil.which("bash")


BASH = find_bash()
GECKO = "uca-connecteur@site-emploi-du-temps.local"
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def run(env_extra, home, path_dir, *args):
    env = dict(os.environ, HOME=home.as_posix(), UCA_YES="1", UCA_NO_OPEN="1", **env_extra)
    env["PATH"] = path_dir.as_posix() + os.pathsep + env["PATH"]
    return subprocess.run([BASH, SCRIPT.as_posix(), *args], env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL, timeout=240)


def main():
    if not BASH:
        print("ignoré : bash introuvable"); return
    src = SCRIPT.read_text(encoding="utf-8")
    check("fins de ligne LF (obligatoire pour bash)", "\r" not in src)
    check("aucune commande sudo / su / pkexec exécutée", not re.search(r"(^|[;&|(]\s*|\s)(sudo|su|pkexec|doas)\s+[-\w]", "\n".join(l for l in src.splitlines() if not l.strip().startswith("#") and "say " not in l and "warn " not in l)))
    check("refuse de tourner en root", 'id -u)" = "0"' in src)
    check("téléchargements en HTTPS uniquement (curl --proto =https)", "--proto =https" in src and "http://" not in src.replace("UCA_BASE_URL", ""))
    check("syntaxe bash valide", subprocess.run([BASH, "-n", SCRIPT.as_posix()], capture_output=True).returncode == 0)
    check("--help fonctionne", subprocess.run([BASH, SCRIPT.as_posix(), "--help"], capture_output=True, text=True, encoding="utf-8", errors="replace").returncode == 0)

    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    base = {"UCA_BASE_URL": f"http://127.0.0.1:{port}/extension"}
    tmp = Path(tempfile.mkdtemp(prefix="uca-sh-"))
    try:
        home = tmp / "home"; (home).mkdir()
        bindir = tmp / "bin"; bindir.mkdir()
        # ---- Chrome-like : installation puis mise à jour
        d = tmp / "chrome dossier"
        r = run({**base, "UCA_BROWSERS": "chrome", "UCA_DIR": d.as_posix()}, home, bindir)
        check("Chrome : installation réussie (code 0)", r.returncode == 0, (r.stdout + r.stderr)[-500:])
        check("Chrome : manifest.json et code installés", (d / "manifest.json").exists() and (d / "background.js").exists() and (d / "core").is_dir())
        check("Chrome : les étapes manuelles obligatoires sont expliquées", "Mode développeur" in r.stdout and "Charger l'extension non empaquetée" in r.stdout)
        mid = re.search(r"chrome-extension://([a-p]{32})/designs/studio/agenda\.html", r.stdout)
        real = subprocess.run([BASH, "-c", f'cd "{d.as_posix()}" && pwd -P'], capture_output=True, text=True, encoding="utf-8").stdout.strip()
        import hashlib
        want = hashlib.sha256(real.encode()).hexdigest()[:32].translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop"))
        check("Chrome : adresse de la page de l'extension (identifiant calculé du dossier)", bool(mid) and mid.group(1) == want, f"{mid and mid.group(1)} / {want}")
        m = json.loads((d / "manifest.json").read_text(encoding="utf-8")); new = m["version"]; m["version"] = "1.0.0"
        (d / "manifest.json").write_text(json.dumps(m), encoding="utf-8")
        r = run({**base, "UCA_BROWSERS": "chrome", "UCA_DIR": d.as_posix()}, home, bindir)
        check("Chrome : mise à jour détectée (1.0.0 -> dernière)", r.returncode == 0 and f"1.0.0 -> {new}" in r.stdout, r.stdout[-300:])
        # ---- Firefox release : refus d'installer en permanent, chargement temporaire
        prof = home / ".mozilla" / "firefox" / "abcd1234.default-release"; prof.mkdir(parents=True)
        (home / ".mozilla" / "firefox" / "profiles.ini").write_text("[Install4F96D1932A9F858E]\nDefault=abcd1234.default-release\nLocked=1\n\n[Profile0]\nName=default-release\nIsRelative=1\nPath=abcd1234.default-release\nDefault=1\n\n[General]\nStartWithLastProfile=1\n", encoding="utf-8")
        ff = bindir / "firefox"; ff.write_text('#!/usr/bin/env bash\necho "Mozilla Firefox 140.0"\n', encoding="utf-8"); ff.chmod(0o755)
        d2 = tmp / "ff"
        r = run({**base, "UCA_BROWSERS": "firefox", "UCA_DIR": d2.as_posix()}, home, bindir)
        out = r.stdout + r.stderr
        check("Firefox release : profil par défaut trouvé", "abcd1234.default-release" in out, out[-300:])
        check("Firefox release : explique que l'installation permanente non signée est refusée", "release" in out and "temporaire" in out.lower())
        check("Firefox release : n'écrit rien dans le profil", not (prof / "user.js").exists() and not (prof / "extensions").exists())
        check("Firefox release : paquet prêt pour « module temporaire »", (d2 / "firefox" / "manifest.json").exists() and "about:debugging" in out)
        # ---- Firefox Developer Edition : installation permanente après accord
        (bindir / "firefox").unlink()
        fd = bindir / "firefox-developer-edition"; fd.write_text('#!/usr/bin/env bash\necho "Mozilla Firefox 141.0b3"\n', encoding="utf-8"); fd.chmod(0o755)
        (prof / "user.js").write_text('user_pref("browser.startup.homepage", "about:blank");\n', encoding="utf-8")
        r = run({**base, "UCA_BROWSERS": "firefox", "UCA_DIR": d2.as_posix()}, home, bindir)
        out = r.stdout + r.stderr
        check("Firefox Developer : installation réussie", r.returncode == 0, out[-400:])
        uj = (prof / "user.js").read_text(encoding="utf-8")
        check("Firefox Developer : réglages ajoutés, ancien user.js conservé", 'xpinstall.signatures.required", false' in uj and "autoDisableScopes\", 0" in uj and "browser.startup.homepage" in uj)
        check("Firefox Developer : sauvegarde de user.js faite", any(p.name.startswith("user.js.uca-sauvegarde-") for p in prof.iterdir()))
        xpi = prof / "extensions" / f"{GECKO}.xpi"
        check("Firefox Developer : .xpi nommé d'après l'identifiant de l'extension", xpi.exists())
        ok_zip = False
        if xpi.exists():
            with zipfile.ZipFile(xpi) as z:
                ok_zip = "manifest.json" in z.namelist() and json.loads(z.read("manifest.json"))["browser_specific_settings"]["gecko"]["id"] == GECKO
        check("Firefox Developer : le .xpi contient le bon manifeste Firefox", ok_zip)
        r2 = run({**base, "UCA_BROWSERS": "firefox", "UCA_DIR": d2.as_posix()}, home, bindir)
        uj2 = (prof / "user.js").read_text(encoding="utf-8")
        check("Firefox Developer : icône épinglée dans la barre d'outils (default_area)", json.loads(zipfile.ZipFile(xpi).read("manifest.json"))["action"].get("default_area") == "navbar")
        check("Firefox Developer : annonce l icône épinglée dans la barre d outils", "épinglée dans la barre d" in out)
        check("Firefox Developer : relance sans doublon dans user.js", uj2.count("xpinstall.signatures.required") == 1 and r2.returncode == 0)
        # ---- aucune écriture hors du HOME de test et des dossiers demandés
        stray = [p for p in (Path(tempfile.gettempdir())).glob("uca-extension*")]
        check("aucun fichier laissé en dehors des dossiers prévus", not stray, str(stray))
    finally:
        srv.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
