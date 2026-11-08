"""Emploi du temps de la classe (ADE, edt.uca.fr) : lecture de l'export iCalendar, groupes de l'utilisateur, jours passés
reconstitués, filtre « emploi du temps personnel » (décoché = toute la classe). Données factices, aucun accès réseau.

Usage : python -I -X utf8 tests/ade.py
"""
import datetime
import socket
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import NO_REAL_SERVERS, ROOT, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def utc(d, h, m):
    """Heure locale d'aujourd'hui + d jours -> format iCalendar UTC."""
    t = (datetime.datetime.now().replace(hour=h, minute=m, second=0, microsecond=0) + datetime.timedelta(days=d)).astimezone(datetime.timezone.utc)
    return t.strftime("%Y%m%dT%H%M%SZ")


def vevent(d, h1, h2, title, room, desc):
    return (f"BEGIN:VEVENT\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:{utc(d, h1, 0)}\r\nDTEND:{utc(d, h2, 0)}\r\nSUMMARY:{title}\r\n"
            f"LOCATION:{room}\r\nDESCRIPTION:{desc}\r\nUID:x{d}{h1}{title[:4]}\r\nEND:VEVENT\r\n")


def ics(events):
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ADE//\r\n" + "".join(events) + "END:VCALENDAR\r\n"


# Classe : deux groupes de TP, un groupe de TD, un cours d'année entière ; passé (-3, -2 jours) et futur (+1, +2).
CLASS_ICS = ics([
    vevent(-3, 8, 10, "Prog1 : TP2", "B8", "\\n\\n1ATP2\\nSAFA KHODOR\\n\\n(Updated :21/07/2026 14\\:51)"),
    vevent(-3, 8, 10, "Prog1 : TP3", "B6", "\\n\\n1ATP3\\nSAFA KHODOR\\n\\n(Updated :21/07/2026 14\\:51)"),
    vevent(-3, 10, 12, "Math1 : TDA", "A5bis", "\\n\\n1ATDA\\nCOURSIMAULT DAVID"),
    vevent(-2, 14, 16, "Archi_res1 - CM", "A5\\, A5bis", "\\n\\n1A\\nFREITAS ANTONIO"),
    vevent(-2, 8, 10, "Com1 : TP1", "B7", "\\n\\n1ATP1\\nGIRAUD NADINE"),
    vevent(1, 8, 10, "Prog1 : TP2", "B8", "\\n\\n1ATP2\\nSAFA KHODOR"),
    vevent(1, 8, 10, "Prog1 : TP3", "B6", "\\n\\n1ATP3\\nSAFA KHODOR"),
    vevent(2, 10, 12, "Math1 : TDA", "A5bis", "\\n\\n1ATDA\\nCOURSIMAULT DAVID"),
])


def odin(d, h1, h2, title):
    t = datetime.date.today() + datetime.timedelta(days=d)
    return {"date": t.isoformat(), "year": t.year, "month": t.month - 1, "day": t.day, "startH": h1, "startM": 0, "endH": h2, "endM": 0,
            "title": title, "teacher": "", "room": "", "raw": "", "color": "#888"}


# Emploi du temps personnel (Odin) : le groupe TP2 + TDA, seulement à partir d'aujourd'hui ; hier n'a jamais été synchronisé.
ODIN_EVENTS = [odin(1, 8, 10, "Prog1 : TP2"), odin(2, 10, 12, "Math1 : TDA"), odin(1, 14, 16, "Prog1 : TP2"), odin(2, 8, 10, "Math1 : TDA")]


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


def main():
    # ---------- fonctions pures (page vierge)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[NO_REAL_SERVERS])
        page = browser.new_page()
        page.set_content("<html></html>")
        page.add_script_tag(path=str(ROOT / "core" / "ade.js"))
        A = "window.UCA_ADE"
        good = "https://edt.uca.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources=2419,1092,16432&projectId=4&calType=ical&nbWeeks=8&displayConfigId=128"
        n = page.evaluate(f"(u) => {A}.normalizeAdeUrl(u)", good)
        check("adresse ADE : normalisée (ressources, projet, configuration)", n == "https://edt.uca.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources=2419,1092,16432&projectId=4&calType=ical&displayConfigId=128", str(n))
        for bad in ("https://evil.example/jsp/custom/modules/plannings/anonymous_cal.jsp?resources=1&projectId=4",
                    "http://edt.uca.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources=1&projectId=4",
                    "https://edt.uca.fr/autre.jsp?resources=1&projectId=4",
                    "https://edt.uca.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources=1;DROP&projectId=4",
                    "javascript:alert(1)", ""):
            check(f"adresse ADE refusée : {bad[:45] or 'vide'}", page.evaluate(f"(u) => {A}.normalizeAdeUrl(u)", bad) is None)
        check("plage : l'adresse porte firstDate et lastDate", page.evaluate(f"(u) => {A}.adeRangeUrl(u, '2026-09-01', '2027-01-31')", n).endswith("&firstDate=2026-09-01&lastDate=2027-01-31"))
        check("année universitaire : 1er septembre", page.evaluate(f"() => [{A}.academicYearStart(new Date(2026, 10, 3)), {A}.academicYearStart(new Date(2027, 2, 3))]") == ["2026-09-01", "2026-09-01"])
        evs = page.evaluate(f"(t) => {A}.parseAdeIcs(t)", CLASS_ICS)
        check("export : 8 cours lus", len(evs) == 8, str(len(evs)))
        tp2 = next(e for e in evs if e["title"] == "Prog1 : TP2" and e["date"] > datetime.date.today().isoformat())
        check("export : groupe, enseignant, salle, heures locales", tp2["group"] == "1ATP2" and tp2["teacher"] == "SAFA KHODOR" and tp2["room"] == "B8" and tp2["startH"] == 8 and tp2["endH"] == 10, str(tp2))
        cm = next(e for e in evs if "Archi" in e["title"])
        check("export : cours de toute l'année (groupe 1A), salles séparées", cm["group"] == "1A" and cm["room"] == "A5, A5bis", str(cm))
        groups = page.evaluate(f"([o, c]) => {A}.deriveMyGroups(o, c)", [ODIN_EVENTS, evs])
        check("groupes retrouvés via Odin (intitulés écrits comme sur Odin)", groups == ["1ATDA", "1ATP2"], str(groups))
        mine = page.evaluate(f"([c, g]) => {A}.personalFromClass(c, g)", [evs, groups])
        check("emploi du temps personnel tiré de la classe : sans les autres groupes", all(e["group"] in ("1ATP2", "1ATDA", "1A") for e in mine) and len(mine) == 5, str(len(mine)))
        filled = page.evaluate(f"([o, m]) => {A}.fillPast(o, m)", [ODIN_EVENTS, mine])
        past = [e for e in filled if e["date"] < datetime.date.today().isoformat()]
        check("passé reconstitué : 3 cours des jours passés ajoutés (TP2, TDA, CM)", sorted(e["title"] for e in past) == ["Archi_res1 - CM", "Math1 : TDA", "Prog1 : TP2"], str([e["title"] for e in past]))
        kept = [e for e in filled if e["date"] >= datetime.date.today().isoformat()]
        check("passé reconstitué : les cours d'Odin d'aujourd'hui et du futur ne bougent pas", len(kept) == len(ODIN_EVENTS))
        browser.close()

    # ---------- extension : synchro de la classe (réseau simulé)
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1280, "height": 800})
        sw.evaluate("(a) => chrome.storage.local.set({ uca_ade_url: a[0], uca_events: a[1] })", [
            "https://edt.uca.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources=2419,1092,16432&projectId=4&calType=ical&displayConfigId=128", ODIN_EVENTS])
        sw.evaluate("""(t) => { globalThis.__asked = []; globalThis.fetch = async (u, o) => { globalThis.__asked.push([String(u), o && o.credentials]); return new Response(t, { status: 200 }); }; }""", CLASS_ICS)
        res = sw.evaluate("() => syncClassSchedule()")
        asked = [a for a in sw.evaluate("() => globalThis.__asked") if "anonymous_cal" in a[0]]
        check("synchro classe : une seule requête, sans cookie, avec dates de début et de fin", len(asked) == 1 and asked[0][1] == "omit" and "firstDate=" in asked[0][0] and "lastDate=" in asked[0][0], str(asked))
        st = sw.evaluate("() => chrome.storage.local.get(['uca_class_events', 'uca_my_groups', 'uca_events', 'uca_class_sync'])")
        check("synchro classe : 8 cours de la classe enregistrés à part", len(st["uca_class_events"]) == 8 and res["count"] == 8)
        check("synchro classe : groupes de l'utilisateur retenus", st["uca_my_groups"] == ["1ATDA", "1ATP2"], str(st["uca_my_groups"]))
        check("synchro classe : jours passés ajoutés à l'emploi du temps personnel", len([e for e in st["uca_events"] if e["date"] < datetime.date.today().isoformat()]) == 3, str(len(st["uca_events"])))
        sw.evaluate("() => { globalThis.fetch = async () => new Response('<html>erreur</html>', { status: 200 }); }")
        err = sw.evaluate("() => syncClassSchedule().then(() => null, (e) => String(e.message))")
        check("réponse inattendue : erreur claire, données conservées", bool(err) and len(sw.evaluate("() => chrome.storage.local.get('uca_class_events').then((d) => d.uca_class_events)")) == 8, str(err))
        none = sw.evaluate("() => chrome.storage.local.remove('uca_ade_url').then(() => syncClassSchedule())")
        check("sans adresse enregistrée : rien n'est tenté (pas de fenêtre de connexion en synchro silencieuse)", none is None)
        ctx.close()

    # ---------- pages : filtre « emploi du temps personnel » dans les 4 designs
    port = free_port()
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[NO_REAL_SERVERS])
            data = seed()
            for design in ("anime", "professionnel", "bulletin", "carnet"):
                ctx = browser.new_context(viewport={"width": 1400, "height": 900})
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(f"http://127.0.0.1:{port}/app/index.html"); page.wait_for_timeout(300)
                store = dict(data); store["uca_design"] = design
                classev = page.evaluate("""(args) => { const [n] = args; const out = []; for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() + (i % 5)); const p = (x) => String(x).padStart(2, '0');
                    out.push({ date: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()), year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), startH: 8 + (i % 3) * 2, startM: 0, endH: 10 + (i % 3) * 2, endM: 0, title: 'Classe' + i + ' : TP' + (i % 4 + 1), teacher: 'X', room: 'Z', raw: '', group: '1ATP' + (i % 4 + 1), color: '#888' }); } return out; }""", [20])
                store["uca_class_events"] = classev; store["uca_my_groups"] = ["1ATP2"]
                page.evaluate("(s) => localStorage.setItem('uca_store', JSON.stringify(s))", store)
                page.goto(f"http://127.0.0.1:{port}/designs/{design}/agenda.html"); page.wait_for_timeout(1200)
                page.locator("#filterBtn").click(); page.wait_for_timeout(400)
                cb = page.locator("#scopePersonal")
                check(f"{design} : « Emploi du temps personnel » coché par défaut", cb.count() == 1 and cb.is_checked())
                perso = page.locator(".event-card").count()
                cb.uncheck(); page.wait_for_timeout(600)
                check(f"{design} : décoché → emploi du temps de la classe (autres groupes visibles)", "Classe" in page.locator(".view.active").first.inner_text() or page.locator(".event-card").count() != perso, f"{perso} -> {page.locator('.event-card').count()}")
                check(f"{design} : filtres de matière et de type masqués en vue classe", page.locator("#filterPanel .fp-chip").count() == 0)
                page.locator("#scopePersonal").check(); page.wait_for_timeout(500)
                check(f"{design} : recoché → retour à l'emploi du temps personnel", page.locator(".event-card").count() == perso and page.locator("#filterPanel .fp-chip").count() > 0, f"{perso} / {page.locator('.event-card').count()}")
                check(f"{design} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                ctx.close()
            browser.close()
    finally:
        server.terminate()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
