"""Accueil : le téléphone de la démo tient en hauteur dans la fenêtre (jamais plus haut que l'écran), sur des écrans bas ou hauts.

Usage : python -I -X utf8 tests/demo_phone_height.py
"""
import socket
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def main():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for w, h in ((1280, 720), (1280, 900), (1920, 1080), (1440, 700)):
                pg = b.new_page(viewport={"width": w, "height": h}); errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)))
                pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(600)
                pg.evaluate("() => document.querySelector('[data-device=phone]').click()"); pg.wait_for_timeout(400)
                bb = pg.evaluate("() => { const r = document.querySelector('.demo-frame').getBoundingClientRect(); return { h: r.height, w: r.width }; }")
                check(f"{w}x{h} : le téléphone tient dans la hauteur de la fenêtre", bb["h"] <= h - 100, f"{bb['h']:.0f} px pour {h}")
                check(f"{w}x{h} : le téléphone reste lisible (au moins 55 % de sa taille)", bb["h"] >= 760 * 0.55, f"{bb['h']:.0f}")
                pg.evaluate("() => document.querySelector('[data-device=desktop]').click()"); pg.wait_for_timeout(300)
                check(f"{w}x{h} : aucune erreur JavaScript", not errs, "; ".join(errs)[:150])
                pg.close()
            b.close()
    finally:
        srv.terminate()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
