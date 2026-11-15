"""Bouton « Aujourd'hui » dans les vues 5 et 6 jours : un samedi ou un dimanche, il affiche la semaine suivante
(la semaine en cours est terminée). La vue Semaine et la semaine en cours (lundi à vendredi) ne changent pas.
Horloge simulée dans le navigateur (samedi 14, dimanche 15, lundi 16 et mercredi 18 novembre 2026), PWA servie en local.

Usage : python -I -X utf8 tests/today_weekend.py
"""
import datetime
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


# jour simulé -> premier jour attendu dans le libellé de période, selon la vue
CASES = [
    ("samedi 14/11", datetime.datetime(2026, 11, 14, 12, 0), {"5day": "16 nov", "6day": "16 nov", "week": "9 nov"}),
    ("dimanche 15/11", datetime.datetime(2026, 11, 15, 12, 0), {"5day": "16 nov", "6day": "16 nov", "week": "9 nov"}),
    ("lundi 16/11", datetime.datetime(2026, 11, 16, 12, 0), {"5day": "16 nov", "6day": "16 nov", "week": "16 nov"}),
    ("mercredi 18/11", datetime.datetime(2026, 11, 18, 12, 0), {"5day": "16 nov", "6day": "16 nov", "week": "16 nov"}),
]


def label(fr):
    return fr.evaluate("() => document.getElementById('periodLabel').textContent.trim()")


def open_agenda(browser, base, when, view, errors):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    ctx.clock.set_fixed_time(when)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(base + "app/index.html"); pg.wait_for_timeout(300)
    st = dict(seed()); st["uca_design"] = "anime"; st["uca_settings"] = {"startView": view}
    pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", st)
    pg.goto(base + "app/index.html?source=pwa"); pg.wait_for_timeout(2500)
    return ctx, pg, pg.query_selector("#agendaFrame").content_frame()


def main():
    port = 8813
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            base = f"http://127.0.0.1:{port}/"
            for name, when, expect in CASES:
                for view, first in expect.items():
                    ctx, pg, fr = open_agenda(b, base, when, view, errors)
                    got = label(fr)
                    check(f"{name} : ouverture en vue {view} -> commence le {first}", got.startswith(first), got)
                    fr.click("#nextBtn"); pg.wait_for_timeout(150); fr.click("#nextBtn"); pg.wait_for_timeout(150)
                    fr.click("#todayBtn"); pg.wait_for_timeout(300)
                    got = label(fr)
                    check(f"{name} : « Aujourd'hui » en vue {view} -> commence le {first}", got.startswith(first), got)
                    ctx.close()
            # Passage de la vue Semaine à la vue 5 jours un dimanche : la semaine suivante
            ctx, pg, fr = open_agenda(b, base, datetime.datetime(2026, 11, 15, 12, 0), "week", errors)
            fr.click("#viewTabs button[data-view=\"5day\"]"); pg.wait_for_timeout(300)
            got = label(fr)
            check("dimanche 15/11 : onglet « 5j » depuis la vue Semaine -> semaine suivante", got.startswith("16 nov"), got)
            fr.click("#viewTabs button[data-view=\"week\"]"); pg.wait_for_timeout(300)
            fr.click("#todayBtn"); pg.wait_for_timeout(300)
            got = label(fr)
            check("dimanche 15/11 : « Aujourd'hui » en vue Semaine garde la semaine en cours (trait du dimanche visible)", got.startswith("9 nov"), got)
            ctx.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
