"""Fabrique le paquet de mise à jour automatique de l'app Android : ota-bundle.zip + ota-bundle.sig.

Le paquet contient les pages web de l'app (app/webview-app/.../assets/legacy-site) et un ota.json
{bundle_version, base_version_code}. Il est signé avec la clé de signature de l'APK (keystore local, jamais envoyé) :
l'app refuse tout paquet dont la signature n'est pas valable pour son propre certificat.

Usage : python -I -X utf8 tests/build_ota.py        (après avoir monté versionCode/versionName dans build.gradle.kts
                                                       et lancé ./gradlew assembleRelease si le code natif a changé)
"""
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app" / "webview-app"
SITE = APP / "app" / "src" / "main" / "assets" / "legacy-site"
PROPS = APP / "keystore" / "keystore.properties"
ALLOWED = {"html", "js", "css", "json", "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "woff", "woff2", "ttf", "txt", "webmanifest", "md"}
FIXED = zipfile.ZipInfo("x").date_time


def gradle_version():
    s = (APP / "app" / "build.gradle.kts").read_text(encoding="utf-8")
    return int(re.search(r"versionCode = (\d+)", s).group(1)), re.search(r'versionName = "([^"]+)"', s).group(1)


def build(out_zip: Path, bundle_version: str, base_code: int):
    files = sorted(p for p in SITE.rglob("*") if p.is_file() and p.name != "ota.json")
    bad = [p for p in files if p.suffix.lstrip(".").lower() not in ALLOWED]
    if bad:
        raise SystemExit("types non autorisés dans le paquet : " + ", ".join(str(p.relative_to(SITE)) for p in bad[:5]))
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        meta = json.dumps({"bundle_version": bundle_version, "base_version_code": base_code, "files": len(files)}, indent=2)
        zi = zipfile.ZipInfo("ota.json", FIXED); zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, meta)
        for p in files:
            zi = zipfile.ZipInfo(p.relative_to(SITE).as_posix(), FIXED); zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, p.read_bytes())
    return len(files)


def main():
    code, name = gradle_version()
    version = sys.argv[1] if len(sys.argv) > 1 else name
    if not PROPS.exists():
        raise SystemExit("keystore.properties introuvable : impossible de signer.")
    out_zip, out_sig = ROOT / "ota-bundle.zip", ROOT / "ota-bundle.sig"
    n = build(out_zip, version, code)
    subprocess.run(["java", str(ROOT / "tools" / "SignBundle.java"), "sign", str(out_zip), str(out_sig), str(PROPS)], check=True)
    subprocess.run(["java", str(ROOT / "tools" / "SignBundle.java"), "verify", str(out_zip), str(out_sig), str(PROPS)], check=True)
    v = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))
    v.update(ota_version=version, ota_base_version_code=code)
    for k in ("ota_bundle_url", "ota_enabled"):
        v.pop(k, None)
    (ROOT / "version.json").write_text(json.dumps(v, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"paquet : {out_zip.name} ({out_zip.stat().st_size // 1024} Ko, {n} fichiers), version {version}, code natif {code}")


if __name__ == "__main__":
    main()
