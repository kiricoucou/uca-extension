"""Page d'accueil sur téléphone : un seul bouton hamburger (celui du menu complet) et démo qui défile à un doigt (la page)
ou à deux doigts (l'app). Les doigts sont simulés par le protocole du navigateur (CDP).

Usage : python -I -X utf8 tests/phone_home.py
"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


def touch(cdp, kind, points):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(points)]})


def drag(cdp, points, dx, dy, steps=8):
    touch(cdp, "touchStart", points)
    for k in range(1, steps + 1):
        touch(cdp, "touchMove", [(x + dx * k / steps, y + dy * k / steps) for x, y in points])
    touch(cdp, "touchEnd", [])


def main():
    port = 8832
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    base = f"http://127.0.0.1:{port}/"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 412, "height": 900}, is_mobile=True, has_touch=True, device_scale_factor=2)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + "index.html"); pg.wait_for_timeout(1500)
            check("un seul bouton hamburger dans la barre du haut", pg.locator(".nav-toggle").count() == 0 and pg.locator(".nv-burger").count() == 1, f"{pg.locator('.nav-toggle').count()} / {pg.locator('.nv-burger').count()}")
            check("le bouton restant est visible", pg.locator(".nv-burger").is_visible())
            pg.locator(".nv-burger").click(); pg.wait_for_timeout(400)
            check("le menu complet s'ouvre depuis ce bouton", pg.locator("#nvPanel").is_visible() or pg.locator(".nv-panel").count() > 0)
            pg.keyboard.press("Escape"); pg.reload(); pg.wait_for_timeout(1200)

            pg.evaluate("() => document.getElementById('demo').scrollIntoView()"); pg.wait_for_timeout(3000)
            fr = pg.query_selector(".demo-frame iframe")
            pg.evaluate("() => document.querySelector('.demo-frame').scrollIntoView({ block: 'center' })"); pg.wait_for_timeout(500)
            frame = fr.content_frame()
            check("la démo est chargée dans le cadre", frame is not None and frame.evaluate("() => !!document.body && document.body.children.length > 0"))
            frame.evaluate("""() => { window.__tm = []; document.addEventListener('touchmove', (e) => window.__tm.push([e.touches.length, e.defaultPrevented]), { capture: true }); }""")
            box = fr.bounding_box()
            cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            cdp = ctx.new_cdp_session(pg)

            y0 = pg.evaluate("() => window.scrollY")
            drag(cdp, [(cx, cy + 120)], 0, -140)
            pg.wait_for_timeout(700)
            y1 = pg.evaluate("() => window.scrollY")
            tm = frame.evaluate("() => window.__tm")
            check("un doigt vers le haut : la PAGE défile", y1 - y0 > 60, f"{y0} -> {y1}")
            check("un doigt : le défilement natif de l'app est annulé", len(tm) > 0 and all(t[0] == 1 and t[1] for t in tm[:3]), str(tm[:3]))
            check("un doigt : l'indication « Deux doigts pour faire défiler l'app » apparaît", pg.locator(".demo-hint").count() == 1 and "Deux doigts" in pg.inner_text(".demo-hint"))

            frame.evaluate("() => { window.__tm = []; }")
            pg.evaluate("() => document.querySelector('.demo-frame').scrollIntoView({ block: 'center' })"); pg.wait_for_timeout(300)
            box = fr.bounding_box(); cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            y2 = pg.evaluate("() => window.scrollY")
            drag(cdp, [(cx - 40, cy + 80), (cx + 40, cy + 80)], 0, -120)
            pg.wait_for_timeout(500)
            y3 = pg.evaluate("() => window.scrollY")
            tm = frame.evaluate("() => window.__tm")
            check("deux doigts : la page ne défile pas (c'est l'app qui défile)", abs(y3 - y2) < 4, f"{y2} -> {y3}")
            check("deux doigts : le défilement de l'app n'est pas bloqué", len(tm) > 0 and all(t[0] == 2 and not t[1] for t in tm), str(tm[:3]))

            frame.evaluate("() => { window.__tm = []; }")
            pg.evaluate("() => document.querySelector('.demo-frame').scrollIntoView({ block: 'center' })"); pg.wait_for_timeout(300)
            box = fr.bounding_box(); cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            y4 = pg.evaluate("() => window.scrollY")
            drag(cdp, [(cx + 60, cy)], -120, 6)
            pg.wait_for_timeout(500)
            y5 = pg.evaluate("() => window.scrollY")
            tm = frame.evaluate("() => window.__tm")
            check("glissement horizontal (changer de semaine) : laissé à l'app, la page ne bouge pas", abs(y5 - y4) < 4 and all(not t[1] for t in tm), f"{y4}->{y5} {tm[:2]}")
            ctx.close()

            # ordinateur : aucune interception
            ctx = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(base + "index.html"); pg.wait_for_timeout(1200)
            check("ordinateur : le bouton hamburger ancien n'existe plus non plus", pg.locator(".nav-toggle").count() == 0)
            ctx.close()
            b.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
