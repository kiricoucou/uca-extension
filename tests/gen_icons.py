"""Rend l'icône SVG d'un design en PNG 16/32/48/128 (designs/<id>/icons/).

Usage : python -I -X utf8 tests/gen_icons.py carnet
L'icône source est designs/<id>/icons/icon.svg.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def main():
    design = sys.argv[1]
    folder = ROOT / "designs" / design / "icons"
    svg = (folder / "icon.svg").read_text(encoding="utf-8")
    fonts = (ROOT / "designs" / design / "fonts").as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for size in (16, 32, 48, 128):
            page = browser.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
            page.set_content(f"""<html><head><style>
              @font-face{{font-family:Caveat;src:url('{fonts}/caveat.ttf');}}
              html,body{{margin:0;background:transparent;}} svg{{width:{size}px;height:{size}px;display:block;}}
            </style></head><body>{svg}</body></html>""")
            page.wait_for_timeout(300)
            page.screenshot(path=str(folder / f"icon{size}.png"), omit_background=True)
            page.close()
        browser.close()
    print(design, "→", ", ".join(sorted(f.name for f in folder.glob("icon*.png"))))


if __name__ == "__main__":
    main()
