"""Barème des évaluations « (sur 12.0) » (v1.46.13) : calcul (core/grades.js applyScales), questions et flèche dans les
4 designs, marge rouge du carnet et moyenne générale sur une ligne, fenêtre de mise à jour de l'app web (nouveautés
défilantes). Tout dans la PWA servie en local (l'agenda tourne dans la coque).

Usage : python -I -X utf8 tests/scales.py
"""
import copy
import json
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


def node(js):
    r = subprocess.run(["node", "-e", "global.self=global; require('./core/grades.js'); const G=self.UCA_GRADES; " + js], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    return r.stdout.strip() if r.returncode == 0 else "ERR " + r.stderr[-200:]


REL = ('{ue:[{label:"UE1",coeff:1,note:null,matieres:[{label:"R1.08",coeff:1,note:5,evals:['
       '{label:"QCM1 (sur 12.0)",coeff:1,note:5,moy:5.84,maxi:11,mini:1},{label:"TP (sur 20.0)",coeff:1,note:10},{label:"DS (sur 25)",coeff:2,note:15}]}]}]}')


def calcul():
    check("barème lu dans l'intitulé (12.0, 25, 20,5, rien)", node("console.log([G.maxOf('A (sur 12.0)'),G.maxOf('B (sur 25)'),G.maxOf('C (sur 20,5)'),G.maxOf('D')].join(','))") == "12,25,20.5,")
    check("sans choix : relevé inchangé (moyenne de matière d'Odin gardée)", node(f"const r={REL}; console.log(G.generalAvg(G.applyScales(r,{{}})))") == "5")
    check("« sur 12 » : 5 devient 8,33 et la moyenne suit", node(f"const r={REL}; const a=G.applyScales(r,{{'R1.08|QCM1 (sur 12.0)':12}}); const e=a.ue[0].matieres[0].evals[0]; console.log(e.note.toFixed(2), e.moy.toFixed(2), e.scaled, G.generalAvg(a).toFixed(3))") == "8.33 9.73 true 12.083")
    check("« sur 20 » : note inchangée, choix mémorisé", node(f"const r={REL}; const e=G.applyScales(r,{{'R1.08|QCM1 (sur 12.0)':20}}).ue[0].matieres[0].evals[0]; console.log(e.note, e.choice, e.scaled)") == "5 20 false")
    check("plusieurs barèmes (12 et 25) dans la même matière", node(f"const r={REL}; const a=G.applyScales(r,{{'R1.08|QCM1 (sur 12.0)':12,'R1.08|DS (sur 25)':25}}); console.log(G.generalAvg(a).toFixed(3))") == "10.583")
    check("barème absurde ignoré", node(f"const r={REL}; console.log(G.applyScales(r,{{'R1.08|QCM1 (sur 12.0)':99}}).ue[0].matieres[0].evals[0].choice)") == "null")
    check("le relevé d'origine n'est jamais modifié", node(f"const r={REL}; G.applyScales(r,{{'R1.08|QCM1 (sur 12.0)':12}}); console.log(r.ue[0].matieres[0].evals[0].note, r.ue[0].matieres[0].note)") == "5 5")


def open_notes(pg, fr, mobile):
    if mobile:
        fr.click("#menuBtn"); pg.wait_for_timeout(250)
        fr.evaluate("() => [...document.querySelectorAll('#mobileMenu .mi')].find(b => b.textContent.includes('Notes')).click()")
    else:
        fr.click("#notesBtn")
    pg.wait_for_timeout(800)


def ui(browser, base, errors):
    for design in ("anime", "professionnel", "lumen", "carnet"):
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"[{design}] {e}"))
        pg.goto(base + "app/index.html"); pg.wait_for_timeout(300)
        st = dict(seed()); st["uca_design"] = design
        rel = copy.deepcopy(st["uca_releve_notes"]); mat = rel["ue"][0]["matieres"][0]
        mat["evals"] = [{"label": "QCM1 (sur 12.0)", "key": "QCM1 (sur 12.0)", "coeff": 1, "note": 5, "moy": 5.84, "maxi": 11, "mini": 1},
                        {"label": "TEST TD N°1 (sur 20.0)", "key": "TEST TD N°1 (sur 20.0)", "coeff": 1, "note": 11, "moy": 10.21, "maxi": 18, "mini": 3},
                        {"label": "DS (sur 25)", "key": "DS (sur 25)", "coeff": 2, "note": 15, "moy": 12, "maxi": 24, "mini": 4}]
        mat["note"] = None; rel["ue"][0]["note"] = None
        st["uca_releve_notes"] = rel; st["uca_scales"] = {}
        pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", st)
        pg.goto(base + "app/index.html?source=pwa"); pg.wait_for_timeout(2500)
        fr = pg.query_selector("#agendaFrame").content_frame()
        open_notes(pg, fr, True)
        asks = fr.evaluate("() => [...document.querySelectorAll('.np-mat .sc-ask')].map(a => [...a.querySelectorAll('button')].map(b => b.textContent).join('/'))")
        check(f"{design} : question « sur combien » pour chaque barème différent de 20 (12 et 25, pas le 20)", asks == ["sur 20/sur 12", "sur 20/sur 25"], str(asks))
        avg0 = fr.evaluate("() => document.querySelector('.notes-avg .na-val').textContent")
        fr.evaluate("() => [...document.querySelectorAll('.np-mat .sc-ask button')].find(b => b.textContent === 'sur 12').click()"); pg.wait_for_timeout(500)
        avg1 = fr.evaluate("() => document.querySelector('.notes-avg .na-val').textContent")
        check(f"{design} : « sur 12 » recalcule la moyenne générale", avg0 != avg1 and "10,33" in avg0 and "10,61" in avg1, f"{avg0} -> {avg1}")
        check(f"{design} : flèche ⇄ à côté de « (sur 12) », l'autre évaluation attend toujours sa réponse", fr.evaluate("() => document.querySelectorAll('.np-mat .sc-flip').length") == 1 and fr.evaluate("() => document.querySelectorAll('.np-mat .sc-ask').length") == 1)
        check(f"{design} : barème affiché une seule fois par intitulé (pas « (sur 12.0) (sur 12) »)", fr.evaluate("() => ![...document.querySelectorAll('.np-mat span')].some(e => (e.textContent.match(/\\(sur/g) || []).length > 1)"))
        fr.evaluate("() => document.querySelector('.np-mat .sc-flip').click()"); pg.wait_for_timeout(500)
        avg2 = fr.evaluate("() => document.querySelector('.notes-avg .na-val').textContent")
        check(f"{design} : la flèche rebascule sur 20 (moyenne d'origine)", avg2 == avg0, f"{avg2} vs {avg0}")
        fr.evaluate("() => document.querySelector('.np-mat .sc-flip').click()"); pg.wait_for_timeout(500)
        saved = pg.evaluate("() => JSON.parse(localStorage.getItem('uca_store')).uca_scales")
        check(f"{design} : choix enregistré par évaluation", saved.get("R1.01 : Init dev|QCM1 (sur 12.0)") == 12 or any(v == 12 for v in saved.values()), str(saved))
        pg.goto(base + "app/index.html?source=pwa"); pg.wait_for_timeout(2500)
        fr = pg.query_selector("#agendaFrame").content_frame(); open_notes(pg, fr, True)
        check(f"{design} : choix retrouvé après rechargement", fr.evaluate("() => document.querySelector('.notes-avg .na-val').textContent") == avg1)
        m = fr.evaluate("""() => {
          const lbl = document.querySelector('.notes-avg .na-lbl'), val = document.querySelector('.notes-avg .na-val');
          const lines = (e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map(q => Math.round(q.top))).size; };
          return { lbl: lines(lbl), val: lines(val) };
        }""")
        check(f"{design} : « Moyenne générale » et la note tiennent chacune sur une ligne", m["lbl"] == 1 and m["val"] == 1, str(m))
        if design == "carnet":
            gap = fr.evaluate("""() => {
              const panel = document.getElementById('notesPanel'), pr = panel.getBoundingClientRect();
              const line = parseFloat(getComputedStyle(panel, '::before').left) + 2;
              let minX = 1e9;
              const w = document.createTreeWalker(document.getElementById('npContent'), NodeFilter.SHOW_TEXT);
              while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.width > 0 && q.height > 0 && q.left < pr.right) minX = Math.min(minX, q.left - pr.left); }
              return Math.round(minX - line);
            }""")
            check("carnet : la marge rouge ne touche aucune lettre (≥ 6 px d'espace)", gap >= 6, f"{gap}px")
        ctx.close()


VERS = {"version": "1.4.12", "version_code": 15, "published_at": "2026-11-11T11:00:00Z", "ota_version": "1.4.12",
        "history": [{"version": "1.46.13", "app": "1.4.12", "title": "barème, mise à jour", "items": ["Barème des évaluations", "Écran de mise à jour qui défile"]},
                    {"version": "1.46.12", "app": "1.4.11", "title": "déclarations", "items": ["Mes déclarations dans les absences"] + [f"Ligne {i}" for i in range(30)]},
                    {"version": "1.46.10", "app": "1.4.9", "title": "app web", "items": ["Tout l'APK dans l'app web"]}]}


def update_sheet(browser, base, errors):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    state = {"v": dict(VERS)}
    ctx.route("**/version.json*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(state["v"])))
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"[maj] {e}"))
    pg.goto(base + "app/index.html"); pg.wait_for_timeout(300)
    st = dict(seed()); st["uca_design"] = "anime"
    pg.evaluate("(s) => { localStorage.setItem('uca_store', JSON.stringify(s)); localStorage.setItem('uca_pwa_seen_app', '1.4.9'); }", st)
    pg.goto(base + "app/index.html?source=pwa"); pg.wait_for_timeout(2500)
    sheet = pg.locator("#sheet")
    check("app web : mise à jour installée → nouveautés affichées au lancement", sheet.is_visible() and "Mise à jour installée" in sheet.inner_text(), sheet.inner_text()[:80])
    txt = sheet.inner_text()
    check("app web : toutes les versions manquées listées (1.4.9 exclue : déjà vue)", "v1.4.12" in txt and "v1.4.11" in txt and "v1.4.9" not in txt, txt[:200])
    sc = pg.evaluate("() => { const n = document.querySelector('#sheet .news'); return [n.scrollHeight, n.clientHeight, getComputedStyle(n).overflowY]; }")
    check("app web : la liste des nouveautés défile", sc[0] > sc[1] and sc[2] in ("auto", "scroll"), str(sc))
    pg.evaluate("() => { const n = document.querySelector('#sheet .news'); n.scrollTop = n.scrollHeight; }")
    check("app web : le bas de la liste est atteignable (Ligne 29 visible en défilant)", pg.evaluate("() => { const n = document.querySelector('#sheet .news'); const l = [...n.querySelectorAll('li')].find(x => x.textContent === 'Ligne 29'); const a = n.getBoundingClientRect(), b = l.getBoundingClientRect(); return b.bottom <= a.bottom + 1 && b.top >= a.top; }"))
    check("app web : version vue mémorisée", pg.evaluate("() => localStorage.getItem('uca_pwa_seen_app')") == "1.4.12")
    pg.locator("#sheet [data-act=closeSheet]").click(); pg.wait_for_timeout(200)
    check("app web : fenêtre refermée", not sheet.is_visible())
    # Version publiée pendant que l'app est ouverte
    state["v"] = dict(VERS, published_at="2026-11-12T08:00:00Z", version="1.4.13", ota_version="1.4.13",
                      history=[{"version": "1.46.14", "app": "1.4.13", "title": "nouveauté", "items": ["Autre chose"]}] + VERS["history"])
    pg.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(1200)
    t = sheet.inner_text() if sheet.is_visible() else ""
    check("app web : nouvelle version publiée pendant l'usage → fenêtre « Nouvelle version disponible »", "Nouvelle version disponible" in t and "v1.4.13" in t, t[:100])
    check("app web : bouton « Mettre à jour maintenant »", pg.locator("#sheet [data-act=applyUpdate]").count() == 1)
    pg.evaluate("() => { window.__reloaded = false; }")
    with pg.expect_navigation(timeout=10000):
        pg.locator("#sheet [data-act=applyUpdate]").click()
    pg.wait_for_timeout(1500)
    check("app web : « Mettre à jour maintenant » recharge l'app", True)
    ctx.close()


def main():
    calcul()
    port = 8811
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            base = f"http://127.0.0.1:{port}/"
            ui(b, base, errors)
            update_sheet(b, base, errors)
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
