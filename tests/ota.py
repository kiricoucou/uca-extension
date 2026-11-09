"""Mise à jour automatique de l'app Android : le paquet est bien formé et la signature protège vraiment.
Vérifie ota-bundle.zip / ota-bundle.sig publiés avec la clé de signature locale ; sans clé (CI), ne vérifie que le contenu.

Usage : python -I -X utf8 tests/ota.py
"""
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_ota import ALLOWED, PROPS, ROOT, gradle_version  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def verify(zp, sp):
    r = subprocess.run(["java", str(ROOT / "tools" / "SignBundle.java"), "verify", str(zp), str(sp), str(PROPS)], capture_output=True, text=True)
    return r.returncode == 0


def main():
    zp, sp = ROOT / "ota-bundle.zip", ROOT / "ota-bundle.sig"
    code, name = gradle_version()
    check("paquet et signature présents", zp.exists() and sp.exists())
    z = zipfile.ZipFile(zp)
    names = z.namelist()
    meta = json.loads(z.read("ota.json"))
    check("ota.json : version du paquet = version de l'app", meta["bundle_version"] == name or tuple(map(int, meta["bundle_version"].split("."))) > tuple(map(int, name.split("."))), str(meta))
    check("ota.json : code natif visé = versionCode de l'APK", meta["base_version_code"] == code, f"{meta['base_version_code']} / {code}")
    check("index.html présent", "index.html" in names)
    check("aucun chemin sortant ni absolu", not [n for n in names if n.startswith(("/", "\\")) or ".." in Path(n).parts or ":" in n])
    check("seulement des types autorisés", not [n for n in names if not n.endswith("/") and n != "ota.json" and n.rsplit(".", 1)[-1].lower() not in ALLOWED])
    check("taille raisonnable (< 25 Mo)", zp.stat().st_size < 25 * 1024 * 1024, str(zp.stat().st_size))
    check("aucun fichier de l'ancien système (github-updater, apk)", not [n for n in names if "github-updater" in n or n.endswith(".apk")])
    v = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))
    check("version.json annonce ce paquet", v.get("ota_version") == meta["bundle_version"] and v.get("ota_base_version_code") == code, str({k: v.get(k) for k in ("ota_version", "ota_base_version_code")}))
    # Les APK déjà installés ne proposent le nouvel APK que si min_apk_version_code dépasse leur versionCode.
    check("version.json : min_apk_version_code = versionCode publié (anciens APK invités à se mettre à jour)", v.get("min_apk_version_code") == code == v.get("version_code"), str({k: v.get(k) for k in ("min_apk_version_code", "version_code")}))
    check("version.json ne donne plus d'adresse de téléchargement", not any(k.endswith("_url") and "ota" in k for k in v))
    if PROPS.exists():
        check("signature valable (clé de l'APK)", verify(zp, sp))
        tmp = Path(tempfile.mkdtemp())
        bad = tmp / "tampered.zip"
        data = bytearray(zp.read_bytes()); data[len(data) // 2] ^= 1; bad.write_bytes(bytes(data))
        check("paquet modifié d'un seul bit → signature refusée", not verify(bad, sp))
        other = tmp / "other.sig"
        other.write_text("AAAA\n")
        check("fausse signature → refusée", not verify(zp, other))
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        print("INFO clé de signature absente : vérification de la signature ignorée")
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
