"""Page de téléchargement de l'extension : tutoriel précis, captures cliquables qui s'ouvrent en grand avec une croix
pour fermer (aussi Échap et clic à côté), choix ZIP / APK / les deux, poids affichés.

Usage : python -I -X utf8 tests/extension_page.py
"""
import socket
import subprocess
import sys
import time
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
    time.sleep(1)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for label, vp in (("bureau", {"width": 1280, "height": 900}), ("téléphone", {"width": 390, "height": 800})):
                pg = b.new_page(viewport=vp); errors = []
                pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(f"http://127.0.0.1:{port}/extension/index.html#installer"); pg.wait_for_timeout(900)
                pg.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('in'))")
                check(f"{label} : 3 étapes détaillées (sous-étapes numérotées)", pg.locator(".step").count() == 3 and pg.locator(".sub-steps li").count() >= 9, str(pg.locator(".sub-steps li").count()))
                check(f"{label} : lightbox cachée au départ", pg.locator("#lightbox").is_hidden())
                btns = pg.locator("button.shot-link")
                check(f"{label} : 2 captures cliquables", btns.count() == 2)
                for k in range(btns.count()):
                    btns.nth(k).scroll_into_view_if_needed(); btns.nth(k).click(); pg.wait_for_timeout(300)
                    vis = pg.evaluate("() => { const l = document.getElementById('lightbox'); const i = document.getElementById('lbImg'); const r = i.getBoundingClientRect(); return !l.hidden && r.width > 200 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && i.naturalWidth > 0; }")
                    check(f"{label} : capture {k + 1} agrandie et entière dans l'écran", vis)
                    check(f"{label} : croix de fermeture visible", pg.locator("#lbClose").is_visible() and pg.locator("#lbClose").inner_text().strip() == "✕")
                    if k == 0:
                        pg.locator("#lbClose").click()
                    elif k == 1:
                        pg.keyboard.press("Escape")
                    pg.wait_for_timeout(250)
                    check(f"{label} : fermeture {'par la croix' if k == 0 else 'par Échap'}", pg.locator("#lightbox").is_hidden())
                btns.nth(0).click(); pg.wait_for_timeout(250)
                pg.mouse.click(5, 5); pg.wait_for_timeout(250)
                check(f"{label} : clic à côté de l'image ferme", pg.locator("#lightbox").is_hidden())
                check(f"{label} : défilement de la page rétabli", pg.evaluate("document.body.style.overflow") == "")
                check(f"{label} : boutons ZIP / APK / les deux avec leur poids", pg.locator("#choix .sz").count() >= 3 and "Mo" in pg.locator("#choix").inner_text())
                check(f"{label} : pas de défilement horizontal", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
                check(f"{label} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                if label == "bureau":
                    btns.nth(0).click(); pg.wait_for_timeout(300)
                    pg.screenshot(path=str(Path(__file__).resolve().parent / ".lightbox.png")) if False else None
                pg.close()
            b.close()
    finally:
        srv.terminate()
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
