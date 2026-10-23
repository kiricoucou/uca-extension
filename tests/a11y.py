"""Audit d'accessibilité automatique (axe-core, WCAG 2.2 AA + bonnes pratiques) des pages de l'app, des Paramètres, du
sélecteur de design et, pour chaque design, de l'agenda (téléphone et ordinateur) et du popup.

axe-core n'est pas dans le dépôt : il est installé à la demande dans tests/.axe (npm). Sans npm ni réseau, le test
s'ignore (SKIP) au lieu d'échouer. Zéro violation attendue.
Usage : python -I -X utf8 tests/a11y.py
"""
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import ROOT, designs, launch  # noqa: E402

AXE_DIR = ROOT / "tests" / ".axe"
AXE = AXE_DIR / "node_modules" / "axe-core" / "axe.min.js"
RULES = {"runOnly": {"type": "tag", "values": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]}}
results = []


def check(name, ok, detail=""):
    ok = bool(ok)
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def ensure_axe():
    if AXE.exists():
        return True
    npm = shutil.which("npm")
    if not npm:
        return False
    AXE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run([npm, "install", "--prefix", str(AXE_DIR), "axe-core@4.10.2", "--no-audit", "--no-fund"], check=True, capture_output=True, timeout=240)
    except Exception:
        return False
    return AXE.exists()


def audit(page, label):
    page.evaluate(AXE.read_text(encoding="utf-8"))
    res = page.evaluate("(opts) => axe.run(document, opts)", RULES)
    detail = "; ".join(f"[{v['impact']}] {v['id']} ({len(v['nodes'])}) -> {[n['target'][0] for n in v['nodes'][:3]]}" for v in res["violations"])
    check(f"axe : {label}", not res["violations"], detail[:600])


def site_audit(p):
    """Pages publiques (accueil, anglais, nouveautés, aide), servies en local comme sur GitHub Pages, sans l'extension."""
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1)
        browser = p.chromium.launch()
        for path in ("", "en/", "nouveautes.html", "aide.html"):
            for label, size in (("ordinateur", {"width": 1280, "height": 900}), ("téléphone", {"width": 390, "height": 844})):
                ctx = browser.new_context(viewport=size)
                pg = ctx.new_page()
                pg.goto(f"http://127.0.0.1:{port}/{path}"); pg.wait_for_timeout(1500)
                if path in ("", "en/"):
                    pg.evaluate("() => document.getElementById('demo').scrollIntoView()"); pg.wait_for_timeout(2500)
                audit(pg, f"site {path or 'accueil'} {label}")
                ctx.close()
        browser.close()
    finally:
        server.terminate()


def main():
    if not ensure_axe():
        print("SKIP accessibilité : axe-core indisponible (npm ou réseau manquant)")
        return
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 390, "height": 844})
        sw.evaluate("(d) => chrome.storage.local.set(d)", seed())
        for name in ("app/import.html", "app/install.html", "settings.html", "choose.html"):
            pg = ctx.new_page(); pg.goto(f"{base}/{name}"); pg.wait_for_timeout(900)
            audit(pg, name)
            pg.close()
        for d in designs():
            sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", d["id"])
            for label, size in (("téléphone", {"width": 390, "height": 844}), ("ordinateur", {"width": 1280, "height": 800})):
                pg = ctx.new_page(); pg.set_viewport_size(size)
                pg.goto(f"{base}/{d['folder']}/agenda.html"); pg.wait_for_timeout(1000)
                audit(pg, f"{d['id']} agenda {label}")
                pg.locator("#notesBtn").evaluate("b => b.click()") if size["width"] > 800 else None
                if size["width"] > 800:
                    pg.wait_for_timeout(300)
                    audit(pg, f"{d['id']} agenda {label}, fenêtre Notes ouverte")
                    pg.locator("#tasksBtn").evaluate("b => b.click()")
                    pg.wait_for_timeout(300)
                    audit(pg, f"{d['id']} agenda {label}, fenêtre Devoirs ouverte")
                pg.close()
            pg = ctx.new_page(); pg.set_viewport_size({"width": 400, "height": 700})
            pg.goto(f"{base}/{d['folder']}/popup.html"); pg.wait_for_timeout(900)
            audit(pg, f"{d['id']} popup")
            pg.close()
        ctx.close()
        site_audit(p)
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
