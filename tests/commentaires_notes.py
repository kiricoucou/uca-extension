"""Fenêtre de détail d'une note (titre sur une ligne sur ordinateur, « Retour » et croix) et commentaire personnel sur
chaque note : enregistré localement, retrouvé après rechargement, icône cliquable dans le tableau, conservé par la
sauvegarde / l'import. Tous les designs. UCA_SHOTS=dossier : captures.

Usage : python -I -X utf8 tests/commentaires_notes.py
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


MATIERE = "R1.06 : Architecture des systèmes numériques et informatiques"
LONGUE = "SAE1.05 : Traiter des données et automatiser des traitements avec un langage de programmation pour l'administration des réseaux"
KEY = MATIERE + "|Contrôle de binaire"
GEO = """() => { const t = document.getElementById('gdmTitle'), b = document.querySelector('#gradeDetailOverlay .grade-modal-box').getBoundingClientRect(), c = document.getElementById('closeGdm').getBoundingClientRect(), r = document.getElementById('gdmBack').getBoundingClientRect(), tr = t.getBoundingClientRect();
  const range = document.createRange(); range.selectNodeContents(t); const lines = new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size;
  return { lines, coupe: t.scrollWidth - t.clientWidth, police: parseFloat(getComputedStyle(t).fontSize), gauche: b.left, droite: b.right, largeur: b.width, vw: innerWidth,
    croix: [Math.round(b.right - c.right), Math.round(c.top - b.top), c.width], retour: [Math.round(r.left - b.left), Math.round(r.top - b.top), r.height], titreSous: tr.top >= Math.max(c.bottom, r.bottom) - 1,
    debord: document.querySelector('#gradeDetailOverlay .grade-modal-box').scrollWidth - document.querySelector('#gradeDetailOverlay .grade-modal-box').clientWidth }; }"""


def main():
    shots = os.environ.get("UCA_SHOTS")
    ev = lambda label, n: {"label": label, "key": label, "coeff": 10, "note": n, "moy": 10.43, "maxi": 18.5, "mini": 2.5}
    releve = {"ue": [{"label": "UE RT 1.1 - Assister l'administrateur du réseau", "coeff": 1, "note": None, "matieres": [
        {"label": MATIERE, "coeff": 10, "note": None, "evals": [ev("Contrôle de binaire", 11.5), ev("TP noté (sur 20.0)", 14)]},
        {"label": LONGUE, "coeff": 5, "note": None, "evals": [ev("Projet", 15)]}]}]}
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})
        errors = []
        stored = lambda: sw.evaluate("() => chrome.storage.local.get('uca_grade_notes').then((x) => x.uca_grade_notes || {})")
        try:
            sw.evaluate("() => { globalThis.fetch = () => Promise.reject(new Error('hors ligne')); }")
            for d in designs():
                did = d["id"]
                data = seed()
                data.update(uca_settings={}, uca_usage={"v": "both", "at": 1}, uca_releve_notes=releve, uca_notes_history=[], uca_notes_seen={"__v": 2}, uca_moodle={"sync": None, "items": {}})
                sw.evaluate("() => chrome.storage.local.clear()")
                sw.evaluate("(x) => chrome.storage.local.set(x)", data)
                page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(f"{did} {e}"))

                def open_notes():
                    page.goto(f"{base}/{d['folder']}/agenda.html"); page.wait_for_timeout(1300)
                    page.evaluate("() => { const g = document.getElementById('ucaUpdateGate'); if (g) g.remove(); localStorage.removeItem('uca_notes_geom_v1'); }")
                    page.click("#notesBtn"); page.wait_for_timeout(800)

                row = lambda text: page.locator("#npContent .notes-table tr", has_text=text).first
                cell = lambda text: row(text).locator("td").nth(1)
                open_notes()
                check(f"{did} : sans commentaire, aucune icône", page.locator(".gn-mark").count() == 0)
                for title in (MATIERE, LONGUE):
                    cell(title).click(); page.wait_for_timeout(600)
                    for width in (1400, 1000, 760):
                        page.set_viewport_size({"width": width, "height": 860}); page.wait_for_timeout(400)
                        g = page.evaluate(GEO)
                        if not page.locator("#notesBtn").is_visible():      # interface téléphone : le titre peut passer à la ligne
                            continue
                        ok = g["lines"] == 1 and g["gauche"] >= 0 and g["droite"] <= g["vw"] + 0.5 and g["debord"] <= 1
                        full = g["coupe"] <= 0 or (len(title) > 90 and g["police"] <= 15)      # titre démesuré sur petit écran : « … », titre complet au survol
                        check(f"{did} {width}px : titre sur une ligne ({len(title)} caractères), entier, fenêtre dans l'écran", ok and full, str(g))
                    page.set_viewport_size({"width": 1400, "height": 860}); page.wait_for_timeout(300)
                    g = page.evaluate(GEO)
                    check(f"{did} : « ← Retour » en haut à gauche, croix en haut à droite, titre en dessous", g["retour"][0] < 60 and g["retour"][1] < 60 and g["croix"][0] < 60 and g["croix"][1] < 60 and g["titreSous"] and g["croix"][2] >= 36, str(g))
                    page.click("#gdmBack"); page.wait_for_timeout(300)
                    check(f"{did} : Retour ferme le détail, la fenêtre Notes reste", page.locator("#gradeDetailOverlay.open").count() == 0 and page.locator("#notesPanel.open").count() == 1)

                cell("Contrôle de binaire").click(); page.wait_for_timeout(500)
                check(f"{did} : « Note obtenue » et zone de commentaire présentes", "note obtenue" in page.locator("#gdmBody").inner_text().lower() and page.locator("#gdmNote").is_visible() and page.locator("#gdmNote").input_value() == "")
                texte = "Contrôle de binaire, première année.\n<b>J'avais confondu hexa et octal</b>"
                page.locator("#gdmNote").fill(texte); page.wait_for_timeout(900)
                s = stored()
                check(f"{did} : enregistré tout seul, sur cette note précise", s.get(KEY, {}).get("text") == texte and len(s) == 1 and "Enregistré" in page.locator(".gdm-note-status").inner_text(), str(s))
                check(f"{did} : la fenêtre reste ouverte pendant la saisie", page.locator("#gradeDetailOverlay.open").count() == 1 and page.locator("#notesPanel.open").count() == 1)
                over = page.evaluate("() => { const b = document.getElementById('gdmBody'); return [b.scrollHeight - b.clientHeight, Math.round(document.getElementById('gdmNote').getBoundingClientRect().height), document.querySelector('.gdm-sub') ? document.querySelector('.gdm-sub').textContent : '']; }")
                check(f"{did} : ordinateur : tout visible sans défiler (860 px de haut), matière rappelée sous le titre", over[0] <= 1 and over[1] <= 100 and over[2] == MATIERE, str(over))
                if shots:
                    Path(shots).mkdir(parents=True, exist_ok=True); page.screenshot(path=str(Path(shots) / f"{did}-detail.png"))
                page.click("#closeGdm"); page.wait_for_timeout(700)
                mark = page.locator("#npContent .notes-table .gn-mark")
                geo = row("Contrôle de binaire").evaluate("(tr) => { const m = tr.querySelector('.gn-mark').getBoundingClientRect(), a = tr.cells[0].getBoundingClientRect(), b = tr.cells[1].getBoundingClientRect(); return { dansTitre: m.left >= a.left && m.right <= b.left + 1, aDroite: m.left > a.left + a.width / 3 }; }")
                check(f"{did} : une seule icône, entre le titre et le coefficient", mark.count() == 1 and geo["dansTitre"] and geo["aDroite"] and "confondu" in mark.get_attribute("title"), str(geo))
                check(f"{did} : l'icône est réellement dessinée (pas un carré vide)", mark.evaluate("(b) => { const r = b.querySelector('svg').getBBox(); return r.width > 10 && r.height > 10; }"))
                if shots:
                    page.locator("#notesPanel").screenshot(path=str(Path(shots) / f"{did}-tableau.png"))
                mark.click(); page.wait_for_timeout(600)
                check(f"{did} : clic sur l'icône : commentaire ouvert, prêt à modifier, HTML jamais interprété", page.locator("#gdmNote").input_value() == texte and page.evaluate("() => document.activeElement && document.activeElement.id") == "gdmNote" and page.locator("#gradeDetailOverlay b").count() == 0)
                page.keyboard.type(" — à revoir")
                page.keyboard.press("Escape"); page.wait_for_timeout(600)       # fermeture immédiate : rien n'est perdu
                check(f"{did} : modification gardée même en fermant aussitôt (Échap)", stored()[KEY]["text"] == texte + " — à revoir", str(stored()))
                cell("TP noté").click(); page.wait_for_timeout(500)
                check(f"{did} : le commentaire ne se retrouve pas sur une autre note", page.locator("#gdmNote").input_value() == "")
                page.click("#closeGdm"); page.wait_for_timeout(300)
                open_notes()
                check(f"{did} : après rechargement : icône et commentaire toujours là", page.locator("#npContent .notes-table .gn-mark").count() == 1 and stored()[KEY]["text"].endswith("à revoir"))
                check(f"{did} : bouton retour d'Android : ferme d'abord le détail", page.evaluate("() => window.ucaHandleBack()") is False and (cell("Contrôle de binaire").click() or True) and page.evaluate("() => window.ucaHandleBack()") is True and page.locator("#gradeDetailOverlay.open").count() == 0)
                # téléphone (390 px) : titre lisible sur plusieurs lignes, rien ne dépasse
                page.set_viewport_size({"width": 390, "height": 780}); page.wait_for_timeout(500)
                page.reload(); page.wait_for_timeout(1300)                       # comme sur un vrai téléphone : les notes s'ouvrent par le menu
                page.evaluate("() => { const g = document.getElementById('ucaUpdateGate'); if (g) g.remove(); }")
                page.click("#menuBtn"); page.wait_for_timeout(400)
                page.locator("#mobileMenu button", has_text="Notes & Moyennes").click(); page.wait_for_timeout(800)
                row(LONGUE).locator("td").first.click(); page.wait_for_timeout(700)
                g = page.evaluate(GEO)
                check(f"{did} : téléphone : titre entier sur plusieurs lignes, fenêtre dans l'écran", g["coupe"] <= 1 and 1 < g["lines"] <= 6 and g["gauche"] >= 0 and g["droite"] <= 390.5 and g["debord"] <= 1 and g["police"] >= 18, str(g))
                if shots:
                    page.screenshot(path=str(Path(shots) / f"{did}-telephone.png"))
                page.click("#closeGdm"); page.wait_for_timeout(300)
                page.set_viewport_size({"width": 1400, "height": 860}); page.wait_for_timeout(300)
                open_notes()
                # effacer : deux clics
                page.locator("#npContent .notes-table .gn-mark").click(); page.wait_for_timeout(500)
                page.click(".gdm-note-erase"); page.wait_for_timeout(500)
                first = KEY in stored()
                page.click(".gdm-note-erase"); page.wait_for_timeout(700)
                check(f"{did} : effacer demande une confirmation, puis l'icône disparaît", first and KEY not in stored() and page.locator("#npContent .notes-table .gn-mark").count() == 0, str(stored()))
                page.close()

            # sauvegarde et import : les commentaires voyagent et un import n'en fait jamais perdre
            page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(f"import {e}"))
            sw.evaluate("() => chrome.storage.local.clear()")
            sw.evaluate("(x) => chrome.storage.local.set(x)", dict(seed(), uca_grade_notes={"a": {"text": "ici, plus récent", "at": 200}, "b": {"text": "seulement ici", "at": 5}}))
            page.goto(f"{base}/settings.html"); page.wait_for_timeout(900)
            page.add_script_tag(url=f"{base}/core/transfer.js") if not page.evaluate("() => !!window.UCA_TRANSFER") else None
            out = page.evaluate("""async () => {
              const snap = await UCA_TRANSFER.snapshot(); const dans = !!snap.data.uca_grade_notes;
              snap.data.uca_grade_notes = { a: { text: 'ancien importé', at: 100 }, c: { text: 'seulement importé', at: 7 } };
              await UCA_TRANSFER.applyImport(snap);
              return { dans, apres: (await chrome.storage.local.get('uca_grade_notes')).uca_grade_notes }; }""")
            check("la sauvegarde contient les commentaires", out["dans"], str(out))
            check("import : rien de perdu, le plus récent gagne", {k: v["text"] for k, v in out["apres"].items()} == {"a": "ici, plus récent", "b": "seulement ici", "c": "seulement importé"}, str(out["apres"]))
            page.close()
        finally:
            ctx.close()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:3]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
