"""Première connexion : une seule question « Odin, Moodle ou les deux ? » (stockée sur l'appareil, règle « Notes Moodle »).
Posée au premier clic sur Synchroniser, jamais deux fois, « Plus tard » ne l'enregistre pas. Chaque design.

Usage : python -I -X utf8 tests/usage_question.py
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
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        time.sleep(1)
        with sync_playwright() as p:
            ctx, sw, ext = launch(p, viewport={"width": 1280, "height": 800})
            page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
            for design in ("studio", "anime", "carnet", "professionnel", "lumen"):
                data = seed(); data["uca_design"] = design
                sw.evaluate("() => chrome.storage.local.remove(['uca_usage','uca_settings'])")
                sw.evaluate("(d) => chrome.storage.local.set(d)", data)
                page.goto(f"{ext}/designs/{design}/agenda.html"); page.wait_for_timeout(900)
                page.evaluate("() => { window.__sent = []; chrome.runtime.sendMessage = (m) => { window.__sent.push(m.type); }; }")
                get = lambda: sw.evaluate("() => new Promise(r => chrome.storage.local.get(['uca_usage','uca_settings'], d => r(d)))")
                page.locator("#syncBtn").click(); page.wait_for_timeout(500)
                check(f"{design} : la question s'affiche au premier clic sur Synchroniser", page.locator("#usageOverlay").count() == 1)
                check(f"{design} : la synchro attend la réponse", page.evaluate("() => window.__sent.length") == 0)
                page.locator("#usSkip").click(); page.wait_for_timeout(500)
                check(f"{design} : « Plus tard » n'enregistre rien et la synchro part", not get().get("uca_usage") and "UCA_SYNC_REQUEST" in page.evaluate("() => window.__sent"))
                page.evaluate("() => { window.__sent = []; }"); page.wait_for_timeout(2300)
                page.locator("#syncBtn").evaluate("b => { b.disabled = false; }")
                page.locator("#syncBtn").click(); page.wait_for_timeout(500)
                check(f"{design} : la question revient après « Plus tard »", page.locator("#usageOverlay").count() == 1)
                page.locator("#usageOverlay button[data-v='odin']").click(); page.wait_for_timeout(600)
                d = get()
                check(f"{design} : « Odin » mémorisé, Notes Moodle désactivé", d["uca_usage"]["v"] == "odin" and d["uca_settings"]["moodleNotes"] is False, str(d))
                check(f"{design} : la synchro part après la réponse", "UCA_SYNC_REQUEST" in page.evaluate("() => window.__sent"))
                page.evaluate("() => { window.__sent = []; }"); page.locator("#syncBtn").evaluate("b => { b.disabled = false; }")
                page.locator("#syncBtn").click(); page.wait_for_timeout(400)
                check(f"{design} : jamais redemandé ensuite", page.locator("#usageOverlay").count() == 0 and "UCA_SYNC_REQUEST" in page.evaluate("() => window.__sent"))
            # « Les deux » active Notes Moodle
            sw.evaluate("() => chrome.storage.local.remove(['uca_usage','uca_settings'])")
            data = seed(); data["uca_design"] = "studio"; sw.evaluate("(d) => chrome.storage.local.set(d)", data)
            page.goto(f"{ext}/designs/studio/agenda.html"); page.wait_for_timeout(900)
            page.evaluate("() => { chrome.runtime.sendMessage = () => {}; }")
            page.locator("#syncBtn").click(); page.wait_for_timeout(400)
            page.locator("#usageOverlay button[data-v='both']").click(); page.wait_for_timeout(600)
            d = sw.evaluate("() => new Promise(r => chrome.storage.local.get(['uca_usage','uca_settings'], d => r(d)))")
            check("« Les deux » : Notes Moodle activé", d["uca_usage"]["v"] == "both" and d["uca_settings"]["moodleNotes"] is True, str(d))
            ctx.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:3]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
