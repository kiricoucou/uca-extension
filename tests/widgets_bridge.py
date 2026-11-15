"""Envoi du résumé des widgets au code natif (app Android) : core/env.js appelle AndroidUCA.onWidgetData après un
changement utile (cours, notes, devoirs, absences, session), pas pour les autres réglages, et au démarrage. Le pont
natif est simulé dans le navigateur.

Usage : python -I -X utf8 tests/widgets_bridge.py
"""
import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


STUB = "window.__w = []; window.AndroidUCA = { onWidgetData: (j) => window.__w.push(j), onEventsUpdated: () => {}, onDesignChanged: () => {}, requestSync: () => {}, requestClass: () => {} };"


def main():
    port = 8825
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    base = f"http://127.0.0.1:{port}/"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 390, "height": 844})
            ctx.add_init_script(STUB)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + "app/shell.html"); pg.wait_for_timeout(500)
            st = dict(seed()); st["uca_design"] = "anime"
            pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", st)
            pg.goto(base + "app/shell.html?source=pwa#home"); pg.wait_for_timeout(4500)
            calls = pg.evaluate("() => window.__w")
            check("au démarrage : un premier résumé est envoyé au code natif", len(calls) >= 1, str(len(calls)))
            snap = json.loads(calls[-1]) if calls else {}
            check("résumé : version 1, cours, moyenne, matières", snap.get("v") == 1 and len(snap.get("events", [])) > 0 and snap.get("avg") is not None and len(snap.get("matieres", [])) > 0, str(list(snap)[:8]))
            check("résumé compact (< 60 Ko)", len(calls[-1]) < 60000 if calls else False, str(len(calls[-1]) if calls else 0))
            n0 = len(calls)
            pg.evaluate("() => chrome.storage.local.set({ uca_design: 'studio' })"); pg.wait_for_timeout(2000)
            check("un réglage sans rapport (design) n'envoie rien", pg.evaluate("() => window.__w.length") == n0)
            pg.evaluate("() => chrome.storage.local.set({ uca_tasks: [{ id: 'x', title: 'Rendre le projet', subject: 'SAE1.01', due: '2999-01-01', done: false }] })"); pg.wait_for_timeout(2200)
            after = pg.evaluate("() => window.__w")
            check("un nouveau devoir déclenche un nouvel envoi", len(after) == n0 + 1, f"{n0} -> {len(after)}")
            snap2 = json.loads(after[-1])
            check("le nouvel envoi contient le devoir", any(t["t"] == "Rendre le projet" for t in snap2.get("tasks", [])))
            pg.evaluate("() => { chrome.storage.local.set({ uca_absences: { declarees: 2, justifiees: 1, nonJustifiees: 1, journeesNonJustifiees: 0 } }); chrome.storage.local.set({ uca_session_expired: true }); }"); pg.wait_for_timeout(2200)
            last = json.loads(pg.evaluate("() => window.__w")[-1])
            check("plusieurs changements rapprochés : un seul envoi, à jour (absences, session expirée)", last["absences"]["total"] == 2 and last["sessionExpired"] is True and len(pg.evaluate("() => window.__w")) == n0 + 2)
            ctx.close()

            # sans pont natif (navigateur ordinaire) : aucune erreur, aucun chargement inutile
            ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            reqs = []
            pg.on("request", lambda r: reqs.append(r.url))
            pg.goto(base + "app/shell.html"); pg.wait_for_timeout(400)
            pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", st)
            pg.goto(base + "app/shell.html?source=pwa#home"); pg.wait_for_timeout(3500)
            pg.evaluate("() => chrome.storage.local.set({ uca_tasks: [] })"); pg.wait_for_timeout(1500)
            check("sans pont natif : aucune erreur", not errors, " | ".join(errors[:3]))
            ctx.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
