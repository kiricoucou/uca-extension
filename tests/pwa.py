"""Test de l'app téléphone (PWA), servie en local comme sur GitHub Pages.

Usage : python -I -X utf8 tests/pwa.py [dossier_captures]
Chromium en émulation Android ; WebKit en émulation iPhone s'il est installé
(`playwright install webkit`).
"""
import json
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import ROOT, designs  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def shot(page, name):
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT / f"pwa-{name}.png"))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


def sync_file():
    data = seed()
    data["uca_design"] = "anime"
    path = Path(tempfile.mkdtemp()) / "test.ucasync"
    path.write_text(json.dumps({"format": "uca-sync", "version": 1, "exportedAt": "2026-10-20T08:00:00.000Z", "data": data}), encoding="utf-8")
    return path


def run_flow(browser, device, base, label, errors, design_id):
    ctx = browser.new_context(**device)
    page = ctx.new_page()
    # Le WebKit de Playwright sous Windows refuse les service workers (Safari iOS les accepte) : bruit ignoré.
    webkit = browser.browser_type.name == "webkit"
    page.on("pageerror", lambda e: None if webkit and "sw.js" in str(e) else errors.append(f"[{label}] {e}"))
    page.goto(base + "app/"); page.wait_for_load_state("networkidle")
    check(f"{label} : guide d'installation à la première visite", "install.html" in page.url, page.url)
    shot(page, f"{label}-installation")
    page.click("#continueBtn"); page.wait_for_url("**/choose.html?tab=1", timeout=8000); page.wait_for_timeout(500)
    check(f"{label} : choix du design", page.locator(".card").count() == len(designs()))
    page.locator(".card", has_text=next(d["name"] for d in designs() if d["id"] == design_id)).locator(".choose-btn").click()
    page.wait_for_url("**/app/import.html", timeout=8000)
    check(f"{label} : sans données → écran d'import", True)
    shot(page, f"{label}-import")
    page.set_input_files("#fileInput", str(sync_file()))
    page.wait_for_url(f"**/designs/{design_id}/agenda.html*", timeout=10000); page.wait_for_timeout(900)
    cards = page.locator(".m-card, .view.active .event-card").count()
    check(f"{label} : import du fichier → cours affichés", cards > 0, str(cards))
    check(f"{label} : design de l'appareil conservé", f"/designs/{design_id}/" in page.url, page.url)
    check(f"{label} : info « données de l'ordinateur »", "Données de l'ordinateur" in page.locator("#syncInfo").inner_text())
    check(f"{label} : bouton Importer au lieu de Synchroniser", "Importer" in page.locator("#syncBtn").inner_text() or not page.locator("#syncBtn").is_visible())
    shot(page, f"{label}-agenda")
    page.locator("#menuBtn").click(); page.wait_for_timeout(300)
    page.locator("#mobileMenu .mi", has_text="Notes").click(); page.wait_for_timeout(400)
    check(f"{label} : notes ouvertes en feuille depuis le menu", page.locator("#notesPanel.as-sheet.open").is_visible())
    shot(page, f"{label}-notes")
    page.goto(base + "app/index.html?open=absences"); page.wait_for_timeout(1500)
    check(f"{label} : raccourci « Mes absences »", page.locator("#absencesPanel.open").count() == 1)
    if browser.browser_type.name == "chromium":
        ready = page.evaluate("() => navigator.serviceWorker.ready.then(r => !!r.active)")
        check(f"{label} : service worker actif", ready)
        page.goto(base + "app/index.html"); page.wait_for_timeout(1500)
        ctx.set_offline(True)
        page.reload(); page.wait_for_timeout(1500)
        check(f"{label} : fonctionne hors ligne", page.locator(".m-card, .view.active .event-card").count() > 0)
        ctx.set_offline(False)
    page.goto(base + "settings.html"); page.wait_for_timeout(600)
    check(f"{label} : réglages propres à l'extension masqués", page.locator("#f-autoSyncHours").count() == 0 and page.locator("#f-startView").count() == 1)
    ctx.close()


def qr_roundtrip(browser, base, errors):
    """Trames générées comme dans l'extension, dessinées en QR puis relues par jsQR."""
    page = browser.new_page()
    page.on("pageerror", lambda e: errors.append(f"[qr] {e}"))
    page.goto(base + "app/import.html"); page.wait_for_timeout(500)
    page.add_script_tag(url=base + "vendor/qrcode.js")
    res = page.evaluate("""async (data) => {
      const snap = { format: 'uca-sync', version: 1, exportedAt: new Date().toISOString(), data };
      const frames = await UCA_TRANSFER.encodeFrames(snap);
      const col = UCA_TRANSFER.collector();
      let decodedOk = 0;
      for (const f of [...frames].reverse()) {
        const c = document.createElement('canvas'); UCA_TRANSFER.drawQr(c, f, 300);
        const img = c.getContext('2d').getImageData(0, 0, c.width, c.height);
        const code = jsQR(img.data, c.width, c.height);
        if (code && code.data === f) decodedOk++;
        col.add(code ? code.data : '');
      }
      const back = await col.result();
      return { frames: frames.length, decodedOk, same: JSON.stringify(back.data) === JSON.stringify(data) };
    }""", seed())
    check("QR : chaque trame relue à l'identique", res["decodedOk"] == res["frames"], str(res))
    check("QR : données reconstruites identiques (ordre quelconque)", res["same"], str(res))
    page.close()


def link_roundtrip(browser, base, errors):
    """Lien partageable (#d=…) : construit par l'extension, ouvert directement dans l'app."""
    data = seed(); data["uca_design"] = "carnet"
    page = browser.new_page()
    page.on("pageerror", lambda e: errors.append(f"[lien] {e}"))
    page.goto(base + "app/import.html"); page.wait_for_timeout(300)
    res = page.evaluate("""async (data) => {
      const snap = { format: 'uca-sync', version: 1, exportedAt: new Date().toISOString(), data };
      const link = await UCA_TRANSFER.buildShareLink(snap);
      const back = await UCA_TRANSFER.fromLinkHash('#' + link.split('#')[1]);
      return { link, same: JSON.stringify(back.data) === JSON.stringify(data) };
    }""", data)
    check("lien : pointe vers app/import.html#d=", "/app/import.html#d=" in res["link"], res["link"][:70])
    check("lien : données reconstruites identiques", res["same"], str(res))
    page.close()
    # Ouvert directement (comme depuis un SMS) : import automatique, sans caméra ni fichier.
    local_link = base + "app/import.html#" + res["link"].split("#", 1)[1]
    page2 = browser.new_page()
    page2.on("pageerror", lambda e: errors.append(f"[lien-ouverture] {e}"))
    page2.goto(local_link); page2.wait_for_timeout(1600)
    stored = page2.evaluate("() => new Promise(r => chrome.storage.local.get('uca_events', d => r((d.uca_events || []).length)))")
    check("lien ouvert directement : cours importés dans le stockage", stored == len(data["uca_events"]), str(stored))
    check("lien : fragment effacé de l'URL après lecture", "#d=" not in page2.url, page2.url)
    page2.close()


def main():
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    errors = []
    try:
        time.sleep(1)
        with sync_playwright() as p:
            chromium = p.chromium.launch()
            man = json.loads(Path(ROOT / "app.webmanifest").read_text(encoding="utf-8"))
            icons_ok = all((ROOT / i["src"]).exists() for i in man["icons"]) and any(i.get("purpose") == "maskable" for i in man["icons"])
            check("manifeste : icônes (dont maskable) présentes", icons_ok)
            check("manifeste : écran plein, raccourcis, partage", man["display"] == "standalone" and len(man["shortcuts"]) >= 3 and "share_target" in man)
            run_flow(chromium, p.devices["Pixel 7"], base, "android", errors, "carnet")
            qr_roundtrip(chromium, base, errors)
            link_roundtrip(chromium, base, errors)
            chromium.close()
            try:
                webkit = p.webkit.launch()
            except Exception:
                webkit = None
                print("SKIP iPhone (WebKit non installé : playwright install webkit)")
            if webkit:
                run_flow(webkit, p.devices["iPhone 14"], base, "iphone", errors, "professionnel")
                webkit.close()
    finally:
        server.terminate()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
