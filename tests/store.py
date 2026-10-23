"""Paquets des magasins : contenu, manifestes, fiches, comportement du paquet « magasin » et gardes Firefox Android.

Construit les deux paquets (--store), les vérifie, charge le paquet Chrome dans Chromium (pas de vérificateur de
mise à jour GitHub, section Mises à jour de Paramètres adaptée) et teste par simulation ce qui manque sur
Firefox pour Android (API windows et notifications absentes).
Usage : python -I -X utf8 tests/store.py
"""
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import ROOT, launch  # noqa: E402

results = []
HOSTS = ("odin.iut.uca.fr", "ent.uca.fr", "moodle.uca.fr", "mail.uca.fr", "kiricoucou.github.io", "raw.githubusercontent.com")
NOT_PACKAGED = ("index.html", "aide.html", "install.html", "404.html", "confidentialite.html", "site.css", "site-demo.js", "nouveautes.html", "sitemap.xml", "robots.txt", "en/index.html", "sw.js", "app.webmanifest")


def check(name, ok, detail=""):
    ok = bool(ok)
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def run(script, *args):
    subprocess.run([sys.executable, "-I", "-X", "utf8", str(ROOT / "tests" / script), *args], check=True, capture_output=True)


def referenced(manifest):
    files = set(manifest.get("icons", {}).values())
    act = manifest.get("action", {})
    files |= set(act.get("default_icon", {}).values())
    if act.get("default_popup"):
        files.add(act["default_popup"])
    bg = manifest.get("background", {})
    files |= set(bg.get("scripts", []))
    if bg.get("service_worker"):
        files.add(bg["service_worker"])
    for cs in manifest.get("content_scripts", []):
        files |= set(cs.get("js", []))
    return files


def fulfill_ok(route):
    route.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="text/html", body="<title>ok</title>")


def png_size(path):
    raw = path.read_bytes()
    return int.from_bytes(raw[16:20], "big"), int.from_bytes(raw[20:24], "big")


def main():
    version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    run("build_firefox.py", "--store")
    run("build_chrome.py", "--store")
    fx = ROOT / "dist" / f"uca-extension-firefox-store-{version}.zip"
    ch = ROOT / "dist" / f"uca-extension-chrome-store-{version}.zip"
    check("paquets magasin construits", fx.exists() and ch.exists())

    for label, path in (("Firefox", fx), ("Chrome", ch)):
        z = zipfile.ZipFile(path)
        names = set(z.namelist())
        m = json.loads(z.read("manifest.json"))
        check(f"{label} : version {version} et store-build.txt", m["version"] == version and "store-build.txt" in names)
        check(f"{label} : description <= 132 caractères (limite Chrome Web Store)", len(m["description"]) <= 132, str(len(m["description"])))
        check(f"{label} : aucun accès à raw.githubusercontent.com", not any("githubusercontent" in h for h in m["host_permissions"]), str(m["host_permissions"]))
        check(f"{label} : pont limité au site publié", all(cs["matches"] == ["https://kiricoucou.github.io/uca-extension/*"] for cs in m["content_scripts"]))
        check(f"{label} : permissions attendues", sorted(m["permissions"]) == ["alarms", "cookies", "notifications", "scripting", "storage"], str(m["permissions"]))
        missing = sorted(f for f in referenced(m) if f not in names)
        check(f"{label} : tous les fichiers du manifeste présents", not missing, str(missing))
        bad = sorted(n for n in names if n.split("/")[0] in ("tests", ".github", "store", "app", "dist", ".git") or n in NOT_PACKAGED)
        check(f"{label} : aucun fichier de test, d'app ni de site", not bad, str(bad[:5]))
        check(f"{label} : politique de confidentialité dans chaque design", all(f"designs/{d}/confidentialite.html" in names for d in ("anime", "professionnel", "carnet")))
    m = json.loads(zipfile.ZipFile(fx).read("manifest.json"))
    g = m["browser_specific_settings"]
    check("Firefox : identifiant, données (aucune), versions minimales",
          g["gecko"]["id"].count("@") == 1 and g["gecko"]["data_collection_permissions"] == {"required": ["none"]}
          and g["gecko"]["strict_min_version"] == "140.0" and g["gecko_android"]["strict_min_version"] == "142.0", json.dumps(g))
    check("Firefox : scripts d'arrière-plan complets", m["background"]["scripts"][-1] == "background.js"
          and "core/status.js" in m["background"]["scripts"] and "core/grades.js" in m["background"]["scripts"])

    # fiches et captures
    fiche = (ROOT / "store" / "FICHE-FIREFOX.md").read_text(encoding="utf-8")
    summary = re.search(r"## Résumé[^\n]*\n([^\n]+)", fiche).group(1)
    check("fiche Firefox : résumé <= 250 caractères", len(summary) <= 250, str(len(summary)))
    check("fiche Firefox : nom <= 50 caractères", len(re.search(r"## Nom[^\n]*\n([^\n]+)", fiche).group(1)) <= 50)
    chrome_fiche = (ROOT / "store" / "FICHE-CHROME.md").read_text(encoding="utf-8")
    check("fiche Chrome : résumé identique à la description du manifeste", json.loads(zipfile.ZipFile(ch).read("manifest.json"))["description"] in chrome_fiche)
    shots = sorted((ROOT / "store" / "screenshots").glob("*.png"))
    check("captures : 5 images 1280x800", len(shots) == 5 and all(png_size(s) == (1280, 800) for s in shots), str([png_size(s) for s in shots]))
    page = (ROOT / "confidentialite.html")
    check("page de confidentialité publique à la racine", page.exists() and "Toutes les connexions réseau" in page.read_text(encoding="utf-8"))

    with sync_playwright() as p:
        # --- paquet des magasins chargé dans Chromium
        tmp = Path(tempfile.mkdtemp())
        zipfile.ZipFile(ch).extractall(tmp)
        ctx, sw, base = launch(p, ext=str(tmp), viewport={"width": 1100, "height": 800})
        fetched = []
        ctx.on("request", lambda r: fetched.append(r.url))
        for host in HOSTS:
            ctx.route(f"https://{host}/**", fulfill_ok)
        sw.evaluate("() => checkForUpdate()")
        flag = sw.evaluate("() => chrome.storage.local.get(['uca_store_build', 'uca_update_available']).then(d => JSON.stringify(d))")
        check("paquet magasin : reconnu, aucune mise à jour proposée", json.loads(flag) == {"uca_store_build": True, "uca_update_available": False}, flag)
        check("paquet magasin : aucune requête de version vers GitHub", not any("/main/manifest.json?t=" in u for u in fetched), str([u for u in fetched if "manifest.json" in u]))
        st = ctx.new_page()
        st.goto(f"{base}/settings.html")
        st.wait_for_timeout(1500)
        check("paquet magasin : Paramètres sans bouton de mise à jour", not st.locator("#checkUpdBtn").is_visible() and "automatiques" in st.locator("#updState").inner_text(), st.locator("#updState").inner_text())
        check("paquet magasin : pas de bloc « Nouvelle version »", st.locator("#updBlock").count() == 0)
        ctx.close()

        # --- paquet de développement : la vérification GitHub existe toujours
        ctx, sw, base = launch(p, viewport={"width": 1100, "height": 800})
        ctx.route("https://raw.githubusercontent.com/**", lambda r: r.fulfill(status=200, headers={"access-control-allow-origin": "*"}, content_type="application/json", body=json.dumps({"version": "9.9.9"})))
        sw.evaluate("() => checkForUpdate()")
        d = sw.evaluate("() => chrome.storage.local.get(['uca_store_build', 'uca_update_available', 'uca_latest_version'])")
        check("paquet de développement : vérification GitHub conservée", d.get("uca_update_available") is True and d.get("uca_latest_version") == "9.9.9" and not d.get("uca_store_build"), str(d))

        # --- exemple du relecteur : de fausses données sans compte UCA
        notes = (ROOT / "store" / "NOTES-RELECTEUR.md").read_text(encoding="utf-8")
        code = re.search(r"```js\n(.*?)```", notes, re.S).group(1).replace("browser.", "chrome.")
        sw.evaluate("async () => { " + code + " }")
        ag = None
        for _ in range(20):
            ag = next((pg for pg in ctx.pages if "designs/professionnel/agenda.html" in pg.url), None)
            if ag:
                break
            ctx.pages[0].wait_for_timeout(300)
        check("exemple du relecteur : l'agenda s'ouvre", ag is not None)
        if ag:
            ag.wait_for_timeout(900)
            txt = ag.locator("body").inner_text()
            check("exemple du relecteur : cours factices visibles", "R1.02 Web TD" in txt and "DS2" in txt, txt[:200])

        # --- Firefox pour Android : ni notifications ni API windows
        res = sw.evaluate("""async () => {
          const real = self.chrome, out = {};
          const copy = Object.assign({}, real);
          copy.notifications = undefined; copy.windows = undefined;
          const tabsCreated = [];
          copy.tabs = Object.assign({}, real.tabs, { create: async (o) => { tabsCreated.push(o.url); return { id: 77 }; }, remove: async () => {}, onRemoved: real.tabs.onRemoved });
          self.chrome = copy;
          const realWait = self.waitForUrlContains, realNav = self.navigateAndScrape;
          self.waitForUrlContains = async () => true; self.navigateAndScrape = async () => "TEXTE OK";
          try {
            try { notify('x', { type: 'basic', title: 't', message: 'm' }); out.notify = 'ok'; } catch (e) { out.notify = String(e); }
            out.text = await fullLogin();
            out.tabs = tabsCreated;
          } finally { self.chrome = real; self.waitForUrlContains = realWait; self.navigateAndScrape = realNav; }
          return out; }""")
        check("Android : notify() sans API notifications ne plante pas", res["notify"] == "ok", str(res))
        check("Android : connexion CAS dans un onglet normal quand windows manque", res["text"] == "TEXTE OK" and len(res["tabs"]) == 1 and "ent.uca.fr" in res["tabs"][0], str(res))
        ctx.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
