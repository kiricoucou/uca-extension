"""Captures d'écran 1280x800 pour les fiches des magasins (addons.mozilla.org, Chrome Web Store),
écrites dans store/screenshots/. Données factices (tests/fixtures.py), aucun vrai compte, aucun accès réseau.

Usage : python -I -X utf8 tests/gen_store.py
"""
import datetime
import struct
import sys
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from grades import RELEVE  # noqa: E402
from harness import ROOT, launch  # noqa: E402

OUT = ROOT / "store" / "screenshots"
HOSTS = ("odin.iut.uca.fr", "ent.uca.fr", "moodle.uca.fr", "mail.uca.fr", "kiricoucou.github.io", "raw.githubusercontent.com")
SIZE = {"width": 1280, "height": 800}


def drop_alpha(path):
    """Le Chrome Web Store veut des PNG 24 bits sans transparence."""
    raw = path.read_bytes()
    pos, chunks, ihdr = 8, [], None
    while pos < len(raw):
        n = struct.unpack(">I", raw[pos:pos + 4])[0]
        kind = raw[pos + 4:pos + 8]
        body = raw[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            ihdr = body
        pos += 12 + n
    if ihdr and ihdr[9] == 2:  # déjà RVB sans alpha
        return
    try:
        from PIL import Image
        Image.open(path).convert("RGB").save(path)
    except ImportError:
        print("  (Pillow absent : PNG gardé tel quel)")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = seed()
    now = datetime.datetime.now()
    exam_day = now + datetime.timedelta(days=3)
    data["uca_events"].append({"date": exam_day.date().isoformat(), "year": exam_day.year, "month": exam_day.month - 1, "day": exam_day.day,
                               "startH": 8, "startM": 0, "endH": 10, "endM": 0, "title": "R1.01 DS2 Examen", "teacher": "M. Dupont", "room": "Amphi B", "raw": "x", "color": "#888"})
    data["uca_releve_notes"] = RELEVE
    tomorrow = (now + datetime.timedelta(days=1)).date().isoformat()
    data["uca_tasks"] = [
        {"id": "s1", "title": "Rendre le compte rendu de TP", "subject": "SAE1.01", "due": tomorrow, "done": False, "created": 1},
        {"id": "s2", "title": "Réviser le chapitre 3", "subject": "R1.01", "due": (now + datetime.timedelta(days=4)).date().isoformat(), "done": False, "created": 2},
    ]
    data["uca_notes_history"] = [{"at": int((now - datetime.timedelta(days=60 - i * 12)).timestamp() * 1000), "avg": a} for i, a in enumerate([8.5, 9.4, 10.1, 9.8, 10.96])]
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport=SIZE)
        for h in HOSTS:
            ctx.route(f"https://{h}/**", lambda r: r.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="text/html", body="<title>ok</title>"))
        sw.evaluate("(d) => chrome.storage.local.set(d)", data)

        def agenda(design):
            sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", design)
            pg = ctx.new_page(); pg.set_viewport_size(SIZE)
            pg.goto(f"{base}/designs/{design}/agenda.html"); pg.wait_for_timeout(1000)
            return pg

        def snap(pg, name):
            f = OUT / name
            pg.screenshot(path=str(f)); drop_alpha(f); print("  ", f.name)

        pg = agenda("professionnel"); snap(pg, "1-semaine-professionnel.png")
        pg.locator("#notesBtn").click(); pg.wait_for_timeout(500); snap(pg, "4-notes-simulateur.png"); pg.close()
        pg = agenda("anime"); snap(pg, "2-semaine-anime.png"); pg.close()
        pg = agenda("bulletin"); pg.locator("#tasksBtn").click(); pg.wait_for_timeout(500); snap(pg, "3-devoirs-bulletin.png"); pg.close()
        sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", "professionnel")
        pg = ctx.new_page(); pg.set_viewport_size(SIZE); pg.goto(f"{base}/settings.html"); pg.wait_for_function("() => document.querySelectorAll('.st-row[data-state=ok]').length === 6", timeout=20000)
        pg.wait_for_timeout(400); snap(pg, "5-parametres-statut.png")
        ctx.close()


if __name__ == "__main__":
    main()
