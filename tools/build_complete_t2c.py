import urllib.request
import json
import datetime
import time
import os
import sys

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

def fetch_json(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))

def build_complete():
    print("1. Fetching all routes...")
    routes_raw = fetch_json("https://api.t2c.fr/siv/routes")
    print(f"   Total routes: {len(routes_raw)}")

    print("2. Fetching all POIs...")
    poi_res = fetch_json("https://api.t2c.fr/siv/poi")
    pois_raw = poi_res.get("data", [])
    print(f"   Total POIs: {len(pois_raw)}")

    print("3. Fetching all stops...")
    stops_raw = fetch_json("https://api.t2c.fr/siv/stops")
    print(f"   Total stops: {len(stops_raw)}")

    # Common cities in Clermont Métropole
    common_cities = [
        "Clermont-Ferrand", "Aubière", "Beaumont", "Chamalières",
        "Cournon-d'Auvergne", "Cournon", "Royat", "Cébazat", "Gerzat",
        "Durtol", "Lempdes", "Pont-du-Château", "Romagnat", "Ceyrat",
        "Pérignat-lès-Sarliève", "Pérignat-ès-Allier", "Blanzat",
        "Châteaugay", "Nohanent", "Orcines", "Aulnat", "Le Cendre",
        "Mur-sur-Allier", "Chappes", "Malintrat", "Les Martres d'Artière",
        "Saint-Genès-Champanelle", "Riom", "Durtol", "Sayat"
    ]

    stops_list = []
    seen_stop_ids = set()

    for p in pois_raw:
        pid = p.get("id")
        if not pid or pid in seen_stop_ids:
            continue
        seen_stop_ids.add(pid)

        raw_name = p.get("name", "").strip()
        city = "Clermont-Ferrand"
        display_name = raw_name
        for c in common_cities:
            if raw_name.startswith(c + " "):
                city = c
                display_name = raw_name[len(c):].strip()
                break

        routes_connected = []
        for r in p.get("routes", []):
            sn = r.get("route_short_name") or r.get("route_id")
            if sn and sn not in routes_connected:
                routes_connected.append(sn)

        ptype = p.get("type", "bus")
        if "A" in routes_connected:
            ptype = "mixte" if len(routes_connected) > 1 else "tram"
        elif ptype == "tram":
            ptype = "tram"

        # Campus check
        is_campus = any(k in raw_name.lower() for k in ["cézeaux", "cezeaux", "universit", "dunant", "gergovia", "uca", "faculté", "fac"])

        stops_list.append({
            "id": pid,
            "name": raw_name,
            "shortName": display_name,
            "city": city,
            "type": ptype,
            "campus": is_campus,
            "lat": p.get("latitude"),
            "lon": p.get("longitude"),
            "lines": routes_connected
        })

    # Add stops from /siv/stops not in POIs
    for s in stops_raw:
        sid = s.get("stop_id")
        if sid and sid not in seen_stop_ids:
            seen_stop_ids.add(sid)
            raw_name = s.get("stop_name", "").strip()
            city = "Clermont-Ferrand"
            display_name = raw_name
            for c in common_cities:
                if raw_name.startswith(c + " "):
                    city = c
                    display_name = raw_name[len(c):].strip()
                    break
            is_campus = any(k in raw_name.lower() for k in ["cézeaux", "cezeaux", "universit", "dunant", "gergovia", "uca", "faculté", "fac"])
            stops_list.append({
                "id": sid,
                "name": raw_name,
                "shortName": display_name,
                "city": city,
                "type": "bus",
                "campus": is_campus,
                "lat": float(s.get("stop_lat", 0)) if s.get("stop_lat") else None,
                "lon": float(s.get("stop_lon", 0)) if s.get("stop_lon") else None,
                "lines": []
            })

    # Add regional hubs for multimodal itineraries
    regional_hubs = [
        {"id": "paris_bercy", "name": "Paris Bercy-Bourgogne", "shortName": "Paris Bercy", "city": "Paris", "type": "train", "campus": False, "lines": ["SNCF", "FlixBus"], "lat": 48.839, "lon": 2.378},
        {"id": "lyon_partdieu", "name": "Lyon Part-Dieu", "shortName": "Lyon Part-Dieu", "city": "Lyon", "type": "train", "campus": False, "lines": ["TER", "TGV"], "lat": 45.760, "lon": 4.860},
        {"id": "lyon_perrache", "name": "Lyon Perrache", "shortName": "Lyon Perrache", "city": "Lyon", "type": "train", "campus": False, "lines": ["TER", "FlixBus"], "lat": 45.748, "lon": 4.826},
        {"id": "riom_gare", "name": "Gare de Riom - Châtel-Guyon", "shortName": "Gare de Riom", "city": "Riom", "type": "train", "campus": False, "lines": ["TER", "P75"], "lat": 45.890, "lon": 3.120},
        {"id": "vichy_gare", "name": "Gare de Vichy", "shortName": "Gare de Vichy", "city": "Vichy", "type": "train", "campus": False, "lines": ["TER", "Intercités"], "lat": 46.126, "lon": 3.430},
        {"id": "issoire_gare", "name": "Gare d'Issoire", "shortName": "Gare d'Issoire", "city": "Issoire", "type": "train", "campus": False, "lines": ["TER"], "lat": 45.545, "lon": 3.253}
    ]
    for rh in regional_hubs:
        if rh["id"] not in seen_stop_ids:
            stops_list.append(rh)

    print(f"4. Total combined stops: {len(stops_list)}")

    # 5. Harvest ordered line stops
    print("5. Harvesting linear stops from live departures at major hubs...")
    now_gmt = datetime.datetime.now(datetime.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
    hubs = ["JAUD", "GASN", "CARN", "LYLA", "PAGA", "DEMO", "CHAM", "PMAI", "BALL", "ROPA", "COAL", "DUCI", "CAMP", "CEPE", "FACU", "1MAI", "GAR2"]
    
    linear_lines = {}
    for hub in hubs:
        url = f"https://api.t2c.fr/siv/stops/{hub}/departures?dateTime={urllib.parse.quote(now_gmt)}"
        try:
            req = urllib.request.Request(url, headers=headers)
            deps = json.loads(urllib.request.urlopen(req, timeout=8).read().decode("utf-8"))
            for d in deps:
                sn = d.get("route_short_name")
                stops = d.get("stops", [])
                if sn and stops and (sn not in linear_lines or len(stops) > len(linear_lines[sn])):
                    linear_lines[sn] = [
                        {
                            "stopId": s.get("parent") or s.get("id"),
                            "name": s.get("name"),
                            "lat": float(s.get("lat")) if s.get("lat") else None,
                            "lon": float(s.get("lon")) if s.get("lon") else None
                        }
                        for s in stops
                    ]
        except Exception:
            pass

    print(f"   Collected linear paths for {len(linear_lines)} routes.")

    # 6. Build route dictionary
    routes_dict = {}
    for r in routes_raw:
        rid = r.get("route_id") or r.get("route_short_name")
        sn = r.get("route_short_name") or rid
        rtype = "tram" if r.get("route_type") == 0 else "bus"
        color = "#" + (r.get("route_color") or ("a81815" if rtype == "tram" else "0069b4"))
        textColor = "#" + (r.get("route_text_color") or "ffffff")
        desc = r.get("route_desc") or f"Ligne {sn}"
        first_stop = r.get("first_stop_name", "")
        last_stop = r.get("last_stop_name", "")
        directions = [d.get("station_arrivee", "") for d in r.get("directions", [])]

        # Use linear path if available, otherwise fetch from /siv/routes/{rid}/stops
        stops_seq = linear_lines.get(sn, [])
        if not stops_seq:
            try:
                line_stops = fetch_json(f"https://api.t2c.fr/siv/routes/{rid}/stops")
                if isinstance(line_stops, list):
                    # Dedup by stop_id
                    seen_sids = set()
                    for ls in line_stops:
                        sid = ls.get("stop_id")
                        if sid and sid not in seen_sids:
                            seen_sids.add(sid)
                            stops_seq.append({
                                "stopId": sid,
                                "name": ls.get("stop_name"),
                                "lat": float(ls.get("stop_lat", 0)) if ls.get("stop_lat") else None,
                                "lon": float(ls.get("stop_lon", 0)) if ls.get("stop_lon") else None
                            })
            except Exception:
                pass

        # If still empty, collect from stops_list where line is in s["lines"]
        if not stops_seq:
            for s in stops_list:
                if sn in s.get("lines", []):
                    stops_seq.append({
                        "stopId": s["id"],
                        "name": s["name"],
                        "lat": s.get("lat"),
                        "lon": s.get("lon")
                    })

        routes_dict[sn] = {
            "id": rid,
            "shortName": sn,
            "type": rtype,
            "color": color,
            "textColor": textColor,
            "desc": desc,
            "firstStop": first_stop,
            "lastStop": last_stop,
            "directions": directions,
            "stopsCount": len(stops_seq),
            "stops": stops_seq
        }

    # Save to JSON and JS
    db = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalStops": len(stops_list),
        "totalRoutes": len(routes_dict),
        "stops": stops_list,
        "routes": routes_dict
    }

    with open("data/t2c_database.json", "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    js_code = f"""/* =========================================================================
   BASE DE DONNÉES OFFICIELLE T2C (CLERMONT AUVERGNE MÉTROPOLE - 63)
   Généré automatiquement depuis api.t2c.fr (SIV Open Data)
   Total arrêts : {len(stops_list)} | Total lignes : {len(routes_dict)}
   ========================================================================= */
(function (root) {{
  "use strict";

  const T2C_DATA = {json.dumps(db, ensure_ascii=False)};

  if (typeof module !== "undefined" && module.exports) {{
    module.exports = T2C_DATA;
  }}
  root.T2C_DATA = T2C_DATA;
}})(typeof window !== "undefined" ? window : globalThis);
"""
    with open("core/t2c_data.js", "w", encoding="utf-8") as f:
        f.write(js_code)

    print(f"\nSUCCESS: Generated {len(stops_list)} stops and {len(routes_dict)} lines.")
    print("Files updated: data/t2c_database.json, core/t2c_data.js")

if __name__ == "__main__":
    build_complete()
