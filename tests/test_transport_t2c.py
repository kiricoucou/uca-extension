"""Page Transports (site et copie embarquée dans l'APK) : aucune donnée inventée.

Aucun accès au réseau : les fichiers du dépôt sont servis sur un port local libre, les appels à
api.t2c.fr reçoivent des réponses factices fournies par Playwright, tout le reste est bloqué.

Usage : python -I -X utf8 tests/test_transport_t2c.py
"""
import json
import re
import threading
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APK_DIR = "app/webview-app/app/src/main/assets/legacy-site"
PAGES = {"site": "transport.html", "APK": APK_DIR + "/transport.html"}
OFFICIAL = {"https://www.t2c.fr/", "https://www.sncf-connect.com/", "https://www.blablacar.fr/", "https://www.flixbus.fr/"}

failures = []


def check(label, ok, detail=""):
    print(("  OK    " if ok else "  ÉCHEC ") + label + ("" if ok or not detail else f"  -> {detail}"))
    if not ok:
        failures.append(label)


def load_data():
    source = (ROOT / "core" / "t2c_data.js").read_text(encoding="utf-8")
    marker = "const T2C_DATA = "
    return json.JSONDecoder().raw_decode(source[source.index(marker) + len(marker):])[0]


def apk_version(source):
    """Les seules différences autorisées entre la page du site et sa copie dans l'APK."""
    def replace(match):
        block = match.group(0)
        if 'class="brand-logo"' in block:
            return '      <img src="icon-192.png" class="brand-logo" alt="">\n'
        if 'rel="icon"' in block:
            return '<link rel="icon" type="image/png" href="icon-512.png">\n'
        return ""
    return re.sub(r"[ \t]*<!-- site-only:start -->.*?<!-- site-only:end -->\n", replace, source, flags=re.S)


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")   # fins de ligne normalisées


def at(minutes):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes, seconds=30)).strftime("%Y-%m-%dT%H:%M:%SZ")


def departure(headsign, minutes, live_minutes=None, flag=None):
    return {
        "trip_headsign": headsign,
        "theorical_departure_datetime": at(minutes),
        "real_time": (live_minutes is not None) if flag is None else flag,
        "real_time_stop_time": at(live_minutes) if live_minutes is not None else None,
    }


def line(name, departures, **extra):
    return dict({"route_short_name": name, "route_type": 0 if name == "A" else 3, "next_departures": departures}, **extra)


def normal_answer():
    return [line("A", [
        departure("Les Vergnes", 4, 7), departure("Les Vergnes", 12), departure("Les Vergnes", 20),
        departure("Les Vergnes", 28), departure("La Pardieu Gare", 6, flag=True), departure("Ancien passage", -30),
    ], route_color="a81815", route_text_color="ffffff")]


class Api:
    """Réponse factice de api.t2c.fr, modifiable par chaque scénario."""

    def __init__(self):
        self.mode = "json"
        self.body = []
        self.calls = []
        self.held = []
        self.by_stop = {}

    def set(self, mode, body=None):
        self.mode, self.body = mode, body
        self.by_stop = {}

    def handle(self, route):
        stop = unquote(urlsplit(route.request.url).path.split("/")[3])
        self.calls.append(stop)
        mode, body = self.by_stop.get(stop, (self.mode, self.body))
        if mode == "hold":
            self.held.append(route)
        elif mode == "abort":
            route.abort()
        else:
            self.fulfill(route, body, 500 if mode == "error" else 200, raw=mode == "raw")

    @staticmethod
    def fulfill(route, body, status=200, raw=False):
        route.fulfill(status=status, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
                      body=body if raw else json.dumps(body))


class QuietHandler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{".js": "text/javascript", ".html": "text/html"})

    def log_message(self, *args):
        pass


class Session:
    def __init__(self, browser, base, path, width=900, scheme="dark", init_script=None):
        self.api = Api()
        self.blocked, self.errors, self.missing = [], [], []
        self.base, self.url = base, base + "/" + path
        self.context = browser.new_context(viewport={"width": width, "height": 800}, color_scheme=scheme,
                                           service_workers="block", locale="fr-FR")
        self.context.route("**/*", self.route)
        if init_script:
            self.context.add_init_script(init_script)
        self.page = self.context.new_page()
        self.page.set_default_timeout(8000)
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.on("response", lambda r: self.missing.append(r.url) if r.url.startswith(base) and r.status >= 400 else None)
        self.page.goto(self.url, wait_until="load")

    def route(self, route):
        url = route.request.url
        if url.startswith(self.base + "/"):
            route.continue_()
        elif url.startswith("https://api.t2c.fr/siv/stops/"):
            self.api.handle(route)
        else:
            self.blocked.append(url)
            route.abort()

    def pick(self, stop="CAMP"):
        self.page.click(f'#campusList [data-stop="{stop}"]')

    def wait_state(self, selector):
        self.page.wait_for_selector("#departures " + selector)

    def text(self, selector="#departures"):
        return self.page.inner_text(selector)

    def count(self, selector):
        return self.page.locator(selector).count()

    def close(self):
        self.context.close()


def static_checks():
    print("\n== Fichiers ==")
    page = read("transport.html") + read("core/transport-page.js")
    module = read("core/mobility.js")
    check("copie APK de la page identique au site (hors blocs réservés au site)", read(PAGES["APK"]) == apk_version(read("transport.html")))
    for name in ("core/mobility.js", "core/t2c_data.js", "core/transport-page.js"):
        check(f"copie APK de {name} identique", read(name) == read(APK_DIR + "/" + name))
    for banned in ("generateScheduledDepartures", "getRealtimeStatus", "findRoutes", "Marc D", "FlixBus N", "TER 873160"):
        check(f"plus de donnée inventée : « {banned} » absent", banned not in page and banned not in module)
    check("aucun innerHTML / insertAdjacentHTML dans la page et le module",
          not re.search(r"innerHTML|insertAdjacentHTML|outerHTML", page + module))
    links = set(re.findall(r'href="(https?://[^"]+)"', page))
    check("liens externes : uniquement les quatre pages d'accueil officielles", links == OFFICIAL, links)


def scenario_start(browser, base, path, data):
    print("\n-- Ouverture, compteurs, raccourcis, onglets")
    s = Session(browser, base, path)
    p = s.page
    transit = [x for x in data["stops"] if x["type"] in ("bus", "tram", "mixte")]
    check("aucune erreur JavaScript", not s.errors, s.errors)
    check("tous les fichiers locaux sont trouvés", not s.missing, s.missing)
    check("aucun appel à l'API avant le choix d'un arrêt", not s.api.calls, s.api.calls)
    check("compteur d'arrêts exact", s.text("#searchCount").startswith(f"{len(transit)} arrêts de bus et de tram"), s.text("#searchCount"))
    check("compteur de lignes exact", s.text("#routesCount") == str(len(data["routes"])))
    ids = p.eval_on_selector_all("#campusList [data-stop]", "els => els.map(e => e.dataset.stop)")
    check("raccourcis campus : arrêts présents dans les données", ids == ["CAMP", "CEPE", "UCAC", "FACU", "CARN"]
          and set(ids) <= {x["id"] for x in transit}, ids)
    generated = datetime.strptime(data["generatedAt"], "%Y-%m-%dT%H:%M:%SZ")
    check("date de la copie des données affichée", f"{generated.day} " in s.text("#dataDate") and str(generated.year) in s.text("#dataDate"), s.text("#dataDate"))

    p.focus("#tab-departs")
    p.keyboard.press("ArrowRight")
    check("onglets au clavier", p.get_attribute("#tab-lignes", "aria-selected") == "true" and p.is_visible("#pane-lignes")
          and not p.is_visible("#pane-departs"))
    check("toutes les lignes listées", s.count("#routesGrid [data-line]") == len(data["routes"]))
    counts = [int(re.search(r"\((\d+)\)", t).group(1)) for t in p.locator("#routeFilters button").all_inner_texts()]
    for i, expected in enumerate(counts):
        p.locator("#routeFilters button").nth(i).click()
        check(f"filtre de lignes n° {i + 1} : compteur exact ({expected})", s.count("#routesGrid [data-line]") == expected)
    check("les catégories couvrent toutes les lignes", sum(counts[1:]) == counts[0], counts)
    p.locator("#routeFilters button").first.click()
    p.click('#routesGrid [data-line="A"]')
    check("détail du tram A : tous les arrêts de la copie", s.count("#lineStops li") == len(data["routes"]["A"]["stops"]))
    s.api.set("json", normal_answer())
    p.click('#lineStops [data-stop="CAMP"]')
    s.wait_state(".group")
    check("un arrêt de ligne ouvre ses départs", p.is_visible("#pane-departs") and s.api.calls[-1] == "CAMP")
    p.click("#tab-ailleurs")
    hrefs = set(p.eval_on_selector_all("#pane-ailleurs a", "els => els.map(e => e.href)"))
    check("trajets et train : liens officiels uniquement", hrefs == OFFICIAL, hrefs)
    check("aucune requête hors du serveur local et de l'API factice", not [u for u in s.blocked if "t2c" in u], s.blocked)
    s.close()


def scenario_success(browser, base, path):
    print("\n-- Réponse normale : regroupement et mentions")
    s = Session(browser, base, path)
    s.api.set("json", normal_answer())
    s.pick()
    s.wait_state(".group")
    check("un groupe par ligne et direction (passé ignoré)", s.count("#departures .group") == 2, s.text())
    vergnes = s.page.locator("#departures .group", has_text="Les Vergnes")
    check("au plus 3 passages par direction", vergnes.locator(".time").count() == 3)
    first = vergnes.locator(".time").first.inner_text()
    check("« En direct » avec heure en temps réel et écart", "En direct" in first and "dans 7 min" in first and "3 min après" in first, first)
    check("« Prévu » pour l'horaire théorique", vergnes.locator(".badge.planned").count() == 2)
    pardieu = s.page.locator("#departures .group", has_text="La Pardieu Gare").inner_text()
    check("indicateur temps réel sans heure en direct : reste « Prévu »", "Prévu" in pardieu and "En direct" not in pardieu, pardieu)
    check("heure de consultation affichée", re.search(r"reçue à \d\d:\d\d:\d\d", s.text("#fetchTime")) is not None, s.text("#fetchTime"))
    s.api.set("abort")
    s.page.click("#refreshBtn")
    s.wait_state('[data-state="unavailable"]')
    check("actualisation en échec : les anciens horaires disparaissent", s.count("#departures .time") == 0)
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


def scenario_failure(browser, base, path):
    print("\n-- Panne : aucune ligne inventée")
    cases = [("réseau coupé", "abort", None), ("erreur 500", "error", []), ("réponse illisible", "raw", "<html>oups</html>"),
             ("format inconnu (objet)", "json", {"message": "x"}), ("format inconnu (liste)", "json", [{"foo": 1}]),
             ("dates illisibles", "json", [line("A", [{"trip_headsign": "X", "theorical_departure_datetime": "demain"}])]),
             ("un passage parti et un illisible", "json", [line("A", [departure("X", -20), {"trip_headsign": "Y"}])])]
    s = Session(browser, base, path)
    for index, (label, mode, body) in enumerate(cases):
        s.api.set(mode, body)
        s.pick("CAMP" if index % 2 == 0 else "CEPE")
        s.wait_state('[data-state="unavailable"]')
        content = s.text()
        check(f"{label} : « Indisponible » sans ligne ni horaire",
              "Indisponible" in content and s.count("#departures .line-tag") == 0 and s.count("#departures .time") == 0
              and not re.search(r"dans \d+ min|En direct|Aucun passage annoncé|À l'heure", content), content)
    check("bouton Réessayer et lien officiel",
          s.page.is_visible("#retryBtn") and s.page.get_attribute("#departures a", "href") == "https://www.t2c.fr/")
    check("heure de la tentative affichée", "Dernière tentative à" in s.text("#fetchTime"))
    s.api.set("json", normal_answer())
    s.page.focus("#retryBtn")
    s.page.keyboard.press("Enter")
    s.wait_state(".group")
    check("après Réessayer, le focus clavier reste sur l'arrêt", s.page.evaluate("document.activeElement.id") == "stopName")
    check("Réessayer relance la demande", s.count("#departures .group") == 2)
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


def scenario_empty(browser, base, path):
    print("\n-- Réponse vide")
    s = Session(browser, base, path)
    cases = [("liste vide", []), ("ligne sans passage", [line("A", [])]),
             ("passages déjà partis", [line("A", [departure("Les Vergnes", -20)])])]
    for index, (label, body) in enumerate(cases):
        s.api.set("json", body)
        s.pick("CAMP" if index % 2 == 0 else "CEPE")
        s.wait_state('[data-state="empty"]')
        check(f"{label} : « Aucun passage annoncé »", "Aucun passage annoncé" in s.text()
              and s.count("#departures .line-tag") == 0 and s.count("#retryBtn") == 0, s.text())
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


MARKUP = '<img src=x onerror="window.__pwn=1">'


def malicious_answer():
    return [{
        "route_short_name": "<b onmouseover=1>", "route_type": 3,
        "route_color": "fff;background-image:url(https://evil.example/c)", "route_text_color": '"><script>window.__pwn=3</script>',
        "next_departures": [departure(MARKUP, 5, 5), departure("<script>window.__pwn=2</script>", 9)],
    }, line("B", [departure("X" * 80, 3)], route_color="ffffff", route_text_color="ffffff")]


def scenario_malicious(browser, base, path):
    print("\n-- HTML malveillant dans la réponse")
    s = Session(browser, base, path, width=360)
    s.api.set("json", malicious_answer())
    s.pick()
    s.wait_state(".group")
    s.page.wait_for_timeout(300)
    check("aucun code exécuté", s.page.evaluate("window.__pwn === undefined"))
    check("aucun élément créé à partir de la réponse", s.count("#departures img, #departures script, #departures b") == 0)
    check("le texte est affiché tel quel", MARKUP in s.text(), s.text())
    check("couleur invalide ignorée, aucune requête externe", not [u for u in s.blocked if "evil" in u], s.blocked)
    colors = s.page.eval_on_selector_all("#departures .line-tag", "els => els.map(e => [e.style.backgroundColor, e.style.color, e.style.backgroundImage])")
    check("couleurs validées et texte lisible (blanc sur blanc corrigé)",
          all(bg != fg and not image for bg, fg, image in colors) and ["rgb(255, 255, 255)", "rgb(0, 0, 0)", ""] in colors, colors)
    check("textes très longs : pas de défilement horizontal à 360 px", s.page.evaluate("document.documentElement.scrollWidth") <= 360)
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


def scenario_search(browser, base, path):
    print("\n-- Recherche (identifiants numériques, arrêts de transport seulement)")
    s = Session(browser, base, path)
    p = s.page
    result = p.evaluate("""() => {
        const M = UCA_MOBILITY;
        return [M.getStopById("INCONNU"), M.getStopById(164), M.getStopById("164"), M.getStopById("camp").id,
                M.transitStops.every(s => ["bus", "tram", "mixte"].includes(s.type))];
    }""")
    check("identifiant inconnu ou numérique : pas de plantage", result == [None, None, None, "CAMP", True], result)
    for query in ("164", "dunant", "zzzz"):
        p.fill("#stopSearch", query)
        check(f"« {query} » : aucun parking ni vélo, message clair",
              s.count("#searchResults button") == 0 and "Aucun arrêt de bus ou de tram" in s.text("#searchCount"), s.text("#searchCount"))
    p.fill("#stopSearch", "110")
    check("recherche numérique par numéro de ligne", s.count("#searchResults button") > 0)
    shown = s.count("#searchResults button")
    total = int(s.text("#searchCount").split()[0])
    check("compteur de résultats cohérent", total >= shown and (total == shown or f"({shown} affichés)" in s.text("#searchCount")), s.text("#searchCount"))
    if total > shown:
        p.click("#searchMore")
        check("« Afficher plus » ajoute des arrêts", s.count("#searchResults button") > shown)
    p.fill("#stopSearch", "cezeau")
    check("recherche sans accents, passage surligné", s.count('#searchResults [data-stop="CAMP"]') == 1
          and p.locator("#searchResults mark").first.inner_text().lower() == "cézeau")
    s.api.set("json", [])
    p.focus('#searchResults [data-stop="CAMP"]')
    p.keyboard.press("Enter")
    s.wait_state('[data-state="empty"]')
    check("choix d'un résultat au clavier", "Cézeaux" in s.text("#stopName") and s.api.calls == ["CAMP"])
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


def scenario_stale(browser, base, path):
    print("\n-- Réponse en retard")
    s = Session(browser, base, path)
    s.api.set("json", [line("A", [departure("Direction récente", 5)])])
    s.api.by_stop["CAMP"] = ("hold", None)
    s.pick("CAMP")
    for _ in range(60):
        if s.api.held:
            break
        s.page.wait_for_timeout(100)
    check("première demande en attente", len(s.api.held) == 1)
    s.pick("CEPE")
    s.wait_state(".group")
    if s.api.held:
        s.api.fulfill(s.api.held[0], [line("A", [departure("Direction périmée", 2)])])
    s.page.wait_for_timeout(500)
    check("la réponse de l'ancien arrêt est ignorée",
          "Direction récente" in s.text() and "Direction périmée" not in s.text() and "Pellez" in s.text("#stopName"), s.text())
    s.close()


def scenario_favorites(browser, base, path):
    print("\n-- Favoris")
    s = Session(browser, base, path)
    s.api.set("json", normal_answer())
    s.page.focus('#campusList [data-stop="CEPE"]')
    s.page.keyboard.press("Enter")
    s.wait_state(".group")
    check("raccourci au clavier : le focus reste sur le bouton",
          s.page.evaluate("document.activeElement.dataset.stop") == "CEPE")
    s.page.click("#favToggle")
    check("favori ajouté", s.page.get_attribute("#favToggle", "aria-pressed") == "true" and s.count('#favList [data-stop="CEPE"]') == 1)
    s.api.calls.clear()
    s.page.reload()
    s.wait_state(".group")
    check("le favori s'affiche dès la réouverture", s.api.calls == ["CEPE"] and "Pellez" in s.text("#stopName"), s.api.calls)
    s.page.click("#favToggle")
    check("favori retiré", s.count("#favList button") == 0 and s.page.is_visible("#favEmpty"))
    s.close()
    for label, script in (
            ("contenu corrompu", "localStorage.setItem('uca_transport_favoris', '{oups')"),
            ("identifiants inconnus", "localStorage.setItem('uca_transport_favoris', JSON.stringify([164, null, {}, 'XXXX']))"),
            ("stockage refusé", "Object.defineProperty(window, 'localStorage', { get() { throw new Error('refusé'); } })")):
        s = Session(browser, base, path, init_script=script)
        s.api.set("json", [])
        s.pick()
        s.wait_state('[data-state="empty"]')
        s.page.click("#favToggle")
        check(f"{label} : la page reste utilisable", s.count('#favList [data-stop="CAMP"]') == 1
              and not [e for e in s.errors if "refusé" not in e], s.errors)
        s.close()


# Pont d'extension factice. « mauvaise fenêtre » répond depuis un cadre : la page doit l'ignorer.
BRIDGE = """
window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || d.source !== 'uca-site' || d.type !== 'UCA_T2C_DEPARTURES_REQUEST') return;
  const reply = { source: 'uca-extension', type: 'UCA_T2C_DEPARTURES_RESPONSE', reqId: d.reqId, res: { ok: true, data: [{
    route_short_name: 'A', route_type: 0, next_departures: [{ trip_headsign: 'Reponse du pont',
    theorical_departure_datetime: new Date(Date.now() + 300000).toISOString() }] }] } };
  if (MODE === 'same') { window.postMessage(reply, location.origin); return; }
  if (MODE === 'unsigned') { delete reply.source; window.postMessage(reply, location.origin); return; }
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const script = frame.contentDocument.createElement('script');
  script.textContent = 'parent.postMessage(' + JSON.stringify(reply) + ', "*")';
  frame.contentDocument.body.append(script);
});
"""


def scenario_messages(browser, base, path):
    print("\n-- Messages postMessage")
    for mode, label, accepted in (("same", "pont de la même fenêtre : accepté", True),
                                  ("frame", "message d'une autre fenêtre : ignoré", False),
                                  ("unsigned", "message sans signature du pont : ignoré", False)):
        s = Session(browser, base, path, init_script=f"if (window.top === window) {{ const MODE = '{mode}'; {BRIDGE} }}")
        s.api.set("abort")
        s.pick()
        s.wait_state(".group" if accepted else '[data-state="unavailable"]')
        check(label, ("Reponse du pont" in s.text()) == accepted, s.text())
        s.close()


def contrast(page, selector):
    return page.eval_on_selector(selector, """el => {
        const rgb = v => v.match(/[\\d.]+/g).slice(0, 3).map(Number);
        const lum = c => c.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        let node = el, bg = getComputedStyle(el).backgroundColor;
        while (bg === 'rgba(0, 0, 0, 0)' && node.parentElement) { node = node.parentElement; bg = getComputedStyle(node).backgroundColor; }
        const a = lum(rgb(getComputedStyle(el).color)), b = lum(rgb(bg));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }""")


def scenario_narrow(browser, base, path):
    print("\n-- Écran de 360 px, thèmes clair et sombre")
    for scheme in ("dark", "light"):
        s = Session(browser, base, path, width=360, scheme=scheme)
        p = s.page
        s.api.set("json", normal_answer())

        def fits(label):
            width = p.evaluate("document.documentElement.scrollWidth")
            check(f"{scheme} : {label} sans défilement horizontal", width <= 360, width)

        fits("accueil")
        s.pick()
        s.wait_state(".group")
        p.click("#favToggle")
        p.fill("#stopSearch", "clermont")
        p.click("details summary")
        fits("départs, recherche et aide")
        for selector in ("#searchResults mark", "#departures .badge.live", "#departures .badge.planned",
                         "#departures .clock", "#tab-departs", ".legend .badge.down", ".back-link, h1"):
            ratio = contrast(p, selector)
            check(f"{scheme} : contraste de {selector} >= 4,5", ratio >= 4.5, round(ratio, 2))
        p.click("#tab-lignes")
        p.click('#routesGrid [data-line="E1"]')
        fits("lignes")
        p.click("#tab-ailleurs")
        fits("trajets et train")
        s.api.set("abort")
        p.click("#tab-departs")
        p.click("#refreshBtn")
        s.wait_state('[data-state="unavailable"]')
        fits("indisponible")
        check(f"{scheme} : aucune erreur JavaScript", not s.errors, s.errors)
        s.close()


def main():
    data = load_data()
    static_checks()
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))   # port libre
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for label, path in PAGES.items():
                print(f"\n==================== Page : {label} ====================")
                scenario_start(browser, base, path, data)
                for scenario in (scenario_success, scenario_failure, scenario_empty, scenario_malicious, scenario_search,
                                 scenario_stale, scenario_favorites, scenario_messages, scenario_narrow):
                    scenario(browser, base, path)
            browser.close()
    finally:
        server.shutdown()
    print(f"\n{len(failures)} échec(s).")
    if failures:
        raise SystemExit("Échecs : " + " ; ".join(sorted(set(failures))))
    print("Transports : tous les contrôles passent.")


if __name__ == "__main__":
    main()
