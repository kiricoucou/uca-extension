"""Menu hamburger (toutes les pages, une description sous chaque lien), recherche globale dans l'en-tête,
page appli.html (Android / iPhone, QR code), assistant du pilote automatique (mise-a-jour.html).

Usage : python -I -X utf8 tests/site_nav.py
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


AND = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/157 Mobile Safari/537.36"
IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157 Safari/537.36 Edg/157"


def main():
    port = 8842
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 1280, "height": 900}, user_agent=WIN_EDGE); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))

            # ---- menu : toutes les pages, chacune avec une description
            pg.goto(base + "aide.html"); pg.wait_for_timeout(800)
            pg.locator(".nv-burger").first.click(); pg.wait_for_timeout(400)
            links = pg.evaluate("() => [...document.querySelectorAll('#nvPanel nav a')].map(a => ({h: a.getAttribute('href'), t: a.querySelector('.nv-t > span') && a.querySelector('.nv-t > span').textContent, d: a.querySelector('small') && a.querySelector('small').textContent}))")
            check("menu : au moins 18 pages listées", len(links) >= 18, len(links))
            check("menu : chaque lien a une description courte (< 60 caractères)", all(l["d"] and 0 < len(l["d"]) < 60 for l in links), [l for l in links if not l["d"] or len(l["d"]) >= 60][:3])
            hrefs = [l["h"] for l in links]
            for must in ("appli.html", "mise-a-jour.html", "app-download.html", "extension/", "installation.html", "telecharger/", "app/install.html", "aide.html", "nouveautes.html", "transport.html", "lieux-map.html", "don.html", "merci.html", "confidentialite.html", "en/"):
                check(f"menu : contient {must}", any(h.split("#")[0].endswith(must) for h in hrefs))
            bad = []
            for h in sorted(set(x.split("#")[0] for x in hrefs)):
                r = pg.request.get(h if h.startswith("http") else base + h)
                if r.status != 200: bad.append((h, r.status))
            check("menu : tous les liens s'ouvrent (200)", not bad, bad)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(200)

            # ---- recherche globale
            check("en-tête : bouton « Rechercher » présent", pg.locator(".nv-find").first.is_visible())
            pg.keyboard.press("/"); pg.wait_for_timeout(300)
            check("touche / : la recherche s'ouvre, champ actif", pg.evaluate("() => document.activeElement && document.activeElement.id === 'nvSearch'"))
            pg.keyboard.type("telechargement appli"); pg.wait_for_timeout(200)
            first = pg.locator("#nvRes a").first.get_attribute("href")
            check("recherche « telechargement appli » (sans accent) : appli.html en premier", first.endswith("appli.html"), first)
            pg.fill("#nvSearch", "mise à jour"); pg.wait_for_timeout(200)
            check("recherche « mise à jour » : le pilote automatique en premier", pg.locator("#nvRes a").first.get_attribute("href").endswith("mise-a-jour.html"), pg.locator("#nvRes a").first.get_attribute("href"))
            pg.fill("#nvSearch", "bus"); pg.wait_for_timeout(200); pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
            check("Entrée : ouvre le premier résultat (transports)", "transport.html" in pg.url, pg.url)
            pg.goto(base + "index.html"); pg.wait_for_timeout(1000)
            pg.locator(".topbar .nv-find").click(); pg.wait_for_timeout(300)
            pg.fill("#nvSearch", "zzzz"); pg.wait_for_timeout(200)
            check("recherche sans résultat : message d'aide", "Aucune page" in pg.inner_text("#nvRes"))
            pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
            check("Échap ferme la recherche", not pg.locator(".nv-sbox.open").count())

            # ---- accueil : « Que veux-tu faire ? »
            cards = pg.locator(".todo-cards .card").count()
            check("accueil : 5 cartes « Que veux-tu faire ? »", cards == 5, cards)
            check("accueil : la carte « Sur mon ordinateur » est la première, recommandée, et mène à la page d'installation", pg.locator(".todo-cards .card").first.get_attribute("class").split()[:2] == ["card", "reco"] and "Recommandé" in pg.locator(".todo-cards .card").first.inner_text() and pg.locator(".todo-cards .card").first.locator("a").get_attribute("href") == "installation.html")
            check("accueil : plus de carte « Voir mon emploi du temps »", "Voir mon emploi du temps" not in pg.locator(".todo-cards").inner_text())
            check("accueil : la carte téléphone mène à appli.html", pg.locator(".todo-cards a[href='appli.html']").count() == 1)
            check("accueil : la carte « Mettre à jour » mène au pilote", pg.locator(".todo-cards a[href='mise-a-jour.html']").count() == 1)

            # ---- pilote automatique : assistant
            pg.goto(base + "mise-a-jour.html"); pg.wait_for_timeout(800)
            check("pilote : Edge détecté et choisi", pg.get_attribute(".chip[data-b='edge']", "aria-checked") == "true")
            check("pilote : rechargement indiqué pour Edge (edge://extensions)", "edge://extensions" in pg.inner_text("#p-windows .rl"))
            pg.click(".chip[data-b='firefox']"); pg.wait_for_timeout(200)
            check("pilote : Firefox choisi -> about:debugging et commande /browser firefox", "about:debugging" in pg.inner_text("#p-windows .rl") and "/browser firefox /yes" in pg.evaluate("document.querySelector('#p-windows .cmd-box').textContent"))
            pg.click("#tab-mac"); pg.wait_for_timeout(200)
            check("pilote : macOS -> commande bash --browser firefox", "--browser firefox --yes" in pg.evaluate("document.querySelector('#p-mac .cmd-box').textContent"))
            n = pg.locator(".tq").count()
            pg.locator(".tq").nth(2).click(); pg.wait_for_timeout(200)
            check("pilote : « Ça ne marche pas ? » : 6 problèmes, une réponse s'affiche", n == 6 and pg.is_visible("#tans") and "Autre dossier" in pg.inner_text("#tans"), n)
            check("pilote : téléchargement du bon fichier", pg.get_attribute("#dl-mac", "href") == "extension/maj-extension.command")
            ctx.close()

            # ---- appli.html : Android, iPhone, QR code
            for label, ua, me in (("Android", AND, "android"), ("iPhone", IOS, "iphone")):
                c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=ua); q = c.new_page(); q.on("pageerror", lambda e: errors.append(str(e)))
                q.goto(base + "appli.html"); q.wait_for_timeout(800)
                check(f"appli ({label}) : la bonne carte est marquée « Ton téléphone »", q.evaluate(f"() => document.getElementById('{me}').classList.contains('me')"))
                check(f"appli ({label}) : pas de débordement horizontal", q.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
                if me == "iphone":
                    check("appli (iPhone) : la carte iPhone passe en premier", q.evaluate("() => document.querySelector('.cards').firstElementChild.id === 'iphone'"))
                c.close()
            c = b.new_context(viewport={"width": 1280, "height": 900}); q = c.new_page()
            q.goto(base + "appli.html"); q.wait_for_timeout(800)
            check("appli : bouton APK", q.get_attribute("#dlApk", "href").endswith("EdtUca.apk"))
            check("appli : bouton iPhone vers l'app web", q.get_attribute("#openPwa", "href").startswith("app/index.html"))
            check("appli : QR code dessiné", q.locator("#qr svg").count() == 1)
            check("appli : texte court (moins de 120 mots)", len(q.inner_text("main").split()) < 120, len(q.inner_text("main").split()))
            c.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:4]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
