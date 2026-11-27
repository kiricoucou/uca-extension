"""Mes compétences : lignes des UE alignées sur les titres et cliquables (retour sur l'UE dans « Détail des notes »), et
statistiques par UE (plus basse / plus haute / actuelle, avec dates) sous le grand graphique. Tous les designs.
UCA_SHOTS=dossier : captures.

Usage : python -I -X utf8 tests/ue_liens.py
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


# Position horizontale du TEXTE (et non de la boîte) des titres, du texte d'aide et des lignes d'UE.
ALIGN = """() => { const left = (e) => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(n); return Math.round(r.getBoundingClientRect().left); } } return null; };
  const c = document.getElementById('npContent');
  return { titre: left([...c.querySelectorAll('.fp-h')].find((e) => e.textContent.startsWith('Mes compétences'))), annee: left(c.querySelector('.np-year .fp-h')), aide: left(c.querySelector('.np-year .fp-empty')), ue: [...c.querySelectorAll('.np-ue-link')].map(left),
    debord: c.querySelector('.np-ue-list').scrollWidth - c.querySelector('.np-ue-list').clientWidth }; }"""
VISIBLE = """(label) => { const row = [...document.querySelectorAll('#npContent tr.ue-row')].find((r) => r.dataset.ue === label); if (!row) return null; const p = document.getElementById('notesPanel').getBoundingClientRect(), r = row.getBoundingClientRect();
  return { dedans: r.top >= p.top && r.bottom <= Math.min(p.bottom, innerHeight), cible: row.classList.contains('ue-target'), fleche: row.querySelectorAll('.ue-arrow').length, autres: document.querySelectorAll('#npContent tr.ue-target').length }; }"""


def main():
    shots = os.environ.get("UCA_SHOTS")
    now = int(time.time() * 1000)
    jour = 86400000
    ev = lambda label, n: {"label": label, "key": label, "coeff": 1, "note": n, "moy": 11, "maxi": 18, "mini": 3}
    mat = lambda label, evals: {"label": label, "coeff": 1, "note": None, "evals": evals}
    titres = ["UE RT 1.1 - Assister l'administrateur du réseau", "UE RT 1.2 - Découvrir les transmissions et la ToIP", "UE RT 1.3 - S'intégrer dans un service informatique"]
    releve = {"ue": [
        {"label": titres[0], "coeff": 1, "note": None, "matieres": [mat("R1.01 : Réseaux", [ev(f"DS {i}", 12 + (i % 3)) for i in range(1, 9)] + [ev("Ancienne", 16), ev("Chute", 4)])]},
        {"label": titres[1], "coeff": 1, "note": None, "matieres": [mat("R1.04 : Transmissions", [ev(f"TP {i}", 14) for i in range(1, 9)])]},
        {"label": titres[2], "coeff": 1, "note": None, "matieres": [mat("R1.10 : Anglais", [ev(f"Oral {i}", 19) for i in range(1, 9)])]},
    ]}
    seen = {"__v": 2, "R1.01 : Réseaux|Chute": {"note": 4, "at": now - 5 * jour}}
    history = [{"at": now - 30 * jour, "avg": 15.9}, {"at": now - 5 * jour, "avg": 15.2}]
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})
        errors = []
        try:
            sw.evaluate("() => { globalThis.fetch = () => Promise.reject(new Error('hors ligne')); }")
            for d in designs():
                did = d["id"]
                data = seed()
                data.update(uca_settings={}, uca_usage={"v": "both", "at": 1}, uca_releve_notes=releve, uca_notes_seen=seen, uca_notes_history=history, uca_moodle={"sync": None, "items": {}})
                sw.evaluate("() => chrome.storage.local.clear()")
                sw.evaluate("(x) => chrome.storage.local.set(x)", data)
                page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(f"{did} {e}"))
                page.goto(f"{base}/{d['folder']}/agenda.html"); page.wait_for_timeout(1300)
                page.evaluate("() => { const g = document.getElementById('ucaUpdateGate'); if (g) g.remove(); localStorage.removeItem('uca_notes_geom_v1'); }")
                page.click("#notesBtn"); page.wait_for_timeout(700)
                page.click("#compBtn"); page.wait_for_timeout(700)
                a = page.evaluate(ALIGN)
                check(f"{did} : lignes des UE alignées sur « Année 1 » et le texte d'aide, sans déborder", len(a["ue"]) == 3 and all(abs(x - a["aide"]) <= 2 and abs(x - a["annee"]) <= 3 for x in a["ue"]) and a["debord"] <= 1, str(a))
                links = page.locator("#npContent .np-ue-link")
                check(f"{did} : chaque UE est un bouton avec sa flèche", links.count() == 3 and page.locator("#npContent .np-ue-go").all_inner_texts() == ["›"] * 3 and links.first.get_attribute("role") == "button")
                if shots:
                    Path(shots).mkdir(parents=True, exist_ok=True); page.locator("#notesPanel").screenshot(path=str(Path(shots) / f"{did}-competences.png"))
                for i in (2, 0, 1):
                    if not page.locator("#npContent .np-ue-link").count():
                        page.click("#compBtn"); page.wait_for_timeout(500)
                    page.locator("#npContent .np-ue-link").nth(i).click(); page.wait_for_timeout(600)
                    v = page.evaluate(VISIBLE, titres[i])
                    check(f"{did} : clic sur l'UE 1.{i + 1} : retour au tableau, ligne visible, une seule flèche", bool(v) and v["dedans"] and v["cible"] and v["fleche"] == 1 and v["autres"] == 1 and page.locator("#notesPanel.open").count() == 1, str(v))
                    if shots and i == 2:
                        page.locator("#notesPanel").screenshot(path=str(Path(shots) / f"{did}-tableau.png"))
                page.click("#compBtn"); page.wait_for_timeout(500)
                page.locator("#npContent .np-ue-link").first.focus(); page.keyboard.press("Enter"); page.wait_for_timeout(500)
                check(f"{did} : au clavier (Entrée) aussi", bool(page.evaluate(VISIBLE, titres[0])) and page.evaluate(VISIBLE, titres[0])["cible"])
                # grand graphique : statistiques par UE
                page.evaluate("() => document.getElementById('chartZoomBtn').click()"); page.wait_for_timeout(700)
                cards = page.locator("#chartOverlay .chart-ue")
                check(f"{did} : grand graphique : une carte par UE", cards.count() == 3, str(cards.count()))
                if cards.count() == 3:
                    first = cards.first
                    low, high, cur = (first.locator(s).inner_text() for s in (".ue-low", ".ue-high", ".ue-cur"))
                    vals = [float(t.split("\n")[1].replace(",", ".")) for t in (low, high, cur)]
                    check(f"{did} : UE 1.1 : plus basse ≤ actuelle ≤ plus haute, la chute fait baisser, dates affichées", vals[0] < vals[1] and vals[0] <= vals[2] <= vals[1] and all("2026" in t for t in (low, high, cur)) and "avant le" in high, str([low, high, cur]))
                    if shots:
                        page.locator("#chartOverlay .chart-box").evaluate("(e) => e.scrollTop = e.scrollHeight"); page.wait_for_timeout(300); page.screenshot(path=str(Path(shots) / f"{did}-ues.png"))
                    cards.nth(2).click(); page.wait_for_timeout(600)
                    v = page.evaluate(VISIBLE, titres[2])
                    check(f"{did} : clic sur une carte UE : le graphique se ferme et montre l'UE dans le tableau", page.locator("#chartOverlay").count() == 0 and bool(v) and v["dedans"] and v["cible"], str(v))
                page.close()
        finally:
            ctx.close()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:3]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
