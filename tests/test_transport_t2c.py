"""Page Transports (site et copie embarquée dans l'APK) : aucune donnée inventée.

Aucun accès au réseau : les fichiers du dépôt sont servis sur un port local libre. Les adresses des horaires
(branche « gtfs-data ») et du flux temps réel reçoivent des réponses factices fournies par Playwright, fabriquées
ici (GTFS factice passé dans tools/build_t2c_schedules.py, flux GTFS-RT encodé à la main), tout le reste est bloqué.
Les contrôles de calcul passent par node (core/t2c_open.js chargé tel quel).

Usage : python -I -X utf8 tests/test_transport_t2c.py
"""
import base64
import copy
import csv
import io
import json
import re
import subprocess
import sys
import tempfile
import threading
import zipfile
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APK_DIR = "app/webview-app/app/src/main/assets/legacy-site"
PAGES = {"site": "transport.html", "APK": APK_DIR + "/transport.html"}
OFFICIAL = {"https://www.t2c.fr/", "https://www.sncf-connect.com/", "https://www.blablacar.fr/", "https://www.flixbus.fr/"}
OPEN_DATA = ("https://transport.data.gouv.fr/datasets/"
             "syndicat-mixte-des-transports-en-commun-de-lagglomeration-clermontoise-smtc-ac-reseau-t2c-gtfs-gtfs-rt")
SCHEDULE = "https://raw.githubusercontent.com/kiricoucou/uca-extension/gtfs-data/"
REALTIME = "https://proxy.transport.data.gouv.fr/resource/t2c-clermont-gtfs-rt-trip-update"

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


# --------------------------------------------------------------------------------------------------------------
# Horloge et fabrication des données factices
# --------------------------------------------------------------------------------------------------------------
def utc(text):
    return datetime.strptime(text, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)


def paris(text):
    """Heure de Paris en hiver (UTC+1), pour les scénarios de novembre 2026."""
    return utc(text) - timedelta(hours=1)


def ms(moment):
    return int(moment.timestamp() * 1000)


NOW = paris("2026-11-24 08:00:00")      # un mardi


def varint(n):
    if n < 0:
        n += 1 << 64
    out = bytearray()
    while True:
        byte, n = n & 0x7F, n >> 7
        out.append(byte | (0x80 if n else 0))
        if not n:
            return bytes(out)


def pb(field, value):
    """Un champ protobuf : entier (type 0) ou texte / octets / sous-message (type 2)."""
    if isinstance(value, int):
        return varint(field << 3) + varint(value)
    data = value.encode("utf-8") if isinstance(value, str) else value
    return varint(field << 3 | 2) + varint(len(data)) + data


def stop_update(stop_id, departure=None, arrival=None, delay=None, skipped=False, seq=None):
    out = b""
    if seq is not None:
        out += pb(1, seq)
    for field, moment in ((2, arrival), (3, departure)):
        if moment is not None:
            out += pb(field, pb(2, int(moment.timestamp())))
    if delay is not None:
        out += pb(3, pb(1, delay))
    out += pb(4, stop_id)
    if skipped:
        out += pb(5, 1)
    return out


def trip_update(trip_id, updates=(), canceled=False):
    trip = pb(1, trip_id) + (pb(4, 3) if canceled else b"")
    return pb(1, trip) + b"".join(pb(2, u) for u in updates)


def feed(timestamp, trips):
    header = pb(1, "2.0") + (pb(3, int(timestamp.timestamp())) if timestamp else b"")
    out = pb(1, header)
    for index, update in enumerate(trips):
        out += pb(2, pb(1, f"e{index}") + pb(3, update))
    return out


def standard_feed(timestamp=None, now=NOW):
    def t(minutes):
        return now + timedelta(minutes=minutes)
    return feed(timestamp or now - timedelta(seconds=20), [
        trip_update("T_LIVE", [stop_update("CAMP1", departure=t(7))]),
        trip_update("T_NOTIME", [stop_update("CAMP2", delay=-60)]),
        trip_update("T_CANCEL", canceled=True),
        trip_update("T_SKIP", [stop_update("CAMP1", skipped=True)]),
        trip_update("T_LATE", [stop_update("CAMP1", departure=t(3))]),
        trip_update("T_EARLYGONE", [stop_update("CAMP1", departure=t(-5))]),
        trip_update("T_FAR", [stop_update("CAMP1", departure=t(24 * 60 + 40))]),   # la même course, un autre jour
        trip_update("T_ELSEWHERE", [stop_update("AUTRE", departure=t(2))]),
    ])


DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def make_gtfs(filler_stations=210, filler_trips=520):
    calendar = [("WEEK", "1111100", "20260101", "20261231"), ("ALL", "1111111", "20260101", "20261231"),
                ("MON", "1000000", "20260101", "20261231"), ("WEEKDEL", "1111100", "20260101", "20261231")]
    calendar_dates = [("ONLYADD", "20261124", "1"), ("WEEKDEL", "20261124", "2")]
    routes = [("rA", "A", "0", "a81815", "ffffff"), ("rB", "B", "3", "005a9c", "ffffff"), ("rN", "N", "3", "", "")]
    stations = ["CAMP", "CEPE", "CARN", "UCAC", "NUIT", "CAL", "DSTS", "LOOP", "END"] + [f"F{i:03d}" for i in range(filler_stations)]
    quays = {"CAMP": ["CAMP1", "CAMP2"]}
    stops = []
    for code in stations:
        stops.append((code, ""))
        stops += [(q, code) for q in quays.get(code, [code + "1"])]
    stops += [("FACU", ""), ("FACU1", "FACU")]      # arrêt connu de la page mais sans aucun départ

    trips, times = [], []

    def trip(trip_id, route, head, service, calls):
        trips.append((trip_id, route, head, service))
        for seq, call in enumerate(calls, 1):
            stop_id, when, pickup = (call + ("",))[:3]
            times.append((trip_id, stop_id, str(seq), when, when, pickup))

    def simple(trip_id, quay, when, head="Les Vergnes", route="rA", service="WEEK"):
        trip(trip_id, route, head, service, [(quay, when), ("END1", "47:59:00")])

    simple("T_LIVE", "CAMP1", "08:04:00")
    simple("T_P1", "CAMP1", "08:12:00")
    simple("T_P2", "CAMP2", "08:20:00")
    simple("T_P3", "CAMP1", "08:28:00")
    simple("T_NOTIME", "CAMP2", "08:06:00", "La Pardieu Gare")
    simple("T_CANCEL", "CAMP1", "08:09:00", "Course annulée", "rB")
    simple("T_SKIP", "CAMP1", "08:10:00", "Arrêt non desservi", "rB")
    simple("T_LATE", "CAMP1", "07:40:00", "Retardataire", "rB")
    simple("T_EARLYGONE", "CAMP1", "08:02:00", "Parti en avance", "rB")
    simple("T_GONE", "CAMP1", "07:30:00", "Déjà parti", "rB")
    simple("T_FAR", "CAMP1", "08:40:00", "Navette", "rB")
    simple("T_LATER", "CAMP1", "12:30:00", "Bien plus tard", "rB")
    trip("T_ARRIVE", "rB", "Terminus ici", "WEEK", [("F0001", "07:50:00"), ("CAMP1", "08:11:00")])
    trip("T_DROPONLY", "rB", "Descente seule", "WEEK", [("CAMP1", "08:13:00", "1"), ("END1", "08:30:00")])
    simple("T_NIGHT", "CAMP1", "24:20:00", "Course de nuit", "rN", "MON")
    simple("T_CEPE", "CEPE1", "08:05:00", "Direction CEPE")
    simple("T_CARN", "CARN1", "15:00:00", "Cet après-midi")
    simple("T_UCAC", "UCAC1", "08:08:00", "Direction UCAC")
    simple("T_NUIT", "NUIT1", "24:20:00", "Nuit", "rN", "MON")
    simple("T_ADDED", "CAL1", "08:10:00", "Ajouté ce jour", service="ONLYADD")
    simple("T_REMOVED", "CAL1", "08:15:00", "Supprimé ce jour", service="WEEKDEL")
    simple("T_DST_MORNING", "DSTS1", "08:00:00", "Matin", service="ALL")
    simple("T_DST_NIGHT", "DSTS1", "26:30:00", "Nuit du changement", service="ALL")
    # course en boucle : elle part de l'arrêt LOOP et y revient (terminus)
    trip("T_LOOP", "rB", "Boucle", "WEEK", [("LOOP1", "07:50:00"), ("F0001", "08:10:00"), ("LOOP1", "08:30:00")])
    for i in range(filler_trips):
        simple(f"X{i}", f"F{i % filler_stations:03d}1" if filler_stations else "CAMP1", "13:00:00", "Remplissage", "rB")

    def table(header, rows):
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)
        return buf.getvalue()

    blob = io.BytesIO()
    with zipfile.ZipFile(blob, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("routes.txt", table(["route_id", "route_short_name", "route_type", "route_color", "route_text_color"], routes))
        z.writestr("calendar.txt", table(["service_id"] + DAY_NAMES + ["start_date", "end_date"],
                                         [[s, *days, a, b] for s, days, a, b in calendar]))
        z.writestr("calendar_dates.txt", table(["service_id", "date", "exception_type"], calendar_dates))
        z.writestr("trips.txt", table(["trip_id", "route_id", "trip_headsign", "service_id"], trips))
        z.writestr("stop_times.txt", table(["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time", "pickup_type"], times))
        z.writestr("stops.txt", table(["stop_id", "parent_station"], stops))
    return blob.getvalue()


class Schedule:
    """Les fichiers produits par le générateur, relus depuis le disque."""

    def __init__(self, folder):
        self.meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        self.stops = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in (folder / "stops").glob("*.json")}


def generator_checks(tmp):
    print("\n== Générateur d'horaires ==")
    blob = make_gtfs()
    source = tmp / "gtfs.zip"
    source.write_bytes(blob)
    out = tmp / "sortie"
    run = subprocess.run([sys.executable, "-I", "-X", "utf8", str(ROOT / "tools" / "build_t2c_schedules.py"), str(out), "--zip", str(source)],
                         capture_output=True, text=True, encoding="utf-8", timeout=120)
    check("le générateur produit les fichiers à partir d'un GTFS factice", run.returncode == 0, run.stderr[-800:])
    if run.returncode:
        raise SystemExit("générateur en échec")
    schedule = Schedule(out)
    meta = schedule.meta
    ids = [t[0] for t in meta["trips"]]
    check("meta.json : liste des arrêts = fichiers écrits", sorted(meta["stops"]) == sorted(schedule.stops), len(schedule.stops))
    check("arrêt sans départ (FACU) absent de la liste", "FACU" not in meta["stops"] and "END" not in meta["stops"])
    check("terminus et descente seule exclus", "T_ARRIVE" in ids and "T_DROPONLY" not in ids
          and not [r for r in schedule.stops["CAMP"]["rows"] if ids[r[1]] in ("T_ARRIVE", "T_DROPONLY")])
    check("quais réunis sous l'arrêt parent", schedule.stops["CAMP"]["ids"] == ["CAMP1", "CAMP2"], schedule.stops["CAMP"]["ids"])
    night = [r[0] for r in schedule.stops["NUIT"]["rows"]]
    check("heure « 24:20 » conservée au-delà de minuit", night == [24 * 3600 + 20 * 60], night)
    check("calendar_dates : ajout et retrait repris", meta["services"]["ONLYADD"]["add"] == ["20261124"]
          and meta["services"]["WEEKDEL"]["del"] == ["20261124"])
    check("période de validité", (meta["validFrom"], meta["validTo"]) == ("20260101", "20261231"), (meta["validFrom"], meta["validTo"]))
    check("chaque fichier d'arrêt porte la version de meta.json",
          all(s.get("version") == meta["version"] for s in schedule.stops.values()))

    sys.path.insert(0, str(ROOT / "tools"))
    sys.dont_write_bytecode = True
    import build_t2c_schedules as builder
    marker = out / "meta.json"
    before = marker.read_bytes()
    try:
        builder.build(make_gtfs(filler_stations=20, filler_trips=40), out)
        refused = False
    except SystemExit as error:
        refused = "incomplet" in str(error)
    check("GTFS incomplet refusé, version précédente conservée", refused and marker.read_bytes() == before)
    return schedule


# --------------------------------------------------------------------------------------------------------------
# Calculs (node)
# --------------------------------------------------------------------------------------------------------------
NODE_RUNNER = r"""
const T = require(process.argv[1]);
const input = JSON.parse(require("fs").readFileSync(0, "utf8"));
const out = input.runs.map((run) => {
  try {
    const file = input.stops[run.code];
    const feed = run.feed === null ? null : T.decodeFeed(new Uint8Array(Buffer.from(run.feed, "base64")), new Set(file.ids));
    const m = T.merge(input.meta, file, feed, run.now);
    return { realtime: m.realtime, departures: m.departures.map((d) => Object.assign({ trip: null }, d)) };
  } catch (e) { return { error: String(e.message || e) }; }
});
const origins = {};
(input.origins || []).forEach((k) => { origins[k] = T.serviceOrigin(k); });
process.stdout.write(JSON.stringify({ out, origins }));
"""


def node(schedule, runs, origins=()):
    payload = {"meta": schedule.meta, "stops": schedule.stops, "origins": list(origins),
               "runs": [{"code": c, "now": ms(n), "feed": None if f is None else base64.b64encode(f).decode()} for c, n, f in runs]}
    result = subprocess.run(["node", "-e", NODE_RUNNER, str(ROOT / "core" / "t2c_open.js")], input=json.dumps(payload),
                            capture_output=True, text=True, encoding="utf-8", timeout=60)
    if result.returncode:
        raise SystemExit("node : " + result.stderr[-1500:])
    return json.loads(result.stdout)


def logic_checks(schedule):
    print("\n== Calculs (node) ==")

    def summary(result):
        return [(d["destination"], d["time"], d["realtime"]) for d in result.get("departures", [])]

    def names(result):
        return [d["destination"] for d in result.get("departures", [])]

    def m(minutes):
        return ms(NOW + timedelta(minutes=minutes))

    full = standard_feed()
    cases = [
        ("CAMP", NOW, full),
        ("CAMP", NOW, None),
        ("CAMP", NOW, standard_feed(NOW - timedelta(minutes=6))),
        ("CAMP", NOW, standard_feed(NOW - timedelta(minutes=4))),
        ("NUIT", paris("2026-11-24 00:10:00"), None),
        ("NUIT", paris("2026-11-25 00:10:00"), None),
        ("CAL", NOW, None),
        ("CAL", NOW + timedelta(days=1), None),
        ("DSTS", utc("2026-03-29 05:30:00"), None),
        ("DSTS", utc("2026-10-25 06:30:00"), None),
        ("DSTS", utc("2026-10-25 00:00:00"), None),
        ("LOOP", NOW - timedelta(minutes=15), feed(NOW - timedelta(minutes=15, seconds=20), [trip_update("T_LOOP", [
            stop_update("LOOP1", departure=NOW - timedelta(minutes=7), seq=1),
            stop_update("LOOP1", arrival=NOW + timedelta(minutes=33), seq=3)])])),
        ("LOOP", NOW, feed(NOW - timedelta(seconds=20), [trip_update("T_LOOP", [
            stop_update("LOOP1", arrival=NOW + timedelta(minutes=33), seq=3)])])),
        ("CAMP", NOW, b""),
        ("CAMP", NOW, full[:-5]),
        ("CAMP", NOW, b"<html>oups</html>"),
        ("CAMP", NOW, b"\xff" * 40),
        ("CAMP", NOW, feed(None, [trip_update("T_CANCEL", canceled=True)])),
    ]
    days = ["20260328", "20260329", "20261025", "20261026", "20261124"]
    answer = node(schedule, cases, days)
    (live, planned, old, recent, night, night_after, cal, cal_next, spring, autumn, autumn_night,
     loop_start, loop_back, empty, truncated, html, garbage, no_time) = answer["out"]

    expected_origins = {"20260328": utc("2026-03-27 23:00:00"), "20260329": utc("2026-03-28 22:00:00"),
                        "20261025": utc("2026-10-24 23:00:00"), "20261026": utc("2026-10-25 23:00:00"),
                        "20261124": utc("2026-11-23 23:00:00")}
    check("serviceOrigin : « midi moins 12 h » à Paris, changements d'heure compris",
          answer["origins"] == {k: ms(v) for k, v in expected_origins.items()}, answer["origins"])

    by_name = {d["destination"]: d for d in live["departures"]}
    check("flux récent : temps réel actif", live["realtime"] is True)
    vergnes = [(d["time"], d["realtime"]) for d in live["departures"] if d["destination"] == "Les Vergnes"]
    check("« En direct » seulement pour l'heure présente dans le flux",
          vergnes == [(m(7), True), (m(12), False), (m(20), False), (m(28), False)], vergnes)
    check("heure prévue conservée à côté de l'heure en direct", live["departures"] and
          [d["plannedTime"] for d in live["departures"] if d["time"] == m(7)] == [m(4)])
    check("mise à jour sans heure (retard seul) : reste prévue", by_name.get("La Pardieu Gare", {}).get("realtime") is False
          and by_name.get("La Pardieu Gare", {}).get("time") == m(6), by_name.get("La Pardieu Gare"))
    check("course annulée retirée", "Course annulée" not in by_name, list(by_name))
    check("arrêt non desservi retiré", "Arrêt non desservi" not in by_name, list(by_name))
    check("véhicule en retard : encore affiché, en direct", by_name.get("Retardataire", {}).get("time") == m(3), by_name.get("Retardataire"))
    check("véhicule parti en avance : retiré", "Parti en avance" not in by_name)
    check("heure d'un autre jour pour la même course : ignorée", by_name.get("Navette", {}).get("time") == m(40)
          and by_name["Navette"]["realtime"] is False, by_name.get("Navette"))
    check("rien de parti, ni au-delà de 3 h, ni terminus", not {"Déjà parti", "Bien plus tard", "Terminus ici", "Descente seule", "Course de nuit"} & set(by_name), list(by_name))
    check("passages triés par heure", [d["time"] for d in live["departures"]] == sorted(d["time"] for d in live["departures"]))

    for label, result in (("sans flux", planned), ("flux de plus de 5 min", old), ("flux vide", empty), ("flux sans date", no_time)):
        found = names(result)
        check(f"{label} : horaires prévus seuls, aucun « En direct »", result.get("realtime") is False and found.count("Les Vergnes") == 4
              and not [d for d in result["departures"] if d["realtime"] or d["time"] != d["plannedTime"]]
              and "Course annulée" in found and "Arrêt non desservi" in found, result)
    check("flux de 4 minutes : encore « En direct »", recent.get("realtime") is True and any(d["realtime"] for d in recent["departures"]))
    for label, result in (("flux tronqué", truncated), ("page HTML à la place du flux", html), ("octets quelconques", garbage)):
        check(f"{label} : le décodage échoue (jamais de données partielles)", "error" in result, result)

    check("course de nuit « 24:20 » rattachée à la veille", summary(night) == [("Nuit", ms(paris("2026-11-24 00:20:00")), False)], night)
    check("course de nuit : absente quand la veille n'est pas un jour de service", names(night_after) == [], night_after)
    check("calendar_dates : course ajoutée présente, course retirée absente", names(cal) == ["Ajouté ce jour"], cal)
    check("calendar_dates : le lendemain, c'est l'inverse", names(cal_next) == ["Supprimé ce jour"], cal_next)
    check("passage à l'heure d'été : 08:00 de Paris = 06:00 UTC", summary(spring) == [("Matin", ms(utc("2026-03-29 06:00:00")), False)], spring)
    check("passage à l'heure d'hiver : 08:00 de Paris = 07:00 UTC", summary(autumn) == [("Matin", ms(utc("2026-10-25 07:00:00")), False)], autumn)
    check("nuit du changement d'heure : course de la veille bien placée",
          ("Nuit du changement", ms(utc("2026-10-25 00:30:00")), False) in summary(autumn_night), autumn_night)
    check("course en boucle : l'heure du départ vient du départ, pas du retour",
          summary(loop_start) == [("Boucle", m(-7), True)], loop_start)
    check("course en boucle déjà partie : le retour au terminus ne crée pas de départ", summary(loop_back) == [], loop_back)


# --------------------------------------------------------------------------------------------------------------
# Navigateur
# --------------------------------------------------------------------------------------------------------------
class Net:
    """Réponses factices des deux sources, modifiables par chaque scénario."""

    def __init__(self, schedule):
        self.meta = copy.deepcopy(schedule.meta)
        self.stops = copy.deepcopy(schedule.stops)
        self.feed = ("ok", standard_feed())
        self.override = {}      # nom de fichier -> (mode, contenu)
        self.requests, self.held = [], []

    @staticmethod
    def fulfill(route, body, status=200, kind="application/json"):
        route.fulfill(status=status, content_type=kind, headers={"Access-Control-Allow-Origin": "*"}, body=body)

    def handle(self, route):
        request = route.request
        url = request.url
        self.requests.append({"url": url, "method": request.method, "headers": request.all_headers(), "body": request.post_data})
        if url == REALTIME:
            mode, body = self.feed
            kind = "application/octet-stream"
        else:
            name = url[len(SCHEDULE):].split("?")[0]
            kind = "application/json"
            if name in self.override:
                mode, body = self.override[name]
            elif name == "meta.json":
                mode, body = "ok", json.dumps(self.meta)
            else:
                code = name[len("stops/"):-len(".json")]
                mode, body = ("ok", json.dumps(self.stops[code])) if code in self.stops else ("status", 404)
        if mode == "hold":
            self.held.append(route)
        elif mode == "abort":
            route.abort()
        elif mode == "status":
            self.fulfill(route, "", body, kind)
        else:
            self.fulfill(route, body, 200, kind)

    def stop_calls(self):
        return [urlsplit(r["url"]).path.rsplit("/", 1)[1][:-5] for r in self.requests if "/gtfs-data/stops/" in r["url"]]

    def feed_calls(self):
        return [r for r in self.requests if r["url"].startswith("https://proxy.transport.data.gouv.fr")]


class QuietHandler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{".js": "text/javascript", ".html": "text/html"})

    def log_message(self, *args):
        pass


class Session:
    def __init__(self, browser, base, path, schedule, width=900, scheme="dark", init_script=None, now=NOW):
        self.net = Net(schedule)
        self.now = now
        if now != NOW:
            self.net.feed = ("ok", standard_feed(now=now))
        self.blocked, self.errors, self.missing = [], [], []
        self.base, self.url = base, base + "/" + path
        self.context = browser.new_context(viewport={"width": width, "height": 800}, color_scheme=scheme,
                                           service_workers="block", locale="fr-FR", timezone_id="Europe/Paris")
        self.context.route("**/*", self.route)
        self.context.clock.set_fixed_time(now)     # Date.now() figé ; les minuteries restent réelles
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
        elif url.startswith(SCHEDULE) or url.startswith("https://proxy.transport.data.gouv.fr/"):
            self.net.handle(route)
        else:
            self.blocked.append(url)
            route.abort()

    def later(self, **delta):
        self.now += timedelta(**delta)
        self.context.clock.set_fixed_time(self.now)

    def pick(self, stop="CAMP"):
        self.page.click(f'#campusList [data-stop="{stop}"]')

    def refresh(self):
        self.page.evaluate("document.getElementById('announce').textContent = ''")
        self.page.click("#refreshBtn")
        self.page.wait_for_function("document.getElementById('announce').textContent !== ''")

    def wait_state(self, selector):
        self.page.wait_for_selector("#departures " + selector)

    def wait_held(self):
        for _ in range(60):
            if self.net.held:
                return True
            self.page.wait_for_timeout(100)
        return False

    def text(self, selector="#departures"):
        return self.page.inner_text(selector)

    def count(self, selector):
        return self.page.locator(selector).count()

    def group(self, text):
        return self.page.locator("#departures .group", has_text=text)

    def close(self):
        self.context.close()


def static_checks():
    print("\n== Fichiers ==")
    page = read("transport.html") + read("core/transport-page.js")
    modules = read("core/mobility.js") + read("core/t2c_open.js")
    check("copie APK de la page identique au site (hors blocs réservés au site)", read(PAGES["APK"]) == apk_version(read("transport.html")))
    for name in ("core/mobility.js", "core/t2c_data.js", "core/t2c_open.js", "core/transport-page.js"):
        check(f"copie APK de {name} identique", (ROOT / APK_DIR / name).is_file() and read(name) == read(APK_DIR + "/" + name))
    for banned in ("generateScheduledDepartures", "getRealtimeStatus", "findRoutes", "Marc D", "FlixBus N", "TER 873160"):
        check(f"plus de donnée inventée : « {banned} » absent", banned not in page and banned not in modules)
    check("plus aucun appel à api.t2c.fr", "api.t2c.fr" not in page + modules)
    check("aucun innerHTML / insertAdjacentHTML dans la page et les modules",
          not re.search(r"innerHTML|insertAdjacentHTML|outerHTML|document\.write|\beval\(", page + modules))
    links = set(re.findall(r'href="(https?://[^"]+)"', page))
    check("liens externes : les quatre pages d'accueil officielles et le jeu de données ouvertes", links == OFFICIAL | {OPEN_DATA}, links)
    for path in PAGES.values():
        html = read(path)
        check(f"{path} : t2c_open.js chargé avant mobility.js", 0 < html.find("core/t2c_open.js") < html.find("core/mobility.js"))


def scenario_start(browser, base, path, schedule, data):
    print("\n-- Ouverture, compteurs, raccourcis, onglets")
    s = Session(browser, base, path, schedule)
    p = s.page
    transit = [x for x in data["stops"] if x["type"] in ("bus", "tram", "mixte")]
    check("aucune erreur JavaScript", not s.errors, s.errors)
    check("tous les fichiers locaux sont trouvés", not s.missing, s.missing)
    check("aucune requête externe avant le choix d'un arrêt", not s.net.requests and not s.blocked, (s.net.requests, s.blocked))
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
    p.click('#lineStops [data-stop="CAMP"]')
    s.wait_state(".group")
    check("un arrêt de ligne ouvre ses départs", p.is_visible("#pane-departs") and s.net.stop_calls() == ["CAMP"], s.net.stop_calls())
    p.click("#tab-ailleurs")
    hrefs = set(p.eval_on_selector_all("#pane-ailleurs a", "els => els.map(e => e.href)"))
    check("trajets et train : liens officiels uniquement", hrefs == OFFICIAL, hrefs)
    check("aucune requête hors du serveur local et des deux sources factices", not s.blocked, s.blocked)
    s.close()


def scenario_success(browser, base, path, schedule):
    print("\n-- Réponse normale : regroupement, mentions, confidentialité")
    s = Session(browser, base, path, schedule)
    s.pick()
    s.wait_state(".group")
    shown = s.text()
    check("un groupe par ligne et direction", s.count("#departures .group") == 4, shown)
    vergnes = s.group("Les Vergnes")
    check("au plus 3 passages par direction", vergnes.locator(".time").count() == 3)
    first = vergnes.locator(".time").first.inner_text()
    check("« En direct » avec heure en temps réel et écart", "En direct" in first and "dans 7 min" in first and "08:07" in first
          and "3 min après" in first, first)
    check("« Prévu » pour l'horaire théorique", vergnes.locator(".badge.planned").count() == 2 and vergnes.locator(".badge.live").count() == 1)
    pardieu = s.group("La Pardieu Gare").inner_text()
    check("mise à jour sans heure : reste « Prévu »", "Prévu" in pardieu and "En direct" not in pardieu, pardieu)
    check("course annulée et arrêt non desservi absents", "Course annulée" not in shown and "Arrêt non desservi" not in shown, shown)
    check("heure d'actualisation et mention du temps réel",
          s.text("#fetchTime") == "Actualisé à 08:00:00 · temps réel officiel T2C.", s.text("#fetchTime"))

    version = schedule.meta["version"]
    expected = {SCHEDULE + "meta.json", f"{SCHEDULE}stops/CAMP.json?v={version}", REALTIME}
    urls = [r["url"] for r in s.net.requests]
    check("seules requêtes : meta.json, l'arrêt consulté, le flux", set(urls) == expected and len(urls) == 3, urls)
    s.later(seconds=31)
    s.refresh()
    realtime = s.net.feed_calls()
    check("le flux est redemandé après 30 s, les horaires restent en mémoire", len(realtime) == 2 and s.net.stop_calls() == ["CAMP"])
    leaks = [r for r in realtime if r["url"] != REALTIME or r["method"] != "GET" or r["body"]
             or "referer" in r["headers"] or "cookie" in r["headers"]
             or any("CAMP" in v for v in r["headers"].values())]
    check("aucune requête vers le serveur temps réel ne porte le code de l'arrêt", realtime and not leaks, leaks)
    check("aucun référent ni cookie envoyé aux sources", not [r for r in s.net.requests
          if "referer" in r["headers"] or "cookie" in r["headers"]])

    s.net.feed = ("abort", None)
    s.later(seconds=31)
    s.refresh()
    check("flux perdu à l'actualisation : plus aucun « En direct », heures prévues", s.count("#departures .badge.live") == 0
          and s.count("#departures .badge.planned") > 0 and "temps réel indisponible" in s.text("#fetchTime"), s.text())
    s.net.override["meta.json"] = ("abort", None)
    s.later(minutes=61)
    s.refresh()
    s.wait_state('[data-state="unavailable"]')
    check("horaires devenus illisibles : les anciens passages disparaissent", s.count("#departures .time") == 0)
    check("aucune erreur JavaScript", not s.errors, s.errors)
    check("aucune autre requête externe", not s.blocked, s.blocked)
    s.close()


def scenario_feed_down(browser, base, path, schedule):
    print("\n-- Temps réel absent : horaires prévus et avertissement")
    full = standard_feed()
    cases = [("flux coupé", ("abort", None)), ("flux en erreur 500", ("status", 500)), ("flux tronqué", ("ok", full[:-5])),
             ("page HTML à la place du flux", ("ok", b"<html>oups</html>")), ("octets quelconques", ("ok", b"\xff" * 40)),
             ("flux vide", ("ok", b"")), ("flux de plus de 5 min", ("ok", standard_feed(NOW - timedelta(minutes=6))))]
    for label, answer in cases:
        s = Session(browser, base, path, schedule)
        s.net.feed = answer
        s.pick()
        s.wait_state(".group")
        vergnes = s.group("Les Vergnes").inner_text()
        check(f"{label} : heures prévues, aucun « En direct »", "08:04" in vergnes and "08:07" not in vergnes
              and s.count("#departures .badge.live") == 0 and s.count("#departures .badge.planned") == s.count("#departures .time") > 0, s.text())
        check(f"{label} : avertissement affiché", "temps réel indisponible pour le moment : horaires prévus uniquement" in s.text("#fetchTime"),
              s.text("#fetchTime"))
        check(f"{label} : aucune erreur JavaScript", not s.errors, s.errors)
        s.close()


def scenario_night(browser, base, path, schedule):
    print("\n-- Course de nuit (« 24:20 » de la veille)")
    s = Session(browser, base, path, schedule, now=paris("2026-11-24 00:10:00"))
    s.net.feed = ("abort", None)
    s.pick()
    s.wait_state(".group")
    content = s.text()
    check("passage de 00:20 affiché une seule fois", "Course de nuit" in content and "00:20" in content and "dans 10 min" in content
          and s.count("#departures .time") == 1, content)
    s.close()


def scenario_failure(browser, base, path, schedule):
    print("\n-- Horaires illisibles : rien d'inventé")
    bad_meta = dict(schedule.meta)
    del bad_meta["routes"]
    mixed = dict(schedule.stops["CAMP"], version="une-autre-version")
    cases = [("réseau coupé", "meta.json", ("abort", None)), ("erreur 500", "meta.json", ("status", 500)),
             ("meta illisible", "meta.json", ("ok", "<html>oups</html>")), ("meta au mauvais format", "meta.json", ("ok", '{"message":"x"}')),
             ("meta incomplet", "meta.json", ("ok", json.dumps(bad_meta))),
             ("fichier d'arrêt absent", "stops/CAMP.json", ("status", 404)),
             ("fichier d'arrêt illisible", "stops/CAMP.json", ("ok", "{oups")),
             ("fichier d'arrêt au mauvais format", "stops/CAMP.json", ("ok", "[1,2]")),
             ("fichier d'arrêt d'une autre version que meta.json", "stops/CAMP.json", ("ok", json.dumps(mixed)))]

    def nothing(s, label, message):
        content = s.text()
        check(f"{label} : « Indisponible » sans ligne ni horaire",
              "Indisponible" in content and s.count("#departures .line-tag") == 0 and s.count("#departures .time") == 0
              and not re.search(r"dans \d+ min|En direct|Prévu\b|Aucun passage annoncé|\d\d:\d\d", content), content)
        check(f"{label} : explication adaptée", message in content, content)

    for label, name, answer in cases:
        s = Session(browser, base, path, schedule)
        s.net.override[name] = answer
        s.pick()
        s.wait_state('[data-state="unavailable"], #departures .group')
        nothing(s, label, "Vérifie ta connexion Internet")
        check(f"{label} : aucune erreur JavaScript", not s.errors, s.errors)
        s.close()

    s = Session(browser, base, path, schedule)
    s.pick("FACU")
    s.wait_state('[data-state="unavailable"]')
    nothing(s, "arrêt sans horaire officiel", "T2C ne publie pas d'horaire officiel pour cet arrêt.")
    check("arrêt sans horaire : seul meta.json est demandé", [r["url"] for r in s.net.requests] == [SCHEDULE + "meta.json"])
    s.close()

    s = Session(browser, base, path, schedule)
    s.net.meta["validTo"] = "20261123"
    s.pick()
    s.wait_state('[data-state="unavailable"]')
    nothing(s, "horaires périmés", "périmés")
    check("horaires périmés : ni fichier d'arrêt ni flux demandés", len(s.net.requests) == 1, [r["url"] for r in s.net.requests])
    s.close()

    s = Session(browser, base, path, schedule)
    s.net.meta["validTo"] = "20261124"
    s.pick()
    s.wait_state('.group, [data-state="unavailable"]')
    check("dernier jour de validité : horaires affichés", s.count("#departures .time") > 0, s.text())
    s.close()

    s = Session(browser, base, path, schedule)
    s.net.override["stops/CAMP.json"] = ("ok", json.dumps(mixed))
    s.pick()
    s.wait_state('[data-state="unavailable"], #departures .group')
    s.net.override.clear()
    s.net.requests.clear()
    s.page.click("#retryBtn")
    s.wait_state('.group, [data-state="empty"]')
    check("versions mélangées : Réessayer relit meta.json puis affiche", s.net.requests[0]["url"] == SCHEDULE + "meta.json", s.net.requests[0]["url"])
    s.close()

    s = Session(browser, base, path, schedule)
    s.net.override["meta.json"] = ("abort", None)
    s.pick()
    s.wait_state('[data-state="unavailable"]')
    check("horaires en échec : le flux n'est pas demandé", not s.net.feed_calls())
    check("bouton Réessayer et lien officiel",
          s.page.is_visible("#retryBtn") and s.page.get_attribute("#departures a", "href") == "https://www.t2c.fr/")
    check("heure de la tentative affichée", s.text("#fetchTime") == "Dernière tentative à 08:00:00.", s.text("#fetchTime"))
    s.net.override.clear()
    s.page.focus("#retryBtn")
    s.page.keyboard.press("Enter")
    s.wait_state(".group")
    check("après Réessayer, le focus clavier reste sur l'arrêt", s.page.evaluate("document.activeElement.id") == "stopName")
    check("Réessayer relance la demande", s.count("#departures .group") == 4)
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


def scenario_empty(browser, base, path, schedule):
    print("\n-- Aucun passage prévu")
    s = Session(browser, base, path, schedule)
    s.pick("CARN")
    s.wait_state('[data-state="empty"]')
    check("prochain passage dans plus de 3 h : « Aucun passage annoncé »", "Aucun passage annoncé" in s.text()
          and "3 prochaines heures" in s.text() and s.count("#departures .line-tag") == 0 and s.count("#retryBtn") == 0, s.text())
    s.net.feed = ("abort", None)
    s.later(seconds=31)
    s.refresh()
    check("liste vide sans temps réel : l'avertissement reste", "temps réel indisponible" in s.text("#fetchTime"))
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


MARKUP = '<img src=x onerror="window.__pwn=1">'


def scenario_malicious(browser, base, path, schedule):
    print("\n-- HTML malveillant dans les horaires")
    s = Session(browser, base, path, schedule, width=360)
    meta = s.net.meta
    trips = {t[0]: t for t in meta["trips"]}

    def head(trip_id, text):
        trips[trip_id][2] = len(meta["headsigns"])
        meta["headsigns"].append(text)

    head("T_LIVE", MARKUP)
    head("T_P1", "<script>window.__pwn=2</script>")
    head("T_P2", "X" * 200)
    meta["routes"]["rA"] = ["<b onmouseover=1>", "<img>", "fff;background-image:url(https://evil.example/c)", '"><script>window.__pwn=3</script>']
    meta["routes"]["rB"] = ["B", "bus", "ffffff", "ffffff"]
    s.pick()
    s.wait_state(".group")
    s.page.wait_for_timeout(300)
    check("aucun code exécuté", s.page.evaluate("window.__pwn === undefined"))
    check("aucun élément créé à partir des données", s.count("#departures img, #departures script, #departures b") == 0)
    check("le texte est affiché tel quel", MARKUP[:60] in s.text(), s.text())
    check("couleur invalide ignorée, aucune requête externe", not s.blocked, s.blocked)
    colors = s.page.eval_on_selector_all("#departures .line-tag", "els => els.map(e => [e.style.backgroundColor, e.style.color, e.style.backgroundImage])")
    check("couleurs validées et texte lisible (blanc sur blanc corrigé)",
          all(bg != fg and not image for bg, fg, image in colors) and ["rgb(255, 255, 255)", "rgb(0, 0, 0)", ""] in colors, colors)
    check("textes très longs : pas de défilement horizontal à 360 px", s.page.evaluate("document.documentElement.scrollWidth") <= 360)
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


def scenario_search(browser, base, path, schedule):
    print("\n-- Recherche (identifiants numériques, arrêts de transport seulement)")
    s = Session(browser, base, path, schedule)
    p = s.page
    result = p.evaluate("""() => {
        const M = UCA_MOBILITY;
        return [M.getStopById("INCONNU"), M.getStopById(164), M.getStopById("164"), M.getStopById("camp").id,
                M.transitStops.every(s => ["bus", "tram", "mixte"].includes(s.type))];
    }""")
    check("identifiant inconnu ou numérique : pas de plantage", result == [None, None, None, "CAMP", True], result)
    states = p.evaluate("async () => (await Promise.all([164, 'XXXX', null].map(UCA_MOBILITY.fetchDepartures))).map(r => r.state)")
    check("passages d'un identifiant inconnu : indisponible, sans requête", states == ["unavailable"] * 3 and not s.net.requests,
          (states, s.net.requests))
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
    check("la recherche n'envoie rien", not s.net.requests and not s.blocked)
    p.focus('#searchResults [data-stop="CAMP"]')
    p.keyboard.press("Enter")
    s.wait_state(".group")
    check("choix d'un résultat au clavier", "Cézeaux" in s.text("#stopName") and s.net.stop_calls() == ["CAMP"])
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


def scenario_stale(browser, base, path, schedule):
    print("\n-- Réponse en retard")
    s = Session(browser, base, path, schedule)
    s.net.override["stops/CAMP.json"] = ("hold", None)
    s.pick("CAMP")
    check("première demande en attente", s.wait_held() and len(s.net.held) == 1)
    s.pick("CEPE")
    s.wait_state(".group")
    if s.net.held:
        s.net.fulfill(s.net.held[0], json.dumps(s.net.stops["CAMP"]))
    s.page.wait_for_timeout(500)
    check("la réponse de l'ancien arrêt est ignorée",
          "Direction CEPE" in s.text() and "Les Vergnes" not in s.text() and "Pellez" in s.text("#stopName"), s.text())
    check("aucune erreur JavaScript", not s.errors, s.errors)
    s.close()


def scenario_favorites(browser, base, path, schedule):
    print("\n-- Favoris")
    s = Session(browser, base, path, schedule)
    s.page.focus('#campusList [data-stop="CEPE"]')
    s.page.keyboard.press("Enter")
    s.wait_state(".group")
    check("raccourci au clavier : le focus reste sur le bouton",
          s.page.evaluate("document.activeElement.dataset.stop") == "CEPE")
    s.page.click("#favToggle")
    check("favori ajouté", s.page.get_attribute("#favToggle", "aria-pressed") == "true" and s.count('#favList [data-stop="CEPE"]') == 1)
    s.net.requests.clear()
    s.page.reload()
    s.wait_state(".group")
    check("le favori s'affiche dès la réouverture", s.net.stop_calls() == ["CEPE"] and "Pellez" in s.text("#stopName"), s.net.stop_calls())
    s.page.click("#favToggle")
    check("favori retiré", s.count("#favList button") == 0 and s.page.is_visible("#favEmpty"))
    s.close()
    for label, script in (
            ("contenu corrompu", "localStorage.setItem('uca_transport_favoris', '{oups')"),
            ("identifiants inconnus", "localStorage.setItem('uca_transport_favoris', JSON.stringify([164, null, {}, 'XXXX']))"),
            ("stockage refusé", "Object.defineProperty(window, 'localStorage', { get() { throw new Error('refusé'); } })")):
        s = Session(browser, base, path, schedule, init_script=script)
        s.pick()
        s.wait_state(".group")
        s.page.click("#favToggle")
        check(f"{label} : la page reste utilisable", s.count('#favList [data-stop="CAMP"]') == 1
              and not [e for e in s.errors if "refusé" not in e], s.errors)
        s.close()


# Message forgé comme celui de l'ancien pont d'extension : la page ne doit plus en tenir compte.
FORGED = """
window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || d.source !== 'uca-site') return;
  window.__asked = true;
});
setInterval(() => window.postMessage({ source: 'uca-extension', type: 'UCA_T2C_DEPARTURES_RESPONSE', reqId: 'x',
  res: { ok: true, data: [{ route_short_name: 'A', next_departures: [{ trip_headsign: 'Reponse du pont',
  theorical_departure_datetime: new Date(Date.now() + 300000).toISOString() }] }] } }, location.origin), 50);
"""


def scenario_messages(browser, base, path, schedule):
    print("\n-- Messages postMessage")
    s = Session(browser, base, path, schedule, init_script=FORGED)
    s.net.override["meta.json"] = ("abort", None)
    s.pick()
    s.wait_state('[data-state="unavailable"]')
    s.page.wait_for_timeout(300)
    check("message forgé ignoré, aucune demande envoyée à un pont",
          "Reponse du pont" not in s.text() and s.page.evaluate("window.__asked === undefined"), s.text())
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


def scenario_narrow(browser, base, path, schedule):
    print("\n-- Écran de 360 px, thèmes clair et sombre")
    for scheme in ("dark", "light"):
        s = Session(browser, base, path, schedule, width=360, scheme=scheme)
        p = s.page

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
                         "#departures .clock", "#fetchTime", "#tab-departs", ".legend .badge.down", ".back-link, h1"):
            ratio = contrast(p, selector)
            check(f"{scheme} : contraste de {selector} >= 4,5", ratio >= 4.5, round(ratio, 2))
        p.click("#tab-lignes")
        p.click('#routesGrid [data-line="E1"]')
        fits("lignes")
        p.click("#tab-ailleurs")
        fits("trajets et train")
        p.click("#tab-departs")
        s.net.feed = ("abort", None)
        s.later(seconds=31)
        s.refresh()
        fits("sans temps réel")
        s.net.override["meta.json"] = ("abort", None)
        s.later(minutes=61)
        s.refresh()
        s.wait_state('[data-state="unavailable"]')
        fits("indisponible")
        check(f"{scheme} : contraste de la mention Indisponible >= 4,5", contrast(p, "#departures .badge.down") >= 4.5)
        check(f"{scheme} : aucune erreur JavaScript", not s.errors, s.errors)
        s.close()


def main():
    data = load_data()
    static_checks()
    with tempfile.TemporaryDirectory() as tmp:
        schedule = generator_checks(Path(tmp))
    logic_checks(schedule)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))   # port libre
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for label, path in PAGES.items():
                print(f"\n==================== Page : {label} ====================")
                scenario_start(browser, base, path, schedule, data)
                for scenario in (scenario_success, scenario_feed_down, scenario_night, scenario_failure, scenario_empty,
                                 scenario_malicious, scenario_search, scenario_stale, scenario_favorites, scenario_messages,
                                 scenario_narrow):
                    scenario(browser, base, path, schedule)
            browser.close()
    finally:
        server.shutdown()
    print(f"\n{len(failures)} échec(s).")
    if failures:
        raise SystemExit("Échecs : " + " ; ".join(sorted(set(failures))))
    print("Transports : tous les contrôles passent.")


if __name__ == "__main__":
    main()
