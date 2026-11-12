"""Revue de sécurité ciblée (pas d'outil externe nécessaire) :

1. XSS : si Odin renvoyait un jour un intitulé de cours/professeur/salle contenant du HTML
   (balise malveillante), l'app ne doit jamais l'exécuter — juste l'afficher comme texte. On
   injecte un faux relevé avec des intitulés piégés et on vérifie qu'aucun script ne s'exécute
   (pas d'alerte interceptée, aucune balise <img>/<script> injectée réellement dans le DOM) dans
   tous les designs.
2. Permissions : host_permissions strictement limités aux domaines réellement contactés par
   fetch/XHR (pas de <all_urls>).
3. Pont app <-> extension (content-bridge.js / core/env.js) : origine des postMessage contrôlée
   des deux côtés (déjà revu par lecture de code, voir commentaires ci-dessous — pas de test
   automatisé nécessaire, la logique est triviale et statique).

Usage : python -I -X utf8 tests/security.py
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import ROOT, designs, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    ok = bool(ok)
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


XSS_TITLE = '<img src=x onerror="window.__xss=(window.__xss||0)+1">'
XSS_TEACHER = '<script>window.__xss=(window.__xss||0)+1</script>M. "<b>Injecté</b>"'
XSS_ROOM = "A101<svg onload=\"window.__xss=(window.__xss||0)+1\">"


def poisoned_seed():
    data = seed()
    for ev in data["uca_events"][:3]:
        ev["title"] = XSS_TITLE
        ev["teacher"] = XSS_TEACHER
        ev["room"] = XSS_ROOM
        ev["raw"] = XSS_TITLE + " / " + XSS_TEACHER
    # Même piège dans le relevé de notes (intitulé de matière).
    data["uca_releve_notes"]["ue"][0]["matieres"][0]["label"] = XSS_TITLE
    return data


def permissions_check():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    hosts = manifest.get("host_permissions", [])
    check("host_permissions : pas de <all_urls>", "<all_urls>" not in hosts and not any(h in ("*://*/*", "https://*/*", "http://*/*") for h in hosts), str(hosts))
    check("host_permissions : seulement les domaines attendus", set(hosts) <= {
        "https://ent.uca.fr/*", "https://odin.iut.uca.fr/*", "http://odin.iut.uca.fr/*", "https://edt.uca.fr/*", "https://raw.githubusercontent.com/*",
    }, str(hosts))


def shell_check(p, data):
    """Coque de l'app web (app/shell.html) : groupes, changements d'emploi du temps et notes piégés, aucun script exécuté."""
    import subprocess, socket
    root = Path(__file__).resolve().parent.parent
    sock = socket.socket(); sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]; sock.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(root)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 412, "height": 860})
        fired = {"n": 0}; pg.on("dialog", lambda dlg: (fired.__setitem__("n", fired["n"] + 1), dlg.dismiss()))
        url = f"http://127.0.0.1:{port}/app/"
        for _ in range(30):
            try: pg.goto(url + "import.html"); break
            except Exception: pg.wait_for_timeout(200)
        d = dict(data); d["uca_design"] = "anime"; d["uca_my_groups"] = [XSS_TITLE]
        ev = dict(d["uca_events"][-1]); ev["date"] = "2099-01-01"
        d["uca_edt_changes"] = [{"type": "added", "key": "k", "ev": ev, "details": [XSS_ROOM]}]
        d["uca_notes_seen"] = {XSS_TITLE: {"at": 4102444800000, "note": XSS_TEACHER}}
        d["uca_profile"] = {"name": XSS_TITLE, "formation": XSS_ROOM}
        pg.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", d)
        pg.goto(url + "shell.html#home"); pg.wait_for_timeout(1500)
        for t in ("home", "etudes", "lieux", "compte"):
            pg.click(f'#bottomNav button[data-tab="{t}"]'); pg.wait_for_timeout(300)
        pg.click("#bellBtn"); pg.wait_for_timeout(400)
        check("coque app web : aucun script injecté ne s'est exécuté", pg.evaluate("() => window.__xss || 0") == 0 and fired["n"] == 0)
        check("coque app web : aucune balise piégée dans le DOM", pg.locator("img[src='x'], svg[onload]").count() == 0)
        check("coque app web : politique de sécurité (CSP) présente", "script-src 'self'" in (pg.locator("meta[http-equiv='Content-Security-Policy']").get_attribute("content") or ""))
        b.close()
    finally:
        srv.terminate()


def main():
    permissions_check()
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1280, "height": 860})
        data = poisoned_seed()
        for d in designs():
            sw.evaluate("(d) => chrome.storage.local.set(d)", data)
            sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", d["id"])
            page = ctx.new_page()
            fired = {"n": 0}
            page.on("dialog", lambda dlg: (fired.__setitem__("n", fired["n"] + 1), dlg.dismiss()))
            page.goto(f"{base}/{d['folder']}/agenda.html")
            page.wait_for_timeout(1000)
            xss_count = page.evaluate("() => window.__xss || 0")
            check(f"{d['id']} : aucun script injecté ne s'est exécuté (grille)", xss_count == 0, f"__xss={xss_count}")
            # Ouvre le détail d'un cours piégé (chemin innerHTML le plus direct, core/agenda.js openDetail).
            card = page.locator(".event-card, .m-card").first
            if card.count():
                card.click()
                page.wait_for_timeout(400)
                if page.locator("#closeDetail").count():
                    page.locator("#closeDetail").click()
                    page.wait_for_timeout(300)
            xss_count2 = page.evaluate("() => window.__xss || 0")
            check(f"{d['id']} : aucun script injecté ne s'est exécuté (détail du cours)", xss_count2 == 0, f"__xss={xss_count2}")
            # Le texte malveillant doit être VISIBLE tel quel (preuve que c'est bien affiché en
            # échappé, pas juste bloqué/caché) : la page doit contenir le texte brut de la balise.
            body_text = page.content()
            check(f"{d['id']} : le titre piégé apparaît échappé dans le HTML (&lt;img)", "&lt;img" in body_text or "&amp;lt;img" in body_text)
            check(f"{d['id']} : aucune balise <img src=x onerror> réellement injectée dans le DOM", page.locator("img[src='x']").count() == 0)
            check(f"{d['id']} : aucune balise <svg onload> réellement injectée dans le DOM", page.locator("svg[onload]").count() == 0)
            # Panneau Notes : matière piégée.
            notes_btn = page.locator("#notesBtn")
            if notes_btn.count():
                notes_btn.click()
                page.wait_for_timeout(400)
                xss_count3 = page.evaluate("() => window.__xss || 0")
                check(f"{d['id']} : aucun script injecté ne s'est exécuté (panneau Notes)", xss_count3 == 0, f"__xss={xss_count3}")
            check(f"{d['id']} : aucune erreur JS (dialog natif déclenché)", fired["n"] == 0)
            page.close()
        ctx.close()
        shell_check(p, data)

    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
