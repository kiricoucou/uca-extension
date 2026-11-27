"""Notes Moodle dans l'app web (PWA) et, avec elle, l'APK (mêmes pages) : les notes Moodle reçues avec le lien de partage / le .ucasync
apparaissent dans la fenêtre Notes de l'app (téléphone 390 px), se valident, se refusent (corbeille), se restaurent, et changent
la moyenne. Pas de bouton « Chercher sur Moodle » dans l'app (un navigateur isole les cookies de Moodle : la recherche se fait
dans l'extension). Tout est servi en local, rien n'est contacté.

Usage : python -I -X utf8 tests/moodle_app.py
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


def item(i, course, title, raw, mx, matiere, how, status):
    return {"id": f"MDL|{i}|{title.lower()}", "courseId": str(i), "course": course, "title": title, "type": "Test", "raw": raw, "max": mx,
            "note20": round(raw / mx * 20, 3), "feedback": "", "matiere": matiere, "isNew": False, "how": how, "coeff": 1,
            "status": status, "at": 1, "decidedAt": None}


def open_notes(pg, fr):
    fr.click("#menuBtn"); pg.wait_for_timeout(250)
    fr.evaluate("() => [...document.querySelectorAll('#mobileMenu .mi')].find(b => b.textContent.includes('Notes')).click()")
    pg.wait_for_timeout(900)


def run(browser, base, errors):
    for design in ("studio", "carnet"):
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"[{design}] {e}"))
        pg.goto(base + "app/index.html"); pg.wait_for_timeout(300)
        st = dict(seed()); st["uca_design"] = design
        rel = copy.deepcopy(st["uca_releve_notes"]); mats = [m["label"] for u in rel["ue"] for m in u["matieres"]]
        first = mats[0]
        st["uca_settings"] = {"moodleNotes": True}
        items = [item(1, "Cours A", "Contrôle 1", 16, 20, first, "code", "pending"),
                 item(2, "Cours B", "Contrôle 2", 12, 20, first, "code", "validated"),
                 item(3, "Cours C", "Quiz refusé", 4, 10, first, "code", "refused")]
        st["uca_moodle"] = {"sync": "2026-11-25T10:00:00Z", "items": {i["id"]: i for i in items}}
        pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", st)
        pg.goto(base + "app/index.html?source=pwa"); pg.wait_for_timeout(2500)
        fr = pg.query_selector("#agendaFrame").content_frame()
        open_notes(pg, fr)
        check(f"{design} app : note Moodle à confirmer affichée (matière, coefficient, Valider / Refuser)", fr.locator(".np-moodle-card", has_text="Contrôle 1").count() == 1 and fr.locator(".np-moodle-card").get_by_role("button", name="Valider la note").count() == 1)
        check(f"{design} app : pas de « Chercher sur Moodle » (recherche réservée à l'extension)", fr.locator("#moodleSyncBtn").count() == 0)
        check(f"{design} app : la note validée est déjà dans le tableau, la refusée non", "Contrôle 2" in fr.locator(".notes-table").inner_text() and "Quiz refusé" not in fr.locator(".notes-table").inner_text())
        avg0 = fr.locator(".notes-avg .na-val").inner_text()
        fr.locator(".np-moodle-card", has_text="Contrôle 1").locator("input[type=number]").fill("1")
        fr.locator(".np-moodle-card", has_text="Contrôle 1").get_by_role("button", name="Valider la note").click(); pg.wait_for_timeout(600)
        avg1 = fr.locator(".notes-avg .na-val").inner_text()
        check(f"{design} app : valider une note la met dans le tableau et change la moyenne", "Contrôle 1" in fr.locator(".notes-table").inner_text() and avg0 != avg1, f"{avg0} -> {avg1}")
        fr.locator("#moodleDoneToggle").click(); pg.wait_for_timeout(400)
        box = fr.evaluate("() => { const s = document.getElementById('moodleSide').getBoundingClientRect(); return [s.left, s.right, s.bottom, window.innerWidth, window.innerHeight, getComputedStyle(document.getElementById('moodleSide')).position]; }")
        check(f"{design} app : sur téléphone la fenêtre des notes traitées est une feuille en bas d'écran, dans l'écran", box[5] == "fixed" and box[0] >= 0 and box[1] <= box[3] + 1 and box[2] <= box[4] + 1, str(box))
        fr.locator("#moodleTrashBtn").click(); pg.wait_for_timeout(300)
        check(f"{design} app : corbeille : la note refusée y est, avec Restaurer / Supprimer", fr.locator("#moodleSide .np-moodle-trash-row", has_text="Quiz refusé").count() == 1)
        fr.locator("#moodleSide .np-moodle-trash-row", has_text="Quiz refusé").get_by_role("button", name="Restaurer").click(); pg.wait_for_timeout(500)
        saved = pg.evaluate("() => Object.values(JSON.parse(localStorage.getItem('uca_store')).uca_moodle.items).map((i) => i.title + ':' + i.status).join('|')")
        check(f"{design} app : restaurer la remet en attente (enregistré dans l'app)", "Quiz refusé:pending" in saved and "Contrôle 1:validated" in saved, saved)
        ctx.close()


def main():
    port = 8812
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            run(b, f"http://127.0.0.1:{port}/", errors)
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript dans l'app", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
