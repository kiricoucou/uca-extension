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


BIG_RELEVE = {"ue": [{"label": "UE 1.1 Test", "coeff": 1, "note": None, "matieres": [
    {"label": f"R1.{i:02d} : Matière numéro {i} avec un titre assez long pour aller à la ligne", "coeff": 1 + i % 3, "note": None, "moy": 9 + i % 6,
     "evals": [{"label": "DS1 (sur 20.0)", "coeff": 1, "note": 6 + i, "moy": 9 + i % 6, "maxi": 18, "mini": 3}]} for i in range(1, 13)]}]}


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

                # --- téléphone : beaucoup de matières, moyenne de la classe, matières cliquables, panneau plein écran
                page.set_viewport_size({"width": 390, "height": 800})
                page.evaluate("(r) => { const s = JSON.parse(localStorage.getItem('uca_store')); s.uca_releve_notes = r; localStorage.setItem('uca_store', JSON.stringify(s)); }", BIG_RELEVE)
                page.reload(); page.wait_for_timeout(1200)
                page.locator("#menuBtn").click(); page.wait_for_timeout(300)
                page.locator("#mobileMenu .mi", has_text="Notes").first.click(); page.wait_for_timeout(600)
                page.locator("#npContent .notes-avg").click(); page.wait_for_timeout(600)
                width = page.evaluate("() => parseFloat(document.querySelector('#npContent .np-chart svg').getAttribute('width'))")
                check(f"{design} : le graphique s'élargit avec le nombre de matières (12 matières)", width >= 12 * 60, str(width))
                scrolls = page.evaluate("() => { const c = document.querySelector('#npContent .np-chart-scroll'); return c.scrollWidth > c.clientWidth + 20; }")
                check(f"{design} : le graphique défile dans son cadre sur téléphone", scrolls)
                check(f"{design} : barres claires de la moyenne de la classe", page.locator("#npContent .np-chart svg rect[fill-opacity='0.3']").count() == 12, str(page.locator("#npContent .np-chart svg rect[fill-opacity='0.3']").count()))
                check(f"{design} : trait transparent de la moyenne générale de la classe", page.locator("#npContent .np-chart svg line[stroke-dasharray='2 4']").count() == 1)
                nowrap = page.evaluate("() => [...document.querySelectorAll('#npContent .np-mat-val')].every((v) => v.getBoundingClientRect().height < 1.8 * parseFloat(getComputedStyle(v).lineHeight || 20) || v.getBoundingClientRect().height < 30)")
                check(f"{design} : la moyenne de chaque matière tient sur une seule ligne", nowrap)
                geo = page.evaluate("() => { const p = document.getElementById('notesPanel'); const r = p.getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, sheet: p.classList.contains('as-sheet') }; }")
                check(f"{design} : panneau Notes = largeur écran - 40 px", geo["sheet"] and abs(geo["w"] - (geo["vw"] - 40)) <= 2, str(geo))
                check(f"{design} : panneau Notes plus haut que 60 % de l'écran, avec défilement", geo["h"] > 0.6 * geo["vh"] and geo["h"] <= geo["vh"] - 100, str(geo))
                close_h = page.evaluate("() => document.querySelector('#notesPanel .panel-close-x').getBoundingClientRect().height")
                check(f"{design} : croix de fermeture assez grande", close_h >= 40, str(close_h))
                page.locator("#npContent .np-lab").nth(7).click(); page.wait_for_timeout(900)
                arrow_in = page.evaluate("() => { const a = document.querySelector('#npContent .np-arrow'); return !!a && a.closest('.np-mat').id === 'np-mat-7'; }")
                check(f"{design} : clic sur une matière du graphique → flèche animée devant sa ligne", arrow_in)
                visible = page.evaluate("() => { const b = document.getElementById('np-mat-7').getBoundingClientRect(); const p = document.getElementById('notesPanel').getBoundingClientRect(); return b.top >= p.top - 2 && b.top < p.bottom; }")
                check(f"{design} : le panneau est descendu jusqu'à la matière", visible)
                page.locator("#notesPanel .panel-close-x").click(); page.wait_for_timeout(300)
                check(f"{design} : la croix ferme le panneau", not page.evaluate("() => document.getElementById('notesPanel').classList.contains('open')"))

                # --- devoirs et examens : un clic mène au cours dans l'agenda, avec une flèche
                page.evaluate("""() => { const s = JSON.parse(localStorage.getItem('uca_store')); const d = new Date(); d.setDate(d.getDate() + 3); const p = (x) => String(x).padStart(2, '0');
                  const ev = { date: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()), year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), startH: 10, startM: 0, endH: 12, endM: 0, title: 'R1.02 Web DS2 Examen', teacher: '', room: 'Amphi A', raw: '', color: '#888' };
                  s.uca_events = s.uca_events.concat([ev]); s.uca_notes = Object.assign(s.uca_notes || {}, { [ev.date + '_10:00_' + ev.title]: 'apporter la calculatrice' }); localStorage.setItem('uca_store', JSON.stringify(s)); }""")
                page.reload(); page.wait_for_timeout(1200)
                page.locator("#menuBtn").click(); page.wait_for_timeout(300)
                page.locator("#mobileMenu .mi", has_text="Devoirs").first.click(); page.wait_for_timeout(500)
                check(f"{design} : l'examen et la note de cours sont dans la liste, cliquables", page.locator("#tasksPanel li.tk-click").count() >= 2, str(page.locator("#tasksPanel li.tk-click").count()))
                page.locator("#tasksPanel li.tk-click", has_text="Examen").first.click(); page.wait_for_timeout(900)
                check(f"{design} : clic sur l'examen → panneau fermé", not page.evaluate("() => document.getElementById('tasksPanel').classList.contains('open')"))
                check(f"{design} : le cours est désigné dans l'agenda par une flèche", page.locator(".cal-arrow").count() == 1 and page.locator(".cal-target").count() >= 1, f"{page.locator('.cal-arrow').count()} / {page.locator('.cal-target').count()}")
                ctx.close()
            browser.close()
    finally:
        server.terminate()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
