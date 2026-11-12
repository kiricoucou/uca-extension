"""Vérifie la démo du site (?demo=1, core/demo.js) dans les 5 designs :

1. même emploi du temps / mêmes notes / mêmes absences d'un design à l'autre, mais un scénario de changements propre à chaque design ;
2. cours jusqu'en septembre 2027, absences toutes « justifiée » (statut valide), courbe de moyenne reconstruite (plusieurs points) ;
3. infobulle « Note qui date du <date précise> » sur les notes datées ;
4. sécurité : une saisie piégée dans le simulateur d'objectif (balise, script, valeur extrême) n'exécute rien et ne déclenche aucune requête réseau.

Usage : python -I -X utf8 tests/demo_scenarios.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8791
DESIGNS = ["studio", "anime", "professionnel", "bulletin", "carnet"]
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("OK   " if ok else "FAIL ") + name + (f" : {detail}" if detail and not ok else ""))


def stored(page):
    return page.evaluate("() => new Promise(r => chrome.storage.local.get(null, r))")


def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()
            datas = {}
            for d in DESIGNS:
                pg = br.new_page(viewport={"width": 1360, "height": 820})
                errs, reqs, dialogs = [], [], []
                pg.on("pageerror", lambda e, errs=errs: errs.append(str(e)))
                pg.on("request", lambda r, reqs=reqs: reqs.append(r.url) if not r.url.startswith(f"http://localhost:{PORT}") and not r.url.startswith("data:") else None)
                pg.on("dialog", lambda dlg, dialogs=dialogs: (dialogs.append(dlg.message), dlg.dismiss()))
                pg.goto(f"http://localhost:{PORT}/designs/{d}/agenda.html?demo=1")
                pg.wait_for_timeout(2000)
                data = stored(pg)
                datas[d] = data
                check(f"{d} : aucune erreur JS", not errs, str(errs[:2]))
                evs = data.get("uca_events", [])
                check(f"{d} : cours jusqu'en septembre 2027 ({len(evs)} cours)", len(evs) > 400 and max(e["date"] for e in evs) >= "2027-09-15", str(max(e["date"] for e in evs)))
                dec = data["uca_absences"]["declarations"]
                check(f"{d} : absences toutes justifiées", dec and all(x["statut"] == "justifiee" for x in dec) and data["uca_absences"]["nonJustifiees"] == 0)
                check(f"{d} : changements d'emploi du temps ({len(data['uca_edt_changes'])})", len(data["uca_edt_changes"]) >= 4)
                seen = data["uca_notes_seen"]
                dated = [k for k, v in seen.items() if k != "__v" and v.get("at")]
                check(f"{d} : notes datées pour la courbe ({len(dated)})", len(dated) >= 12)

                # panneau Notes : infobulle datée + courbe
                pg.click("#notesBtn")
                pg.wait_for_timeout(800)
                titles = pg.evaluate("() => [...document.querySelectorAll('td.note-val[title]')].map(e => e.title)")
                check(f"{d} : infobulle « Note qui date du … »", any(t.startswith("Note qui date du ") and " à " in t for t in titles), str(titles[:2]))

                # sécurité : saisie piégée dans le simulateur d'objectif
                bad = ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "1e999", "-1e999", "javascript:alert(1)", "20; DROP TABLE notes"]
                inp = pg.query_selector("#simTarget")
                if inp:
                    for v in bad:
                        pg.evaluate("(v) => { const i = document.getElementById('simTarget'); i.value = v; i.dispatchEvent(new Event('input', {bubbles: true})); }", v)
                    pg.wait_for_timeout(300)
                    check(f"{d} : saisie piégée sans alerte ni balise injectée", not dialogs and not pg.query_selector("#simOut img, #simOut script"), str(dialogs))
                else:
                    check(f"{d} : simulateur d'objectif présent", False)
                check(f"{d} : aucune requête hors du site", not reqs, str(reqs[:3]))
                pg.close()
            # même emploi du temps / mêmes notes / mêmes absences d'un design à l'autre
            base = datas["professionnel"]
            for d in DESIGNS:
                if d == "professionnel":
                    continue
                check(f"{d} : mêmes notes que professionnel", datas[d]["uca_releve_notes"] == base["uca_releve_notes"])
                ab = lambda x: ({k: v for k, v in x["uca_absences"].items() if k != "declarations"}, [(a["motif"], a["statut"]) for a in x["uca_absences"]["declarations"]])  # noqa: E731
                check(f"{d} : mêmes absences que professionnel", ab(datas[d]) == ab(base))
                kinds = lambda x: sorted(c["type"] for c in x["uca_edt_changes"])  # noqa: E731
            scen = {d: tuple(kinds(datas[d])) for d in DESIGNS}
            check("scénarios de changements différents par design", len(set(scen.values())) == len(DESIGNS), json.dumps(scen))
            br.close()
    finally:
        srv.terminate()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
