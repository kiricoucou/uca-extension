"""Page d'accueil du site : « Comment l'installer » (extension) -> installation.html ; « Installer l'app » -> app-download.html,
avec une fenêtre de choix (ouvrir l'app installée / voir la page d'installation) quand l'app est déjà installée.
Détection simulée : getInstalledRelatedApps (API du navigateur) puis repère uca_pwa_installed.

Usage : python -I -X utf8 tests/home_install.py
"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


APP_BTN = "article.card a[data-install-app]"


def main():
    port = 8814
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    base = f"http://127.0.0.1:{port}/"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()

            # 1) Bouton de l'extension
            ctx = b.new_context(viewport={"width": 1200, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + "index.html"); pg.wait_for_timeout(500)
            href = pg.evaluate("() => [...document.querySelectorAll('article.card a.btn')].find(a => a.textContent.trim() === \"Comment l'installer\").getAttribute('href')")
            check("« Comment l'installer » -> installation.html", href == "installation.html", href)
            check("installation.html existe et s'ouvre", pg.request.get(base + "installation.html").status == 200)
            check("« Installer l'app » -> app-download.html", pg.get_attribute(APP_BTN, "href") == "app-download.html")

            # 2) App non installée : le lien mène directement au guide
            pg.click(APP_BTN); pg.wait_for_timeout(1200)
            check("app non installée : le clic ouvre la page d'installation (pas de fenêtre)", "app-download.html" in pg.url, pg.url)
            ctx.close()

            # 3) App installée (repère local)
            ctx = b.new_context(viewport={"width": 1200, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + "index.html"); pg.evaluate("() => localStorage.setItem('uca_pwa_installed', '1')"); pg.reload(); pg.wait_for_timeout(400)
            pg.click(APP_BTN); pg.wait_for_timeout(300)
            check("app installée (repère) : la fenêtre de choix s'ouvre", pg.evaluate("() => document.getElementById('installChoice').open"))
            check("la fenêtre reste sur l'accueil", pg.url.endswith("index.html"), pg.url)
            check("choix « Ouvrir l'app installée » -> app/index.html", pg.get_attribute("#installChoiceOpen", "href").startswith("app/index.html"))
            check("choix « Voir la page d'installation » -> app-download.html", pg.get_attribute("#installChoiceGuide", "href") == "app-download.html")
            pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
            check("Échap ferme la fenêtre", not pg.evaluate("() => document.getElementById('installChoice').open"))
            pg.click(APP_BTN); pg.wait_for_timeout(200); pg.click("#installChoiceClose"); pg.wait_for_timeout(200)
            check("« Annuler » ferme la fenêtre", not pg.evaluate("() => document.getElementById('installChoice').open"))
            pg.click(APP_BTN); pg.wait_for_timeout(200); pg.click("#installChoiceGuide"); pg.wait_for_timeout(1200)
            check("« Voir la page d'installation » ouvre le guide", "app-download.html" in pg.url, pg.url)
            ctx.close()

            # 4) App installée (API du navigateur), sans repère local
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            ctx.add_init_script("navigator.getInstalledRelatedApps = () => Promise.resolve([{ platform: 'webapp', url: 'x' }]);")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + "index.html"); pg.wait_for_timeout(400)
            pg.click(APP_BTN); pg.wait_for_timeout(300)
            check("app installée (API du navigateur) : la fenêtre s'ouvre aussi sur téléphone", pg.evaluate("() => document.getElementById('installChoice').open"))
            box = pg.evaluate("() => { const r = document.querySelector('#installChoice').getBoundingClientRect(); return [r.left, r.right, innerWidth]; }")
            check("la fenêtre tient dans l'écran du téléphone", box[0] >= 0 and box[1] <= box[2], str(box))
            ctx.close()

            # 5) API qui échoue : on retombe sur le guide
            ctx = b.new_context(viewport={"width": 1200, "height": 900})
            ctx.add_init_script("navigator.getInstalledRelatedApps = () => Promise.reject(new Error('non'));")
            pg = ctx.new_page(); pg.goto(base + "index.html"); pg.wait_for_timeout(400)
            pg.click(APP_BTN); pg.wait_for_timeout(1200)
            check("détection impossible : le guide s'ouvre directement", "app-download.html" in pg.url, pg.url)
            ctx.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
