"""Page app-download.html : deux menus (appareil, puis système), liens adaptés, tutoriels, APK avec confirmation,
PWA « non recommandée » sur Android, App Store indisponible + PWA sur iPhone.

Usage : python -I -X utf8 tests/app_download.py
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


SLOW = """
const realFetch = window.fetch.bind(window);
window.__fail = false; window.__n = 5;
window.fetch = (url, opts) => {
  if (!/\\.(zip|apk)(\\?|$)/.test(String(url))) return realFetch(url, opts);
  if (window.__fail) return Promise.resolve(new Response('x', { status: 500 }));
  const n = window.__n; let sent = 0;
  const stream = new ReadableStream({ async pull(c) { await new Promise(r => setTimeout(r, 250)); if (sent >= n) { c.close(); return; } c.enqueue(new Uint8Array(1000)); sent++; } });
  return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-length': String(n * 1000) } }));
};
"""


def pick(pg, btn, option):
    pg.click(btn); pg.wait_for_timeout(120); pg.click(option); pg.wait_for_timeout(250)


def main():
    port = 8820
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    base = f"http://127.0.0.1:{port}/app-download.html"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()

            # ---------- premier menu ----------
            ctx = b.new_context(viewport={"width": 1200, "height": 900}, user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157"); ctx.add_init_script(SLOW)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base); pg.wait_for_timeout(400)
            check("page construite comme les autres (menu du site, titre, canonique)", "Installer l'app" in pg.title() and pg.locator("link[rel=canonical]").get_attribute("href").endswith("/app-download.html") and pg.locator("link[href='site.css']").count() == 1)
            check("au départ : seule la question « appareil », pas de fiche", pg.is_visible("#q1") and pg.is_hidden("#q2") and pg.is_visible("#resEmpty"))
            pg.click("#devBtn"); pg.wait_for_timeout(120)
            check("menu appareil : Ordinateur et Téléphone", pg.locator("#devList li").count() == 2 and "Ordinateur" in pg.inner_text("#devList") and "Téléphone" in pg.inner_text("#devList"))
            check("ordinateur marqué « Détecté » sur Windows", "Détecté" in pg.inner_text("#devList-pc"))
            pg.click("#devList-pc"); pg.wait_for_timeout(250)
            check("ordinateur : le second menu apparaît avec Windows, Linux, macOS", pg.is_visible("#q2") and pg.locator("#osList li").count() == 3 and all(k in pg.inner_text("#osList") for k in ("Windows", "Linux", "macOS")))

            # ---------- ordinateur ----------
            pick(pg, "#osBtn", "#osList-windows")
            txt = pg.inner_text("#res")
            check("Windows : installateur automatique (Recommandé) et ZIP", "Installateur automatique pour Windows" in txt and "Recommandé" in txt and "Installation avec le ZIP" in txt)
            check("Windows : lien de l'installateur .bat", pg.locator("#res a[href='extension/installer-windows.bat'][download]").count() == 1)
            check("deux boutons « Voir le tutoriel en images » (installateur, ZIP)", pg.locator("#res a.btn-line").count() == 2 and pg.locator("#res a[href='installation.html#installateur']").count() == 1 and pg.locator("#res a[href='installation.html#zip']").count() == 1)
            pick(pg, "#osBtn", "#osList-mac")
            check("macOS : bon installateur", pg.locator("#res a[href='extension/installer-mac.command']").count() == 1 and "Installateur automatique pour macOS" in pg.inner_text("#res"))
            pick(pg, "#osBtn", "#osList-linux")
            check("Linux : bon installateur", pg.locator("#res a[href='extension/install-linux.sh']").count() == 1)
            with pg.expect_download() as dl:
                pg.click("#res a[href='extension/install-linux.sh']")
            check("le clic télécharge install-linux.sh", dl.value.suggested_filename == "install-linux.sh", dl.value.suggested_filename)
            # ZIP : fenêtre de progression
            pg.click("#zipGo"); pg.wait_for_timeout(700)
            mid = pg.evaluate("() => [document.getElementById('dlDlg').open, parseInt(document.getElementById('dlBar').getAttribute('aria-valuenow'), 10), document.getElementById('dlPct').textContent]")
            check("ZIP : fenêtre avec pourcentage en cours de route", mid[0] and 0 < mid[1] < 100 and "%" in mid[2], str(mid))
            with pg.expect_download() as dl2:
                pg.wait_for_selector("#dlDone:not([hidden])", timeout=8000)
            check("ZIP : « Vous avez bien téléchargé le ZIP ? » et fichier enregistré", "Vous avez bien téléchargé le ZIP ?" in pg.inner_text("#dlDone") and dl2.value.suggested_filename == "uca-extension-chrome.zip")
            pg.click("#dlOk"); pg.wait_for_timeout(900)
            vis = pg.evaluate("() => { const r = document.getElementById('zip-3').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }")
            check("« Oui » mène au tutoriel, sur l'étape d'extraction (visible à l'écran)", "installation.html" in pg.url and pg.url.endswith("#zip-3") and vis, pg.url + " visible=" + str(vis))
            ctx.close()

            # ---------- téléphone : Android ----------
            ctx = b.new_context(viewport={"width": 1200, "height": 900}); ctx.add_init_script(SLOW); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base); pg.wait_for_timeout(400)
            pick(pg, "#devBtn", "#devList-phone")
            check("téléphone : second menu Android / iOS", pg.locator("#osList li").count() == 2 and "Android" in pg.inner_text("#osList") and "iOS" in pg.inner_text("#osList"))
            pick(pg, "#osBtn", "#osList-android")
            txt = pg.inner_text("#res")
            check("Android : APK recommandé + bouton « Télécharger l'APK »", "Recommandé" in txt and "Télécharger l'APK" in txt)
            check("Android : deuxième fiche « Installer via PWA (application via le web) » marquée Non recommandé", "Installer via PWA (application via le web)" in txt and "Non recommandé" in txt)
            check("Android : le texte souligne que la PWA reste disponible si l'APK ne marche pas", "reste disponible en cas de besoin" in txt and "même si l'APK ne fonctionne pas" in txt)
            pg.click("#apkGo"); pg.wait_for_timeout(300)
            check("APK : petite fenêtre « Voulez-vous bien télécharger ? »", pg.evaluate("() => document.getElementById('dlDlg').open") and "Voulez-vous bien télécharger ?" in pg.inner_text("#dlConfirm") and pg.inner_text("#dlYes").strip() == "Télécharger l'application")
            pg.click("#dlNo"); pg.wait_for_timeout(200)
            check("APK : « Annuler » ferme sans rien télécharger", not pg.evaluate("() => document.getElementById('dlDlg').open"))
            pg.click("#apkGo"); pg.wait_for_timeout(200)
            with pg.expect_download() as dl3:
                pg.click("#dlYes"); pg.wait_for_selector("#dlDone:not([hidden])", timeout=8000)
            check("APK : « Télécharger l'application » lance le téléchargement de EdtUca.apk", dl3.value.suggested_filename == "EdtUca.apk", dl3.value.suggested_filename)
            pg.click("#dlOk"); pg.wait_for_timeout(200)
            pg.evaluate("() => { window.__fail = true; }"); pg.click("#apkGo"); pg.click("#dlYes"); pg.wait_for_selector("#dlErr:not([hidden])", timeout=5000)
            check("APK : échec réseau -> message, réessai et lien direct", "n'a pas abouti" in pg.inner_text("#dlErr") and pg.get_attribute("#dlDirect", "href") == "EdtUca.apk")
            pg.click("#dlClose"); pg.wait_for_timeout(150)
            pg.click("#pwaGo"); pg.wait_for_timeout(1200)
            check("PWA : le bouton mène au guide d'installation de l'app web", "app/install.html" in pg.url, pg.url)
            ctx.close()

            # ---------- téléphone : iOS ----------
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base); pg.wait_for_timeout(400)
            pg.tap("#devBtn"); pg.tap("#devList-phone"); pg.wait_for_timeout(250); pg.tap("#osBtn"); pg.tap("#osList-ios"); pg.wait_for_timeout(300)
            txt = pg.inner_text("#res")
            check("iOS : « Application dans l'App Store » indisponible pour le moment", "Application dans l'App Store" in txt and "Indisponible pour le moment, veuillez réessayer plus tard" in txt)
            check("iOS : le bouton App Store est désactivé", pg.evaluate("() => document.querySelector('#res .btn-dl[disabled]') !== null"))
            check("iOS : alternative PWA avec bouton d'installation", "Une alternative existe" in txt and pg.locator("#iosGo").count() == 1)
            pg.tap("#iosGo"); pg.wait_for_timeout(300)
            check("iOS : le bouton ouvre le guide Safari en trois touches", pg.evaluate("() => document.getElementById('iosDlg').open") and pg.locator("#iosDlg .ios-steps li").count() == 3 and "Partager" in pg.inner_text("#iosDlg"))
            m = pg.evaluate("() => [document.documentElement.scrollWidth <= innerWidth + 1, (() => { const r = document.getElementById('iosDlg').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()]")
            check("téléphone : aucun débordement horizontal, fenêtre dans l'écran", all(m), str(m))
            ctx.close()

            # ---------- clavier ----------
            ctx = b.new_context(viewport={"width": 1200, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base); pg.wait_for_timeout(300)
            pg.focus("#devBtn"); pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(100); pg.keyboard.press("End"); pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
            check("clavier : Fin + Entrée choisit Téléphone", "Téléphone" in pg.inner_text("#devLabel") and pg.is_visible("#q2"))
            pg.click("#osBtn"); pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
            check("Échap ferme le menu", pg.is_hidden("#osList"))
            ctx.close()

            # ---------- fichiers servis ----------
            ctx = b.new_context(); pg = ctx.new_page()
            for f in ("EdtUca.apk", "extension/uca-extension-chrome.zip", "extension/uca-extension-firefox.zip", "extension/installer-windows.bat", "extension/installer-mac.command", "extension/install-linux.sh", "installation.html", "app/install.html"):
                check(f"{f} servi par le site", pg.request.get(f"http://127.0.0.1:{port}/{f}").status == 200)
            ctx.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
