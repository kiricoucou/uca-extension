"""Coefficient d'une note Moodle (− / +, coefficients préenregistrés et configurables) et graphique de la moyenne en grand
(plus haute, plus basse, actuelle, dernière synchro, détail de chaque point). Tous les designs. UCA_SHOTS=dossier : captures.

Usage : python -I -X utf8 tests/coef_graphique.py
"""
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import designs, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


def note(i, title, raw):
    return {"id": f"MDL|{i}|{title.lower()}", "courseId": str(i), "course": "R1.07 - Programmation", "title": title, "type": "Test", "raw": raw, "max": 20,
            "note20": raw, "feedback": "", "matiere": "R1.07 : Programmation", "isNew": False, "how": "code", "coeff": 1, "coeffConfirmed": False, "status": "pending", "at": 1, "decidedAt": None}


def main():
    shots = os.environ.get("UCA_SHOTS")
    now = int(time.time() * 1000)
    jour = 86400000
    ev = lambda label, n: {"label": label, "key": label, "coeff": 1, "note": n, "moy": 11, "maxi": 18, "mini": 3}
    releve = {"ue": [{"label": "UE 1.1", "coeff": 1, "note": None, "matieres": [{"label": "R1.07 : Programmation", "coeff": 1, "note": None, "evals": [ev("DS 1 (sur 20.0)", 15), ev("DS 2 (sur 20.0)", 9)]}]}]}
    history = [{"at": now - 30 * jour, "avg": 15.35}, {"at": now - 20 * jour, "avg": 11.2}, {"at": now - 10 * jour, "avg": 14.9}, {"at": now - 2 * jour, "avg": 12.0}]
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 900})
        errors = []
        try:
            sw.evaluate("() => { globalThis.fetch = () => Promise.reject(new Error('hors ligne')); }")
            for d in designs():
                did = d["id"]
                data = seed()
                data.update(uca_settings={"moodleNotes": True}, uca_usage={"v": "both", "at": 1}, uca_releve_notes=releve, uca_notes_history=history,
                            uca_notes_seen={"__v": 2, "R1.07 : Programmation|DS 2 (sur 20.0)": {"note": 9, "at": now - 20 * jour}},
                            uca_releve_notes_sync=time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() - 7 * 60)),
                            uca_moodle={"sync": "2026-11-27T10:00:00Z", "items": {n["id"]: n for n in (note(1, "Quiz A", 8), note(2, "Quiz B", 14))}})
                sw.evaluate("() => chrome.storage.local.clear()")
                sw.evaluate("(x) => chrome.storage.local.set(x)", data)
                page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(f"{did} {e}"))
                page.goto(f"{base}/{d['folder']}/agenda.html"); page.wait_for_timeout(1300)
                page.evaluate("() => { const g = document.getElementById('ucaUpdateGate'); if (g) g.remove(); localStorage.removeItem('uca_notes_geom_v1'); }")
                page.click("#notesBtn"); page.wait_for_timeout(800)
                card = page.locator("#notesPanel .np-moodle-card", has_text="Quiz A")
                field = card.locator("input[type=number]")
                val = lambda: field.input_value()
                check(f"{did} : coefficients par défaut 3, 5, 10, 6 proposés", card.locator(".np-coeff-chip").all_inner_texts() == ["3", "5", "10", "6"] and val() == "", str(card.locator(".np-coeff-chip").all_inner_texts()))
                geo = card.evaluate("(c) => { const chips = c.querySelector('.np-coeff-presets').getBoundingClientRect(); const ok = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Valider la note').getBoundingClientRect(); return { chipsRight: chips.right, chipsTop: chips.top, chipsBottom: chips.bottom, left: ok.left, mid: ok.top + ok.height / 2, overflow: c.scrollWidth - c.clientWidth }; }")
                check(f"{did} : la liste est avant le bouton « Valider la note », sans déborder", (geo["chipsRight"] <= geo["left"] + 1 or geo["chipsBottom"] <= geo["mid"]) and geo["overflow"] <= 1, str(geo))
                card.get_by_role("button", name="Coefficient moins 1").click(); a = val()
                card.get_by_role("button", name="Coefficient plus 1").click(); b = val()
                card.get_by_role("button", name="Coefficient plus 1").click(); c = val()
                card.get_by_role("button", name="Coefficient moins 1").click(); e = val()
                card.get_by_role("button", name="Coefficient moins 1").click(); f = val()
                check(f"{did} : − / + : vide reste vide avec −, puis 1, 2, 1, et jamais 0", [a, b, c, e, f] == ["", "1", "2", "1", "1"], str([a, b, c, e, f]))
                field.fill("3.5"); card.get_by_role("button", name="Coefficient plus 1").click()
                check(f"{did} : nombre à virgule : 3,5 + 1 = 4,5", val() == "4.5", val())
                card.get_by_role("button", name="Choisir le coefficient 10").click()
                check(f"{did} : un clic sur un coefficient le saisit et le marque choisi", val() == "10" and card.locator(".np-coeff-chip[aria-pressed=true]").inner_text() == "10", val())
                sw.evaluate("() => chrome.storage.local.set({ uca_moodle_progress: { active: true, phase: 'cours', done: 1, total: 4, label: 'x', at: Date.now() } })"); page.wait_for_timeout(400)
                sw.evaluate("() => chrome.storage.local.set({ uca_moodle_progress: { active: false, at: Date.now() } })"); page.wait_for_timeout(500)
                check(f"{did} : la saisie reste quand la fenêtre se redessine (recherche en cours)", val() == "10", val())
                # éditeur sur place : ajouter 3,5, refuser les saisies incorrectes, retirer
                card.locator(".np-coeff-edit").click(); page.wait_for_timeout(400)
                editor = page.locator("#notesPanel .np-coeff-editor")
                editor.locator(".coeff-new").fill("3,5"); editor.locator(".coeff-add").click(); page.wait_for_timeout(500)
                saved = sw.evaluate("() => chrome.storage.local.get('uca_settings').then((x) => x.uca_settings.coeffPresets)")
                check(f"{did} : ajouter 3,5 : enregistré et proposé aussitôt", saved == [3, 5, 10, 6, 3.5] and "3,5" in page.locator("#notesPanel .np-moodle-card", has_text="Quiz B").locator(".np-coeff-chip").all_inner_texts(), str(saved))
                editor = page.locator("#notesPanel .np-coeff-editor")
                for bad in ("abc", "0", "500", "5"):
                    editor.locator(".coeff-new").fill(bad); editor.locator(".coeff-add").click(); page.wait_for_timeout(150)
                saved = sw.evaluate("() => chrome.storage.local.get('uca_settings').then((x) => x.uca_settings.coeffPresets)")
                check(f"{did} : valeurs incorrectes ou en double refusées", saved == [3, 5, 10, 6, 3.5], str(saved))
                editor.get_by_role("button", name="Retirer le coefficient 6").click(); page.wait_for_timeout(500)
                saved = sw.evaluate("() => chrome.storage.local.get('uca_settings').then((x) => x.uca_settings.coeffPresets)")
                check(f"{did} : retirer un coefficient, fenêtre Notes toujours ouverte", saved == [3, 5, 10, 3.5] and page.locator("#notesPanel.open").count() == 1, str(saved))
                page.locator("#notesPanel .np-moodle-card", has_text="Quiz A").locator(".np-coeff-edit").click(); page.wait_for_timeout(300)
                card = page.locator("#notesPanel .np-moodle-card", has_text="Quiz A")
                if shots:
                    Path(shots).mkdir(parents=True, exist_ok=True); card.screenshot(path=str(Path(shots) / f"{did}-carte.png"))
                card.get_by_role("button", name="Choisir le coefficient 3,5").click()
                card.get_by_role("button", name="Valider la note").click(); page.wait_for_timeout(700)
                item = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((x) => x.uca_moodle.items['MDL|1|quiz a'])")
                check(f"{did} : la note est validée avec le coefficient choisi (3,5)", item["status"] == "validated" and item["coeff"] == 3.5, str(item))

                # ---- graphique en grand
                zoom = page.locator("#chartZoomBtn")
                if not zoom.count():
                    page.locator("#notesPanel .notes-avg").click(); page.wait_for_timeout(700)
                    zoom = page.locator("#chartZoomBtn")
                check(f"{did} : bouton pour agrandir le graphique", zoom.count() == 1)
                if zoom.count() != 1:
                    page.close(); continue
                zoom.scroll_into_view_if_needed(); zoom.locator("xpath=..").locator("svg").first.click(); page.wait_for_timeout(700)
                ov = page.locator("#chartOverlay")
                box = ov.locator(".chart-box").bounding_box() if ov.count() else None
                check(f"{did} : clic sur le graphique : fenêtre en grand par-dessus tout", bool(box) and box["width"] > 1000 and page.evaluate("() => { const e = document.elementFromPoint(40, 40); return !!(e && e.closest('#chartOverlay')); }"), str(box))
                close = page.locator("#chartOverlayClose").bounding_box()
                check(f"{did} : « Fermer le graphique » en haut à droite", close and close["x"] + close["width"] > box["x"] + box["width"] - 40 and close["y"] < box["y"] + 60, str(close))
                txt = lambda sel: page.locator(sel).inner_text()
                hits = page.locator("#chartOverlay .chart-hit")
                avgs = [float(x.split("moyenne ")[1].split(" sur")[0].replace(",", ".")) for x in hits.evaluate_all("(l) => l.map((e) => e.getAttribute('aria-label'))")]
                fr = lambda v: (f"{v:.2f}".rstrip("0").rstrip(".")).replace(".", ",")
                check(f"{did} : plus haute et plus basse avec leur date", fr(max(avgs)) + " / 20" in txt("#chartHigh") and fr(min(avgs)) + " / 20" in txt("#chartLow") and "2026" in txt("#chartHigh") and "2026" in txt("#chartLow"), txt("#chartHigh") + " | " + txt("#chartLow"))
                check(f"{did} : moyenne actuelle, sa date et « il y a 7 minutes »", fr(avgs[-1]) + " / 20" in txt("#chartNow") and "Dernière synchronisation : il y a 7 minutes" in txt("#chartNow"), txt("#chartNow"))
                idx = next((i for i in range(len(avgs)) if abs(avgs[i] - 11.2) < 0.001), 1)
                hits.nth(idx).hover(); page.wait_for_timeout(250)
                det = txt("#chartPointDetail")
                check(f"{did} : survol d'un point : date, synchro, moyenne et notes apparues", f"Point {idx + 1} sur {len(avgs)}" in det and "à " in det and "11,2 / 20" in det and "synchronisation" in det and "DS 2" in det and page.locator("#chartTip").is_visible(), det)
                if shots:
                    page.screenshot(path=str(Path(shots) / f"{did}-graphique.png"))
                page.locator("#chartOverlayClose").click(); page.wait_for_timeout(300)
                check(f"{did} : fermeture : le graphique disparaît, la fenêtre Notes reste", page.locator("#chartOverlay").count() == 0 and page.locator("#notesPanel.open").count() == 1)
                page.locator("#chartZoomBtn").click(); page.wait_for_timeout(500)
                page.keyboard.press("Escape"); page.wait_for_timeout(300)
                check(f"{did} : Échap ferme aussi le graphique", page.locator("#chartOverlay").count() == 0)
                page.set_viewport_size({"width": 390, "height": 760}); page.wait_for_timeout(500)
                if page.locator("#chartZoomBtn").count():
                    page.evaluate("() => document.getElementById('chartZoomBtn').click()"); page.wait_for_timeout(600)
                    over = page.evaluate("() => { const b = document.querySelector('#chartOverlay .chart-box'); return b ? [b.scrollWidth - b.clientWidth, b.getBoundingClientRect().right] : null; }")
                    check(f"{did} : sur téléphone (390 px) le grand graphique tient en largeur", bool(over) and over[0] <= 1 and over[1] <= 391, str(over))
                page.close()
            # page Paramètres : le même éditeur
            page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(f"paramètres {e}"))
            sw.evaluate("() => chrome.storage.local.set({ uca_settings: {} })")
            page.goto(f"{base}/settings.html"); page.wait_for_timeout(1200)
            page.evaluate("() => { const g = document.getElementById('ucaUpdateGate'); if (g) g.remove(); document.querySelectorAll('[inert]').forEach((e) => e.inert = false); }")
            w = page.locator("#f-coeffPresets")
            w.locator(".coeff-new").fill("2,5"); w.locator(".coeff-add").click(); page.wait_for_timeout(500)
            saved = sw.evaluate("() => chrome.storage.local.get('uca_settings').then((x) => x.uca_settings.coeffPresets)")
            check("Paramètres : « Coefficients souvent utilisés » : ajout à virgule enregistré", saved == [3, 5, 10, 6, 2.5], str(saved))
            w.locator(".coeff-reset").click(); page.wait_for_timeout(500)
            saved = sw.evaluate("() => chrome.storage.local.get('uca_settings').then((x) => x.uca_settings.coeffPresets)")
            check("Paramètres : « Valeurs par défaut » revient à 3, 5, 10, 6", saved == [3, 5, 10, 6], str(saved))
            if shots:
                w.screenshot(path=str(Path(shots) / "parametres.png"))
            page.close()
        finally:
            ctx.close()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:3]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
