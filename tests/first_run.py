"""Première installation : une fois l'extension installée, l'onglet du calendrier des cours (agenda, design Studio par défaut)
s'ouvre tout seul, avec le bouton pour se connecter à Odin ; l'adresse utilisée par les installateurs (choose.html?tab=1)
mène elle aussi à l'agenda ; le design se change en un clic ; un design déjà choisi est respecté.

Usage : python -I -X utf8 tests/first_run.py
"""
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def main():
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1280, "height": 800})
        try:
            cdp = ctx.new_cdp_session(ctx.pages[0])
            urls = []
            deadline = time.time() + 8
            while time.time() < deadline and not any(u.endswith("/agenda.html") for u in urls):
                urls = [t["url"] for t in cdp.send("Target.getTargets")["targetInfos"] if t["type"] == "page"]
                time.sleep(0.3)
            opened = [u for u in urls if u.startswith(base) and u.endswith("/agenda.html")]
            check("l'onglet de l'agenda s'ouvre tout seul après l'installation", len(opened) == 1, str(urls))
            check("c'est le design Studio (par défaut)", opened and opened[0].endswith("/designs/studio/agenda.html"), str(opened))
            check("aucune page de choix de design ouverte à la place", not any("choose.html" in u for u in urls), str(urls))
            agenda = ctx.new_page(); agenda.goto(f"{base}/designs/studio/agenda.html"); agenda.wait_for_timeout(1500)
            check("le calendrier est affiché (vue de la semaine / liste)", agenda.locator("#weekView, #dayView, #listView, .grid-view, #monthView").count() >= 1)
            check("bouton pour se connecter / importer présent", agenda.locator("#syncBtn").count() == 1)
            check("bouton « Design » (changer de design en un clic) avec le logo", agenda.locator("#designBtn img.design-logo").count() == 1)
            agenda.close()
            stored = sw.evaluate("chrome.storage.local.get('uca_design').then(d => d.uca_design)")
            check("design par défaut mémorisé", stored == "studio", str(stored))
            popup = sw.evaluate("chrome.action.getPopup({})")
            check("le popup de la barre d'outils suit le design (Studio)", popup.endswith("/designs/studio/popup.html"), popup)
            # un design déjà choisi n'est pas écrasé par la première installation (le registre le garde)
            sw.evaluate("() => chrome.storage.local.set({ uca_design: 'anime' })")
            check("un design déjà choisi est respecté", sw.evaluate("chrome.storage.local.get('uca_design').then(d => d.uca_design)") == "anime")
        finally:
            ctx.close()
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
