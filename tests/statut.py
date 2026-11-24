"""Page statut.html : détection de la version par l'extension (avec autorisation de l'utilisateur), puis mise à jour directe
depuis la page, ou redirection vers le fichier .bat / .command / .sh si l'utilisateur refuse.

Charge la vraie extension (harness) ; la fenêtre d'autorisation de l'extension est dans une racine fermée : on y répond au
clavier (Échap = Refuser, Tab puis Entrée = Autoriser), des touches vraies, comme un utilisateur.
Le dossier de l'extension est simulé par le dossier privé du navigateur (OPFS) ; le ZIP et sa signature sont servis depuis le dépôt.

Usage : python -I -X utf8 tests/statut.py
"""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import ROOT, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    ok = bool(ok)
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    local = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    errors = []
    zip_bytes = (ROOT / "extension" / "uca-extension-chrome.zip").read_bytes()
    sig_text = (ROOT / "extension" / "uca-extension-chrome.zip.sig").read_text(encoding="utf-8")
    try:
        time.sleep(1)
        with sync_playwright() as p:
            ctx, sw, ext_url = launch(p)
            sw.evaluate("() => chrome.storage.local.remove('uca_site_detect')")

            def newpage(online="9.99.0"):
                pg = ctx.new_page()
                pg.on("pageerror", lambda e: errors.append(str(e)))
                if online:
                    pg.route("**/manifest.json*", lambda r: r.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"version": online, "name": "UCA"})))
                pg.goto(base + "statut.html"); pg.wait_for_timeout(700)
                return pg

            def state(pg):
                return pg.locator("#main").inner_text()

            # 1) départ : rien n'est lu sans le bouton
            pg = newpage()
            check("version en ligne affichée", pg.locator("#vOnline").inner_text() == "9.99.0", pg.locator("#vOnline").inner_text())
            check("détection désactivée au départ, bouton « Activer la détection »", pg.locator("#go").inner_text() == "Activer la détection" and pg.locator("#vLocal").inner_text() == "—")
            check("aucune autorisation mémorisée par l'extension avant le clic", sw.evaluate("() => new Promise(r => chrome.storage.local.get('uca_site_detect', d => r(d.uca_site_detect === true)))") is False)

            # 2) refus de la détection
            pg.click("#go"); pg.wait_for_timeout(800)
            check("la fenêtre de l'extension est en attente (message « une fenêtre s'ouvre »)", "ton extension" in state(pg))
            pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
            check("refus : « Détection refusée », version non lue", "Détection refusée" in state(pg) and pg.locator("#vLocal").inner_text() == "—", state(pg)[:80])
            check("refus : rien de mémorisé", sw.evaluate("() => new Promise(r => chrome.storage.local.get('uca_site_detect', d => r(d.uca_site_detect === true)))") is False)

            # 3) un clic simulé par la page ne vaut pas autorisation (clic non « trusted »)
            pg.click("#go"); pg.wait_for_timeout(800)
            pg.evaluate("() => { /* la racine est fermée : la page ne peut même pas atteindre les boutons */ document.body.click(); }")
            pg.wait_for_timeout(300)
            check("la page ne peut pas valider à la place de l'utilisateur", sw.evaluate("() => new Promise(r => chrome.storage.local.get('uca_site_detect', d => r(d.uca_site_detect === true)))") is False)

            # 4) autorisation de la détection : Tab (vers « Autoriser ») puis Entrée
            pg.keyboard.press("Tab"); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
            check("autorisé : la version installée s'affiche", pg.locator("#vLocal").inner_text() == local, pg.locator("#vLocal").inner_text())
            check("version plus ancienne que celle en ligne : « Mise à jour disponible »", "Mise à jour disponible" in state(pg) and "Mettre à jour" in state(pg), state(pg)[:100])
            check("l'autorisation de détection est mémorisée par l'extension", sw.evaluate("() => new Promise(r => chrome.storage.local.get('uca_site_detect', d => r(d.uca_site_detect === true)))") is True)
            check("le bouton de désactivation apparaît", pg.locator("#revokeWrap").is_visible())

            # 5) refus de la mise à jour dans la fenêtre du site -> redirection vers le fichier de mise à jour du système
            pg.click("#upd"); pg.wait_for_timeout(400)
            check("la fenêtre du site demande communiquer / installer / modifier le dossier", pg.evaluate("() => document.getElementById('ask').open") and "modifier le dossier" in pg.locator("#ask").inner_text())
            pg.click("#askNo"); pg.wait_for_timeout(500)
            check("refus : message « Direction le fichier de mise à jour »", "Direction le fichier de mise à jour" in state(pg), state(pg)[:100])
            pg.wait_for_url("**/mise-a-jour.html*", timeout=6000)
            check("refus : redirigé vers la page du pilote, onglet de son système", pg.url.endswith("mise-a-jour.html#windows") or "mise-a-jour.html#" in pg.url, pg.url)
            pg.close()

            # 6) la détection mémorisée : à la réouverture, version lue sans nouvelle fenêtre
            pg = newpage()
            check("réouverture : détection automatique sans nouvelle question", pg.locator("#vLocal").inner_text() == local, pg.locator("#vLocal").inner_text())

            # 7) refus à l'étape de l'extension -> redirection aussi
            pg.click("#upd"); pg.wait_for_timeout(300); pg.click("#askYes"); pg.wait_for_timeout(900)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
            check("refus dans la fenêtre de l'extension : direction le fichier de mise à jour", "Direction le fichier de mise à jour" in state(pg), state(pg)[:100])
            pg.close()

            # 8) autorisation complète : dossier simulé, paquet signé, rechargement
            pg = newpage()
            pg.route("https://raw.githubusercontent.com/**", lambda r: r.fulfill(status=200, headers={"access-control-allow-origin": "*"}, body=zip_bytes if r.request.url.split("?")[0].endswith(".zip") else sig_text))
            pg.evaluate("""async () => {
              const root = await navigator.storage.getDirectory();
              try { await root.removeEntry('uca-ext', { recursive: true }); } catch (e) {}
              const d = await root.getDirectoryHandle('uca-ext', { create: true });
              const f = await d.getFileHandle('manifest.json', { create: true });
              const w = await f.createWritable(); await w.write(JSON.stringify({ name: 'Emploi du temps UCA (non officiel)', version: '0.0.1', manifest_version: 3 })); await w.close();
              window.showDirectoryPicker = async () => d;
            }""")
            pg.click("#upd"); pg.wait_for_timeout(300); pg.click("#askYes"); pg.wait_for_timeout(900)
            pg.keyboard.press("Tab"); pg.keyboard.press("Enter")
            pg.wait_for_function("() => document.getElementById('pb') || /Version .* installée|Échec|Direction/.test(document.getElementById('main').innerText)", timeout=20000)
            pg.wait_for_timeout(2500)
            txt = state(pg)
            written = pg.evaluate("""async () => { const r = await navigator.storage.getDirectory(); const d = await r.getDirectoryHandle('uca-ext'); const m = JSON.parse(await (await (await d.getFileHandle('manifest.json')).getFile()).text()); let n = 0; for await (const _ of d.keys()) n++; return { v: m.version, n }; }""") if not pg.is_closed() else {}
            check("mise à jour directe : les fichiers de la dernière version sont écrits dans le dossier", written.get("v") == local and written.get("n", 0) > 20, str(written) + " | " + txt[:120])
            ctx.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript de la page", not errors, " | ".join(errors[:3]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
