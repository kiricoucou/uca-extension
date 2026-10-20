"""Pont extension <-> app web (content-bridge.js + core/env.js) : quand l'extension Chrome est
installée dans le même navigateur que l'app, l'app peut déclencher une vraie synchro au lieu du
transfert manuel par lien/QR/fichier. Charge la vraie extension (comme e2e.py) et sert le dépôt en
local sur 127.0.0.1 — déjà dans les "matches" du content script (les ports n'y comptent pas).

N'appelle jamais la vraie synchro Odin (la session de test n'existe pas, et ça ouvrirait une vraie
fenêtre de connexion CAS) : seule la plomberie est vérifiée, avec un résultat de synchro simulé
posté comme le ferait content-bridge.js.

Usage : python -I -X utf8 tests/bridge.py
"""
import socket
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import ROOT, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    errors = []
    try:
        time.sleep(1)
        with sync_playwright() as p:
            ctx, sw, ext_url = launch(p)
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            data = seed(); data["uca_design"] = "anime"
            # Donnée de départ différente du résultat simulé plus bas, pour prouver que c'est bien
            # le message du pont qui a mis à jour l'app, pas les données déjà en place.
            data["uca_events"] = data["uca_events"][:1]
            page.goto(base + "designs/anime/agenda.html"); page.wait_for_timeout(400)
            page.evaluate("(d) => new Promise(r => chrome.storage.local.set(d, r))", data)
            page.goto(base + "designs/anime/agenda.html"); page.wait_for_timeout(1200)

            ready = page.evaluate("() => window.UCA_APP && window.UCA_APP.extensionReady")
            check("extension détectée par l'app (content-bridge.js injecté)", ready is True, str(ready))

            label = page.locator("#syncBtn").inner_text()
            check("bouton redevenu « Synchroniser » (extension présente)", "Synchroniser" in label, label)
            check("bouton Importer ajouté à côté", page.locator("#appImportBtn").count() == 1)
            sync_sent = page.evaluate("() => !document.getElementById('syncBtn').disabled")
            check("pas de synchro auto (dernière synchro récente)", sync_sent)

            fake_events = seed()["uca_events"]  # jeu complet, différent du jeu tronqué déposé plus haut
            page.evaluate("""(events) => {
              window.postMessage({ source: 'uca-extension', type: 'UCA_SYNC_RESULT', ok: true,
                events, lastSync: new Date().toISOString(), silent: true }, location.origin);
            }""", fake_events)
            page.wait_for_timeout(600)
            stored = page.evaluate("() => new Promise(r => chrome.storage.local.get('uca_events', d => r((d.uca_events || []).length)))")
            check("résultat de synchro (simulé) persisté dans le stockage de l'app", stored == len(fake_events), str(stored))
            rendered = page.locator(".event-card, .m-card").count()
            check("agenda mis à jour sans recharger la page", rendered > 0, str(rendered))
            check("aucune erreur JS", not errors, " | ".join(errors[:3]))
            ctx.close()
    finally:
        server.terminate()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
