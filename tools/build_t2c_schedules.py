"""Découpe les horaires officiels de T2C (GTFS, données ouvertes, Licence Ouverte) en petits fichiers lus par la page Transports.

  meta.json            lignes, directions, calendriers de service, liste des courses, période de validité
  stops/<CODE>.json    pour un arrêt : la version de meta.json, ses quais (« ids ») et ses passages
                       [secondes depuis minuit, numéro de course (, rang de l'arrêt si la course y passe plusieurs fois)]

Lancé chaque jour par .github/workflows/horaires-t2c.yml, qui publie le résultat sur la branche « gtfs-data ».
Source : transport.data.gouv.fr, jeu « Réseau urbain T2C » (Clermont Auvergne Métropole). Bibliothèque standard seulement.

Usage : python -I -X utf8 tools/build_t2c_schedules.py <dossier_de_sortie> [--zip fichier_gtfs.zip]
"""
import argparse
import collections
import csv
import hashlib
import io
import json
import re
import shutil
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

GTFS_URL = "https://www.data.gouv.fr/api/1/datasets/r/4e237a58-cd14-4746-b729-1337a40a8a7b"
SOURCE = "https://transport.data.gouv.fr/datasets/syndicat-mixte-des-transports-en-commun-de-lagglomeration-clermontoise-smtc-ac-reseau-t2c-gtfs-gtfs-rt"
LICENCE = "Licence Ouverte 2.0 (Etalab). Données : Clermont Auvergne Métropole, réseau T2C."
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
CODE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
MAX_ZIP = 40_000_000


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "horaires-t2c/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read(MAX_ZIP + 1)
    if len(data) > MAX_ZIP:
        raise SystemExit("fichier GTFS anormalement gros : abandon")
    return data


def seconds(text):
    h, m, s = (int(x) for x in text.split(":"))
    return h * 3600 + m * 60 + s


def runs_on(service, day):
    if not service or day in service["del"]:
        return False
    if day in service["add"]:
        return True
    if not service["from"] or not service["from"] <= day <= service["to"]:
        return False
    return service["days"][time.strptime(day, "%Y%m%d").tm_wday] == "1"


def build(blob, out: Path):
    z = zipfile.ZipFile(io.BytesIO(blob))

    def table(name, required=True):
        if name not in z.namelist():
            if required:
                raise SystemExit(f"{name} absent du GTFS : abandon")
            return []
        return csv.DictReader(io.TextIOWrapper(z.open(name), "utf-8-sig"))

    routes = {r["route_id"]: [r["route_short_name"] or r["route_id"], "tram" if r["route_type"] == "0" else "bus", r.get("route_color", ""), r.get("route_text_color", "")]
              for r in table("routes.txt")}
    services = {}
    for r in table("calendar.txt", required=False):
        services[r["service_id"]] = {"days": "".join(r[d] for d in DAYS), "from": r["start_date"], "to": r["end_date"], "add": [], "del": []}
    for r in table("calendar_dates.txt", required=False):
        s = services.setdefault(r["service_id"], {"days": "0000000", "from": "", "to": "", "add": [], "del": []})
        s["add" if r["exception_type"] == "1" else "del"].append(r["date"])

    headsigns, head_index, trips, trip_index = [], {}, [], {}
    trip_rows = {r["trip_id"]: r for r in table("trips.txt")}
    last_seq, rows = {}, []
    for r in table("stop_times.txt"):
        seq = int(r["stop_sequence"])
        if seq > last_seq.get(r["trip_id"], -1):
            last_seq[r["trip_id"]] = seq
        rows.append((r["trip_id"], r["stop_id"], seq, r.get("departure_time") or r.get("arrival_time") or "", r.get("pickup_type", ""), r.get("stop_headsign", "")))

    parent = {}
    for r in table("stops.txt"):
        parent[r["stop_id"]] = r.get("parent_station") or r["stop_id"]

    per_stop = collections.defaultdict(lambda: {"ids": set(), "rows": []})
    visits = collections.Counter((r[0], parent.get(r[1])) for r in rows)
    for trip_id, stop_id, seq, when, pickup, stop_head in rows:
        trip = trip_rows.get(trip_id)
        code = parent.get(stop_id)
        # le terminus (on ne peut que descendre) et les arrêts sans montée ne sont pas des départs
        if not trip or not code or not when or pickup == "1" or seq == last_seq[trip_id]:
            continue
        if trip_id not in trip_index:
            head = (stop_head or trip.get("trip_headsign") or "").strip()
            if head not in head_index:
                head_index[head] = len(headsigns); headsigns.append(head)
            trip_index[trip_id] = len(trips)
            trips.append([trip_id, trip["route_id"], head_index[head], trip["service_id"]])
        per_stop[code]["ids"].add(stop_id)
        # course en boucle : sans le rang, l'heure en direct d'un autre passage au même arrêt serait reprise
        extra = [seq] if visits[(trip_id, code)] > 1 else []
        per_stop[code]["rows"].append([seconds(when), trip_index[trip_id]] + extra)

    if len(per_stop) < 200 or len(trips) < 500:
        raise SystemExit(f"GTFS incomplet ({len(per_stop)} arrêts, {len(trips)} courses) : on garde la version précédente")
    dates = [d for s in services.values() for d in [s["from"], s["to"]] + s["add"] if d]
    # un fichier qui ne commence que plus tard (ou déjà fini) remplacerait des horaires valables par du vide
    soon = [time.strftime("%Y%m%d", time.gmtime(time.time() + n * 86400)) for n in (0, 1, 2)]
    used = {t[3] for t in trips}
    if not any(runs_on(services.get(s), d) for s in used for d in soon):
        raise SystemExit("aucune course dans les trois prochains jours : on garde la version précédente")

    if out.exists():
        # on n'efface qu'un dossier vide ou déjà fabriqué par ce script (jamais le dépôt par erreur)
        if any(out.iterdir()) and not ((out / "meta.json").is_file() and (out / "stops").is_dir() and not (out / ".git").exists()):
            raise SystemExit(f"{out} contient autre chose que des horaires : abandon")
        shutil.rmtree(out)
    (out / "stops").mkdir(parents=True)
    written = []
    version = hashlib.sha256(blob).hexdigest()[:16]
    for code, data in sorted(per_stop.items()):
        if not CODE.match(code):
            continue
        (out / "stops" / f"{code}.json").write_text(json.dumps({"version": version, "ids": sorted(data["ids"]), "rows": sorted(data["rows"])}, separators=(",", ":")), encoding="utf-8")
        written.append(code)
    meta = {"version": version, "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": SOURCE, "licence": LICENCE, "validFrom": min(dates), "validTo": max(dates),
            "routes": routes, "headsigns": headsigns, "services": services, "trips": trips, "stops": written}
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "README.md").write_text(f"# Horaires T2C découpés par arrêt (fichiers générés, ne pas modifier)\n\nSource : {SOURCE}\n\n{LICENCE}\n", encoding="utf-8")
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--zip")
    a = ap.parse_args()
    blob = Path(a.zip).read_bytes() if a.zip else download(GTFS_URL)
    meta = build(blob, Path(a.out))
    size = sum(p.stat().st_size for p in Path(a.out).rglob("*") if p.is_file())
    print(f"{len(meta['stops'])} arrêts, {len(meta['trips'])} courses, valables du {meta['validFrom']} au {meta['validTo']} ; {size // 1024} Ko")


if __name__ == "__main__":
    sys.exit(main())
