"""Construit l'« Édition Moodle » : une extension complète et indépendante, à charger À CÔTÉ de l'extension normale
pour tester les notes Moodle sans rien mélanger.

  - dossier à part (par défaut <dépôt>_EDITION-MOODLE, à côté du dépôt) : Chrome lui donne un identifiant différent,
    donc des données (chrome.storage) totalement séparées de l'extension normale ;
  - nom, description et infobulle différents, icônes teintées orange avec un badge « M » (barre d'outils, notifications) ;
  - paquet « magasin » : aucun vérificateur de mise à jour GitHub (elle ne se remplace donc jamais par la version
    normale), pas d'accès à raw.githubusercontent.com ;
  - « Notes Moodle » activé par défaut.

Usage : python -I -X utf8 tests/build_edition_moodle.py [dossier_de_sortie]
Puis chrome://extensions -> Mode développeur -> « Charger l'extension non empaquetée » -> ce dossier.
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_firefox import ROOT, should_copy, store_manifest  # noqa: E402

NAME = "EDT UCA — ÉDITION MOODLE (test)"
VERSION = "2.0.0"
ORANGE = (255, 122, 0)


def tint(path: Path):
    """Icône recolorée en orange + badge rond « M » en bas à droite (lisible même en 16 px)."""
    im = Image.open(path).convert("RGBA")
    alpha = im.getchannel("A")
    gray = ImageOps.grayscale(im.convert("RGB"))
    col = ImageOps.colorize(gray, black=(70, 28, 0), white=(255, 196, 120)).convert("RGBA")
    col.putalpha(alpha)
    w, h = col.size
    r = max(5, int(w * 0.30))
    d = ImageDraw.Draw(col)
    cx, cy = w - r - 1, h - r - 1
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(205, 40, 40, 255), outline=(255, 255, 255, 255), width=max(1, w // 32))
    if w >= 32:
        try:
            font = ImageFont.truetype("arialbd.ttf", int(r * 1.35))
        except OSError:
            font = ImageFont.load_default()
        d.text((cx, cy), "M", fill=(255, 255, 255, 255), font=font, anchor="mm")
    col.save(path)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / (ROOT.name + "_EDITION-MOODLE")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    n = 0
    for src in ROOT.rglob("*"):
        if src.is_dir() or not should_copy(src):
            continue
        dest = out / src.relative_to(ROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        n += 1

    manifest = store_manifest(json.loads((ROOT / "manifest.json").read_text(encoding="utf-8")), firefox=False)
    manifest["name"] = NAME
    manifest["version"] = VERSION
    manifest["description"] = "ÉDITION MOODLE de test : emploi du temps, notes (Odin + Moodle avec validation) et absences de l'UCA. Indépendante de l'extension normale. Non officielle."
    manifest["action"]["default_title"] = "EDT UCA — ÉDITION MOODLE (test)"
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "store-build.txt").write_text("paquet des magasins : pas de vérification de mise à jour via GitHub\n", encoding="utf-8")

    icons = [p for p in out.rglob("icon*.png") if "icons" in p.parts]
    for p in icons:
        tint(p)

    # « Notes Moodle » activé d'office dans cette édition (réglage par défaut du code).
    settings = out / "core" / "settings.js"
    s = settings.read_text(encoding="utf-8")
    assert "moodleNotes: false," in s
    settings.write_text(s.replace("moodleNotes: false,", "moodleNotes: true, ", 1), encoding="utf-8")

    (out / "LISEZ-MOI-EDITION-MOODLE.txt").write_text(
        "ÉDITION MOODLE — extension indépendante de l'extension normale.\n\n"
        "Comment la reconnaître : icône ORANGE avec un badge rouge « M », nom « EDT UCA — ÉDITION MOODLE (test) », version 2.0.0.\n"
        "Installation : chrome://extensions -> Mode développeur -> Charger l'extension non empaquetée -> ce dossier.\n"
        "Ses données sont séparées de l'extension normale (il faut s'y synchroniser séparément).\n"
        "Elle ne se met jamais à jour toute seule depuis GitHub : pour la renouveler, relance tests/build_edition_moodle.py.\n",
        encoding="utf-8")
    print(f"édition Moodle : {out} ({n} fichiers, {len(icons)} icônes teintées)")


if __name__ == "__main__":
    main()
