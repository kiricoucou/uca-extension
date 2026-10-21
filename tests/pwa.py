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
    """Lien partageable (#d=…), adresse publique = la racine : construit par l'extension, ouvert
    directement (racine → index.html route vers app/import.html, voir index.html à la racine)."""
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
    check("lien : pointe vers la racine publique (#d=)", res["link"].startswith("https://kiricoucou.github.io/uca-extension/#d="), res["link"][:70])
    check("lien : données reconstruites identiques", res["same"], str(res))
    page.close()
    # Ouvert directement (comme depuis un SMS) : la racine route vers l'import, sans caméra ni fichier.
    local_link = base + "#" + res["link"].split("#", 1)[1]
    page2 = browser.new_page()
    page2.on("pageerror", lambda e: errors.append(f"[lien-ouverture] {e}"))
    page2.goto(local_link); page2.wait_for_timeout(2000)
    stored = page2.evaluate("() => new Promise(r => chrome.storage.local.get('uca_events', d => r((d.uca_events || []).length)))")
    check("lien ouvert depuis la racine : cours importés dans le stockage", stored == len(data["uca_events"]), str(stored))
    check("lien : fragment effacé de l'URL après lecture", "#d=" not in page2.url, page2.url)
    page2.close()

    # Lien vieux de plus de 2 jours : refusé (voir core/transfer.js LINK_MAX_AGE_MS).
    page3 = browser.new_page()
    page3.goto(base + "app/import.html"); page3.wait_for_timeout(300)
    old = page3.evaluate("""async (data) => {
      const snap = { format: 'uca-sync', version: 1, exportedAt: new Date(Date.now() - 3 * 86400000).toISOString(), data };
      const link = await UCA_TRANSFER.buildShareLink(snap);
      try { await UCA_TRANSFER.fromLinkHash('#' + link.split('#')[1]); return { rejected: false }; }
      catch (e) { return { rejected: true, message: e.message }; }
    }""", data)
    check("lien de plus de 2 jours : refusé", old.get("rejected") is True and "expir" in old.get("message", ""), str(old))
    page3.close()

    # Lien collé à la main sur app/import.html (bouton "Coller un lien de partage").
    page4 = browser.new_page()
    page4.on("pageerror", lambda e: errors.append(f"[lien-colle] {e}"))
    page4.goto(base + "app/import.html"); page4.wait_for_timeout(400)
    page4.locator("#pasteLinkBtn").click(); page4.wait_for_timeout(200)
    page4.locator("#linkInput").fill("un message avant " + res["link"] + " et après")
    page4.locator("#linkGoBtn").click(); page4.wait_for_timeout(1200)
    stored4 = page4.evaluate("() => new Promise(r => chrome.storage.local.get('uca_events', d => r((d.uca_events || []).length)))")
    check("lien collé à la main (entouré de texte) : importé", stored4 == len(data["uca_events"]), str(stored4))
    page4.close()


def root_router(browser, base, errors):
    """La racine (index.html) est la seule adresse publique : sans lien partageable, elle renvoie
    vers le guide d'installation ; jamais une page interne brute (agenda, choisir un design…)."""
    ctx = browser.new_context()
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[racine] {e}"))
    page.goto(base); page.wait_for_timeout(1000)
    check("racine, visite simple : renvoie vers le guide d'installation", "install.html" in page.url, page.url)
    ctx.close()


def no_install_loop_once_configured(browser, base, errors):
    """Un appareil qui a déjà un design choisi ne doit plus jamais revoir le guide d'installation,
    même si "display-mode: standalone" n'est pas détecté (ex. fenêtre "application" classique) :
    sinon l'app reste bloquée sur ce guide au lieu d'ouvrir l'agenda."""
    ctx = browser.new_context()
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[boucle-install] {e}"))
    page.goto(base + "app/import.html"); page.wait_for_timeout(300)
    data = seed(); data["uca_design"] = "anime"
    page.evaluate("(d) => new Promise(r => chrome.storage.local.set(d, r))", data)
    # Pas de "uca_install_seen" dans localStorage, pas de mode standalone : avant le correctif,
    # index.html renvoyait quand même vers install.html.
    page.goto(base + "app/index.html"); page.wait_for_timeout(1200)
    check("design déjà choisi : jamais renvoyé vers le guide d'installation", "install.html" not in page.url, page.url)
    check("design déjà choisi : agenda ouvert directement", "agenda.html" in page.url, page.url)
    ctx.close()


def update_detection(browser, base, errors):
    """Bandeau de mise à jour de l'app (core/env.js checkAppUpdate) : current = manifest.json figé
    dans le cache du service worker, latest = GitHub (ici simulé via une interception réseau)."""
    current_version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    ctx = browser.new_context()
    ctx.route("https://raw.githubusercontent.com/**", lambda route: route.fulfill(
        status=200, content_type="application/json", body=json.dumps({"version": "99.0.0"})))
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[maj] {e}"))
    page.goto(base + "designs/anime/agenda.html"); page.wait_for_timeout(500)
    data = seed(); data["uca_design"] = "anime"
    page.evaluate("(d) => new Promise(r => chrome.storage.local.set(d, r))", data)
    page.goto(base + "designs/anime/agenda.html"); page.wait_for_timeout(1500)
    # Simule une app déjà installée avant un déploiement : le cache garde l'ancienne version.
    page.evaluate("""async (v) => {
      const cache = await caches.open('uca-app-v1');
      const url = UCA_APP.root + 'manifest.json';
      const old = JSON.parse(await (await cache.match(url)).text()); old.version = v;
      await cache.put(url, new Response(JSON.stringify(old), { headers: { 'content-type': 'application/json' } }));
    }""", current_version)
    page.evaluate("() => chrome.runtime.sendMessage({ type: 'UCA_FORCE_UPDATE_CHECK' })")
    page.wait_for_timeout(700)
    state = page.evaluate("() => new Promise(r => chrome.storage.local.get(['uca_update_available','uca_current_version','uca_latest_version'], r))")
    check("maj app : détectée (current figé != latest GitHub)", state.get("uca_update_available") is True, str(state))
    check("maj app : versions correctes", state.get("uca_current_version") == current_version and state.get("uca_latest_version") == "99.0.0", str(state))
    box = page.locator("#updateOverlay:not(.hidden)").bounding_box()
    vp = page.viewport_size
    check("maj app : bandeau plein écran, bloque l'usage", bool(box) and box["width"] >= vp["width"] - 2 and box["height"] >= vp["height"] - 2)
    check("maj app : un seul bouton (Mettre à jour)", page.locator("#updateOverlay button").count() == 1)

    page.goto(base + "settings.html"); page.wait_for_timeout(1200)
    check("maj app : page Paramètres bloquée aussi", page.locator("#updBlock").count() == 1)
    check("maj app : bouton Vérifier les mises à jour dans Paramètres", page.locator("#checkUpdBtn").count() == 1)
    page.goto(base + "designs/anime/agenda.html"); page.wait_for_timeout(1200)
    # Clique "Mettre à jour" : le cache (shell complet, stale-while-revalidate) doit être vidé —
    # sinon la page rechargée réaffiche le contenu périmé malgré la "mise à jour".
    page.evaluate("""async () => {
      const cache = await caches.open('uca-app-v1');
      await cache.put(UCA_APP.root + 'core/agenda.js', new Response('/* PERIME */', { headers: { 'content-type': 'text/javascript' } }));
    }""")
    page.locator("#updateOverlay button").click()
    page.wait_for_load_state("load", timeout=10000)
    page.wait_for_timeout(500)
    poisoned_gone = page.evaluate("""async () => {
      const c = await caches.open('uca-app-v1');
      const r = await c.match(UCA_APP.root + 'core/agenda.js');
      return !r || !(await r.text()).includes('PERIME');
    }""")
    check("maj app : cache vidé, contenu périmé disparu après Mettre à jour", poisoned_gone)
    check("maj app : écran de blocage disparu après la mise à jour", page.locator("#updateOverlay:not(.hidden)").count() == 0)
    ctx.close()


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
            root_router(chromium, base, errors)
            no_install_loop_once_configured(chromium, base, errors)
            update_detection(chromium, base, errors)
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
