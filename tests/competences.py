"""Notes > « 👁 Voir mes compétences » : moyenne de chaque UE (« UE RT 1.1 - … ») avec le seuil de validation à 10
(trait pointillé), séparée par semestre et par année, avec la moyenne de chaque année. Les 4 designs, bureau et téléphone.

Usage : python -I -X utf8 tests/competences.py
"""
import re
import socket
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import NO_REAL_SERVERS, ROOT, designs, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def mat(label, coeff, notes):
    return {"label": label, "coeff": coeff, "note": None, "moy": 10,
            "evals": [{"label": f"DS{i} (sur 20.0)", "coeff": 1, "note": n, "moy": 10, "maxi": 18, "mini": 3} for i, n in enumerate(notes, 1)]}


# UE 1.1 : note d'Odin (12) ; UE 1.2 : calculée depuis les matières (6 et 8, coeff 1 et 3 => 7,5) ; S2 : une UE sans note ;
# année 2 : une UE validée.
RELEVE = {"ue": [
    {"label": "UE RT 1.1 - Assister l'administrateur du réseau", "coeff": 1, "note": 12, "matieres": [mat("R1.01 : Réseaux", 1, [12])]},
    {"label": "UE RT 1.2 - Découvrir les transmissions et la ToIP", "coeff": 1, "note": None, "matieres": [mat("R1.02 : Transmission", 1, [6]), mat("R1.03 : Signal", 3, [8])]},
    {"label": "UE RT 2.1 - Assister l'administrateur du réseau", "coeff": 1, "note": None, "matieres": [mat("R2.01 : Admin", 1, [])]},
    {"label": "UE RT 3.1 - Assister l'administrateur du réseau", "coeff": 1, "note": 14, "matieres": [mat("R3.01 : Admin 2", 1, [14])]},
]}


def extension_check():
    """Même vérification dans la vraie extension chargée dans Chromium (stockage chrome.storage, 4 designs)."""
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})
        try:
            for d in designs():
                sw.evaluate("(r) => chrome.storage.local.set({ uca_releve_notes: r })", RELEVE)
                page = ctx.new_page(); errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(f"{base}/{d['folder']}/agenda.html"); page.wait_for_timeout(1500)
                page.locator("#notesBtn").click(); page.wait_for_timeout(500)
                page.locator("#compBtn").click(); page.wait_for_timeout(500)
                check(f"extension {d['id']} : compétences par année avec le seuil à 10",
                      page.locator("#npContent .np-year").count() == 2 and page.locator("#npContent .np-year svg line[stroke-dasharray='6 4']").count() == 2)
                check(f"extension {d['id']} : UE à 7,5 sous 10 et UE d'Odin validée", "7,5" in page.locator("#npContent .np-comp").inner_text() and "validée" in page.locator("#npContent .np-comp").inner_text())
                check(f"extension {d['id']} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                page.close()
        finally:
            ctx.close()


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    data = seed()
    data["uca_releve_notes"] = RELEVE
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[NO_REAL_SERVERS])
            for design in ("studio", "anime", "professionnel", "lumen", "carnet"):
                for label, vp in (("bureau", {"width": 1280, "height": 800}), ("téléphone", {"width": 390, "height": 800})):
                    ctx = browser.new_context(viewport=vp)
                    page = ctx.new_page()
                    errors = []
                    page.on("pageerror", lambda e: errors.append(str(e)))
                    page.goto(base + "app/index.html"); page.wait_for_timeout(300)
                    store = dict(data); store["uca_design"] = design
                    page.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", store)
                    page.goto(base + f"designs/{design}/agenda.html"); page.wait_for_timeout(1200)
                    if vp["width"] <= 500:
                        page.locator("#menuBtn").click(); page.wait_for_timeout(300)
                        page.locator("#mobileMenu .mi", has_text="Notes").first.click()
                    else:
                        page.locator("#notesBtn").click()
                    page.wait_for_timeout(600)
                    page.wait_for_timeout(600)
                    contrast = page.evaluate("""() => {
                      const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
                      const bg = lum(getComputedStyle(document.getElementById('notesPanel')).backgroundColor);
                      const el = document.querySelector('#npContent .fp-h, #npContent .fp-empty');
                      const fg = lum(getComputedStyle(el).color); const hi = Math.max(bg, fg), lo = Math.min(bg, fg);
                      return (hi + .05) / (lo + .05); }""")
                    check(f"{design} {label} : texte du panneau Notes lisible (contraste >= 4,5)", contrast >= 4.5, str(contrast))
                    btn = page.locator("#compBtn")
                    check(f"{design} {label} : bouton « Voir mes compétences »", btn.count() == 1 and "compétences" in btn.inner_text())
                    btn.click(); page.wait_for_timeout(500)
                    years = page.locator("#npContent .np-year")
                    check(f"{design} {label} : une section par année (2)", years.count() == 2, str(years.count()))
                    check(f"{design} {label} : trait pointillé du seuil à 10 dans chaque graphique",
                          page.locator("#npContent .np-year svg line[stroke-dasharray='6 4']").count() == 2)
                    bars = page.locator("#npContent .np-year svg rect[rx='4']")
                    check(f"{design} {label} : une barre par UE notée (3 sur 4)", bars.count() == 3, str(bars.count()))
                    txt = page.locator("#npContent .np-comp").inner_text(); low = txt.lower()
                    check(f"{design} {label} : UE calculée depuis les matières (7,5 sous 10)", "7,5" in txt and "sous 10" in txt, txt[:160])
                    check(f"{design} {label} : UE d'Odin validée (12)", "RT 1.1" in txt and "validée" in txt)
                    check(f"{design} {label} : semestres séparés", page.locator("#npContent .np-year svg text", has_text=re.compile(r"^(Semestre |S)\d")).count() >= 3)
                    check(f"{design} {label} : moyenne de chaque année", "année 1" in low and "année 2" in low and "moyenne des ue" in low)
                    heights = page.evaluate("""() => [...document.querySelectorAll('#npContent .np-year')].map(y => { const r = [...y.querySelectorAll('svg rect[rx=\"4\"]')].map(b => +b.getAttribute('height')); return r; })""")
                    # barre de 12 plus haute que celle de 7,5 (même année) : hauteur proportionnelle à la moyenne
                    check(f"{design} {label} : hauteur des barres proportionnelle à la moyenne", len(heights[0]) == 2 and heights[0][0] > heights[0][1] > 0, str(heights))
                    check(f"{design} {label} : pas de débordement horizontal de la page", page.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1"))
                    geo = page.evaluate("() => { const r = document.getElementById('notesPanel').getBoundingClientRect(); return [r.width, r.height, innerWidth]; }")
                    check(f"{design} {label} : fenêtre des compétences visible et dans l'écran", geo[0] > 200 and geo[0] <= geo[2] + 1, str(geo))
                    page.locator("#compBack").click(); page.wait_for_timeout(300)
                    check(f"{design} {label} : retour aux notes", page.locator("#compBtn").count() == 1 and page.locator("#npContent .np-year").count() == 0)
                    check(f"{design} {label} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                    ctx.close()
            browser.close()
    finally:
        server.terminate()
    extension_check()
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
