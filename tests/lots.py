"""v1.40 : bandeau « données vieilles », rappels, devoirs, objectifs de moyenne, .ics, prochain cours / examen,
partage en image… Une section par lot (ajoutées au fil des versions). Aucun accès réseau réel.

Usage : python -I -X utf8 tests/lots.py [dossier_captures]
"""
import datetime
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import designs, launch  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []


def check(name, ok, detail=""):
    ok = bool(ok); results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def shot(page, name):
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT / f"{name}.png"))


def open_agenda(ctx, base, folder, size):
    pg = ctx.new_page(); pg.set_viewport_size(size)
    pg.goto(f"{base}/{folder}/agenda.html"); pg.wait_for_timeout(900)
    return pg


def lot1(ctx, sw, base, errors):
    for d in designs():
        sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", d["id"])
        old = (datetime.datetime.now() - datetime.timedelta(hours=30)).isoformat()
        sw.evaluate("(iso) => chrome.storage.local.set({uca_last_sync: iso})", old)
        for label, size in (("ordinateur", {"width": 1400, "height": 860}), ("téléphone", {"width": 390, "height": 844})):
            pg = open_agenda(ctx, base, d["folder"], size)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            txt = pg.locator("#staleInfo").inner_text() if pg.locator("#staleInfo").count() else ""
            check(f"{d['id']} {label} : bandeau « Données vieilles de 30 h »", "Données vieilles de 30 h" in txt, txt)
            check(f"{d['id']} {label} : bouton Resynchroniser présent", pg.locator("#staleSyncBtn").count() == 1)
            pg.evaluate("() => { window.__sent = []; const o = chrome.runtime.sendMessage.bind(chrome.runtime); chrome.runtime.sendMessage = (m, cb) => { window.__sent.push(m); if (m && m.type === 'UCA_SYNC_REQUEST') return Promise.resolve(); return o(m, cb); }; }")
            if pg.locator("#staleSyncBtn").count():
                pg.locator("#staleSyncBtn").evaluate("b => b.click()")
                pg.wait_for_timeout(200)
                sent = pg.evaluate("() => window.__sent.filter(m => m && m.type === 'UCA_SYNC_REQUEST').map(m => m.mode)")
                check(f"{d['id']} {label} : un clic lance une resynchro", sent == ["resync"], str(sent))
            if label == "ordinateur":
                shot(pg, f"lot1-stale-{d['id']}")
            pg.close()
        sw.evaluate("() => chrome.storage.local.set({uca_last_sync: new Date().toISOString()})")
        pg = open_agenda(ctx, base, d["folder"], {"width": 1400, "height": 860})
        check(f"{d['id']} : données récentes -> pas de bandeau", pg.locator("#staleInfo").count() == 0)
        pg.close()


def main():
    errors = []
    data = seed()
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})
        sw.evaluate("(d) => chrome.storage.local.set(d)", data)
        lot1(ctx, sw, base, errors)
        check("aucune erreur JavaScript", not errors, " | ".join(errors[:3]))
        ctx.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
