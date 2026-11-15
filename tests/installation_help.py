"""Page d'aide à l'installation (installation.html) : menu « système d'exploitation » de l'installateur automatique
(clavier et souris, fiche à droite, bon fichier à télécharger) et téléchargement du ZIP avec fenêtre de progression
puis « Vous avez bien téléchargé le ZIP ? ».

Usage : python -I -X utf8 tests/installation_help.py
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


# fetch simulé pour observer la progression (flux lent avec content-length)
SLOW_FETCH = """
const realFetch = window.fetch.bind(window);
window.__chunks = 5; window.__fail = false;
window.fetch = (url, opts) => {
  if (!String(url).includes('uca-extension-chrome.zip')) return realFetch(url, opts);
  if (window.__fail) return Promise.resolve(new Response('x', { status: 500 }));
  const n = window.__chunks, size = 1000; let sent = 0;
  const stream = new ReadableStream({ async pull(c) { await new Promise(r => setTimeout(r, 250)); if (sent >= n) { c.close(); return; } c.enqueue(new Uint8Array(size)); sent++; } });
  return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-length': String(n * size) } }));
};
"""


def main():
    port = 8816
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    base = f"http://127.0.0.1:{port}/installation.html"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()

            # ---------- Installateur automatique : menu des systèmes ----------
            ctx = b.new_context(viewport={"width": 1200, "height": 900}, user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157"); pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base); pg.wait_for_timeout(300)
            check("onglet « Installateur automatique » ouvert par défaut avec la question du système", pg.is_visible("#osQ") and "système d'exploitation" in pg.inner_text("#osQ"))
            check("avant le choix : pas de fiche, message d'attente", pg.is_hidden("#osCard") and pg.is_visible("#osEmpty"))
            check("menu fermé au départ", pg.is_hidden("#osList") and pg.get_attribute("#osBtn", "aria-expanded") == "false")
            pg.click("#osBtn"); pg.wait_for_timeout(150)
            check("clic : le menu s'ouvre avec 3 systèmes", pg.is_visible("#osList") and pg.locator("#osList li").count() == 3 and pg.get_attribute("#osBtn", "aria-expanded") == "true")
            check("Windows marqué « Détecté »", "Détecté" in pg.inner_text("#os-windows"))
            pg.click("#os-linux"); pg.wait_for_timeout(250)
            check("Linux choisi : fiche à droite avec titre, SVG et bouton", pg.is_visible("#osCard") and "Installateur Linux" in pg.inner_text("#osCard") and pg.locator("#osCard svg").count() >= 2)
            check("Linux : le bouton télécharge install-linux.sh", pg.get_attribute("#osDl", "href") == "extension/install-linux.sh" and pg.get_attribute("#osDl", "download") is not None)
            check("le menu se referme et affiche le choix", pg.is_hidden("#osList") and "Linux" in pg.inner_text("#osLabel"))
            card = pg.evaluate("() => { const c = document.getElementById('osCard').getBoundingClientRect(), l = document.querySelector('.os-left').getBoundingClientRect(); return [c.left > l.right - 2, Math.abs(c.top - l.top) < 40]; }")
            check("la fiche est à droite du menu (bureau)", card[0] and card[1], str(card))
            with pg.expect_download() as dl:
                pg.click("#osDl")
            check("clic sur le bouton : téléchargement de install-linux.sh", dl.value.suggested_filename == "install-linux.sh", dl.value.suggested_filename)
            # clavier
            pg.focus("#osBtn"); pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(100)
            check("clavier : flèche bas ouvre le menu", pg.is_visible("#osList"))
            pg.keyboard.press("Home"); pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
            check("clavier : Début + Entrée choisit Windows", "Installateur Windows" in pg.inner_text("#osCard") and pg.get_attribute("#osDl", "href") == "extension/installer-windows.bat")
            check("Windows : lien « étape 3 » vers les captures", pg.locator("#osCard a.next").count() == 1)
            pg.click("#osBtn"); pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
            check("Échap ferme le menu", pg.is_hidden("#osList"))
            pg.click("#osBtn"); pg.click("h1"); pg.wait_for_timeout(100)
            check("clic ailleurs ferme le menu", pg.is_hidden("#osList"))
            pg.click("#osBtn"); pg.click("#os-mac"); pg.wait_for_timeout(250)
            check("macOS : bon fichier .command", pg.get_attribute("#osDl", "href") == "extension/installer-mac.command")
            for f in ("installer-windows.bat", "installer-mac.command", "install-linux.sh"):
                check(f"{f} servi par le site", pg.request.get(base.replace("installation.html", "extension/" + f)).status == 200)
            ctx.close()

            # téléphone : la fiche passe sous le menu
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base); pg.wait_for_timeout(300); pg.tap("#osBtn"); pg.tap("#os-windows"); pg.wait_for_timeout(250)
            m = pg.evaluate("() => { const c = document.getElementById('osCard').getBoundingClientRect(), l = document.querySelector('.os-left').getBoundingClientRect(); return [c.top >= l.bottom - 2, c.right <= innerWidth + 1, document.documentElement.scrollWidth <= innerWidth + 1]; }")
            check("téléphone : fiche sous le menu, sans débordement", all(m), str(m))
            ctx.close()

            # ---------- ZIP : fenêtre de téléchargement ----------
            ctx = b.new_context(viewport={"width": 1200, "height": 900}); ctx.add_init_script(SLOW_FETCH); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + "#zip"); pg.wait_for_timeout(300)
            check("onglet ZIP : « Veuillez installer le ZIP » et bouton « Installer le ZIP »", "Veuillez installer le ZIP" in pg.inner_text("#zipHelper") and pg.inner_text("#zipBtn").strip() == "Installer le ZIP")
            pg.click("#zipBtn"); pg.wait_for_timeout(400)
            check("la fenêtre de progression s'ouvre", pg.evaluate("() => document.getElementById('zipDlg').open") and pg.is_visible("#zipProg"))
            pg.wait_for_timeout(500)
            mid = pg.evaluate("() => [document.getElementById('zipPct').textContent, parseInt(document.getElementById('zipBar').getAttribute('aria-valuenow'), 10), document.getElementById('zipFill').style.width]")
            check("pendant le téléchargement : pourcentage et barre avancent (entre 0 et 100)", 0 < mid[1] < 100 and "%" in mid[0] and mid[2].endswith("%"), str(mid))
            with pg.expect_download() as dl:
                pg.wait_for_selector("#zipAsk:not([hidden])", timeout=8000)
            check("fin : le ZIP est enregistré sous le bon nom", dl.value.suggested_filename == "uca-extension-chrome.zip", dl.value.suggested_filename)
            check("fin : « Vous avez bien téléchargé le ZIP ? »", "Vous avez bien téléchargé le ZIP ?" in pg.inner_text("#zipAsk") and pg.is_hidden("#zipProg"))
            check("barre à 100 % à la fin", pg.evaluate("() => document.getElementById('zipFill').style.width") == "100%")
            pg.click("#zipNo"); pg.wait_for_timeout(300)
            check("« Non, le télécharger à nouveau » relance le téléchargement", pg.is_visible("#zipProg"))
            pg.wait_for_selector("#zipAsk:not([hidden])", timeout=8000)
            pg.click("#zipYes"); pg.wait_for_timeout(500)
            check("« Oui » ferme la fenêtre et mène à l'étape d'extraction", not pg.evaluate("() => document.getElementById('zipDlg').open") and pg.evaluate("() => location.hash") == "#zip-3")
            # annulation
            pg.evaluate("() => { window.__chunks = 30; }"); pg.click("#zipBtn"); pg.wait_for_timeout(600); pg.click("#zipCancel"); pg.wait_for_timeout(300)
            check("« Annuler » ferme la fenêtre sans demander confirmation", not pg.evaluate("() => document.getElementById('zipDlg').open"))
            # échec réseau
            pg.evaluate("() => { window.__fail = true; }"); pg.click("#zipBtn"); pg.wait_for_selector("#zipErr:not([hidden])", timeout=5000)
            check("échec : message d'erreur, réessai et lien direct", "n'a pas abouti" in pg.inner_text("#zipErr") and pg.locator("#zipErr a[download]").count() == 1)
            ctx.close()

            # vrai téléchargement (sans simulation)
            ctx = b.new_context(viewport={"width": 1200, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + "#zip"); pg.wait_for_timeout(300)
            with pg.expect_download(timeout=20000) as dl:
                pg.click("#zipBtn")
            check("vrai fichier : le ZIP du site se télécharge", dl.value.suggested_filename == "uca-extension-chrome.zip" and Path(dl.value.path()).stat().st_size > 1_000_000, dl.value.suggested_filename)
            pg.wait_for_selector("#zipAsk:not([hidden])", timeout=8000)
            ctx.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
