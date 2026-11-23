"""Écrans de chargement : (1) le site affiche une page de chargement seulement si la page met plus de 2 s à se charger
complètement, et la retire à la fin ; (2) la démo de l'accueil se prépare en arrière plan derrière un petit écran avec barre
de progression, qui disparaît quand la simulation est prête.

Usage : python -I -X utf8 tests/loading_screens.py
"""
import functools
import http.server
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


DELAYS = {}  # fin de chemin -> secondes de retard côté serveur (un vrai réseau lent, sans bloquer le test)


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        for tail, sec in list(DELAYS.items()):
            if self.path.split("?")[0].endswith(tail):
                time.sleep(sec)
        super().do_GET()

    def log_message(self, *a):
        pass


def main():
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    srv = httpd
    base = f"http://127.0.0.1:{port}/"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            # --- page lente : une image met 4,5 s à arriver
            pg = b.new_page(viewport={"width": 1280, "height": 800}); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            DELAYS["/telecharger/shots/agenda-studio.webp"] = 4.5
            t0 = time.time(); pg.goto(base + "index.html", wait_until="commit")
            pg.wait_for_timeout(1200)
            check("page lente : pas d'écran de chargement avant 2 s", pg.locator("#ucaLoading").count() == 0)
            pg.wait_for_timeout(1800)
            check("page lente : l'écran de chargement apparaît après 2 s", pg.locator("#ucaLoading").count() == 1 and pg.locator("#ucaLoading").is_visible())
            check("page lente : il montre une barre de progression", pg.locator("#ucaLoading .sp i").count() == 1)
            pg.wait_for_function("() => !document.getElementById('ucaLoading')", timeout=15000)
            check("page lente : l'écran de chargement disparaît quand tout est chargé", pg.locator("#ucaLoading").count() == 0)
            pg.close(); DELAYS.clear()
            # --- page rapide : jamais d'écran
            pg = b.new_page(viewport={"width": 1280, "height": 800}); seen = []
            pg.add_init_script("new MutationObserver(() => { if (document.getElementById('ucaLoading')) window.__sawLoading = true; }).observe(document, { childList: true, subtree: true });")
            pg.goto(base + "appli.html"); pg.wait_for_timeout(2600)
            check("page rapide : jamais d'écran de chargement", pg.evaluate("() => !window.__sawLoading && !document.getElementById('ucaLoading')"))
            pg.close()
            # --- démo : écran de préparation avec barre de progression, en arrière plan
            pg = b.new_page(viewport={"width": 1280, "height": 800})
            pg.on("pageerror", lambda e: errs.append(str(e)))
            DELAYS["/designs/professionnel/agenda.html"] = 2.0
            pg.goto(base + "index.html", wait_until="commit"); pg.wait_for_timeout(1700)
            v = pg.locator(".demo-load")
            check("démo : écran de préparation présent, avec barre de progression", v.count() == 1 and pg.locator(".demo-load [role=progressbar]").count() == 1)
            check("démo : la simulation se charge en arrière plan (sans aller sur la section)", v.is_visible() and "off" not in (v.get_attribute("class") or "") and pg.evaluate("() => window.scrollY") < 200)
            pct1 = int(pg.locator(".demo-load [role=progressbar]").get_attribute("aria-valuenow"))
            check("démo : la barre avance", 0 < pct1 < 100, pct1)
            pg.wait_for_function("() => document.querySelector('.demo-load').classList.contains('off')", timeout=20000)
            check("démo : l'écran disparaît quand la simulation est prête", pg.locator(".demo-load").evaluate("e => getComputedStyle(e).pointerEvents") == "none")
            check("démo : la simulation est bien chargée derrière", "agenda.html" in pg.locator(".demo-frame iframe").get_attribute("src"))
            pg.locator("[data-design]").nth(1).click(); pg.wait_for_timeout(250)
            check("démo : changer de design réaffiche l'écran de préparation", "off" not in (pg.locator(".demo-load").get_attribute("class") or "") or pg.locator(".demo-load").evaluate("e => getComputedStyle(e).opacity") != "0")
            pg.close(); DELAYS.clear()
            # --- minimum 3 s, même si la simulation est prête tout de suite
            pg = b.new_page(viewport={"width": 1280, "height": 800}); pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(base + "index.html"); t1 = time.time()
            pg.wait_for_function("() => document.querySelector('.demo-frame iframe').getAttribute('src')", timeout=10000)
            t_start = time.time()
            pg.wait_for_timeout(2000)
            check("démo prête tout de suite : l'écran reste au moins 2 s", "off" not in (pg.locator(".demo-load").get_attribute("class") or ""))
            pg.wait_for_function("() => document.querySelector('.demo-load').classList.contains('off')", timeout=10000)
            dur = time.time() - t_start
            check("démo prête tout de suite : l'écran dure au moins 3 s au total", dur >= 2.6, f"{dur:.2f}s")
            check("démo : écran disparu et simulation visible ensuite", pg.locator(".demo-load").evaluate("e => getComputedStyle(e).pointerEvents") == "none")
            check("aucune erreur JavaScript", not errs, "; ".join(errs)[:200])
            b.close()
    finally:
        srv.shutdown()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
