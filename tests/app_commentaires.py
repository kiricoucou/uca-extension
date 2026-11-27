"""Application Android (pages réellement embarquées dans l'APK, écran de téléphone tactile) : commentaire sur une note
(titre lisible, enregistrement local, icône cliquable, bouton retour d'Android), coefficient (− / +, préenregistrés),
compétences cliquables et grand graphique. La partie Kotlin n'est pas exécutée ici. UCA_SHOTS=dossier : captures.

Usage : python -I -X utf8 tests/app_commentaires.py
"""
import os
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))
from fixtures import seed  # noqa: E402,F401
from harness import designs  # noqa: E402
from moodle_apk import SITE, BRIDGE, open_notes, store  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


TITRE = "SAE1.05 : Traiter des données et automatiser des traitements avec un langage de programmation"
FIT = """(sel) => { const b = document.querySelector(sel); if (!b) return null; const r = b.getBoundingClientRect(); return { gauche: r.left, droite: r.right, debord: b.scrollWidth - b.clientWidth }; }"""


def main():
    shots = os.environ.get("UCA_SHOTS")
    now = int(time.time() * 1000)
    ev = lambda label, n: {"label": label, "key": label, "coeff": 2, "note": n, "moy": 10.43, "maxi": 18.5, "mini": 2.5}
    releve = {"ue": [{"label": "UE RT 1.1 - Assister l'administrateur du réseau", "coeff": 1, "note": None, "matieres": [
        {"label": TITRE, "coeff": 5, "note": None, "evals": [ev("Contrôle de binaire", 11.5), ev("Projet", 15)]}]}]}
    pending = {"id": "MDL|1|quiz", "courseId": "1", "course": "R1.07 - Programmation", "title": "Quiz de boucles", "type": "Test", "raw": 8, "max": 10, "note20": 16, "feedback": "",
               "matiere": TITRE, "isNew": False, "how": "code", "coeff": 1, "coeffConfirmed": False, "status": "pending", "at": 1, "decidedAt": None}
    port = 8815
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(SITE)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            base = f"http://127.0.0.1:{port}/"
            for d in designs():
                did = d["id"]
                if not (SITE / "designs" / d["folder"].split("/")[-1] / "agenda.html").exists():
                    continue
                ctx = browser.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True, service_workers="block")
                ctx.add_init_script(f"({BRIDGE})(true);")
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"[{did}] {e}"))
                pg.goto(base + "choose.html"); pg.wait_for_timeout(300)
                st = dict(seed()); st.update(uca_design=did, uca_settings={"moodleNotes": True}, uca_usage={"v": "both", "at": 1}, uca_releve_notes=releve, uca_notes_seen={"__v": 2},
                                             uca_notes_history=[{"at": now - 9 * 86400000, "avg": 11}, {"at": now - 86400000, "avg": 14}], uca_moodle={"sync": None, "items": {pending["id"]: pending}})
                pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", st)
                url = base + f"designs/{did}/agenda.html"

                def start():
                    pg.goto(url); pg.wait_for_timeout(2200)
                    pg.evaluate("() => { const g = document.getElementById('ucaUpdateGate'); if (g) g.remove(); }")
                    open_notes(pg)

                def shot(name):
                    if shots:
                        Path(shots).mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(Path(shots) / f"{did}-{name}.png"))

                start()
                # ---- coefficient
                card = pg.locator("#notesPanel .np-moodle-card").first
                card.get_by_role("button", name="Choisir le coefficient 5").tap(); card.get_by_role("button", name="Coefficient plus 1").tap()
                f = pg.evaluate(FIT, "#notesPanel .np-moodle-card")
                small = card.evaluate("(c) => Math.min(...[...c.querySelectorAll('.np-coeff-ctl button')].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)))")
                check(f"{did} : coefficient au doigt (5 puis +1 = 6), boutons assez grands, sans débordement", card.locator("input[type=number]").input_value() == "6" and f["debord"] <= 1 and f["droite"] <= 360.5 and small >= 34, f"{f} {small}")
                card.locator(".np-coeff-edit").tap(); pg.wait_for_timeout(500)
                pg.locator(".np-coeff-editor .coeff-new").fill("1,5"); pg.locator(".np-coeff-editor .coeff-add").tap(); pg.wait_for_timeout(700)
                check(f"{did} : coefficients configurables dans l'application (sans page Paramètres)", store(pg)["uca_settings"].get("coeffPresets") == [3, 5, 10, 6, 1.5], str(store(pg)["uca_settings"]))
                shot("coefficient")
                # ---- commentaire
                line = pg.locator("#npContent .notes-table tr", has_text="Contrôle de binaire").first
                line.locator("td").first.tap(); pg.wait_for_timeout(700)
                pg.locator("#gdmNote").fill("Contrôle de binaire, première année"); pg.wait_for_timeout(900)
                saved = store(pg).get("uca_grade_notes", {})
                check(f"{did} : commentaire enregistré dans le téléphone", saved.get(TITRE + "|Contrôle de binaire", {}).get("text") == "Contrôle de binaire, première année", str(saved))
                f = pg.evaluate(FIT, "#gradeDetailOverlay .grade-modal-box")
                font = pg.evaluate("() => parseFloat(getComputedStyle(document.getElementById('gdmNote')).fontSize)")
                check(f"{did} : détail dans l'écran, saisie sans zoom automatique (16 px)", f["gauche"] >= 0 and f["droite"] <= 360.5 and f["debord"] <= 1 and font >= 16, f"{f} {font}")
                shot("detail")
                check(f"{did} : « retour » d'Android ferme le détail et le signale à l'application", pg.evaluate("() => window.ucaHandleBack()") is True and pg.locator("#gradeDetailOverlay.open").count() == 0 and pg.evaluate("() => window.ucaHandleBack()") is False)
                pg.wait_for_timeout(400)
                start()
                mark = pg.locator("#npContent .notes-table .gn-mark")
                box = mark.bounding_box() if mark.count() == 1 else None
                check(f"{did} : après redémarrage : une icône visible dans le tableau", bool(box) and box["x"] >= 0 and box["x"] + box["width"] <= 360, str(box))
                shot("tableau")
                check(f"{did} : l'icône est réellement dessinée (pas un carré vide)", bool(box) and mark.evaluate("(b) => { const r = b.querySelector('svg').getBBox(); return r.width > 10 && r.height > 10; }"))
                if box:
                    mark.tap(); pg.wait_for_timeout(700)
                    check(f"{did} : toucher l'icône ouvre le commentaire prêt à modifier", pg.locator("#gdmNote").input_value() == "Contrôle de binaire, première année" and pg.evaluate("() => document.activeElement.id") == "gdmNote")
                    # saisie en cours puis application mise en arrière-plan : rien n'est perdu
                    pg.keyboard.type(" !")
                    pg.evaluate("() => window.dispatchEvent(new Event('pagehide'))"); pg.wait_for_timeout(300)
                    check(f"{did} : application quittée pendant la saisie : texte gardé", store(pg)["uca_grade_notes"][TITRE + "|Contrôle de binaire"]["text"].endswith(" !"))
                    pg.locator("#closeGdm").tap(); pg.wait_for_timeout(500)
                # ---- compétences et grand graphique
                pg.locator("#compBtn").tap(); pg.wait_for_timeout(700)
                pg.locator("#npContent .np-ue-link").first.tap(); pg.wait_for_timeout(800)
                check(f"{did} : toucher une UE renvoie à sa ligne dans le tableau", pg.locator("#npContent tr.ue-target .ue-arrow").count() == 1 and pg.locator("#npContent tr.ue-target").is_visible())
                pg.evaluate("() => document.getElementById('chartZoomBtn').click()"); pg.wait_for_timeout(800)
                f = pg.evaluate(FIT, "#chartOverlay .chart-box")
                check(f"{did} : grand graphique dans l'écran du téléphone, avec les stats par UE", bool(f) and f["gauche"] >= 0 and f["droite"] <= 360.5 and f["debord"] <= 1 and pg.locator("#chartOverlay .chart-ue").count() == 1, str(f))
                hit = pg.locator("#chartOverlay .chart-hit").first
                hit.tap(); pg.wait_for_timeout(300)
                check(f"{did} : toucher un point affiche son détail", "Point 1 sur" in pg.locator("#chartPointDetail").inner_text())
                size = pg.evaluate("() => { const svg = document.querySelector('#chartOverlay svg'), k = svg.getScreenCTM().a; return { texte: Math.min(...[...svg.querySelectorAll('text')].map((x) => parseFloat(x.getAttribute('font-size')) * k)), haut: svg.getBoundingClientRect().height }; }")
                check(f"{did} : graphique lisible au téléphone (texte ≥ 10 px, assez haut)", size["texte"] >= 10 and size["haut"] >= 220, str(size))
                shot("graphique")
                check(f"{did} : « retour » d'Android ferme aussi le graphique", pg.evaluate("() => window.ucaHandleBack()") is True and pg.locator("#chartOverlay").count() == 0)
                ctx.close()
            browser.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
