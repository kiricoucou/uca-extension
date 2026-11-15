"""Écran « Mes widgets » de l'app web (PWA) : 25 widgets, ajout, retrait, ordre mémorisé, boutons, téléphone et bureau.

Usage : python -I -X utf8 tests/widgets_pwa.py
"""
import copy
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


def store():
    st = dict(seed()); st["uca_design"] = "anime"
    st["uca_tasks"] = [{"id": "a", "title": "Rendre le TP réseau", "subject": "R1.03", "due": "2020-01-02", "done": False},
                       {"id": "b", "title": "Réviser le DS", "subject": "R1.02", "due": "2999-01-01", "done": False}]
    st["uca_absences"] = {"declarees": 3, "justifiees": 2, "nonJustifiees": 1, "avecMotifs": 2, "journeesNonJustifiees": 1}
    st["uca_notes_history"] = [{"at": 1, "avg": 10.5}, {"at": 2, "avg": 12.0}]
    return st


def open_widgets(pg, base):
    pg.goto(base + "app/index.html"); pg.wait_for_timeout(500)
    pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", store())
    pg.goto(base + "app/shell.html?source=pwa#home"); pg.wait_for_timeout(2500)
    pg.click("#screen [data-go='widgets']"); pg.wait_for_timeout(500)


def main():
    port = 8822
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    base = f"http://127.0.0.1:{port}/"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            open_widgets(pg, base)
            check("depuis l'Accueil : « Mes widgets » ouvre l'écran", pg.inner_text("#topbarTitle") == "Mes widgets")
            check("6 widgets par défaut", pg.locator(".uw").count() == 6, str(pg.locator(".uw").count()))
            check("pas d'erreur d'affichage dans les widgets par défaut", all(k not in pg.inner_text("#uwGrid") for k in ("undefined", "NaN", "[object")))
            check("devoirs : le devoir en retard est signalé", "En retard" in pg.inner_text("#uwGrid"))
            check("moyenne générale affichée", pg.locator(".uw[data-wid=avg] .uw-big").count() == 1)

            # tout ajouter
            for _ in range(30):
                pg.click("[data-act=wAdd]"); pg.wait_for_timeout(120)
                if pg.locator("[data-act=wPick]").count() == 0:
                    break
                pg.locator("[data-act=wPick]").first.click(); pg.wait_for_timeout(150)
            pg.click("[data-act=closeSheet]") if pg.locator("[data-act=closeSheet]").count() else None
            pg.wait_for_timeout(200)
            n = pg.locator(".uw").count()
            check("tous les widgets ajoutés : 25", n == 25, str(n))
            txt = pg.inner_text("#uwGrid")
            check("les 25 widgets s'affichent sans « undefined » ni « NaN »", all(k not in txt for k in ("undefined", "NaN", "[object")))
            empty = pg.evaluate("() => [...document.querySelectorAll('.uw')].filter(w => w.innerText.trim().length < 3).map(w => w.dataset.wid)")
            check("aucun widget vide", not empty, str(empty))
            ov = pg.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.uw')].every(w => w.scrollWidth <= w.clientWidth + 2)")
            check("téléphone : aucun débordement horizontal (page et widgets)", ov)
            pg.screenshot(path=str(Path(sys.argv[1]) / "pwa-widgets-mobile.png"), full_page=False) if len(sys.argv) > 1 else None

            # édition : ordre, retrait, mémoire
            first = pg.evaluate("() => document.querySelector('.uw').dataset.wid")
            pg.click("[data-act=wEdit]"); pg.wait_for_timeout(200)
            check("mode « Modifier » : boutons ↑ ↓ ✕ visibles", pg.is_visible(".uw .uw-tools button"))
            pg.locator(".uw").first.locator("[data-act=wDown]").click(); pg.wait_for_timeout(200)
            second_now = pg.evaluate("() => document.querySelectorAll('.uw')[1].dataset.wid")
            check("↓ descend le premier widget d'un cran", second_now == first, f"{first} -> {second_now}")
            pg.locator(".uw").nth(1).locator("[data-act=wDel]").click(); pg.wait_for_timeout(200)
            check("✕ retire le widget", pg.locator(".uw").count() == 24)
            pg.goto(base + "app/shell.html?source=pwa&rechargement=1#home"); pg.wait_for_timeout(2500); pg.click("#screen [data-go='widgets']"); pg.wait_for_timeout(500)
            check("ordre et retrait mémorisés après rechargement", pg.locator(".uw").count() == 24)
            pg.click("[data-act=wEdit]"); pg.wait_for_timeout(100); pg.click("[data-act=wReset]"); pg.wait_for_timeout(250)
            check("« Remettre ceux par défaut » : 6 widgets", pg.locator(".uw").count() == 6)
            pg.click("[data-act=wEdit]"); pg.wait_for_timeout(100)

            # boutons dans les widgets
            pg.click("[data-act=wAdd]"); pg.wait_for_timeout(120); pg.locator("[data-act=wPick][data-id=shortcuts]").click(); pg.wait_for_timeout(250)
            pg.locator(".uw[data-wid=shortcuts] [data-go='agenda:notes']").click(); pg.wait_for_timeout(1200)
            src = pg.evaluate("() => document.getElementById('agendaFrame').src")
            check("raccourci « Notes » : ouvre l'agenda sur le panneau Notes", "open=notes" in src, src)
            ctx.close()

            # bureau
            ctx = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            open_widgets(pg, base)
            for _ in range(30):
                pg.click("[data-act=wAdd]"); pg.wait_for_timeout(100)
                if pg.locator("[data-act=wPick]").count() == 0:
                    break
                pg.locator("[data-act=wPick]").first.click(); pg.wait_for_timeout(120)
            pg.click("[data-act=closeSheet]") if pg.locator("[data-act=closeSheet]").count() else None
            pg.wait_for_timeout(200)
            cols = pg.evaluate("() => getComputedStyle(document.getElementById('uwGrid')).gridTemplateColumns.split(' ').length")
            check("bureau : grille de 6 colonnes", cols == 6, str(cols))
            check("bureau : aucun débordement horizontal", pg.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1"))
            pg.screenshot(path=str(Path(sys.argv[1]) / "pwa-widgets-desktop.png"), full_page=False) if len(sys.argv) > 1 else None
            ctx.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
