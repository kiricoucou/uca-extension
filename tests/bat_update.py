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
    env = dict(os.environ, MYUCA_NOPAUSE="1", MYUCA_NOINSTALL="1", LOCALAPPDATA=str(cwd / "appdata"))
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
        # dossier Firefox : le script doit télécharger le paquet Firefox (manifeste différent), pas celui de Chrome
        extff = tmp / "ext firefox"; extff.mkdir()
        mf = json.loads((ROOT / "manifest.firefox.json").read_text(encoding="utf-8")); mf["version"] = "1.0.0"
        (extff / "manifest.json").write_text(json.dumps(mf), encoding="utf-8")
        (tmp / "maj.bat").write_bytes(src)
        rf = run(tmp / "maj.bat", tmp, str(extff))
        newf = json.loads((extff / "manifest.json").read_text(encoding="utf-8"))
        check("dossier Firefox : mis à jour avec le paquet Firefox (pas celui de Chrome)", rf.returncode == 0 and newf["version"] != "1.0.0" and "browser_specific_settings" in newf and "scripts" in newf.get("background", {}), f"rc={rf.returncode} out={rf.stdout[-300:]!r} err={rf.stderr[-200:]!r} v={newf.get('version')}")
        check("dossier Firefox : le message indique about:debugging", "about:debugging" in rf.stdout, rf.stdout[-300:])
        # détection automatique : le script est seul dans un dossier, l'extension est repérée dans les préférences du navigateur
        det = tmp / "det"; det.mkdir()
        (det / "maj-extension.bat").write_bytes(src)
        extd = tmp / "ext detectee"; extd.mkdir()
        m2 = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8")); m2["version"] = "1.0.0"
        (extd / "manifest.json").write_text(json.dumps(m2), encoding="utf-8")
        autre = tmp / "autre extension"; autre.mkdir()
        (autre / "manifest.json").write_text(json.dumps({"name": "Autre chose", "version": "9.9.9"}), encoding="utf-8")
        prefs = tmp / "appdata" / "Google" / "Chrome" / "User Data" / "Default"; prefs.mkdir(parents=True)
        (prefs / "Secure Preferences").write_text(json.dumps({"extensions": {"settings": {"aaa": {"location": 4, "path": str(extd)}, "bbb": {"location": 4, "path": str(autre)}, "ccc": {"location": 1, "path": "ccc\1.0_0"}}}}), encoding="utf-8")
        (tmp / "appdata" / "MyUCA" / "dossier-extension.txt").unlink()
        envx = dict(os.environ, MYUCA_NOPAUSE="1", MYUCA_NOINSTALL="1", LOCALAPPDATA=str(tmp / "appdata"), APPDATA=str(tmp / "roaming"))
        rd = subprocess.run(["cmd", "/c", str(det / "maj-extension.bat")], cwd=det, env=envx, capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=180)
        newd = json.loads((extd / "manifest.json").read_text(encoding="utf-8"))["version"]
        check("détection : l'extension est retrouvée dans les préférences de Chrome et mise à jour (sans dossier donné)", rd.returncode == 0 and newd != "1.0.0" and "Dossier detecte" in rd.stdout, f"rc={rd.returncode} v={newd} out={rd.stdout[-300:]!r}")
        check("détection : un autre dossier chargé dans Chrome (pas My UCA) est ignoré", json.loads((autre / "manifest.json").read_text(encoding="utf-8"))["version"] == "9.9.9")
        check("détection : le dossier trouvé est mémorisé", (tmp / "appdata" / "MyUCA" / "dossier-extension.txt").read_text(encoding="ascii").strip() == str(extd))
        # Firefox : extension temporaire repérée dans extensions.json
        (tmp / "appdata" / "MyUCA" / "dossier-extension.txt").unlink()
        (prefs / "Secure Preferences").unlink()
        extf = tmp / "ext ff detectee"; extf.mkdir()
        mf2 = json.loads((ROOT / "manifest.firefox.json").read_text(encoding="utf-8")); mf2["version"] = "1.0.0"
        (extf / "manifest.json").write_text(json.dumps(mf2), encoding="utf-8")
        fp = tmp / "roaming" / "Mozilla" / "Firefox" / "Profiles" / "abc.default"; fp.mkdir(parents=True)
        (fp / "extensions.json").write_text(json.dumps({"addons": [{"id": "autre@truc", "path": str(autre)}, {"id": "uca-connecteur@site-emploi-du-temps.local", "path": str(extf)}]}), encoding="utf-8")
        rff = subprocess.run(["cmd", "/c", str(det / "maj-extension.bat")], cwd=det, env=envx, capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=180)
        newff = json.loads((extf / "manifest.json").read_text(encoding="utf-8"))
        check("détection Firefox : extension temporaire retrouvée, paquet Firefox appliqué", rff.returncode == 0 and newff["version"] != "1.0.0" and "browser_specific_settings" in newff and "about:debugging" in rff.stdout, f"rc={rff.returncode} out={rff.stdout[-300:]!r}")
        (fp / "extensions.json").unlink()
        rnone = subprocess.run(["cmd", "/c", str(det / "maj-extension.bat")], cwd=det, env=dict(envx, LOCALAPPDATA=str(tmp / "vide")), capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=180)
        check("aucune extension trouvée (mode sans fenêtre) : échec propre", rnone.returncode == 2 and "introuvable" in rnone.stdout, f"rc={rnone.returncode} {rnone.stdout[-200:]!r}")
        src_ok = src.decode("utf-8")
        check("le script propose « Ouvrir le dossier » et « Valider »", "Ouvrir le dossier" in src_ok and "'Valider'" in src_ok and "Autre dossier" in src_ok)
        # dossier pointé = parent (le manifest.json est dans un sous-dossier), puis dossier voisin
        par = tmp / "uca-extension"; sub = par / "extension_uca_firefox"; sub.mkdir(parents=True)
        mm = dict(m); (sub / "manifest.json").write_text(json.dumps(mm), encoding="utf-8")
        (par / "core").mkdir(); (par / "autre-dossier").mkdir()
        rp = run(ext / "maj-extension.bat", tmp, str(par))
        check("dossier choisi = parent : le manifest.json est cherché dans les sous-dossiers", rp.returncode == 0 and json.loads((sub / "manifest.json").read_text(encoding="utf-8"))["version"] != "1.0.0" and "sous-dossier" in rp.stdout, f"rc={rp.returncode} {rp.stdout[-300:]!r}")
        (sub / "manifest.json").write_text(json.dumps(mm), encoding="utf-8")
        rv = run(ext / "maj-extension.bat", tmp, str(par / "autre-dossier"))
        check("dossier choisi = voisin du bon : l'extension est retrouvée à côté", rv.returncode == 0 and json.loads((sub / "manifest.json").read_text(encoding="utf-8"))["version"] != "1.0.0" and "cote" in rv.stdout, f"rc={rv.returncode} {rv.stdout[-300:]!r}")
        # commande complète : /browser, /os, /version, /yes + dossier
        rr = run(ext / "maj-extension.bat", tmp, "/browser", "chrome", "/os", "windows", "/version", "99.0.0", "/yes", str(sub))
        check("commande complète : /browser /os /version /yes + dossier acceptés", rr.returncode in (0, 10) and "Remarque : la version attendue etait 99.0.0" in rr.stdout, f"rc={rr.returncode} {rr.stdout[-300:]!r}")
        # dossiers rangés côte à côte : extension_uca_chrome / _edge / _firefox, tous mis à jour
        base3 = tmp / "trois" / "uca-extension"
        e_c = base3 / "extension_uca_chrome"; e_e = base3 / "extension_uca_edge"; e_f = base3 / "extension_uca_firefox"
        for dd, ffx in ((e_c, False), (e_e, False), (e_f, True)):
            dd.mkdir(parents=True)
            mj = json.loads((ROOT / ("manifest.firefox.json" if ffx else "manifest.json")).read_text(encoding="utf-8")); mj["version"] = "1.0.0"
            (dd / "manifest.json").write_text(json.dumps(mj), encoding="utf-8")
        (tmp / "appdata" / "MyUCA").mkdir(parents=True, exist_ok=True)
        r3 = run(ext / "maj-extension.bat", tmp, str(e_c), "/yes")
        r3 = subprocess.run(["cmd", "/c", str(ext / "maj-extension.bat"), "/yes"], cwd=tmp, env=dict(os.environ, MYUCA_NOLAUNCH="1", MYUCA_NOPAUSE="1", MYUCA_NOINSTALL="1", LOCALAPPDATA=str(tmp / "appdata3")), capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=180)
        (tmp / "appdata3" / "MyUCA").mkdir(parents=True, exist_ok=True)
        (tmp / "appdata3" / "MyUCA" / "dossier-extension.txt").write_text(str(e_c), encoding="ascii")
        r3 = subprocess.run(["cmd", "/c", str(ext / "maj-extension.bat"), "/yes"], cwd=tmp, env=dict(os.environ, MYUCA_NOLAUNCH="1", MYUCA_NOPAUSE="1", MYUCA_NOINSTALL="1", LOCALAPPDATA=str(tmp / "appdata3")), capture_output=True, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=180)
        vv = [json.loads((d / "manifest.json").read_text(encoding="utf-8"))["version"] for d in (e_c, e_e, e_f)]
        check("trois dossiers côte à côte (Chrome, Edge, Firefox) : tous mis à jour", all(v != "1.0.0" for v in vv), f"{vv} {r3.stdout[-500:]!r}")
        check("les navigateurs sont nommés (Edge et Firefox reconnus)", "(Edge)" in r3.stdout and "(Firefox)" in r3.stdout, r3.stdout[-500:])
        r4 = run(ext / "maj-extension.bat", tmp, str(tmp / "n-existe-pas"))
        check("mauvais dossier : échec propre, rien cassé", r4.returncode != 0 and (ext / "manifest.json").exists(), r4.stdout[-300:])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
