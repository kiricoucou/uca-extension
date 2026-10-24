"""Lecture d'Odin : parseurs sur des pages factices (fixtures) et pannes des pages secondaires.

Aucun accès réseau : le service worker est piloté en remplaçant l'extraction du texte de la page
(extractScheduleText) et l'API des onglets. Vérifie, pour les absences et les notes :
page normale -> données ; page d'erreur 404/500/503/maintenance -> `serviceDown` ; page chargée
mais méconnaissable -> `structure` ; renvoi vers CAS -> `session` ; et que les anciennes données
sont conservées, qu'une alerte est mémorisée puis effacée, et que le journal de diagnostic ne
contient aucun contenu de page.
Usage : python -I -X utf8 tests/scrape.py
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import launch  # noqa: E402

FIX = Path(__file__).resolve().parent / "pages"
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def fx(name):
    return (FIX / name).read_text(encoding="utf-8")


STUB = """async ({ text, url }) => {
  self.__stub = { text, url };
  chrome.tabs.create = async () => ({ id: 1 });
  chrome.tabs.get = async () => ({ id: 1, url: self.__stub.url });
  chrome.tabs.remove = async () => {};
  self.waitForComplete = async () => {};
  self.sleep = () => Promise.resolve();
  self.extractScheduleText = async () => self.__stub.text;
  self.extractDeclarations = async () => null;
  return true;
}"""


def scrape(sw, kind, text, url="https://odin.iut.uca.fr/etudiants/"):
    sw.evaluate(STUB, {"text": text, "url": url})
    fn = "scrapeAbsences" if kind == "absences" else "scrapeNotes"
    return sw.evaluate(f"() => {fn}()")


def main():
    with sync_playwright() as p:
        ctx, sw, _ = launch(p)

        # --- parseurs sur pages factices
        edt = sw.evaluate("(t) => parseScheduleText(t)", fx("odin_edt.txt"))
        check("EDT : 3 cours lus", len(edt) == 3, str(len(edt)))
        check("EDT : salle et enseignant lus", edt[0]["room"] == "B1-12" and "Martin" in edt[0]["teacher"], json.dumps(edt[0], ensure_ascii=False)[:200])
        ab = sw.evaluate("(t) => parseAbsencesText(t)", fx("odin_absences.txt"))
        check("absences : compteurs lus", ab["declarees"] == 4 and ab["justifiees"] == 1 and ab["nonJustifiees"] == 3 and ab["journeesNonJustifiees"] == 1, str(ab))
        rel = sw.evaluate("(t) => parseNotesText(t)", fx("odin_notes.txt"))
        check("notes : 2 UE lues", len(rel["ue"]) == 2, str(len(rel["ue"])))
        check("notes : évaluation lue", rel["ue"][0]["matieres"][0]["evals"][0]["note"] == 12.5, json.dumps(rel["ue"][0], ensure_ascii=False)[:200])

        # --- détection des pages d'erreur
        for name in ("odin_404.txt", "odin_500.txt", "odin_503.txt", "odin_maintenance.txt", "odin_maintenance_http.txt"):
            check(f"page d'erreur reconnue : {name}", sw.evaluate("(t) => looksLikeServiceError(t)", fx(name)))
        for name in ("odin_edt.txt", "odin_absences.txt", "odin_notes.txt"):
            check(f"page normale non prise pour une panne : {name}", not sw.evaluate("(t) => looksLikeServiceError(t)", fx(name)))

        # --- pages secondaires
        for kind, good, parsed in (("absences", "odin_absences.txt", "nonJustifiees"), ("notes", "odin_notes.txt", "ue")):
            r = scrape(sw, kind, fx(good))
            check(f"{kind} : page normale -> données, pas de problème", r["issue"] is None and r["data"] is not None, str(r)[:200])
            for err in ("odin_404.txt", "odin_500.txt", "odin_503.txt"):
                r = scrape(sw, kind, fx(err))
                check(f"{kind} : {err} -> serviceDown", r["issue"] == "serviceDown" and r["data"] is None, str(r)[:200])
            for err, url in (("odin_maintenance.txt", "https://odin.iut.uca.fr/etudiants/"), ("odin_maintenance_http.txt", "http://odin.iut.uca.fr/etudiants/")):
                r = scrape(sw, kind, fx(err), url)
                check(f"{kind} : {err} ({url[:5]}) -> maintenance", r["issue"] == "maintenance" and r["data"] is None, str(r)[:200])
            r = scrape(sw, kind, fx("odin_changee.txt"))
            check(f"{kind} : page méconnaissable -> structure", r["issue"] == "structure" and r["data"] is None, str(r)[:200])
            r = scrape(sw, kind, "", "https://ent.uca.fr/cas/login")
            check(f"{kind} : renvoi vers CAS -> session", r["issue"] == "session", str(r)[:200])
        r = scrape(sw, "absences", "Absences\nAucune information")
        check("absences : page « absences » sans compteur -> structure", r["issue"] == "structure", str(r)[:200])

        # --- anciennes données gardées, alerte mémorisée puis effacée, journal propre
        sw.evaluate("() => chrome.storage.local.set({ uca_absences: { declarees: 9, nonJustifiees: 9 }, uca_releve_notes: { ue: [{ label: 'ANCIEN', matieres: [] }] }, uca_notes_seen: { __v: 2 } })")
        sw.evaluate(STUB, {"text": fx("odin_503.txt"), "url": "https://odin.iut.uca.fr/etudiants/"})
        sw.evaluate("() => syncAbsencesQuietly().then(() => syncNotesQuietly())")
        st = sw.evaluate("() => chrome.storage.local.get(['uca_absences', 'uca_releve_notes', 'uca_scrape_issues'])")
        check("panne : anciennes absences conservées", st["uca_absences"]["declarees"] == 9)
        check("panne : ancien relevé conservé", st["uca_releve_notes"]["ue"][0]["label"] == "ANCIEN")
        check("panne : problème mémorisé pour les deux pages", st["uca_scrape_issues"].get("absences", {}).get("issue") == "serviceDown" and st["uca_scrape_issues"].get("notes", {}).get("issue") == "serviceDown", str(st["uca_scrape_issues"]))
        sw.evaluate(STUB, {"text": fx("odin_absences.txt"), "url": "https://odin.iut.uca.fr/etudiants/"})
        sw.evaluate("() => syncAbsencesQuietly()")
        st = sw.evaluate("() => chrome.storage.local.get(['uca_absences', 'uca_scrape_issues'])")
        check("retour à la normale : absences mises à jour", st["uca_absences"]["declarees"] == 4)
        check("retour à la normale : problème effacé pour les absences, gardé pour les notes", "absences" not in st["uca_scrape_issues"] and "notes" in st["uca_scrape_issues"], str(st["uca_scrape_issues"]))
        log = sw.evaluate("() => chrome.storage.local.get('uca_diag_log').then(d => d.uca_diag_log || [])")
        check("journal : événements enregistrés", any(l["event"] == "scrape-absences" for l in log) and any(l["event"] == "scrape-notes" for l in log), str(log)[:200])
        blob = json.dumps(log, ensure_ascii=False)
        check("journal : aucun contenu de page (nom, note, salle)", not any(w in blob for w in ("Martin", "B1-12", "12,5", "Maintenance", "Dupont")))
        sw.evaluate("() => { chrome.storage.local.set({ uca_diag_log: Array.from({ length: 300 }, (_, i) => ({ at: i, event: 'x', detail: '' })) }).then(() => diag('dernier', '')); }")
        ctx.pages[0].wait_for_timeout(300) if ctx.pages else None
        n = sw.evaluate("() => chrome.storage.local.get('uca_diag_log').then(d => d.uca_diag_log.length)")
        check("journal : borné à 200 lignes", n <= 200, str(n))
        # --- synchro de l'emploi du temps pendant une maintenance (page en http) : erreur dédiée, ancien EDT gardé
        sw.evaluate("() => chrome.storage.local.set({ uca_events: [{ date: '2099-01-05', year: 2099, month: 0, day: 5, startH: 8, startM: 0, endH: 10, endM: 0, title: 'ANCIEN', teacher: '', room: '' }], uca_scrape_issues: {}, uca_last_sync: '2020-01-01T00:00:00.000Z' })")
        sw.evaluate(STUB, {"text": fx("odin_maintenance_http.txt"), "url": "http://odin.iut.uca.fr/etudiants/?p=edt"})
        err = sw.evaluate("() => extractScheduleTextWithRetry(1, 3, 0).then(() => null, (e) => ({ maintenance: !!e.maintenance, serviceDown: !!e.serviceDown, message: e.message }))")
        check("EDT : page de maintenance -> erreur maintenance", err and err["maintenance"] and err["serviceDown"] and "maintenance" in err["message"], str(err))
        sw.evaluate("() => handleSync('background').catch(() => {})")
        sw.evaluate("() => handleSync('resync').catch(() => {})")
        st = sw.evaluate("() => chrome.storage.local.get(['uca_events', 'uca_scrape_issues', 'uca_last_sync'])")
        check("EDT maintenance : ancien emploi du temps et date de synchro conservés", st["uca_events"][0]["title"] == "ANCIEN" and st["uca_last_sync"].startswith("2020"), str(st)[:200])
        check("EDT maintenance : problème « maintenance » mémorisé", st["uca_scrape_issues"].get("edt", {}).get("issue") == "maintenance", str(st["uca_scrape_issues"]))
        # --- emploi du temps : page reconnue mais aucun cours lu -> ancien emploi du temps conservé
        sw.evaluate(STUB, {"text": fx("odin_edt.txt"), "url": "https://odin.iut.uca.fr/etudiants/"})
        sw.evaluate("() => chrome.storage.local.set({ uca_events: [{ date: '2099-01-05', year: 2099, month: 0, day: 5, startH: 8, startM: 0, endH: 10, endM: 0, title: 'ANCIEN', teacher: '', room: '' }], uca_scrape_issues: {}, uca_last_sync: '2020-01-01T00:00:00.000Z' })")
        sw.evaluate("() => syncSucceeded('Lundi 5 janvier 2099 Aucun cours reconnaissable ici', true)")
        st = sw.evaluate("() => chrome.storage.local.get(['uca_events', 'uca_scrape_issues', 'uca_last_sync'])")
        check("EDT méconnaissable : ancien emploi du temps conservé", len(st["uca_events"]) == 1 and st["uca_events"][0]["title"] == "ANCIEN", str(st["uca_events"])[:200])
        check("EDT méconnaissable : problème « structure » mémorisé, date de synchro inchangée", st["uca_scrape_issues"].get("edt", {}).get("issue") == "structure" and st["uca_last_sync"].startswith("2020"), str(st)[:300])
        sw.evaluate("() => chrome.storage.local.set({ uca_events: [{ date: '2001-01-05', year: 2001, month: 0, day: 5, startH: 8, startM: 0, endH: 10, endM: 0, title: 'PASSE', teacher: '', room: '' }] })")
        sw.evaluate("() => syncSucceeded('Lundi 5 janvier 2099 Semaine sans cours', true)")
        st = sw.evaluate("() => chrome.storage.local.get(['uca_events', 'uca_scrape_issues'])")
        check("semaine vide légitime (rien à venir avant) : emploi du temps remplacé", st["uca_events"] == [] and "edt" not in st["uca_scrape_issues"], str(st)[:300])
        sw.evaluate("(t) => syncSucceeded(t, true)", fx("odin_edt.txt"))
        st = sw.evaluate("() => chrome.storage.local.get(['uca_events'])")
        check("EDT normal : 3 cours enregistrés", len(st["uca_events"]) == 3, str(len(st["uca_events"])))
        ctx.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
