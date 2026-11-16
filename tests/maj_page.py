"""Page mise-a-jour.html : présentation des scripts .bat / .command / .sh (onglets par système, détection, téléchargements),
fenêtre de confirmation expliquée, lien depuis le menu du site, téléphone sans débordement.

Usage : python -I -X utf8 tests/maj_page.py
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


WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157"
MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605 Safari/605"
LIN = "Mozilla/5.0 (X11; Linux x86_64) Chrome/157"


def main():
    port = 8834
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    base = f"http://127.0.0.1:{port}/mise-a-jour.html"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for label, ua, sel, fname in (("Windows", WIN, "windows", "maj-extension.bat"), ("macOS", MAC, "mac", "maj-extension.command"), ("Linux", LIN, "linux", "maj-extension.sh")):
                ctx = b.new_context(viewport={"width": 1200, "height": 900}, user_agent=ua); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(base); pg.wait_for_timeout(500)
                check(f"{label} détecté : son onglet est ouvert et marqué « Détecté »", pg.get_attribute(f"#tab-{sel}", "aria-selected") == "true" and "Détecté" in pg.inner_text(f"#tab-{sel}") and pg.is_visible(f"#p-{sel}"))
                check(f"{label} : bouton de téléchargement de {fname}", pg.get_attribute(f"#dl-{sel}", "href") == f"extension/{fname}" and pg.get_attribute(f"#dl-{sel}", "download") is not None)
                with pg.expect_download() as dl:
                    pg.click(f"#dl-{sel}")
                check(f"{label} : le fichier se télécharge sous le bon nom", dl.value.suggested_filename == fname, dl.value.suggested_filename)
                ctx.close()

            ctx = b.new_context(viewport={"width": 1200, "height": 900}, user_agent=WIN); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base); pg.wait_for_timeout(400)
            check("4 étapes présentées (lancer, retrouver, vérifier, mettre à jour)", pg.locator(".flow li").count() == 4)
            check("la fenêtre de confirmation est expliquée avec « Ouvrir le dossier » et « Valider »", "Ouvrir le dossier" in pg.inner_text(".win") and "Valider" in pg.inner_text(".win"))
            pg.click("#tab-mac"); pg.wait_for_timeout(200)
            check("clic sur macOS : son panneau s'affiche, celui de Windows se cache", pg.is_visible("#p-mac") and pg.is_hidden("#p-windows") and pg.get_attribute("#tab-mac", "aria-selected") == "true")
            pg.focus("#tab-mac"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)
            check("flèche droite : passe à Linux (clavier)", pg.get_attribute("#tab-linux", "aria-selected") == "true")
            pg.goto(base + "#mac"); pg.wait_for_timeout(400)
            check("adresse #mac : onglet macOS ouvert", pg.get_attribute("#tab-mac", "aria-selected") == "true")
            ctx.close()

            ctx = b.new_context(viewport={"width": 1200, "height": 900}, user_agent=WIN); pg = ctx.new_page()
            for f in ("maj-extension.bat", "maj-extension.command", "maj-extension.sh"):
                check(f"extension/{f} servi par le site", pg.request.get(f"http://127.0.0.1:{port}/extension/{f}").status == 200)
            check("sitemap : la page est listée", "mise-a-jour.html" in pg.request.get(f"http://127.0.0.1:{port}/sitemap.xml").text())
            pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(1200)
            pg.locator(".nv-burger").first.click(); pg.wait_for_timeout(500)
            check("menu du site : « Mettre à jour l'extension » mène à la nouvelle page", pg.locator("a[href$='mise-a-jour.html']").count() >= 1)
            ctx.close()

            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=LIN); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base); pg.wait_for_timeout(500)
            ov = pg.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1")
            check("téléphone : aucun débordement horizontal", ov)
            check("téléphone : les onglets restent utilisables", pg.is_visible("#tab-windows") and pg.is_visible("#p-linux"))
            ctx.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
