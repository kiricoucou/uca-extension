"""Notes : un clic sur « Moyenne générale » ouvre le graphique de toutes les matières, avec le trait pointillé de la
moyenne générale et les notes de chaque matière dessous ; couleurs des notes. Les 4 designs, app web (données factices).

Usage : python -I -X utf8 tests/notes_chart.py
"""
import json
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
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    data = seed()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[NO_REAL_SERVERS])
            for design in ("anime", "professionnel", "bulletin", "carnet"):
                ctx = browser.new_context(viewport={"width": 1280, "height": 800})
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(base + "app/index.html"); page.wait_for_timeout(300)
                store = dict(data); store["uca_design"] = design
                page.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", store)
                page.goto(base + f"designs/{design}/agenda.html"); page.wait_for_timeout(1200)
                page.locator("#notesBtn").click(); page.wait_for_timeout(500)
                bar = page.locator("#npContent .notes-avg")
                check(f"{design} : la moyenne générale est cliquable", bar.count() == 1 and bar.get_attribute("role") == "button")
                bar.click(); page.wait_for_timeout(500)
                check(f"{design} : le graphique « toutes les matières » s'affiche", page.locator("#chartScope").input_value() == "overview")
                check(f"{design} : trait pointillé de la moyenne générale", page.locator("#npContent .np-chart svg line[stroke-dasharray]").count() >= 1)
                check(f"{design} : une barre par matière notée", page.locator("#npContent .np-chart svg rect").count() >= 2, str(page.locator("#npContent .np-chart svg rect").count()))
                check(f"{design} : notes de chaque matière sous le graphique", page.locator("#npContent .np-mat").count() >= 1)
                page.locator("#chartScope").select_option(index=2); page.wait_for_timeout(300)
                check(f"{design} : graphique d'une matière avec le trait de la moyenne générale", page.locator("#npContent .np-chart svg line[stroke-dasharray='5 4']").count() >= 1)
                check(f"{design} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                ctx.close()
            browser.close()
    finally:
        server.terminate()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
