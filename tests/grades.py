"""Notes et absences (v1.35) : calculs (simulateur, historique), fenêtre Notes (examens à venir,
simulateur, graphiques) et alerte d'absences, dans chaque design du registre.

Usage : python -I -X utf8 tests/grades.py [dossier_captures]
"""
import datetime
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import designs, launch  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def shot(page, name):
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT / f"{name}.png"))


def ev(label, coeff, note, moy=None):
    return {"label": label, "key": label, "coeff": coeff, "note": note, "moy": moy, "maxi": None, "mini": None}


RELEVE = {"ue": [
    {"label": "UE 1.1 Réaliser", "coeff": 2, "note": None, "matieres": [
        {"label": "R1.01 : Init dev", "coeff": 2, "note": None, "evals": [ev("DS1 (sur 20.0)", 1, 10, 11), ev("DS2 (sur 20.0)", 1, None), ev("TP (sur 20.0)", 2, 14, 12)]},
        {"label": "R1.02 : Web", "coeff": 1, "note": 12, "evals": [ev("Projet (sur 20.0)", 1, None)]}]},
    {"label": "UE 1.2 Optimiser", "coeff": 1, "note": None, "matieres": [
        {"label": "R1.03 : Maths", "coeff": 1, "note": None, "evals": [ev("QCM (sur 20.0)", 1, 8, 9), ev("DS (sur 20.0)", 3, None)]}]},
]}


def main():
    errors = []
    data = seed()
    today = datetime.date.today()
    exam_day = today + datetime.timedelta(days=3)
    exam = {"date": exam_day.isoformat(), "year": exam_day.year, "month": exam_day.month - 1, "day": exam_day.day, "startH": 8, "startM": 0,
            "endH": 10, "endM": 0, "title": "R1.01 DS2 Examen", "teacher": "M. Dupont", "room": "Amphi B", "raw": "x", "color": "#888"}
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})

        # --- calculs purs
        sim = lambda scope, t, rel=RELEVE: sw.evaluate("([r, s, t]) => UCA_GRADES.simulate(r, s, t)", [rel, scope, t])
        r = sim("mat:R1.01 : Init dev", 12)
        # (10×1 + 14×2 + x×1) / 4 >= 12  ->  x >= 10
        check("simulateur matière : note nécessaire exacte", r["status"] == "needed" and abs(r["needed"] - 10) < 0.011 and r["pending"] == 1, str(r))
        r = sim("mat:R1.01 : Init dev", 15)
        check("simulateur : objectif inatteignable détecté", r["status"] == "impossible" and abs(r["max"] - 14.5) < 0.011, str(r))
        r = sim("mat:R1.01 : Init dev", 5)
        check("simulateur : objectif déjà atteint avec 0", r["status"] == "reached", str(r))
        r = sim("mat:R1.02 : Web", 10)
        check("simulateur : matière figée par le jury ignorée", r["status"] == "nothing", str(r))
        r = sim("ue:UE 1.2 Optimiser", 10)
        # (8×1 + x×3)/4 >= 10  ->  x >= 10.67
        check("simulateur UE", r["status"] == "needed" and abs(r["needed"] - 10.67) < 0.011, str(r))
        r = sim("general", 11)
        cur = sw.evaluate("(r) => UCA_GRADES.generalAvg(r)", RELEVE)
        check("simulateur moyenne générale : résultat cohérent", r["status"] in ("needed", "reached") and cur is not None, str(r))
        if r["status"] == "needed":
            filled = json.loads(json.dumps(RELEVE))
            for ue in filled["ue"]:
                for m in ue["matieres"]:
                    if m["note"] is None:
                        for e in m["evals"]:
                            if e["note"] is None:
                                e["note"] = r["needed"]
            got = sw.evaluate("(r) => UCA_GRADES.generalAvg(r)", filled)
            check("simulateur : en jouant la note trouvée, la moyenne vise juste", got >= 11 - 1e-9 and got < 11.05, str(got))
        scopes = sw.evaluate("(r) => UCA_GRADES.scopes(r).map(s => s.id)", RELEVE)
        check("simulateur : seules les évaluations à venir proposées", "mat:R1.02 : Web" not in scopes and "general" in scopes and "mat:R1.01 : Init dev" in scopes, str(scopes))
        h1 = sw.evaluate("(r) => UCA_GRADES.nextHistory([], r, 1000)", RELEVE)
        h2 = sw.evaluate("([h, r]) => UCA_GRADES.nextHistory(h, r, 2000)", [h1, RELEVE])
        check("historique : point ajouté puis rien si la moyenne est inchangée", len(h1) == 1 and h2 is None, str(h2))
        better = json.loads(json.dumps(RELEVE)); better["ue"][1]["matieres"][0]["evals"][1]["note"] = 20
        h3 = sw.evaluate("([h, r]) => UCA_GRADES.nextHistory(h, r, 3000)", [h1, better])
        check("historique : nouveau point quand la moyenne change", h3 and len(h3) == 2 and h3[1]["avg"] > h3[0]["avg"], str(h3))
        big = [{"at": i, "avg": i % 20} for i in range(400)]
        check("historique : borné à 300 points", len(sw.evaluate("([h, r]) => UCA_GRADES.nextHistory(h, r, 9)", [big, better]) or []) <= 300)

        # --- la synchro enregistre l'historique (comme le fait le service worker)
        sw.evaluate("() => chrome.storage.local.remove('uca_notes_history')")
        sw.evaluate("""(rel) => { self.scrapeNotes = async () => ({ data: rel, issue: null }); return syncNotesQuietly(); }""", RELEVE)
        hist = sw.evaluate("() => chrome.storage.local.get('uca_notes_history').then(d => d.uca_notes_history)")
        check("synchro : historique de la moyenne enregistré", hist and len(hist) == 1, str(hist))
        sw.evaluate("() => syncNotesQuietly()")
        check("synchro : même moyenne, pas de doublon", len(sw.evaluate("() => chrome.storage.local.get('uca_notes_history').then(d => d.uca_notes_history)")) == 1)
        sw.evaluate("() => chrome.storage.local.remove('uca_notes_history')")

        # --- alerte d'absences (service worker)
        notifs = sw.evaluate("""async () => {
          const out = [], real = chrome.notifications.create;
          chrome.notifications.create = (id, o) => { out.push(o.title); };
          try {
            await chrome.storage.local.set({ uca_settings: { absenceAlert: 3 } });
            await chrome.storage.local.remove('uca_absence_alert');
            await checkAbsenceAlert({ nonJustifiees: 2 });
            await checkAbsenceAlert({ nonJustifiees: 3 });
            await checkAbsenceAlert({ nonJustifiees: 3 });
            await checkAbsenceAlert({ nonJustifiees: 4 });
            await checkAbsenceAlert({ nonJustifiees: 1 });
            await checkAbsenceAlert({ nonJustifiees: 3 });
            await chrome.storage.local.set({ uca_settings: { absenceAlert: 0 } });
            await checkAbsenceAlert({ nonJustifiees: 9 });
          } finally { chrome.notifications.create = real; await chrome.storage.local.remove('uca_settings'); }
          return out; }""")
        check("alerte absences : une notification par franchissement, réarmée sous le seuil, muette si désactivée",
              notifs == ["3 absences non justifiées", "4 absences non justifiées", "3 absences non justifiées"], str(notifs))

        # --- interface, dans chaque design
        data["uca_events"] = data["uca_events"] + [exam]
        data["uca_releve_notes"] = RELEVE
        data["uca_notes_history"] = [{"at": 1_700_000_000_000 + i * 86400000 * 6, "avg": a} for i, a in enumerate([8.5, 9.4, 10.1, 9.8, 11.2])]
        data["uca_settings"] = {"absenceAlert": 1}
        data["uca_notes_seen"] = {}
        sw.evaluate("(d) => chrome.storage.local.set(d)", data)
        for d in designs():
            did = d["id"]
            sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", did)
            ag = ctx.new_page()
            ag.on("pageerror", lambda e: errors.append(f"[{did}] {e}"))
            ag.on("console", lambda m: m.type == "error" and errors.append(f"[{did}] {m.text}"))
            ag.goto(f"{base}/{d['folder']}/agenda.html"); ag.wait_for_timeout(900)
            ag.locator("#notesBtn").click(); ag.wait_for_timeout(300)
            check(f"{did} : examen à venir avec compte à rebours", "Dans 3 jours" in ag.locator(".np-exam").first.inner_text() and "DS2" in ag.locator(".np-exam").first.inner_text(), ag.locator(".np-exams").inner_text() if ag.locator(".np-exams").count() else "absent")
            check(f"{did} : simulateur affiché avec résultat", ag.locator("#simOut").inner_text().startswith("Il faut au moins"), ag.locator("#simOut").inner_text())
            ag.select_option("#simScope", "mat:R1.01 : Init dev"); ag.locator("#simTarget").fill("12"); ag.wait_for_timeout(200)
            txt = ag.locator("#simOut").inner_text()
            check(f"{did} : simulateur matière : 10 / 20 pour viser 12", "au moins 10 / 20" in txt and "12 en R1.01" in txt, txt)
            ag.locator("#simTarget").fill("15"); ag.wait_for_timeout(200)
            check(f"{did} : simulateur : message d'impossibilité", "Impossible" in ag.locator("#simOut").inner_text(), ag.locator("#simOut").inner_text())
            ag.locator("#simTarget").fill("12"); ag.wait_for_timeout(100)
            check(f"{did} : courbe de la moyenne dessinée", ag.locator(".np-chart svg polyline").count() == 1 and ag.locator(".np-chart svg circle").count() == 5)
            ag.select_option("#chartScope", "mat:R1.01 : Init dev"); ag.wait_for_timeout(200)
            check(f"{did} : barres par évaluation (note + classe)", ag.locator(".np-chart svg rect").count() == 4, str(ag.locator(".np-chart svg rect").count()))
            check(f"{did} : tableau des notes toujours présent", ag.locator(".notes-table").count() == 1 and ag.locator(".notes-avg .na-val").count() == 1)
            over = ag.evaluate("() => { const p = document.getElementById('notesPanel'); return p.scrollWidth - p.clientWidth; }")
            check(f"{did} : fenêtre Notes sans défilement horizontal", over <= 1, str(over))
            shot(ag, f"{did}-notes-outils")
            ag.select_option("#chartScope", "general"); ag.locator("#notesBtn").click()
            ag.locator("#absencesBtn").click(); ag.wait_for_timeout(300)
            check(f"{did} : alerte d'absences dans le panneau", "seuil d'alerte (1)" in ag.locator("#absencesPanel .absence-alert").inner_text())
            shot(ag, f"{did}-absences-alerte")
            ag.locator("#absencesBtn").click()
            sw.evaluate("() => UCA_saveSettings({ absenceAlert: 0 })"); ag.wait_for_timeout(400)
            ag.locator("#absencesBtn").click(); ag.wait_for_timeout(200)
            check(f"{did} : alerte retirée quand désactivée", ag.locator("#absencesPanel .absence-alert").count() == 0)
            sw.evaluate("() => UCA_saveSettings({ absenceAlert: 1 })")
            # téléphone
            ag.set_viewport_size({"width": 390, "height": 844}); ag.wait_for_timeout(300)
            ag.locator("#menuBtn").click(); ag.wait_for_timeout(250)
            ag.locator("#mobileMenu .mi", has_text="Notes").first.click(); ag.wait_for_timeout(500)
            check(f"{did} : outils de notes lisibles sur téléphone", ag.locator("#notesPanel .np-sim").is_visible() and ag.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 0)
            shot(ag, f"{did}-notes-mobile")
            ag.close()
        ctx.close()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
