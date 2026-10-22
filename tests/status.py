"""Test du widget « Statut des sites » (Paramètres) et de la surveillance en arrière-plan.

Les sites réels ne sont jamais contactés : context.route répond à leur place (200 / 503 / lent /
coupure). Usage : python -I -X utf8 tests/status.py [dossier_captures]
"""
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import designs, launch  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []
HOSTS = {"odin": "odin.iut.uca.fr", "cas": "ent.uca.fr", "moodle": "moodle.uca.fr", "mail": "mail.uca.fr",
         "site": "kiricoucou.github.io", "updates": "raw.githubusercontent.com"}
mode = {k: "ok" for k in HOSTS}
CORS = {"access-control-allow-origin": "*"}


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def handler_for(site_id):
    def handle(route):
        m = mode[site_id]
        if m == "ok":
            route.fulfill(status=200, headers=CORS, content_type="text/html", body="<title>Accueil</title>ok")
        elif m == "503":
            route.fulfill(status=503, headers=CORS, content_type="text/html", body="<title>Service Unavailable</title>")
        elif m == "title":
            route.fulfill(status=200, headers=CORS, content_type="text/html", body="<title>Maintenance en cours</title>")
        elif m == "slow":
            time.sleep(2.8)
            route.fulfill(status=200, headers=CORS, content_type="text/html", body="<title>Accueil</title>ok")
        else:
            route.abort()
    return handle


def state(page, site_id):
    return page.locator(f"#st-{site_id}").get_attribute("data-state")


def test_now(page):
    page.locator("#stTestBtn").click()
    page.wait_for_function("() => !document.getElementById('stTestBtn').disabled", timeout=20000)
    page.wait_for_timeout(250)


def shot(page, name):
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)


def main():
    errors = []
    with sync_playwright() as p:
        ctx, sw, base = launch(p)
        for sid, host in HOSTS.items():
            ctx.route(f"https://{host}/**", handler_for(sid))
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and not m.text.startswith("Failed to load resource") and errors.append(m.text))
        page.goto(f"{base}/settings.html")
        page.wait_for_function("() => document.querySelectorAll('.st-row[data-state=ok]').length === 6", timeout=20000)
        check("6 sites listés", page.locator(".st-row").count() == 6)
        check("tous en ligne au départ", all(state(page, s) == "ok" for s in HOSTS))
        check("résumé « Tout fonctionne »", page.locator("#stSummary").inner_text() == "Tout fonctionne")
        check("latence affichée", "ms" in page.locator("#st-odin .hint").inner_text())
        check("Moodle : état exact non lisible signalé", "joignable" in page.locator("#st-moodle .hint").inner_text())
        check("Odin : état exact (pas de mention de limite)", "joignable" not in page.locator("#st-odin .hint").inner_text())
        shot(page, "statut-ok")

        mode["odin"] = "503"
        test_now(page)
        check("Odin 503 : en panne", state(page, "odin") == "down")
        check("Odin 503 : raison affichée", "503" in page.locator("#st-odin .hint").inner_text())
        check("Odin 503 : résumé en panne", page.locator("#stSummary").inner_text() == "En panne : Odin" and "bad" in page.locator("#stSummary").get_attribute("class"))
        check("les autres sites restent en ligne", all(state(page, s) == "ok" for s in HOSTS if s != "odin"))
        shot(page, "statut-panne")

        mode["odin"] = "title"
        test_now(page)
        check("page d'erreur déguisée en 200 : en panne", state(page, "odin") == "down" and "Maintenance" in page.locator("#st-odin .hint").inner_text())

        mode["odin"] = "ok"; mode["moodle"] = "abort"; mode["cas"] = "slow"
        test_now(page)
        check("coupure réseau : Moodle en panne", state(page, "moodle") == "down" and "injoignable" in page.locator("#st-moodle .hint").inner_text())
        check("réponse lente : CAS lent", state(page, "cas") == "slow")
        check("Odin revenu en ligne", state(page, "odin") == "ok")
        check("courbe d'historique affichée", page.locator("#st-odin .st-spark rect").count() >= 3)
        check("courbe : une barre rouge pour la panne", page.locator("#st-odin .st-spark rect.down").count() >= 1)
        shot(page, "statut-lent")

        mode.update({k: "ok" for k in HOSTS})
        test_now(page)
        check("retour à la normale", page.locator("#stSummary").inner_text() == "Tout fonctionne")

        # Mise à jour en direct : un résultat écrit ailleurs (service worker) apparaît sans clic.
        sw.evaluate("""chrome.storage.local.get('uca_status').then(({uca_status}) => {
          uca_status.sites.mail = Object.assign({}, uca_status.sites.mail, {state: 'down', reason: 'Serveur injoignable', at: Date.now()});
          return chrome.storage.local.set({uca_status}); })""")
        page.wait_for_timeout(500)
        check("affichage mis à jour en direct (stockage)", state(page, "mail") == "down")

        # Surveillance en arrière-plan.
        check("surveillance désactivée par défaut", sw.evaluate("chrome.alarms.get('uca_status')") is None)
        page.locator("#f-statusWatch").check(force=True); page.wait_for_timeout(500)
        check("alarme créée à l'activation", (sw.evaluate("chrome.alarms.get('uca_status')") or {}).get("periodInMinutes") == 5)
        notes = sw.evaluate("""async () => {
          const realFetch = self.fetch, out = [], realCreate = chrome.notifications.create;
          chrome.notifications.create = (id, o) => { out.push(o.title); };
          const set = (st) => chrome.storage.local.set({ uca_status: { at: Date.now(), sites: { odin: { state: st, ms: 10, at: Date.now(), history: [], since: Date.now() }, cas: { state: st, ms: 10, at: Date.now(), history: [], since: Date.now() } } } });
          try {
            await set('ok'); self.fetch = (u, o) => /^https:/.test(u) ? Promise.reject(new Error('down')) : realFetch(u, o); await runStatusWatch();
            self.fetch = (u, o) => /^https:/.test(u) ? Promise.resolve(new Response('<title>x</title>', { status: 200, headers: { 'content-type': 'text/html' } })) : realFetch(u, o); await runStatusWatch();
            await runStatusWatch();
          } finally { self.fetch = realFetch; chrome.notifications.create = realCreate; }
          return out; }""")
        check("notification de panne puis de retour, une seule fois chacune",
              sorted(notes) == sorted(["Odin est en panne", "Connexion (CAS) est en panne", "Odin est de nouveau disponible", "Connexion (CAS) est de nouveau disponible"]), str(notes))
        page.locator("#f-statusWatch").uncheck(force=True); page.wait_for_timeout(500)
        check("alarme supprimée à la désactivation", sw.evaluate("chrome.alarms.get('uca_status')") is None)

        # Captures de chaque design, bureau et mobile, clair et sombre.
        mode["odin"] = "503"; mode["cas"] = "slow"
        test_now(page)
        for d in designs():
            sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", d["id"])
            page.reload(); page.wait_for_function("() => document.querySelectorAll('.st-row[data-state=down]').length >= 1", timeout=20000)
            for scheme in ("light", "dark"):
                page.emulate_media(color_scheme=scheme)
                page.set_viewport_size({"width": 900, "height": 900}); shot(page, f"statut-{d['id']}-{scheme}")
            page.emulate_media(color_scheme="light")
            page.set_viewport_size({"width": 390, "height": 844}); shot(page, f"statut-{d['id']}-mobile")
            over = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"{d['id']} : pas de défilement horizontal sur mobile", over <= 0, str(over))
            page.set_viewport_size({"width": 1280, "height": 900})
        ctx.close()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
