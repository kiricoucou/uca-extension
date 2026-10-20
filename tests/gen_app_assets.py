"""Génère les icônes et écrans de démarrage de l'app téléphone depuis app/icons/icon.svg.

Usage : python -I -X utf8 tests/gen_app_assets.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "app" / "icons"
SPLASH = ROOT / "app" / "splash"
SVG = (ICONS / "icon.svg").read_text(encoding="utf-8")
SPLASH_SIZES = [(1290, 2796, 3), (1179, 2556, 3), (1284, 2778, 3), (1170, 2532, 3), (1125, 2436, 3), (1242, 2688, 3), (828, 1792, 2), (750, 1334, 2)]


def render(browser, w, h, body, out, transparent=False, scale=1):
    page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=scale)
    page.set_content(f"""<html><head><style>html,body{{margin:0;width:{w}px;height:{h}px;overflow:hidden;background:transparent;}}
      svg{{display:block;width:100%;height:100%;}}</style></head><body>{body}</body></html>""")
    page.wait_for_timeout(150)
    page.screenshot(path=str(out), omit_background=transparent)
    page.close()


def main():
    SPLASH.mkdir(exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        rounded = lambda s: f'<div style="width:{s}px;height:{s}px;border-radius:{round(s * .22)}px;overflow:hidden">{SVG}</div>'
        render(b, 192, 192, rounded(192), ICONS / "icon-192.png", transparent=True)
        render(b, 512, 512, rounded(512), ICONS / "icon-512.png", transparent=True)
        render(b, 180, 180, SVG, ICONS / "apple-touch-icon.png")
        # Maskable : fond plein, contenu réduit dans la zone sûre (80 %).
        render(b, 512, 512, f'<div style="width:512px;height:512px;background:linear-gradient(135deg,#1a73e8,#0b3f9e);display:flex;align-items:center;justify-content:center"><div style="width:400px;height:400px">{SVG}</div></div>',
               ICONS / "maskable-512.png")
        for w, h, r in SPLASH_SIZES:
            cw, ch = w // r, h // r
            body = f"""<div style="width:{cw}px;height:{ch}px;background:#0b57d0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;font-family:'Segoe UI',Arial,sans-serif;color:#fff">
              <div style="width:{round(cw * .3)}px;height:{round(cw * .3)}px;border-radius:{round(cw * .066)}px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.25)">{SVG}</div>
              <div style="font-size:{round(cw * .062)}px;font-weight:700;letter-spacing:.01em">Emploi du temps UCA</div>
              <div style="font-size:{round(cw * .036)}px;opacity:.8">Non officiel</div></div>"""
            render(b, cw, ch, body, SPLASH / f"splash-{w}x{h}.png", scale=r)
        b.close()
    print("icônes :", ", ".join(sorted(f.name for f in ICONS.glob("*.png"))))
    print("démarrage :", len(list(SPLASH.glob("*.png"))), "images")


if __name__ == "__main__":
    main()
