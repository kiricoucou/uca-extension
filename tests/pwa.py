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
    """Lien partageable chiffré (#e=…), adresse publique = la racine : construit comme dans
    l'extension, ouvert directement (racine → app/import.html), code demandé puis mémorisé."""
    data = seed(); data["uca_design"] = "carnet"
    code = "K7P2QX"
    ctx = browser.new_context()
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[lien] {e}"))
    page.goto(base + "app/import.html"); page.wait_for_timeout(300)
    res = page.evaluate("""async ([data, code]) => {
      const snap = { format: 'uca-sync', version: 1, exportedAt: new Date().toISOString(), data };
      const link = await UCA_TRANSFER.buildShareLink(snap, { code, hours: 48 });
      const h = '#' + link.split('#')[1];
      const back = await UCA_TRANSFER.fromLinkHash(h, code.toLowerCase());
      let wrong = null; try { await UCA_TRANSFER.fromLinkHash(h, 'ZZZZZZ'); } catch (e) { wrong = e.kind; }
      let noCode = null; try { await UCA_TRANSFER.fromLinkHash(h, ''); } catch (e) { noCode = e.kind; }
      // Expiration modifiée à la main : le chiffrement authentifie l'en-tête, le lien devient invalide.
      const parts = h.slice(3).split('.'); parts[1] = (parseInt(parts[1], 36) + 999999).toString(36);
      let tampered = null; try { await UCA_TRANSFER.fromLinkHash('#e=' + parts.join('.'), code); } catch (e) { tampered = e.kind; }
      const json = JSON.stringify(data);
      const sample = (data.uca_events[0] || {}).title || '';
      return { link, same: JSON.stringify(back.data) === json, wrong, noCode, tampered, plainVisible: sample && link.includes(encodeURIComponent(sample).slice(0, 12)) };
    }""", [data, code])
    check("lien : pointe vers la racine publique (#e=)", res["link"].startswith("https://kiricoucou.github.io/uca-extension/#e="), res["link"][:70])
    check("lien : données reconstruites identiques avec le bon code", res["same"], str(res)[:200])
    check("lien : mauvais code refusé", res["wrong"] == "code", str(res["wrong"]))
    check("lien : sans code, rien n'est lisible", res["noCode"] == "code", str(res["noCode"]))
    check("lien : expiration modifiée → lien invalide", res["tampered"] == "code", str(res["tampered"]))
    check("lien : contenu chiffré (aucun intitulé de cours en clair)", not res["plainVisible"])
    page.close()

    # Ouvert directement (comme depuis un SMS) : la racine route vers l'import, le code est demandé.
    local_link = base + "#" + res["link"].split("#", 1)[1]
    page2 = ctx.new_page()
    page2.on("pageerror", lambda e: errors.append(f"[lien-ouverture] {e}"))
    page2.goto(local_link); page2.wait_for_timeout(1500)
    check("lien : fragment effacé de l'URL dès l'ouverture", "#e=" not in page2.url, page2.url)
    check("lien : code de partage demandé", page2.locator("#codeCard:not(.hidden)").count() == 1)
    shot(page2, "lien-code")
    page2.locator("#codeInput").fill("ZZZZZZ"); page2.locator("#codeGoBtn").click(); page2.wait_for_timeout(1500)
    check("lien : mauvais code → message d'erreur", "incorrect" in page2.locator("#status").inner_text(), page2.locator("#status").inner_text())
    page2.locator("#codeInput").fill(code.lower()); page2.locator("#codeGoBtn").click(); page2.wait_for_timeout(2500)
    stored = page2.evaluate("() => new Promise(r => chrome.storage.local.get(['uca_events','uca_share_code_saved'], d => r(d)))")
    check("lien ouvert depuis la racine : cours importés", len(stored.get("uca_events") or []) == len(data["uca_events"]), str(len(stored.get("uca_events") or [])))
    check("lien : code mémorisé sur ce téléphone", stored.get("uca_share_code_saved") == code, str(stored.get("uca_share_code_saved")))
    page2.close()

    # Lien expiré : refusé avant même de demander le code.
    page3 = ctx.new_page()
    page3.goto(base + "app/import.html"); page3.wait_for_timeout(300)
    old = page3.evaluate("""async ([data, code]) => {
      const snap = { format: 'uca-sync', version: 1, exportedAt: new Date().toISOString(), data };
      const link = await UCA_TRANSFER.buildShareLink(snap, { code, hours: -1 });
      try { await UCA_TRANSFER.fromLinkHash('#' + link.split('#')[1], code); return { rejected: false }; }
      catch (e) { return { rejected: true, kind: e.kind, message: e.message }; }
    }""", [data, code])
    check("lien expiré : refusé", old.get("rejected") is True and old.get("kind") == "expired", str(old))
    legacy = page3.evaluate("""async () => { try { await UCA_TRANSFER.fromLinkHash('#d=abc'); return null; } catch (e) { return e.kind; } }""")
    check("ancien lien non chiffré (#d=) : refusé", legacy == "format", str(legacy))
    page3.close()

    # Lien collé à la main (bouton "Coller un lien de partage") : code déjà mémorisé → import direct.
    page4 = ctx.new_page()
    page4.on("pageerror", lambda e: errors.append(f"[lien-colle] {e}"))
    page4.goto(base + "app/import.html"); page4.wait_for_timeout(400)
    page4.evaluate("() => new Promise(r => chrome.storage.local.remove('uca_events', r))")
    page4.locator("#pasteLinkBtn").click(); page4.wait_for_timeout(200)
    page4.locator("#linkInput").fill("un message avant " + res["link"] + " et après")
    page4.locator("#linkGoBtn").click(); page4.wait_for_timeout(2500)
    stored4 = page4.evaluate("() => new Promise(r => chrome.storage.local.get('uca_events', d => r((d.uca_events || []).length)))")
    check("lien collé (code mémorisé) : importé sans redemander", stored4 == len(data["uca_events"]), str(stored4))
    page4.close()
    ctx.close()


def site_pages(browser, base, errors):
    """Pages publiques : accueil (comparatif), aide (recherche), 404 (boutons)."""
    ctx = browser.new_context()
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[site] {e}"))
    page.goto(base); page.wait_for_timeout(800)
    check("accueil : reste sur la racine (plus de redirection)", page.url.rstrip("/") == base.rstrip("/") or page.url.endswith("index.html"), page.url)
    heads = page.locator("table.compare thead th").all_inner_texts()
    check("accueil : comparatif site / agenda en ligne / extension / app",
          all(any(k in h for h in heads) for k in ["Site", "Agenda en ligne", "Extension", "App"]), str(heads))
    check("accueil : ligne « connexion directe à Odin » mise en avant", page.locator("tr.key th", has_text="directement à Odin").count() == 1)
    check("accueil : pas de défilement horizontal", page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    shot(page, "accueil")
    page.goto(base + "aide.html"); page.wait_for_timeout(600)
    total = page.locator("details.qa").count()
    check("aide : nombreuses questions", total >= 50, str(total))
    page.fill("#q", "code incorrect"); page.wait_for_timeout(200)
    visible = page.locator("details.qa:visible").count()
    check("aide : la recherche filtre les questions", 0 < visible < total, f"{visible}/{total}")
    page.fill("#q", ""); page.goto(base + "aide.html#maj-extension"); page.wait_for_timeout(400)
    check("aide : ancre #maj-extension ouverte", page.locator("#maj-extension[open]").count() == 1)
    shot(page, "aide")
    page.goto(base + "nexiste/pas/du-tout.html"); page.wait_for_timeout(600)
    # http.server ne sert pas 404.html pour une adresse inconnue (GitHub Pages oui) : page testée directement.
    page.goto(base + "404.html"); page.wait_for_timeout(600)
    hrefs = page.eval_on_selector_all("a.btn", "els => els.map(a => a.getAttribute('href'))")
    labels = " ".join(page.locator("a.btn").all_inner_texts())
    check("404 : boutons Accueil, Agenda en ligne, Installer, Aide",
          all(k in labels for k in ["Accueil", "agenda en ligne", "Installer l'app", "Aide"]), labels)
    check("404 : liens vers ce même site en local", all(h.startswith("/") for h in hrefs), str(hrefs))
    check("404 : logo animé", page.evaluate("getComputedStyle(document.querySelector('.logo .float')).animationName") == "float")
    shot(page, "404")
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


def network_first(browser, base, errors):
    """En ligne, une copie périmée dans le cache ne doit jamais être servie (app installée,
    raccourci ou onglet : même service worker) — la dernière version arrive sans aucun clic."""
    ctx = browser.new_context()
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[reseau-d-abord] {e}"))
    page.goto(base + "designs/carnet/agenda.html"); page.wait_for_timeout(500)
    data = seed(); data["uca_design"] = "carnet"
    page.evaluate("(d) => new Promise(r => chrome.storage.local.set(d, r))", data)
    page.goto(base + "designs/carnet/agenda.html"); page.wait_for_timeout(1500)
    controlled = page.evaluate("() => !!navigator.serviceWorker.controller")
    page.evaluate("""async () => {
      const c = await caches.open('uca-app-v3');
      const bad = (t) => new Response(t, { headers: { 'content-type': 'text/javascript' } });
      await c.put(UCA_APP.root + 'designs/carnet/design.js', bad('window.__stale = true;'));
      await c.put(UCA_APP.root + 'designs/designs.json', new Response('[]', { headers: { 'content-type': 'application/json' } }));
    }""")
    page.reload(); page.wait_for_timeout(1500)
    check("réseau d'abord : page contrôlée par le service worker", controlled)
    check("réseau d'abord : copie périmée du cache ignorée en ligne", page.evaluate("() => !window.__stale") and page.locator(".view.active .event-card, .m-card").count() > 0)
    ctx.close()


def http_cache_bypass(browser, base, errors):
    """Le service worker doit ignorer le cache HTTP du navigateur (Cache-Control: max-age, comme
    en envoie GitHub Pages) et pas seulement son propre cache applicatif : sinon un contenu
    republié peut rester invisible plusieurs minutes après "Mettre à jour" malgré un cache Cache
    API vidé (voir sw.js, fetch forcé en cache:'no-store')."""
    ctx = browser.new_context()
    calls = {"n": 0}

    def handle(route):
        calls["n"] += 1
        route.fulfill(status=200, content_type="text/plain", headers={"Cache-Control": "max-age=600"}, body=f"VERSION-{calls['n']}")
    ctx.route("**/cache-probe.txt", handle)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[cache-http] {e}"))
    page.goto(base + "designs/anime/agenda.html"); page.wait_for_timeout(500)
    v1 = page.evaluate("() => fetch('cache-probe.txt').then(r => r.text())")
    v2 = page.evaluate("() => fetch('cache-probe.txt').then(r => r.text())")
    check("service worker : cache HTTP (max-age) ignoré, contenu toujours frais", v1 == "VERSION-1" and v2 == "VERSION-2", f"{v1} / {v2}")
    ctx.close()


def update_detection(browser, base, errors):
    """Bandeau de mise à jour de l'app (core/env.js checkAppUpdate) : current = version obtenue par
    la page (réseau d'abord, cache hors ligne), latest = manifest.json du site en no-store (ici une
    version plus récente simulée, comme une page démarrée sur sa copie hors ligne)."""
    current_version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    ctx = browser.new_context()
    newer = lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"version": "99.0.0"}))
    ctx.route("**/manifest.json?latest=*", newer)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[maj] {e}"))
    page.goto(base + "designs/anime/agenda.html"); page.wait_for_timeout(500)
    data = seed(); data["uca_design"] = "anime"
    page.evaluate("(d) => new Promise(r => chrome.storage.local.set(d, r))", data)
    page.goto(base + "designs/anime/agenda.html"); page.wait_for_timeout(1500)
    page.evaluate("() => chrome.runtime.sendMessage({ type: 'UCA_FORCE_UPDATE_CHECK' })")
    page.wait_for_timeout(900)
    state = page.evaluate("() => new Promise(r => chrome.storage.local.get(['uca_update_available','uca_current_version','uca_latest_version'], r))")
    check("maj app : détectée (version chargée != version publiée)", state.get("uca_update_available") is True, str(state))
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
      const cache = await caches.open('uca-app-v3');
      await cache.put(UCA_APP.root + 'core/agenda.js', new Response('/* PERIME */', { headers: { 'content-type': 'text/javascript' } }));
    }""")
    # La nouvelle version est désormais celle servie : après rechargement, plus rien à mettre à jour.
    ctx.unroute("**/manifest.json?latest=*", newer)
    page.locator("#updateOverlay button").click()
    page.wait_for_load_state("load", timeout=10000)
    page.wait_for_timeout(1500)
    poisoned_gone = page.evaluate("""async () => {
      const c = await caches.open('uca-app-v3');
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
            site_pages(chromium, base, errors)
            no_install_loop_once_configured(chromium, base, errors)
            network_first(chromium, base, errors)
            http_cache_bypass(chromium, base, errors)
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
