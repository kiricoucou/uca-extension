"""Notes : chaque note (ligne avec sa barre de progression, barres du graphique d'une matière, lignes du tableau) ouvre un
petit détail (note, coefficient, moyenne de la classe, meilleure et moins bonne note) ; sa croix, un clic à côté ou Échap
ne ferment QUE ce détail : le panneau Notes reste ouvert. Les 4 designs, ordinateur et téléphone.

Usage : python -I -X utf8 tests/notes_detail.py
"""
import socket
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import NO_REAL_SERVERS, ROOT  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    data = seed()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[NO_REAL_SERVERS])
            for design in ("anime", "professionnel", "lumen", "carnet"):
                for label, vp, touch in (("PC", {"width": 1280, "height": 800}, False), ("téléphone", {"width": 390, "height": 844}, True)):
                    ctx = browser.new_context(viewport=vp, has_touch=touch, is_mobile=touch)
                    page = ctx.new_page(); errors = []
                    page.on("pageerror", lambda e: errors.append(str(e)))
                    page.goto(base + "app/index.html"); page.wait_for_timeout(300)
                    store = dict(data); store["uca_design"] = design
                    page.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", store)
                    page.goto(base + f"designs/{design}/agenda.html"); page.wait_for_timeout(1200)
                    tag = f"{design} ({label})"
                    if touch:
                        page.locator("#menuBtn").click(); page.wait_for_timeout(300)
                        page.locator("#mobileMenu button", has_text="Notes").first.click(); page.wait_for_timeout(500)
                    else:
                        page.locator("#notesBtn").click(); page.wait_for_timeout(500)
                    page.locator("#npContent .notes-avg").click(); page.wait_for_timeout(500)
                    rows = page.locator("#npContent .np-eval-row")
                    check(f"{tag} : les notes avec barre de progression sont cliquables", rows.count() >= 1, rows.count())
                    check(f"{tag} : accessibles au clavier (bouton, tabindex)", rows.first.get_attribute("role") == "button" and rows.first.get_attribute("tabindex") == "0")
                    rows.first.scroll_into_view_if_needed(); rows.first.click(); page.wait_for_timeout(400)
                    ov = page.locator("#gradeDetailOverlay")
                    check(f"{tag} : un clic sur la ligne ouvre le détail", ov.count() == 1 and "open" in (ov.get_attribute("class") or ""))
                    body = page.locator("#gdmBody").inner_text()
                    check(f"{tag} : le détail montre meilleure note, moins bonne note et moyenne de la classe", all(k in body for k in ("Note la plus haute", "Note la plus basse", "Moyenne promo")), body[:120])
                    page.locator("#closeGdm").click(); page.wait_for_timeout(400)
                    check(f"{tag} : la croix ferme seulement le détail", "open" not in (ov.get_attribute("class") or ""))
                    check(f"{tag} : le panneau Notes reste ouvert après la croix", page.locator("#notesPanel").evaluate("e => e.classList.contains('open')") and page.locator("#npContent .np-eval-row").first.is_visible())
                    # clic à côté du détail, puis Échap
                    rows.first.click(); page.wait_for_timeout(300)
                    page.locator("#gradeDetailOverlay").click(position={"x": 4, "y": 4}); page.wait_for_timeout(300)
                    check(f"{tag} : un clic à côté ferme le détail sans fermer les notes", "open" not in (ov.get_attribute("class") or "") and page.locator("#notesPanel").evaluate("e => e.classList.contains('open')"))
                    rows.first.click(); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(300)
                    check(f"{tag} : Échap ferme le détail sans fermer les notes", "open" not in (ov.get_attribute("class") or "") and page.locator("#notesPanel").evaluate("e => e.classList.contains('open')"))
                    # clavier : Entrée sur la ligne
                    rows.first.focus(); page.keyboard.press("Enter"); page.wait_for_timeout(300)
                    check(f"{tag} : Entrée sur la ligne ouvre le détail", "open" in (ov.get_attribute("class") or ""))
                    page.locator("#closeGdm").click(); page.wait_for_timeout(200)
                    # graphique d'une matière : barres et libellés cliquables
                    page.locator("#chartScope").select_option(index=2); page.wait_for_timeout(400)
                    bars = page.locator("#npContent .np-chart svg rect.np-bar")
                    check(f"{tag} : barres du graphique d'une matière cliquables", bars.count() >= 1, bars.count())
                    bars.first.dispatch_event("click"); page.wait_for_timeout(300)
                    check(f"{tag} : clic sur une barre : détail de la note", "open" in (ov.get_attribute("class") or "") and "Note la plus haute" in page.locator("#gdmBody").inner_text())
                    page.locator("#closeGdm").click(); page.wait_for_timeout(200)
                    check(f"{tag} : toujours dans le panneau Notes", page.locator("#notesPanel").evaluate("e => e.classList.contains('open')"))
                    # un vrai clic hors du panneau ferme toujours les notes (comportement inchangé)
                    check(f"{tag} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                    ctx.close()
            browser.close()
    finally:
        server.terminate()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
