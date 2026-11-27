"""Fenêtre Notes et liste « Devoirs et examens » ouvertes ensemble (ordinateur) : côte à côte, sans chevauchement, les deux
utilisables, et les Notes reprennent leur place ensuite. Tous les designs, plusieurs largeurs. UCA_SHOTS=dossier garde des
captures.

Usage : python -I -X utf8 tests/notes_devoirs.py
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import designs, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


BOXES = """() => { const r = (id) => { const e = document.getElementById(id); if (!e || !e.classList.contains('open')) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width }; };
  return { notes: r('notesPanel'), tasks: r('tasksPanel'), vw: innerWidth }; }"""


def apart(b):
    return b["notes"] and b["tasks"] and b["notes"]["l"] >= b["tasks"]["r"] - 0.5 and b["notes"]["r"] <= b["vw"] + 0.5 and b["tasks"]["l"] >= -0.5


def main():
    shots = os.environ.get("UCA_SHOTS")
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})
        errors = []
        try:
            data = seed()
            data["uca_settings"] = {"moodleNotes": True}
            data["uca_usage"] = {"v": "both", "at": 1}
            sw.evaluate("(d) => chrome.storage.local.set(d)", data)
            sw.evaluate("() => { globalThis.fetch = () => Promise.reject(new Error('hors ligne')); }")
            for d in designs():
                did = d["id"]
                for width in (760, 1000, 1400):
                    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
                    page.set_viewport_size({"width": width, "height": 860})
                    page.goto(f"{base}/{d['folder']}/agenda.html"); page.wait_for_timeout(1200)
                    page.evaluate("() => { const g = document.getElementById('ucaUpdateGate'); if (g) g.remove(); localStorage.removeItem('uca_notes_geom_v1'); }")
                    if not page.locator("#notesBtn").is_visible():
                        print(f"  {did} {width}px : interface téléphone, sans objet"); page.close(); continue
                    page.click("#notesBtn"); page.wait_for_timeout(600)
                    before = page.evaluate(BOXES)["notes"]
                    # 1) depuis le bouton des examens de la fenêtre Notes
                    exams = page.locator("#notesPanel button", has_text="examens")
                    if exams.count():
                        exams.first.click()
                    else:
                        page.click("#tasksBtn")
                    page.wait_for_timeout(700)
                    b = page.evaluate(BOXES)
                    check(f"{did} {width}px : devoirs à gauche, notes à droite, aucun chevauchement, tout dans la fenêtre", apart(b), str(b))
                    if shots and width in (760, 1400):
                        Path(shots).mkdir(parents=True, exist_ok=True); page.screenshot(path=str(Path(shots) / f"{did}-{width}.png"))
                    if not apart(b):
                        page.close(); continue
                    # 2) un clic dans l'une ne ferme pas l'autre
                    page.mouse.click(b["notes"]["l"] + b["notes"]["w"] - 40, b["notes"]["t"] + 80); page.wait_for_timeout(300)
                    page.locator("#tasksPanel input").first.click(); page.wait_for_timeout(300)
                    b2 = page.evaluate(BOXES)
                    check(f"{did} {width}px : cliquer dans les notes puis dans les devoirs garde les deux ouvertes", apart(b2), str(b2))
                    # 3) fermeture des devoirs : les notes restent et reprennent leur place
                    back = page.locator("#tasksBackBtn")
                    if back.count():
                        back.click()
                    else:
                        page.click("#tasksBtn")
                    page.wait_for_timeout(700)
                    b3 = page.evaluate(BOXES)
                    check(f"{did} {width}px : devoirs fermés : notes toujours ouvertes, revenues à leur place et à leur taille", b3["notes"] and not b3["tasks"] and abs(b3["notes"]["l"] - before["l"]) <= 2 and abs(b3["notes"]["w"] - before["w"]) <= 2, f"{before} -> {b3}")
                    saved = page.evaluate("() => localStorage.getItem('uca_notes_geom_v1')")
                    check(f"{did} {width}px : le déplacement automatique n'est pas mémorisé", saved is None, str(saved))
                    # 4) ouvertes par le bouton « Devoirs » de la barre
                    page.click("#tasksBtn"); page.wait_for_timeout(700)
                    b4 = page.evaluate(BOXES)
                    check(f"{did} {width}px : par le bouton Devoirs de la barre aussi : côte à côte (ou notes fermées)", apart(b4) or not b4["notes"], str(b4))
                    page.close()
        finally:
            ctx.close()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:3]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
