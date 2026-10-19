"""Régénère les 6 captures du sélecteur pour chaque design (designs/<id>/previews/).

Usage : python -I -X utf8 tests/gen_previews.py [id_design ...]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import ROOT, designs, launch  # noqa: E402


def shot(page, path):
    page.screenshot(path=str(path), type="jpeg", quality=82)


def main():
    wanted = set(sys.argv[1:])
    data = seed()
    with sync_playwright() as p:
        desk, dsw, base = launch(p, viewport={"width": 1280, "height": 800})
        mob, msw, mbase = launch(p, viewport={"width": 390, "height": 760}, device_scale_factor=2, is_mobile=True, has_touch=True)
        for sw in (dsw, msw):
            sw.evaluate("(s) => chrome.storage.local.set(s)", data)
        for d in designs():
            if wanted and d["id"] not in wanted:
                continue
            out = ROOT / d["folder"] / "previews"
            out.mkdir(exist_ok=True)
            ag = desk.new_page(); ag.goto(f"{base}/{d['folder']}/agenda.html"); ag.bring_to_front(); ag.wait_for_timeout(900)
            ag.locator("#viewTabs button[data-view='week']").click(); ag.wait_for_timeout(500)
            shot(ag, out / "1-semaine.jpg")
            ag.locator("#notesBtn").click(); ag.wait_for_timeout(400)
            shot(ag, out / "2-notes.jpg")
            ag.locator("#notesBtn").click(); ag.wait_for_timeout(200)
            ag.locator("#viewTabs button[data-view='month']").click(); ag.wait_for_timeout(500)
            shot(ag, out / "5-mois.jpg")
            ag.locator("#viewTabs button[data-view='week']").click(); ag.wait_for_timeout(400)
            ag.locator(".view.active .event-card").first.click(); ag.wait_for_timeout(400)
            shot(ag, out / "6-detail.jpg")
            ag.close()
            pp = desk.new_page(); pp.set_viewport_size({"width": 380, "height": 600})
            pp.goto(f"{base}/{d['folder']}/popup.html"); pp.bring_to_front(); pp.wait_for_timeout(700)
            shot(pp, out / "3-popup.jpg"); pp.close()
            mp = mob.new_page(); mp.goto(f"{mbase}/{d['folder']}/agenda.html"); mp.bring_to_front(); mp.wait_for_timeout(900)
            shot(mp, out / "4-mobile.jpg"); mp.close()
            print(d["id"], "→", ", ".join(sorted(f.name for f in out.iterdir())))
        desk.close(); mob.close()


if __name__ == "__main__":
    main()
