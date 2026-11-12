"""Notifications de l'app web : filtrer, marquer lue/non lue, garder (reste même après une nouvelle synchro), supprimer,
tout supprimer sauf les gardées, restaurer. Les 5 designs.

Usage : python -I -X utf8 tests/notifs.py
"""
import socket
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import ROOT  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def open_notifs(pg):
    """Ouvre l'écran Notifications par la cloche (si on y est déjà après un rechargement, ne fait rien)."""
    if pg.locator("#bellBtn").is_visible():
        pg.locator("#bellBtn").click()
    pg.wait_for_timeout(500)


def main():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    base = f"http://127.0.0.1:{port}/"
    data = seed()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for design in ("studio", "anime", "professionnel", "bulletin", "carnet"):
                ctx = b.new_context(viewport={"width": 390, "height": 800}); pg = ctx.new_page(); errors = []
                pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(base + "app/index.html"); pg.wait_for_timeout(300)
                d = dict(data); d["uca_design"] = design
                pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", d)
                pg.goto(base + "app/shell.html#home"); pg.wait_for_timeout(1400); open_notifs(pg)
                cards = pg.locator(".notif")
                n0 = cards.count()
                check(f"{design} : des notifications sont listées", n0 >= 2, str(n0))
                check(f"{design} : filtres, lu, garder, supprimer présents", pg.locator(".nchip").count() == 5 and pg.locator("[data-act=nKeep]").count() == n0 and pg.locator("[data-act=nDel]").count() == n0)
                # lue / non lue
                pg.locator("[data-act=nRead]").first.click(); pg.wait_for_timeout(200)
                check(f"{design} : marquer lue", pg.locator(".notif.read").count() == 1)
                pg.locator("[data-act=nRead]").first.click(); pg.wait_for_timeout(200)
                check(f"{design} : marquer non lue (bascule)", pg.locator(".notif.read").count() == 0)
                # garder
                pg.locator("[data-act=nKeep]").first.click(); pg.wait_for_timeout(200)
                check(f"{design} : garder une notification (★)", pg.locator(".notif.kept").count() == 1)
                pg.locator(".nchip", has_text="Gardées").click(); pg.wait_for_timeout(200)
                check(f"{design} : filtre « Gardées »", pg.locator(".notif").count() == 1)
                pg.locator(".nchip", has_text="Toutes").click(); pg.wait_for_timeout(200)
                # une notification gardée reste affichée même quand sa source a disparu (ici : copie sans source dans le stockage)
                pg.evaluate("() => localStorage.setItem('uca_notif_saved', JSON.stringify([{ id: 'edt:fake:1', type: 'edt', title: 'Cours annulé : ancien cours', text: 'plus dans Odin', at: Date.now() }]))")
                pg.goto(base + "app/shell.html#home"); pg.wait_for_timeout(1400); open_notifs(pg)
                check(f"{design} : la notification gardée reste même sans sa source", pg.locator(".notif.kept", has_text="ancien cours").count() == 1)
                # supprimer
                n_before = pg.locator(".notif").count()
                pg.locator("[data-act=nDel]").first.click(); pg.wait_for_timeout(250)
                check(f"{design} : supprimer", pg.locator(".notif").count() == n_before - 1, f"{n_before} -> {pg.locator('.notif').count()}")
                pg.locator("[data-act=nClear]").click(); pg.wait_for_timeout(250)
                check(f"{design} : tout supprimé -> plus aucune carte", pg.locator(".notif").count() == 0)
                pg.locator("#backBtn").click(); pg.wait_for_timeout(400)
                check(f"{design} : cloche sans point quand tout est supprimé", pg.evaluate("document.getElementById('bellDot').hidden"))
                # tout supprimer sauf gardées + restaurer
                pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", d)
                pg.evaluate("() => { localStorage.removeItem('uca_notif_dismissed'); localStorage.removeItem('uca_notif_saved'); }")
                pg.goto(base + "app/shell.html#home"); pg.wait_for_timeout(1400); open_notifs(pg)
                total = pg.locator(".notif").count()
                pg.locator("[data-act=nKeep]").first.click(); pg.wait_for_timeout(200)
                pg.locator("[data-act=nClear]").click(); pg.wait_for_timeout(250)
                check(f"{design} : « supprimer tout » garde la notification gardée", pg.locator(".notif").count() == 1 and pg.locator(".notif.kept").count() == 1, str(pg.locator(".notif").count()))
                pg.locator("[data-act=nRestore]").click(); pg.wait_for_timeout(250)
                check(f"{design} : restaurer les supprimées", pg.locator(".notif").count() == total, f"{pg.locator('.notif').count()} / {total}")
                # Compte : session privée + trames (QR animé) vers un autre appareil
                pg.goto(base + "app/shell.html#home"); pg.wait_for_timeout(1200); pg.locator("#bottomNav [data-tab=compte]").click(); pg.wait_for_timeout(600)
                check(f"{design} : carte « Session privée » dans Compte", "Session privée" in pg.locator("#screen").inner_text() and "uniquement dans ce navigateur" in pg.locator("#screen").inner_text())
                pg.locator("[data-act=sendFrames]").click(); pg.wait_for_timeout(700)
                c1 = pg.locator("#frameCount").inner_text(); pg.wait_for_timeout(700); c2 = pg.locator("#frameCount").inner_text()
                check(f"{design} : QR animé (trames) affiché et qui tourne", pg.locator("#frameQr").is_visible() and "Trame" in c1 and c1 != c2, f"{c1} / {c2}")
                pg.locator("#sheet [data-act=closeSheet]").click(); pg.wait_for_timeout(200)
                check(f"{design} : fermeture de la fenêtre des trames", pg.locator("#sheet").is_hidden())
                # un clic sur le corps de la carte ouvre l'agenda (pas sur les boutons)
                check(f"{design} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                ctx.close()
            b.close()
    finally:
        srv.terminate()
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
