"""Recherche des notes Moodle dans l'application Android, avec les pages réellement embarquées dans l'APK :
  1. le script injecté dans la page Moodle (core/moodle.js + core/moodle-app.js) contre un Moodle factice ;
  2. l'agenda avec un faux pont AndroidUCA : bouton « Chercher sur Moodle », progression, notes à valider, notification,
     session absente (« Me connecter à Moodle »), recherche silencieuse après la synchro Odin, ancien APK sans la fonction.
La partie Kotlin (UcaMoodle.kt) n'est pas exécutée ici. Rien n'est contacté : tout est servi en local ou simulé.

Usage : python -I -X utf8 tests/moodle_apk.py
"""
import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "app" / "webview-app" / "app" / "src" / "main" / "assets" / "legacy-site"
TESTS = ROOT / "tests"
sys.path.insert(0, str(TESTS))
from fixtures import seed  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


# Faux pont natif : note les appels ; « recent » = False simule un APK d'avant la fonction.
BRIDGE = """(recent) => { if (window.top !== window) return; window.__calls = [];
  const rec = (n) => (...a) => window.__calls.push([n, ...a]);
  const api = { requestSync: rec('sync'), requestClass: rec('class'), onDesignChanged: rec('design'), onEventsUpdated: rec('events'), onWidgetData: rec('widget') };
  if (recent) Object.assign(api, { requestMoodle: rec('moodle'), requestMoodleLogin: rec('login'), notifyMoodle: rec('notify') });
  window.AndroidUCA = api; }"""


def scraped():
    overview = (TESTS / "pages" / "moodle_overview.html").read_text(encoding="utf-8")
    course = (TESTS / "pages" / "moodle_cours.html").read_text(encoding="utf-8")
    return overview, course


def run_inpage(browser, errors):
    overview, course = scraped()
    state = {"expired": False}

    def moodle(route):
        u = route.request.url
        if state["expired"] and "/login/" not in u:
            return route.fulfill(status=302, headers={"location": "https://moodle2026.uca.fr/login/index.php"}, body="")
        body = overview if "/grade/report/overview/" in u else course if "id=1111" in u else "Pas de notes"
        route.fulfill(status=200, content_type="text/html; charset=utf-8", body="<html><body>" + body + "</body></html>")

    ctx = browser.new_context()
    ctx.route("https://moodle2026.uca.fr/**", moodle)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"[moodle] {e}"))
    pg.goto("https://moodle2026.uca.fr/grade/report/overview/index.php")
    code = (SITE / "core" / "moodle.js").read_text(encoding="utf-8") + "\n" + (SITE / "core" / "moodle-app.js").read_text(encoding="utf-8")
    pg.evaluate(code)
    pg.wait_for_function("() => window.__ucaMoodleJob && window.__ucaMoodleJob.result", timeout=30000)
    job = pg.evaluate("() => window.__ucaMoodleJob")
    data = job["result"].get("data") or []
    check("page Moodle : les notes sont lues depuis la page (3 notes du cours 1111)", len(data) == 3 and {g["courseId"] for g in data} == {"1111"}, json.dumps(job)[:300])
    check("page Moodle : progression complète (cours lus / cours à lire)", job["total"] > 1 and job["done"] == job["total"], json.dumps(job)[:200])
    state["expired"] = False
    pg.goto("https://moodle2026.uca.fr/my/")
    state["expired"] = True
    pg.evaluate(code)
    pg.wait_for_function("() => window.__ucaMoodleJob && window.__ucaMoodleJob.result", timeout=30000)
    res = pg.evaluate("() => window.__ucaMoodleJob.result")
    check("page Moodle : renvoi vers la connexion -> session absente", res.get("issue") in ("session", "error") and "data" not in res, str(res))
    ctx.close()
    return data


def deliver(pg, payload):
    pg.evaluate("(m) => window.postMessage(Object.assign({ source: 'uca-extension' }, m), '*')", payload)
    pg.wait_for_timeout(700)


def calls(pg, name):
    return [c for c in pg.evaluate("() => window.__calls") if c[0] == name]


def open_app(browser, base, design, recent, errors, extra=None):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script(f"({BRIDGE})({'true' if recent else 'false'});")
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"[{design}] {e}"))
    pg.goto(base + "choose.html"); pg.wait_for_timeout(300)
    st = dict(seed()); st["uca_design"] = design; st["uca_settings"] = {"moodleNotes": True}; st["uca_usage"] = {"v": "both", "at": 1}
    st.pop("uca_moodle", None); st.update(extra or {})
    pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", st)
    pg.goto(base + f"designs/{design}/agenda.html"); pg.wait_for_timeout(2500)
    return ctx, pg


def open_notes(pg):
    pg.click("#menuBtn"); pg.wait_for_timeout(250)
    pg.evaluate("() => [...document.querySelectorAll('#mobileMenu .mi')].find(b => b.textContent.includes('Notes')).click()")
    pg.wait_for_timeout(900)


def store(pg):
    return pg.evaluate("() => JSON.parse(localStorage.getItem('uca_store'))")


def run_app(browser, base, data, errors):
    designs = sorted(p.name for p in (SITE / "designs").iterdir() if (p / "agenda.html").exists())
    for design in designs:
        ctx, pg = open_app(browser, base, design, True, errors)
        open_notes(pg)
        btn = pg.locator("#moodleSyncBtn")
        check(f"{design} APK : bouton « Chercher sur Moodle » présent", btn.count() == 1)
        if btn.count() != 1:
            ctx.close(); continue
        btn.click(); pg.wait_for_timeout(700)
        check(f"{design} APK : le bouton demande la recherche à l'application (manuelle)", calls(pg, "moodle")[-1:] == [["moodle", True]], str(calls(pg, "moodle")))
        deliver(pg, {"type": "UCA_MOODLE_PROGRESS", "done": 1, "total": 4, "label": "Cours A"})
        check(f"{design} APK : progression affichée", "cours 2 / 4" in pg.locator("#moodleProgress").inner_text(), pg.locator("#notesPanel").inner_text()[:200])
        deliver(pg, {"type": "UCA_MOODLE_RESULT", "data": data, "issue": None, "detail": None})
        items = (store(pg).get("uca_moodle") or {}).get("items", {})
        check(f"{design} APK : 3 notes en attente de validation, affichées", len(items) == 3 and all(i["status"] == "pending" for i in items.values()) and pg.locator(".np-moodle-card").count() == 3, f"{len(items)} / {pg.locator('.np-moodle-card').count()}")
        check(f"{design} APK : notification de l'application demandée (3 notes)", calls(pg, "notify") == [["notify", 3]], str(calls(pg, "notify")))
        check(f"{design} APK : barre de progression refermée", pg.locator("#moodleProgress").count() == 0 and store(pg)["uca_moodle_progress"]["active"] is False)
        pg.locator(".np-moodle-card").first.get_by_role("button", name="Refuser la note").click(); pg.wait_for_timeout(500)
        # recherche silencieuse après la synchro Odin : la décision est gardée, pas de nouvelle notification
        before = len(calls(pg, "moodle"))
        deliver(pg, {"type": "UCA_NOTES_RESULT", "ok": True, "releve": store(pg)["uca_releve_notes"]})
        check(f"{design} APK : après la synchro Odin, recherche silencieuse", calls(pg, "moodle")[before:] == [["moodle", False]], str(calls(pg, "moodle")))
        deliver(pg, {"type": "UCA_MOODLE_RESULT", "data": data, "issue": None, "detail": None})
        st = store(pg)["uca_moodle"]["items"]
        check(f"{design} APK : note refusée toujours refusée, aucune nouvelle notification", sorted(i["status"] for i in st.values()) == ["pending", "pending", "refused"] and len(calls(pg, "notify")) == 1, str(calls(pg, "notify")))
        # session absente -> bouton de connexion -> retour -> recherche relancée
        pg.locator("#moodleSyncBtn").click(); pg.wait_for_timeout(500)
        deliver(pg, {"type": "UCA_MOODLE_RESULT", "data": None, "issue": "session", "detail": None})
        txt = pg.locator("#notesPanel").inner_text()
        check(f"{design} APK : session absente -> message de l'app, sans parler du navigateur", "dans l'application" in txt and "dans ce navigateur" not in txt, txt[:300])
        check(f"{design} APK : session absente : les notes déjà vues sont gardées", len(store(pg)["uca_moodle"]["items"]) == 3)
        pg.locator("#moodleLoginBtn").click(); pg.wait_for_timeout(500)
        check(f"{design} APK : « Me connecter à Moodle » ouvre l'écran de connexion de l'app", len(calls(pg, "login")) == 1, str(calls(pg, "login")))
        before = len(calls(pg, "moodle"))
        deliver(pg, {"type": "UCA_MOODLE_LOGIN_DONE"})
        check(f"{design} APK : une fois connecté, la recherche repart toute seule", calls(pg, "moodle")[before:] == [["moodle", True]], str(calls(pg, "moodle")))
        deliver(pg, {"type": "UCA_MOODLE_RESULT", "data": data, "issue": None, "detail": None})
        check(f"{design} APK : le message d'erreur disparaît après réussite", pg.locator("#moodleLoginBtn").count() == 0 and "moodle" not in store(pg).get("uca_scrape_issues", {}))
        ctx.close()

    # De vraies notes et de vrais devoirs aux noms ordinaires (« UE 1.1 », « SAE 1.01 ») survivent à l'ouverture de l'app.
    design = designs[0]
    ctx, pg = open_app(browser, base, design, True, errors, {"uca_tasks": [{"id": "task1", "title": "Rendu SAE 1.01", "date": "2026-12-01", "done": False}]})
    kept = store(pg)
    check("app : le relevé « UE 1.1 » et le devoir « SAE 1.01 » ne sont pas effacés à l'ouverture", "uca_releve_notes" in kept and len(kept.get("uca_tasks", [])) == 1, str(sorted(kept)))
    ctx.close()

    ctx, pg = open_app(browser, base, design, False, errors)
    open_notes(pg)
    deliver(pg, {"type": "UCA_NOTES_RESULT", "ok": True, "releve": store(pg)["uca_releve_notes"]})
    check("ancien APK (sans la fonction) : pas de bouton, aucune erreur", pg.locator("#moodleSyncBtn").count() == 0)
    ctx.close()

    ctx, pg = open_app(browser, base, design, True, errors, {"uca_settings": {"moodleNotes": False}})
    before = len(calls(pg, "moodle"))
    deliver(pg, {"type": "UCA_NOTES_RESULT", "ok": True, "releve": store(pg)["uca_releve_notes"]})
    check("réglage « Notes Moodle » désactivé : aucune recherche", len(calls(pg, "moodle")) == before)
    ctx.close()

    ctx, pg = open_app(browser, base, design, True, errors, {"uca_moodle_progress": {"active": True, "at": 9999999999999}})
    check("page rechargée pendant une recherche : la progression ne reste pas bloquée", store(pg)["uca_moodle_progress"]["active"] is False)
    ctx.close()


def main():
    port = 8813
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(SITE)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            data = run_inpage(b, errors)
            run_app(b, f"http://127.0.0.1:{port}/", data, errors)
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
