"""maj-extension.sh / maj-extension.command (Linux et macOS) : l'extension est retrouvée dans les préférences du navigateur,
le dossier est confirmé (« Ouvrir le dossier », « Valider »), puis mise à jour. Les fenêtres (zenity, osascript) ne peuvent pas
tourner ici : on teste la détection, la confirmation au terminal et la mise à jour avec les ZIP locaux du dépôt.

Usage : python -I -X utf8 tests/maj_sh.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


def find_bash():
    if os.name == "nt":
        for c in ("C:/Program Files/Git/bin/bash.exe", "C:/Program Files (x86)/Git/bin/bash.exe"):
            if os.path.exists(c):
                return c
        return None
    return shutil.which("bash")


def posix(p):
    return Path(p).as_posix()


def mp(p):
    """Chemin tel que bash le voit (Git Bash : /c/Users/... ; ailleurs : inchangé), comme dans les préférences d'un navigateur Linux ou Mac."""
    q = Path(p).as_posix()
    return "/" + q[0].lower() + q[2:] if os.name == "nt" and len(q) > 2 and q[1] == ":" else q


def run(bash, script, home, args=(), env_extra=None, stdin_text=None):
    env = dict(os.environ, HOME=posix(home), UCA_URL_CHROME=(ROOT / "extension" / "uca-extension-chrome.zip").as_uri(),
               UCA_URL_FF=(ROOT / "extension" / "uca-extension-firefox.zip").as_uri())
    for k in ("DISPLAY", "WAYLAND_DISPLAY", "UCA_YES", "UCA_FAKE_OS", "XDG_CONFIG_HOME"):
        env.pop(k, None)
    env.update(env_extra or {})
    return subprocess.run([bash, posix(script), *args], env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", input=stdin_text if stdin_text is not None else "", timeout=180)


def make_ext(folder, firefox=False, version="1.0.0"):
    folder.mkdir(parents=True, exist_ok=True)
    m = json.loads((ROOT / ("manifest.firefox.json" if firefox else "manifest.json")).read_text(encoding="utf-8")); m["version"] = version
    (folder / "manifest.json").write_text(json.dumps(m), encoding="utf-8")
    (folder / "fichier-perso.txt").write_text("à garder", encoding="utf-8")


def vers(folder):
    return json.loads((folder / "manifest.json").read_text(encoding="utf-8"))["version"]


def main():
    bash = find_bash()
    if not bash:
        print("ignoré : pas de bash"); return
    sh = (ROOT / "extension" / "maj-extension.sh").read_bytes()
    cmd = (ROOT / "extension" / "maj-extension.command").read_bytes()
    check("maj-extension.sh : fins de ligne LF, shebang, pas de sudo", b"\r\n" not in sh and sh.startswith(b"#!/usr/bin/env bash") and b"sudo " not in sh.replace(b"sudo apt install unzip", b""))
    check("maj-extension.command : même script que le .sh (double-clic sur Mac)", sh == cmd)
    check("le script propose « Ouvrir le dossier » et « Valider »", b"Ouvrir le dossier" in sh and b"Valider" in sh and b"Autre dossier" in sh)
    zf = (ROOT / "extension" / "uca-extension-chrome.zip")
    import zipfile
    names = zipfile.ZipFile(zf).namelist()
    check("le ZIP contient les trois scripts de mise à jour", all(n in names for n in ("maj-extension.bat", "maj-extension.sh", "maj-extension.command")), str([n for n in names if n.startswith("maj")]))
    tmp = Path(tempfile.mkdtemp(prefix="uca-sh-"))
    try:
        script = tmp / "scripts" / "maj-extension.sh"; script.parent.mkdir(); script.write_bytes(sh)

        # ---- Linux : Chrome, chemin avec espaces, autre extension ignorée
        home = tmp / "h linux"; ext = home / "Mes extensions" / "uca"; make_ext(ext)
        autre = home / "autre"; autre.mkdir(parents=True); (autre / "manifest.json").write_text(json.dumps({"name": "Autre chose", "version": "9.9.9"}), encoding="utf-8")
        prof = home / ".config" / "google-chrome" / "Default"; prof.mkdir(parents=True)
        (prof / "Secure Preferences").write_text(json.dumps({"extensions": {"settings": {"a": {"location": 4, "path": mp(ext)}, "b": {"location": 4, "path": mp(autre)}, "c": {"location": 1, "path": "ccc/1.0_0"}}}}), encoding="utf-8")
        r = run(bash, script, home, env_extra={"UCA_YES": "1"})
        check("Linux : l'extension est retrouvée dans Chrome et mise à jour (sans dossier donné)", r.returncode == 0 and vers(ext) != "1.0.0" and "Dossier détecté" in r.stdout and "OK :" in r.stdout, f"rc={r.returncode} v={vers(ext)} {r.stdout[-300:]!r} {r.stderr[-200:]!r}")
        check("Linux : un autre dossier chargé dans Chrome est ignoré", vers(autre) == "9.9.9")
        check("Linux : fichier perso conservé", (ext / "fichier-perso.txt").exists())
        check("Linux : dossier mémorisé (~/.config/MyUCA)", (home / ".config" / "MyUCA" / "dossier-extension.txt").read_text(encoding="utf-8").strip() == mp(ext))
        r2 = run(bash, script, home, env_extra={"UCA_YES": "1"})
        check("Linux : 2e lancement : déjà à jour", r2.returncode == 0 and "Déjà à jour" in r2.stdout, r2.stdout[-250:])
        r3 = run(bash, script, home, args=("--force",), env_extra={"UCA_YES": "1"})
        check("Linux : --force réinstalle", r3.returncode == 0 and "OK :" in r3.stdout, r3.stdout[-250:])
        check("Linux : le script lui-même n'est pas écrasé", script.read_bytes() == sh and not (ext / "maj-extension.sh").exists())

        # ---- confirmation au terminal : « Ouvrir le dossier » puis « Valider »
        make_ext(ext)
        r4 = run(bash, script, home, stdin_text="O\nV\n")
        check("confirmation (terminal) : « O » (Ouvrir le dossier) puis « V » (Valider) met à jour", r4.returncode == 0 and vers(ext) != "1.0.0" and "C'est bien le dossier de ton extension" in r4.stdout, f"rc={r4.returncode} v={vers(ext)} {r4.stdout[-400:]!r}")
        make_ext(ext)
        r5 = run(bash, script, home, stdin_text="Q\n")
        check("confirmation (terminal) : « Q » annule, rien n'est modifié", r5.returncode == 3 and vers(ext) == "1.0.0" and "Annulé" in r5.stdout, f"rc={r5.returncode} v={vers(ext)}")
        make_ext(ext)
        ext2 = home / "Mes extensions" / "uca2"; make_ext(ext2)
        r6 = run(bash, script, home, stdin_text=f"A\n{posix(ext2)}\n")
        check("confirmation (terminal) : « A » (Autre dossier) puis chemin valide", r6.returncode == 0 and vers(ext2) != "1.0.0" and vers(ext) == "1.0.0", f"rc={r6.returncode} {vers(ext2)} {vers(ext)} {r6.stdout[-300:]!r}")

        # ---- macOS : ~/Library/Application Support, Brave
        homem = tmp / "h mac"; extm = homem / "Documents" / "mon extension"; make_ext(extm)
        profm = homem / "Library" / "Application Support" / "BraveSoftware" / "Brave-Browser" / "Profile 2"; profm.mkdir(parents=True)
        (profm / "Preferences").write_text(json.dumps({"extensions": {"settings": {"x": {"location": 4, "path": mp(extm)}}}}), encoding="utf-8")
        scriptc = tmp / "scripts" / "maj-extension.command"; scriptc.write_bytes(cmd)
        rm = run(bash, scriptc, homem, env_extra={"UCA_YES": "1", "UCA_FAKE_OS": "Darwin"})
        check("macOS : l'extension est retrouvée dans Brave (profil 2) et mise à jour", rm.returncode == 0 and vers(extm) != "1.0.0" and "Brave, profil Profile 2" in rm.stdout, f"rc={rm.returncode} {rm.stdout[-300:]!r}")
        check("macOS : dossier mémorisé (~/Library/Application Support/MyUCA)", (homem / "Library" / "Application Support" / "MyUCA" / "dossier-extension.txt").exists())

        # ---- Firefox : extension temporaire dans extensions.json
        homef = tmp / "h ff"; extf = homef / "ff ext"; make_ext(extf, firefox=True)
        fp = homef / ".mozilla" / "firefox" / "abc.default-release"; fp.mkdir(parents=True)
        (fp / "extensions.json").write_text(json.dumps({"addons": [{"id": "autre@x", "path": "/non"}, {"id": "uca-connecteur@site-emploi-du-temps.local", "type": "extension", "path": mp(extf)}]}), encoding="utf-8")
        rf = run(bash, script, homef, env_extra={"UCA_YES": "1"})
        newf = json.loads((extf / "manifest.json").read_text(encoding="utf-8"))
        check("Firefox : extension temporaire retrouvée, paquet Firefox appliqué, consigne about:debugging", rf.returncode == 0 and newf["version"] != "1.0.0" and "browser_specific_settings" in newf and "about:debugging" in rf.stdout, f"rc={rf.returncode} {rf.stdout[-300:]!r}")

        # ---- erreurs propres
        rbad = run(bash, script, home, args=(mp(tmp / "n-existe-pas"),), env_extra={"UCA_YES": "1"})
        check("mauvais dossier donné : échec propre (code 2), rien cassé", rbad.returncode == 2 and vers(ext) == "1.0.0", f"rc={rbad.returncode}")
        none = run(bash, script, tmp / "vide", env_extra={"UCA_YES": "1"})
        check("aucune extension trouvée (mode sans fenêtre) : échec propre (code 2)", none.returncode == 2 and "introuvable" in none.stdout, f"rc={none.returncode} {none.stdout[-200:]!r}")
        offline = run(bash, script, home, env_extra={"UCA_YES": "1", "UCA_URL_CHROME": "file:///n/existe/pas.zip"})
        check("téléchargement impossible : message clair, ancienne version intacte", offline.returncode == 1 and "Rien n'a été modifié" in offline.stdout and vers(ext) == "1.0.0", f"rc={offline.returncode} {offline.stdout[-200:]!r}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
