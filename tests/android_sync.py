"""App Android : le natif envoie le TEXTE brut de la page Odin (UCA_SYNC_RESULT avec "text", sans "events").
core/env.js doit le transformer en cours, les enregistrer et afficher l'agenda.

Simule le pont natif (window.AndroidUCA) dans Chromium, sert le dépôt en local ; aucun contact avec Odin ni le CAS.

Usage : python -I -X utf8 tests/android_sync.py
"""
import json
import socket
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import NO_REAL_SERVERS, ROOT  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


STUB = """
window.__native = { sync: [], events: 0 };
window.AndroidUCA = { requestSync(m) { window.__native.sync.push(m); }, onEventsUpdated(j) { window.__native.events = JSON.parse(j).length; } };
"""


def deliver(page, payload):
    page.evaluate("(p) => window.postMessage(Object.assign({ source: 'uca-extension' }, p), '*')", payload)
    page.wait_for_timeout(500)


def stored(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('uca_store') || '{}')")


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    text = (ROOT / "tests" / "pages" / "odin_edt.txt").read_text(encoding="utf-8")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[NO_REAL_SERVERS])
            for design in ("anime", "professionnel", "bulletin", "carnet"):
                ctx = browser.new_context(viewport={"width": 1280, "height": 800})
                ctx.add_init_script(STUB)
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(base + "app/index.html"); page.wait_for_timeout(300)
                page.evaluate("(d) => localStorage.setItem('uca_store', JSON.stringify({ uca_design: d, uca_events: [{year: 2025, month: 0, day: 1, startH: 8, startM: 0, endH: 9, endM: 0, title: 'Ancien cours', date: '2025-01-01'}], uca_last_sync: '2025-01-01T00:00:00.000Z' }))", design)
                page.goto(base + f"designs/{design}/agenda.html"); page.wait_for_timeout(1200)
                check(f"{design} : l'app est bien en mode natif (pas de redirection vers l'import)", f"designs/{design}/agenda.html" in page.url, page.url)

                deliver(page, {"type": "UCA_SYNC_RESULT", "ok": True, "text": text, "silent": True})
                data = stored(page)
                evs = data.get("uca_events") or []
                check(f"{design} : le texte d'Odin devient des cours enregistrés", len(evs) == 3, str(len(evs)))
                check(f"{design} : cours lu avec salle et enseignant", any(e.get("room") == "B1-12" and e.get("teacher") == "Martin Alice" and e.get("startH") == 8 for e in evs), json.dumps(evs[:1], ensure_ascii=False)[:200])
                check(f"{design} : date de synchro mise à jour", (data.get("uca_last_sync") or "") > "2026", str(data.get("uca_last_sync")))
                check(f"{design} : session marquée valide", data.get("uca_session_expired") is False, str(data.get("uca_session_expired")))
                check(f"{design} : calendrier du téléphone prévenu", page.evaluate("() => window.__native.events") == 3, str(page.evaluate("() => window.__native.events")))

                deliver(page, {"type": "UCA_SYNC_RESULT", "ok": True, "text": "Emploi du temps\nrien ici", "silent": True})
                data = stored(page)
                check(f"{design} : page sans cours → ancien emploi du temps conservé", len(data.get("uca_events") or []) == 3, str(len(data.get("uca_events") or [])))
                deliver(page, {"type": "UCA_SESSION_STATE", "expired": True})
                check(f"{design} : session expirée enregistrée", stored(page).get("uca_session_expired") is True)
                check(f"{design} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                ctx.close()
            browser.close()
    finally:
        server.terminate()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
