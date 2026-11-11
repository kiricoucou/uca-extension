"""Icônes de l'app (APK + PWA) à partir du logo « Université Clermont Auvergne » (app/icons/logo-uca-source.jpg).

L'extension garde ses propres icônes (designs/<id>/icons/) : ce script n'y touche pas.
Usage : python -I -X utf8 tests/gen_uca_logo.py
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "app" / "icons"
SPLASH = ROOT / "app" / "splash"
RES = ROOT / "app" / "webview-app" / "app" / "src" / "main" / "res"
SRC = ICONS / "logo-uca-source.jpg"
WHITE = (255, 255, 255)


def logo():
    """Logo rogné au contenu (fond blanc retiré), en RGB."""
    im = Image.open(SRC).convert("RGB")
    bbox = ImageChops.difference(im, Image.new("RGB", im.size, WHITE)).point(lambda v: 255 if v > 18 else 0).getbbox()
    return im.crop(bbox)


def canvas(size, fill=0.74, round_frac=0.0, bg=WHITE, circle=False, alpha_outside=True):
    """Carré `size` : logo centré qui occupe `fill` de la zone, fond blanc, coins arrondis (ou rond)."""
    src = logo()
    k = size * fill / max(src.size)
    lg = src.resize((max(1, round(src.width * k)), max(1, round(src.height * k))), Image.LANCZOS)
    img = Image.new("RGBA", (size, size), bg + (255,))
    img.paste(lg, ((size - lg.width) // 2, (size - lg.height) // 2))
    if circle or round_frac:
        mask = Image.new("L", (size * 4, size * 4), 0)
        d = ImageDraw.Draw(mask)
        if circle:
            d.ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
        else:
            d.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=round(size * 4 * round_frac), fill=255)
        img.putalpha(mask.resize((size, size), Image.LANCZOS))
    return img


def main():
    # PWA
    canvas(192, 0.74, 0.22).save(ICONS / "icon-192.png")
    canvas(512, 0.74, 0.22).save(ICONS / "icon-512.png")
    canvas(180, 0.74).convert("RGB").save(ICONS / "apple-touch-icon.png")
    canvas(512, 0.6).convert("RGB").save(ICONS / "maskable-512.png")   # zone sûre des icônes adaptatives
    # Écrans de démarrage iOS : fond blanc, logo centré
    for f in SPLASH.glob("splash-*x*.png"):
        w, h = (int(n) for n in f.stem.split("-")[1].split("x"))
        img = Image.new("RGB", (w, h), WHITE)
        src = logo()
        k = w * 0.5 / src.width
        lg = src.resize((round(src.width * k), round(src.height * k)), Image.LANCZOS)
        img.paste(lg, ((w - lg.width) // 2, (h - lg.height) // 2))
        img.save(f)
    # APK : icône de lanceur (carrée arrondie + ronde) à chaque densité
    for d, s in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        canvas(s * 2, 0.74, 0.16).resize((s, s), Image.LANCZOS).save(RES / f"mipmap-{d}" / "ic_launcher.png")
        canvas(s * 2, 0.62, circle=True).resize((s, s), Image.LANCZOS).save(RES / f"mipmap-{d}" / "ic_launcher_round.png")
    print("ok")


if __name__ == "__main__":
    main()
