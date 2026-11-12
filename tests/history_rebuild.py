"""Courbe d'évolution de la moyenne générale : le passé est reconstruit à partir des dates de première vue de chaque note
(uca_notes_seen), fusionné avec les points de synchro ; un seul point est dessiné quand même. Logique (node) + affichage.

Usage : python -I -X utf8 tests/history_rebuild.py
"""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import ROOT  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


DAY = 86400000
NOW = int(time.time() * 1000)
T1, T2 = NOW - 20 * DAY, NOW - 8 * DAY


def ev(label, note, coeff=1):
    return {"label": label + " (sur 20.0)", "key": label + " (sur 20.0)", "coeff": coeff, "note": note, "moy": 10, "maxi": 18, "mini": 3}


RELEVE = {"ue": [{"label": "UE 1.1 Test", "coeff": 1, "note": None, "matieres": [{"label": "R1.01 : Test", "coeff": 1, "note": None, "evals": [ev("A", 14), ev("B", 10), ev("C", 6)]}]}]}
SEEN = {"__v": 2, "R1.01 : Test|A (sur 20.0)": {"note": 14, "at": 0}, "R1.01 : Test|B (sur 20.0)": {"note": 10, "at": T1}, "R1.01 : Test|C (sur 20.0)": {"note": 6, "at": T2}}

NODE = r"""
const fs = require('fs'); const vm = require('vm');
const code = fs.readFileSync(process.argv[1], 'utf8');
const ctx = { self: {}, window: {} }; ctx.self = ctx; vm.createContext(ctx); vm.runInContext(code, ctx);
const G = ctx.UCA_GRADES;
const releve = JSON.parse(process.argv[2]), seen = JSON.parse(process.argv[3]), stored = JSON.parse(process.argv[4]);
console.log(JSON.stringify({ rebuilt: G.reconstructHistory(releve, seen, stored), none: G.reconstructHistory(releve, {}, []), merged: G.reconstructHistory(releve, seen, JSON.parse(process.argv[5])) }));
"""


def main():
    r = subprocess.run(["node", "-e", NODE, (ROOT / "core" / "grades.js").as_posix(), json.dumps(RELEVE), json.dumps(SEEN), "[]", json.dumps([{"at": NOW - 3 * DAY, "avg": 10}])],
                       capture_output=True, text=True, encoding="utf-8")
    o = json.loads(r.stdout or "{}")
    pts = o.get("rebuilt", [])
    check("3 points reconstruits (avant B, à l'arrivée de B, à l'arrivée de C)", [p["avg"] for p in pts] == [14, 12, 10], str(pts))
    check("les points sont dans l'ordre chronologique", [p["at"] for p in pts] == sorted(p["at"] for p in pts))
    check("sans date de vue (tout est « ancien »), rien d'inventé", o.get("none") == [], str(o.get("none")))
    check("fusion avec un point de synchro identique : pas de doublon", [p["avg"] for p in o.get("merged", [])] == [14, 12, 10], str(o.get("merged")))

    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    base = f"http://127.0.0.1:{port}/"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for design in ("studio", "anime", "professionnel", "lumen", "carnet"):
                for label, vp in (("bureau", {"width": 1280, "height": 800}), ("téléphone", {"width": 390, "height": 800})):
                    ctx = b.new_context(viewport=vp); pg = ctx.new_page(); errors = []
                    pg.on("pageerror", lambda e: errors.append(str(e)))
                    pg.goto(base + "app/index.html"); pg.wait_for_timeout(300)
                    data = seed(); data["uca_design"] = design; data["uca_releve_notes"] = RELEVE; data["uca_notes_seen"] = SEEN; data["uca_notes_history"] = []
                    pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", data)
                    pg.goto(base + f"designs/{design}/agenda.html"); pg.wait_for_timeout(1400)
                    if vp["width"] <= 500:
                        pg.locator("#menuBtn").click(); pg.wait_for_timeout(300)
                        pg.locator("#mobileMenu .mi", has_text="Notes").first.click()
                    else:
                        pg.locator("#notesBtn").click()
                    pg.wait_for_timeout(700)
                    dots = pg.locator("#npContent .np-evo svg circle").count()
                    check(f"{design} {label} : courbe d'évolution avec 3 points sans aucune synchro enregistrée", dots == 3, str(dots))
                    check(f"{design} {label} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                    ctx.close()
            # un seul point : dessiné quand même
            ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page()
            pg.goto(base + "app/index.html"); pg.wait_for_timeout(300)
            data = seed(); data["uca_design"] = "studio"; data["uca_releve_notes"] = RELEVE; data["uca_notes_seen"] = {"__v": 2}; data["uca_notes_history"] = []
            pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", data)
            pg.goto(base + "designs/studio/agenda.html"); pg.wait_for_timeout(1400)
            pg.locator("#notesBtn").click(); pg.wait_for_timeout(600)
            check("un seul point : affiché (cercle + moyenne actuelle)", pg.locator("#npContent .np-evo svg circle").count() == 1 and "Moyenne actuelle" in pg.locator("#npContent .np-evo").inner_text())
            ctx.close(); b.close()
    finally:
        srv.terminate()
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
