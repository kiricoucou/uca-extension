"""Notes Moodle : lecture des pages, rattachement, détection des nouvelles notes, validation / refus et fusion
dans le relevé. Deux parties :
  1. core/moodle.js (fonctions pures, exécutées par node) ;
  2. de bout en bout dans Chromium : synchro du service worker avec un Moodle factice (fetch simulé), notification
     avec ses deux boutons, bandeau Valider / Refuser dans la fenêtre Notes de chaque design, note fusionnée au tableau.

Usage : python -I -X utf8 tests/moodle.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import designs, launch  # noqa: E402

root = Path(__file__).resolve().parent
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


r = subprocess.run(["node", str(root / "moodle.js")], capture_output=True, text=True, encoding="utf-8")
print(r.stdout, end="")
if r.stderr:
    print(r.stderr, end="")
results.append(r.returncode == 0)


def pick(page, card, text):
    """Choisit une matière dans le menu à couleurs (bouton, puis ligne de la liste)."""
    card.locator(".mdl-pick").click()
    needle = text.split(" : ")[-1]     # la ligne affiche le code en gras puis le nom (sans « : »)
    page.locator(".mdl-opt", has_text=needle).first.click()


def ev(label, coeff, note):
    return {"label": label, "key": label, "coeff": coeff, "note": note, "moy": None, "maxi": None, "mini": None}


RELEVE = {"ue": [{"label": "UE 1.1 Réaliser", "coeff": 1, "note": None, "matieres": [
    {"label": "R1.07 : Programmation", "coeff": 1, "note": None, "evals": [ev("DS (sur 20.0)", 1, 10)]},
    {"label": "R1.03 : Maths du signal", "coeff": 1, "note": None, "evals": [ev("QCM (sur 20.0)", 1, 8)]}]}]}

OVERVIEW = (root / "pages" / "moodle_overview.html").read_text(encoding="utf-8")
COURSE = (root / "pages" / "moodle_cours.html").read_text(encoding="utf-8")

# Moodle factice : aperçu du profil, un seul cours avec des notes (les autres sont vides).
FAKE_FETCH = """(args) => {
  const [overview, course, expired] = args;
  self.__fetched = [];
  chrome.permissions.contains = async () => true;  // les tests ne dépendent pas de la date du jour
  self.__moodleOrder = ['direct'];                 // ces tests simulent fetch : on les fait passer par la lecture directe
  const real = self.__realFetch || (self.__realFetch = self.fetch.bind(self));
  self.fetch = async (url, ...rest) => {
    if (!String(url).startsWith("https://moodle")) return real(url, ...rest);
    self.__fetched.push(url);
    const mk = (u, body) => ({ url: u, ok: true, status: 200, text: async () => body });
    if (expired) return mk("https://ent.uca.fr/cas/login?service=x", "<form></form>");
    if (url.includes("/grade/report/overview/")) return mk(url, overview);
    if (url.includes("id=1111")) return mk(url, course);
    return mk(url, "<html><body>Pas de notes</body></html>");
  };
}"""


def main():
    data = seed()
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})
        data["uca_releve_notes"] = RELEVE
        data["uca_settings"] = {"moodleNotes": True, "notifyNewGrades": True}
        sw.evaluate("(d) => chrome.storage.local.set(d)", data)
        sw.evaluate("() => { self.__notifs = []; chrome.notifications.create = (id, o) => { self.__notifs.push({ id, o }); }; }")
        sw.evaluate(FAKE_FETCH, [OVERVIEW, COURSE, False])

        perms = sw.evaluate("() => chrome.permissions.getAll().then((p) => p.origins)")
        check("manifeste : accès Moodle accordé année par année (un motif moodle* est refusé par Chrome)", all(f"https://moodle{y}.uca.fr/*" in perms for y in (2026, 2027, 2028)), str(perms))
        check("manifeste : aucun motif avec joker au milieu du nom d'hôte", not any("*" in h.split("//")[1].split("/")[0].lstrip("*.") for h in perms if "//" in h), str(perms))

        # --- synchro 1 : tout est « en attente », une seule notification de synthèse
        sw.evaluate("""() => { self.__prog = []; chrome.storage.onChanged.addListener((c) => { if (c.uca_moodle_progress && c.uca_moodle_progress.newValue) self.__prog.push(c.uca_moodle_progress.newValue); }); }""")
        sw.evaluate("() => syncMoodleQuietly()")
        prog = sw.evaluate("() => self.__prog")
        courses_prog = [x for x in prog if x.get("phase") == "cours"]
        check("progression : connexion, cours un par un (1 / 3, 2 / 3, 3 / 3), analyse, puis terminée",
              prog and prog[0].get("phase") == "connexion" and [x["done"] for x in courses_prog] == [0, 1, 2] and all(x["total"] == 3 for x in courses_prog)
              and any(x.get("phase") == "analyse" for x in prog) and prog[-1].get("active") is False, str([(x.get("phase"), x.get("done"), x.get("total"), x.get("active")) for x in prog]))
        check("progression : nom du cours en cours de lecture", courses_prog and "R107" in courses_prog[0]["label"], str(courses_prog[:1]))
        st = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
        pend = [i for i in st["items"].values() if i["status"] == "pending"]
        check("synchro : notes lues par cours (liens trouvés dans la page, pas codés en dur)", len(pend) == 3 and any("id=1111" in u for u in sw.evaluate("() => self.__fetched")), str([i["title"] for i in pend]))
        check("synchro : session Moodle sans identifiant utilisateur géré, pages demandées avec l'identifiant lu", any("user=900" in u for u in sw.evaluate("() => self.__fetched")))
        n = sw.evaluate("() => self.__notifs.map((x) => x.o.title)")
        check("premier passage : une seule notification de synthèse", n == ["3 notes Moodle à valider"], str(n))

        # --- synchro 2 : une nouvelle note sur un autre cours -> notification avec Valider / Refuser
        sw.evaluate("() => { self.__notifs = []; }")
        row = COURSE[COURSE.index("<tr><th class=\"level2 item"):]
        row = row[:row.index("</tr>") + 5]
        newcourse = COURSE.split("<tbody>")[0] + "<tbody>" + row.replace("Résultats évaluation 1", "Contrôle surprise").replace("19,000", "16,000") + "</tbody></table>"
        sw.evaluate("""([overview, course, other]) => { self.fetch = async (url, ...rest) => {
            if (!String(url).startsWith("https://moodle")) return self.__realFetch(url, ...rest);
            const mk = (u, body) => ({ url: u, ok: true, status: 200, text: async () => body });
            if (url.includes("/grade/report/overview/")) return mk(url, overview);
            if (url.includes("id=1111")) return mk(url, course);
            if (url.includes("id=3333")) return mk(url, other);
            return mk(url, "<html></html>"); }; }""", [OVERVIEW, COURSE, newcourse])
        sw.evaluate("() => syncMoodleQuietly()")
        nots = sw.evaluate("() => self.__notifs")
        fresh = [x for x in nots if x["id"].startswith("uca_moodle|")]
        check("nouvelle note : notification « Nouvelle note détectée sur Moodle »", any(x["o"]["title"] == "Nouvelle note détectée sur Moodle" for x in fresh), str(nots))
        btn = [b["title"] for b in (fresh[0]["o"].get("buttons") or [])] if fresh else []
        check("nouvelle note : deux boutons Valider la note / Refuser la note", btn == ["Valider la note", "Refuser la note"], str(btn))
        check("nouvelle note : matière, note sur 20 et commentaire dans le message", fresh and "Contrôle surprise — 16 / 20" in fresh[0]["o"]["message"] and "bonne maîtrise" in fresh[0]["o"]["message"], fresh[0]["o"]["message"] if fresh else "")

        # --- boutons de la notification
        nid = fresh[0]["id"]
        iid = nid[len("uca_moodle|"):]
        url = sw.evaluate("(id) => moodleReviewUrl(id)", iid)
        check("notification : Valider ouvre la fenêtre Notes sur cette note (rien n'est ajouté sans confirmation)", "open=notes" in url and "moodle=" in url, url)
        st0 = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
        check("notification : la note reste en attente tant que l'utilisateur n'a pas confirmé", st0["items"][iid]["status"] == "pending")
        check("notification : Refuser enregistre le refus", sw.evaluate("(id) => refuseMoodle(id)", iid) is True)
        st = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
        check("refus enregistré, pas de redemande à la synchro suivante", st["items"][iid]["status"] == "refused" and sw.evaluate("() => syncMoodleQuietly().then(() => self.__notifs.filter((x) => x.id.startsWith('uca_moodle|')).length)") == 1)

        # --- session Moodle expirée : aucune note perdue, problème signalé
        sw.evaluate(FAKE_FETCH, [OVERVIEW, COURSE, True])
        sw.evaluate("() => syncMoodleQuietly()")
        iss = sw.evaluate("() => chrome.storage.local.get('uca_scrape_issues').then((d) => (d.uca_scrape_issues || {}).moodle)")
        st2 = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
        check("session expirée : problème signalé, notes déjà vues conservées", iss and iss["issue"] == "session" and len(st2["items"]) == len(st["items"]), str(iss))
        sw.evaluate("() => chrome.storage.local.remove('uca_scrape_issues')")

        # --- réglage désactivé : aucune requête
        sw.evaluate("() => UCA_saveSettings({ moodleNotes: false })")
        sw.evaluate(FAKE_FETCH, [OVERVIEW, COURSE, False])
        sw.evaluate("() => syncMoodleQuietly()")
        check("réglage désactivé : aucune requête vers Moodle", sw.evaluate("() => self.__fetched.length") == 0)
        sw.evaluate("() => UCA_saveSettings({ moodleNotes: true })")

        # --- secours : lecture DEPUIS une page Moodle (même origine : cookies de l'utilisateur) quand la lecture directe échoue
        def fake_moodle(route):
            u = route.request.url
            body = OVERVIEW if "/grade/report/overview/" in u else COURSE if "id=1111" in u else "Pas de notes"
            route.fulfill(status=200, content_type="text/html; charset=utf-8", body="<html><body>" + body + "</body></html>")
        ctx.route("https://moodle2026.uca.fr/**", fake_moodle)
        mp = ctx.new_page(); mp.goto("https://moodle2026.uca.fr/grade/report/overview/index.php"); mp.wait_for_timeout(500)
        inpage = sw.evaluate("""async () => {
          const [tab] = await chrome.tabs.query({ url: "https://moodle2026.uca.fr/*" });
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["core/moodle.js"] });
          const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [60], func: moodleInPageScrape });
          return r.result; }""")
        check("secours : lecture depuis la page Moodle (3 notes, cours retrouvés dans la page)", inpage.get("data") and len(inpage["data"]) == 3 and {g["courseId"] for g in inpage["data"]} == {"1111"}, str(inpage)[:200])
        check("secours : notes avec barème et note sur 20", any(g["title"] == "Résultats évaluation 1" and g["note20"] == 19 for g in inpage.get("data", [])))
        # méthode principale de bout en bout : un onglet Moodle est déjà ouvert -> lecture depuis cette page (pas de CORS, pas de nouvel onglet)
        tabs_before = sw.evaluate("() => chrome.tabs.query({}).then((t) => t.length)")
        sw.evaluate("() => { self.__swM = 0; const rf = self.__realFetch; self.fetch = (u, ...r) => { if (String(u).includes('moodle')) self.__swM++; return rf(u, ...r); }; self.__moodleOrder = ['page']; return chrome.storage.local.remove('uca_moodle'); }")
        res_page = sw.evaluate("() => syncMoodleQuietly()")
        check("lecture depuis la page : notes lues dans l'onglet Moodle déjà ouvert", res_page.get("issue") is None and res_page.get("read") == 3 and res_page.get("pending") == 3, str(res_page))
        check("lecture depuis la page : aucun onglet ouvert ni laissé", sw.evaluate("() => chrome.tabs.query({}).then((t) => t.length)") == tabs_before)
        check("lecture depuis la page : aucune requête du service worker vers Moodle (donc plus d'erreur CORS)", sw.evaluate("() => self.__swM") == 0)
        mp.close(); ctx.unroute("https://moodle2026.uca.fr/**")

        # lecture directe en échec + aucune session Moodle (le CAS répond) : « session » clairement signalée, onglet refermé
        sw.evaluate("() => { self.fetch = self.__realFetch; self.__moodleOrder = undefined; self.__moodleGetReal = self.moodleGet; self.moodleGet = async () => ({ issue: 'error', detail: 'cookies non transmis' }); return chrome.storage.local.remove('uca_moodle'); }")
        res2 = sw.evaluate("() => syncMoodleQuietly()")
        check("secours : session absente signalée (pas d'erreur obscure)", res2.get("issue") in ("session", "error") and res2.get("read") == 0, str(res2))
        diaglog = sw.evaluate("() => chrome.storage.local.get('uca_diag_log').then((d) => (d.uca_diag_log || []).map((x) => x.event))")
        check("journal de diagnostic : échec de la lecture depuis la page tracé", any(e.startswith("moodle-page-echec") for e in diaglog), str(diaglog[-5:]))
        check("secours : aucun onglet Moodle laissé ouvert", sw.evaluate("() => chrome.tabs.query({ url: 'https://moodle2026.uca.fr/*' }).then((t) => t.length)") == 0)
        sw.evaluate("() => { self.moodleGet = self.__moodleGetReal; }")
        sw.evaluate("() => chrome.storage.local.remove(['uca_scrape_issues', 'uca_moodle'])")
        # état de départ de l'interface : trois notes du cours 1111, puis une nouvelle note (cours 3333, sans matière correspondante)
        sw.evaluate(FAKE_FETCH, [OVERVIEW, COURSE, False])
        sw.evaluate("() => syncMoodleQuietly()")
        sw.evaluate("""([overview, course, other]) => { self.fetch = async (url, ...rest) => {
            if (!String(url).startsWith("https://moodle")) return self.__realFetch(url, ...rest);
            const mk = (u, body) => ({ url: u, ok: true, status: 200, text: async () => body });
            if (url.includes("/grade/report/overview/")) return mk(url, overview);
            if (url.includes("id=1111")) return mk(url, course);
            if (url.includes("id=3333")) return mk(url, other);
            return mk(url, "<html></html>"); }; }""", [OVERVIEW, COURSE, newcourse])
        sw.evaluate("() => syncMoodleQuietly()")

        # --- « Me connecter à Moodle » : la recherche reprend toute seule une fois connecté
        sw.evaluate("() => { self.__synced = 0; self.__realSync = self.syncMoodleQuietly; self.syncMoodleQuietly = async () => { self.__synced++; return { read: 0, pending: 0 }; }; return chrome.storage.local.set({ uca_moodle_login: { tabId: 77, base: 'https://moodle2026.uca.fr', at: Date.now() } }); }")
        upd = lambda tab_id, url, status="complete": sw.evaluate("([i, u, s]) => moodleLoginTabUpdated(i, { status: s }, { url: u }).then(() => self.__synced)", [tab_id, url, status])
        check("connexion : onglet encore sur la page de connexion / CAS -> pas de recherche", upd(77, "https://ent.uca.fr/cas/login?service=x") == 0 and upd(77, "https://moodle2026.uca.fr/login/index.php?authCAS=CAS") == 0)
        check("connexion : autre onglet ou chargement en cours -> pas de recherche", upd(5, "https://moodle2026.uca.fr/my/") == 0 and upd(77, "https://moodle2026.uca.fr/my/", "loading") == 0)
        check("connexion : arrivée sur Moodle connecté -> la recherche se lance toute seule, une seule fois", upd(77, "https://moodle2026.uca.fr/my/") == 1 and upd(77, "https://moodle2026.uca.fr/my/") == 1)
        check("connexion : mémorisation effacée une fois la recherche lancée", sw.evaluate("() => chrome.storage.local.get('uca_moodle_login').then((d) => d.uca_moodle_login === undefined)"))
        sw.evaluate("() => chrome.storage.local.set({ uca_moodle_login: { tabId: 78, base: 'https://moodle2026.uca.fr', at: Date.now() - 21 * 60 * 1000 } })")
        check("connexion : attente trop longue (20 min) -> abandon sans recherche", upd(78, "https://moodle2026.uca.fr/my/") == 1 and sw.evaluate("() => chrome.storage.local.get('uca_moodle_login').then((d) => d.uca_moodle_login === undefined)"))
        sw.evaluate("() => { self.syncMoodleQuietly = self.__realSync; }")

        # --- app Android / PWA : les notes Moodle (validées, corbeille, matières créées) voyagent avec le lien de partage / le fichier .ucasync
        tp = ctx.new_page(); tp.goto(f"{base}/designs/studio/agenda.html"); tp.wait_for_timeout(700)
        rt = tp.evaluate("""async () => {
          const before = (await chrome.storage.local.get('uca_moodle')).uca_moodle;
          const snap = await UCA_TRANSFER.snapshot();
          const inKeys = UCA_TRANSFER.KEYS.includes('uca_moodle'), inSnap = !!(snap.data.uca_moodle && snap.data.uca_moodle.items);
          const frames = await UCA_TRANSFER.encodeFrames(snap);
          await chrome.storage.local.remove('uca_moodle');
          await UCA_TRANSFER.applyImport(snap);
          const after = (await chrome.storage.local.get('uca_moodle')).uca_moodle;
          return { inKeys, inSnap, frames: frames.length > 0, same: JSON.stringify(before) === JSON.stringify(after), n: Object.keys(after.items).length };
        }""")
        check("app / PWA : les notes Moodle sont dans le transfert (lien, QR, .ucasync) et se retrouvent identiques à l'import", rt["inKeys"] and rt["inSnap"] and rt["frames"] and rt["same"] and rt["n"] >= 3, str(rt))
        tp.close()

        # --- interface : bandeau Valider / Refuser dans chaque design
        errors = []
        for d in designs():
            did = d["id"]
            # état de départ : trois notes en attente, la première rattachée à R1.07 par son code
            store = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            for it in store["items"].values():
                if it["courseId"] in ("1111", "3333"):
                    it["status"] = "pending"; it["decidedAt"] = None; it["coeff"] = 1
                    if it["courseId"] == "1111":
                        it["matiere"], it["isNew"], it["how"] = "R1.07 : Programmation", False, "code"
                    else:
                        it["matiere"], it["isNew"], it["how"] = "SAE1.02 : S'initier aux réseaux", True, "nouvelle"
            sw.evaluate("(s) => chrome.storage.local.set({ uca_moodle: s, uca_design: '%s' })" % did, store)
            ag = ctx.new_page()
            ag.on("pageerror", lambda e: errors.append(f"[{did}] {e}"))
            ag.on("console", lambda m: m.type == "error" and errors.append(f"[{did}] {m.text}"))
            ag.goto(f"{base}/{d['folder']}/agenda.html"); ag.wait_for_timeout(900)
            ag.evaluate("() => { localStorage.removeItem('uca_notes_geom_v1'); localStorage.removeItem('uca_moodle_side_w_v1'); }")
            ag.locator("#notesBtn").click(); ag.wait_for_timeout(300)
            cards = ag.locator(".np-moodle-card")
            gap = ag.evaluate("() => { const p = document.getElementById('notesPanel').getBoundingClientRect(), s = document.getElementById('weekSubLabel').getBoundingClientRect(); return [p.top - s.bottom, getComputedStyle(document.getElementById('notesPanel')).position, p.width]; }")
            check(f"{did} : panneau Notes à 10 px sous la barre de la semaine (rien ne le colle aux pointillés)", abs(gap[0] - 10) <= 1.5 and gap[1] == "fixed" and gap[2] >= 340, str(gap))
            # « Dernière recherche : il y a … » à côté du bouton
            ago = ag.locator("#moodleAgo").inner_text()
            check(f"{did} : « Dernière recherche : il y a … » à côté de « Chercher sur Moodle »", re.fullmatch(r"Dernière recherche : (à l'instant|il y a \d+ (seconde|minute|heure|jour)s?)", ago) is not None, ago)
            rel = ag.evaluate("() => [UCA_relTimeFr(2000), UCA_relTimeFr(1000 * 12), UCA_relTimeFr(1000 * 60), UCA_relTimeFr(1000 * 150), UCA_relTimeFr(3600 * 1000 * 5), UCA_relTimeFr(86400 * 1000), UCA_relTimeFr(86400 * 1000 * 3)]")
            check(f"{did} : durées en secondes, minutes, heures et jours (singulier / pluriel)", rel == ["à l'instant", "il y a 12 secondes", "il y a 1 minute", "il y a 2 minutes", "il y a 5 heures", "il y a 1 jour", "il y a 3 jours"], str(rel))
            sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => { d.uca_moodle.sync = new Date(Date.now() - 3 * 3600 * 1000 - 5000).toISOString(); return chrome.storage.local.set({ uca_moodle: d.uca_moodle }); })"); ag.wait_for_timeout(1300)
            check(f"{did} : le temps écoulé suit la date de la dernière recherche (il y a 3 heures)", "il y a 3 heures" in ag.locator("#moodleAgo").inner_text(), ag.locator("#moodleAgo").inner_text())
            check(f"{did} : 4 notes Moodle à confirmer affichées", cards.count() == 4, str(cards.count()))
            check(f"{did} : « Chercher sur Moodle » en bleu", ag.evaluate("() => getComputedStyle(document.getElementById('moodleSyncBtn')).backgroundColor") == "rgb(31, 111, 235)")
            check(f"{did} : cartes en attente bordées de bleu", ag.evaluate("() => getComputedStyle(document.querySelector('.np-moodle-card')).borderTopColor") == "rgb(31, 111, 235)")
            # --- barre de progression de la recherche
            sw.evaluate("() => chrome.storage.local.set({ uca_moodle_progress: { active: true, phase: 'cours', done: 3, total: 10, label: 'R107 - Fondamentaux', at: Date.now() } })"); ag.wait_for_timeout(400)
            bar = ag.locator("#moodleProgress")
            check(f"{did} : barre de progression affichée (cours 4 / 10)", bar.count() == 1 and "cours 4 / 10" in bar.inner_text() and "R107" in bar.inner_text() and bar.get_by_role("progressbar").get_attribute("aria-valuenow") == "30", bar.inner_text() if bar.count() else "absente")
            check(f"{did} : progression exprimée en pourcentage (30 %), en grand à droite de la barre", ag.locator("#moodleProgress .np-mp-pct").inner_text() == "30 %" and bar.get_by_role("progressbar").get_attribute("aria-valuetext") == "30 %", ag.locator("#moodleProgress .np-mp-pct").inner_text())
            check(f"{did} : bouton « Recherche en cours… » désactivé pendant la recherche", ag.locator("#moodleSyncBtn").is_disabled() and "en cours" in ag.locator("#moodleSyncBtn").inner_text())
            ag.evaluate("() => { document.getElementById('moodleProgress').dataset.keep = '1'; }")
            sw.evaluate("() => chrome.storage.local.set({ uca_moodle_progress: { active: true, phase: 'cours', done: 6, total: 10, label: 'Maths 1', at: Date.now() } })"); ag.wait_for_timeout(300)
            check(f"{did} : la barre avance sur place (60 %, sans refaire le panneau)", ag.locator("#moodleProgress .np-mp-pct").inner_text() == "60 %" and ag.locator("#moodleProgress").get_by_role("progressbar").get_attribute("aria-valuenow") == "60" and ag.locator("#moodleProgress").get_attribute("data-keep") == "1" and "Maths 1" in ag.locator("#moodleProgress").inner_text())
            shot_name = f"{did}-progression"
            sw.evaluate("() => chrome.storage.local.set({ uca_moodle_progress: { active: false, at: Date.now() } })"); ag.wait_for_timeout(400)
            check(f"{did} : barre retirée et bouton réactivé à la fin", ag.locator("#moodleProgress").count() == 0 and ag.locator("#moodleSyncBtn").is_enabled())
            # --- erreur « session Moodle introuvable » : boutons Me connecter / Relancer
            sw.evaluate("() => chrome.storage.local.set({ uca_scrape_issues: { moodle: { issue: 'session', at: Date.now() } } })"); ag.wait_for_timeout(400)
            ag.evaluate("() => { window.__msgs = []; chrome.runtime.sendMessage = (m, cb) => { window.__msgs.push(m.type); if (cb) cb({ ok: true, read: 0, pending: 0 }); }; }")
            issue = ag.locator(".scrape-issue", has_text="Session Moodle introuvable")
            check(f"{did} : erreur de session Moodle : boutons « Me connecter à Moodle » et « Relancer la recherche »", issue.count() == 1 and ag.locator("#moodleLoginBtn").is_visible() and ag.locator("#moodleRetryBtn").is_visible() and "Me connecter" in ag.locator("#moodleLoginBtn").inner_text(), issue.inner_text() if issue.count() else "absente")
            check(f"{did} : boutons de l'erreur : « Me connecter » bleu, « Relancer » vert", ag.evaluate("() => [document.getElementById('moodleLoginBtn'), document.getElementById('moodleRetryBtn')].map((b) => getComputedStyle(b).backgroundColor).join('|')") == "rgb(31, 111, 235)|rgb(22, 138, 85)")
            ag.locator("#moodleLoginBtn").click(); ag.wait_for_timeout(300)
            check(f"{did} : « Me connecter à Moodle » demande l'ouverture de la connexion", "UCA_MOODLE_LOGIN" in ag.evaluate("() => window.__msgs"), str(ag.evaluate("() => window.__msgs")))
            ag.locator("#moodleRetryBtn").click(); ag.wait_for_timeout(300)
            check(f"{did} : « Relancer la recherche » relance la recherche", "UCA_MOODLE_SYNC" in ag.evaluate("() => window.__msgs"), str(ag.evaluate("() => window.__msgs")))
            sw.evaluate("() => chrome.storage.local.set({ uca_moodle_progress: { active: false, at: Date.now() }, uca_scrape_issues: {} })"); ag.wait_for_timeout(400)
            check(f"{did} : erreur effacée : plus de boutons de connexion", ag.locator("#moodleLoginBtn").count() == 0)
            # --- la fenêtre Notes ne remonte pas en haut quand son contenu est rafraîchi (barème, validation, recherche…)
            ag.set_viewport_size({"width": 1400, "height": 620}); ag.wait_for_timeout(400)
            ag.evaluate("() => { document.getElementById('notesPanel').scrollTop = 140; }"); ag.wait_for_timeout(150)
            sc0 = ag.evaluate("() => [document.getElementById('notesPanel').scrollTop, document.getElementById('notesPanel').scrollHeight > document.getElementById('notesPanel').clientHeight]")
            sw.evaluate("() => chrome.storage.local.set({ uca_moodle_progress: { active: true, phase: 'cours', done: 1, total: 5, label: 'x', at: Date.now() } })"); ag.wait_for_timeout(400)
            sw.evaluate("() => chrome.storage.local.set({ uca_moodle_progress: { active: false, at: Date.now() } })"); ag.wait_for_timeout(500)
            sc1 = ag.evaluate("() => document.getElementById('notesPanel').scrollTop")
            check(f"{did} : rafraîchissement du contenu : la fenêtre Notes reste là où l'utilisateur était (pas de retour en haut)", sc0[1] and abs(sc0[0] - 140) <= 3 and abs(sc1 - sc0[0]) <= 3, f"{sc0} -> {sc1}")
            ag.set_viewport_size({"width": 1400, "height": 900}); ag.wait_for_timeout(300)
            first = cards.filter(has_text="Résultats évaluation 1").first
            check(f"{did} : note, barème et commentaire visibles", "19 / 20" in first.inner_text() and "bonne maîtrise" in first.inner_text(), first.inner_text())
            check(f"{did} : rien dans les moyennes avant validation", ag.locator(".notes-table").inner_text().count("Moodle") == 0)
            check(f"{did} : boutons Valider la note et Refuser la note", first.get_by_role("button", name="Valider la note").count() == 1 and first.get_by_role("button", name="Refuser la note").count() == 1)
            check(f"{did} : matière R1.07 choisie d'après le code du cours, marquée Recommandée", first.locator(".mdl-pick").get_attribute("data-value") == "R1.07 : Programmation" and "Recommandée" in first.locator(".mdl-pick").inner_text(), first.locator(".mdl-pick").inner_text())
            first.get_by_role("button", name="Valider la note").click(); ag.wait_for_timeout(500)
            table = ag.locator(".notes-table").inner_text()
            check(f"{did} : note validée ajoutée au tableau des notes", "Résultats évaluation 1" in table and "Moodle" in table, table[:200])
            # R1.07 : (10 + 19) / 2 = 14,5 ; R1.03 : 8 ; moyenne générale (coeff égaux) : 11,25 (9 avant validation)
            avg = ag.locator(".notes-avg .na-val").inner_text()
            check(f"{did} : moyenne générale recalculée avec la note validée (9 -> 11,25)", avg.startswith("11,25"), avg)
            ag.locator(".np-moodle-card", has_text="Quizz n°2").get_by_role("button", name="Refuser la note").click(); ag.wait_for_timeout(400)
            check(f"{did} : note refusée ignorée du tableau", "Quizz" not in ag.locator(".notes-table").inner_text() and ag.locator(".np-moodle-card").count() == 2)
            sur = ag.locator(".np-moodle-card", has_text="Contrôle surprise")
            pk = sur.locator(".mdl-pick")
            check(f"{did} : cours sans correspondance -> « Créer une nouvelle matière » par défaut, recommandé, avec le nom proposé",
                  pk.get_attribute("data-new") == "1" and pk.get_attribute("data-value") == "SAE1.02 : S'initier aux réseaux" and "Recommandée" in pk.inner_text() and sur.locator(".mdl-newname").input_value() == "SAE1.02 : S'initier aux réseaux" and "nouvelle matière est recommandé" in sur.inner_text(), pk.inner_text() + "|" + (pk.get_attribute("data-value") or ""))
            pk.click(); ag.wait_for_timeout(150)
            pop = ag.locator(".mdl-pop")
            first_opt = ag.locator(".mdl-opt").first
            check(f"{did} : menu à couleurs : « Créer une nouvelle matière » en tête, recommandée", pop.is_visible() and "Créer une nouvelle matière" in first_opt.inner_text() and "Recommandée" in first_opt.inner_text(), first_opt.inner_text())
            check(f"{did} : menu à couleurs : matières rangées par UE, chacune avec sa couleur", ag.locator(".mdl-opt").count() == 3 and "UE" in pop.inner_text() and all(ag.locator(".mdl-opt").nth(i).evaluate("(e) => getComputedStyle(e).borderLeftWidth") == "6px" for i in range(3)), pop.inner_text())
            ag.locator(".mdl-search").fill("signal"); ag.wait_for_timeout(150)
            check(f"{did} : menu à couleurs : la recherche filtre les matières", ag.locator(".mdl-opt:visible").count() == 1 and "Maths du signal" in ag.locator(".mdl-opt:visible").first.inner_text(), str(ag.locator(".mdl-opt:visible").count()))
            ag.keyboard.press("Escape"); ag.wait_for_timeout(150)
            check(f"{did} : Échap referme le menu", ag.locator(".mdl-pop").count() == 0)
            pk.click(); ag.wait_for_timeout(150)
            ag.evaluate("() => window.dispatchEvent(new Event('resize'))"); ag.wait_for_timeout(150)
            check(f"{did} : redimensionner la fenêtre referme le menu sans erreur JavaScript", ag.locator(".mdl-pop").count() == 0 and not errors, str(errors[:2]))
            pk.focus(); ag.keyboard.press("ArrowDown"); ag.wait_for_timeout(150)
            ag.keyboard.press("ArrowDown"); ag.keyboard.press("Enter"); ag.wait_for_timeout(200)
            check(f"{did} : menu au clavier (flèches + Entrée) : une matière existante choisie", pk.get_attribute("data-new") == "0" and pk.get_attribute("data-value") in ("R1.07 : Programmation", "R1.03 : Maths du signal"), str(pk.get_attribute("data-value")))
            pick(ag, sur, "R1.03 : Maths du signal"); sur.locator("input[type=number]").fill("3")
            check(f"{did} : matière et coefficient sont modifiables avant l'ajout", "Contrôle surprise" not in ag.locator(".notes-table").inner_text())
            sur.get_by_role("button", name="Valider la note").click(); ag.wait_for_timeout(400)
            stv = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            itv = next(i for i in stv["items"].values() if i["title"] == "Contrôle surprise")
            check(f"{did} : ajoutée avec la matière et le coefficient confirmés", itv["status"] == "validated" and itv["matiere"] == "R1.03 : Maths du signal" and itv["isNew"] is False and itv["coeff"] == 3, str(itv))
            # --- notes déjà traitées : modifier, ignorer, revalider
            tog = ag.locator("#moodleDoneToggle")
            check(f"{did} : « déjà traitées » est un bouton, fermé au départ", tog.count() == 1 and tog.get_attribute("aria-expanded") == "false" and not ag.locator("#moodleDoneList").is_visible())
            hh = ag.evaluate("() => { const b = document.getElementById('moodleDoneToggle'); const l = b.querySelector('span'); return [b.offsetHeight, parseFloat(getComputedStyle(b).lineHeight) || 0, getComputedStyle(b).whiteSpace]; }")
            check(f"{did} : bouton « Notes Moodle déjà traitées » sur une seule ligne", hh[0] <= 46 and hh[2] == "nowrap", str(hh))
            ttxt = ag.locator("#moodleDoneToggle").inner_text()
            arr = ag.evaluate("() => { const b = document.getElementById('moodleDoneToggle'), a = b.querySelector('.np-moodle-arrow'); const br = b.getBoundingClientRect(), ar = a.getBoundingClientRect(); return [a.textContent, br.right - ar.right]; }")
            check(f"{did} : flèche ▸ à l'extrémité droite du bouton (rien d'autre)", arr[0] == "▸" and arr[1] <= 22, str(arr))
            check(f"{did} : bouton des notes traitées sans texte « Ouvrir / Fermer » à droite", "Ouvrir" not in ttxt and "Fermer" not in ttxt and ttxt.startswith("Notes Moodle déjà traitées"), ttxt)
            tog.click(); ag.wait_for_timeout(200)
            check(f"{did} : un clic ouvre la liste des notes traitées", tog.get_attribute("aria-expanded") == "true" and ag.locator("#moodleDoneList").is_visible())
            tog.click(); ag.wait_for_timeout(150)
            check(f"{did} : un second clic la referme", not ag.locator("#moodleDoneList").is_visible())
            tog.focus(); ag.keyboard.press("Enter"); ag.wait_for_timeout(150)
            check(f"{did} : ouverture aussi au clavier (Entrée)", ag.locator("#moodleDoneList").is_visible())
            # --- fenêtre des notes traitées : à droite de l'écran, le panneau Notes reste ouvert à gauche
            geo = ag.evaluate("() => { const s = document.getElementById('moodleSide').getBoundingClientRect(), p = document.getElementById('notesPanel').getBoundingClientRect(); return { sideRightGap: window.innerWidth - s.right, sideW: s.width, sideLeft: s.left, panelRight: p.right, panelOpen: document.getElementById('notesPanel').classList.contains('open'), inPanel: document.querySelectorAll('#notesPanel .np-moodle-edit').length, inSide: document.querySelectorAll('#moodleSide .np-moodle-edit').length, sideTop: s.top }; }")
            check(f"{did} : notes traitées dans une petite fenêtre collée à droite de l'écran (12 px du bord, 360 px)", (abs(geo["sideRightGap"] - 12) <= 1.5 or geo["sideW"] >= 898) and 360 <= geo["sideW"] <= 902, str(geo))
            check(f"{did} : fenêtre de droite à 15 px du panneau Notes (pas de « trou » entre les deux)", 13 <= geo["sideLeft"] - geo["panelRight"] <= 17, str(geo))
            check(f"{did} : fenêtre de droite : cartes dans la fenêtre, plus dans le panneau Notes ; panneau Notes ouvert à gauche sans chevauchement", geo["inSide"] >= 1 and geo["inPanel"] == 0 and geo["panelOpen"] and geo["panelRight"] <= geo["sideLeft"] + 1, str(geo))
            check(f"{did} : fenêtre de droite alignée sur la même hauteur que le panneau Notes", abs(geo["sideTop"] - ag.evaluate("() => document.getElementById('notesPanel').getBoundingClientRect().top")) <= 1.5, str(geo["sideTop"]))
            check(f"{did} : graphique et moyenne du panneau Notes visibles pendant que la fenêtre est ouverte", ag.locator("#notesPanel .np-chart, #notesPanel .notes-avg").first.is_visible())
            check(f"{did} : bouton « Fermer » en haut à droite de la fenêtre", ag.locator("#moodleSideClose").is_visible() and ag.evaluate("() => { const b = document.getElementById('moodleSideClose').getBoundingClientRect(), s = document.getElementById('moodleSide').getBoundingClientRect(); return b.right > s.right - 30 && b.top < s.top + 60; }"))
            # --- largeur : la taille calculée (15 px après le panneau Notes) est la taille par défaut ; l'utilisateur peut la changer
            w0 = ag.evaluate("() => document.getElementById('moodleSide').offsetWidth")
            check(f"{did} : par défaut, bouton « Taille par défaut » masqué", not ag.locator("#moodleSideReset").is_visible())
            gb = ag.locator(".mdl-side-grip").bounding_box()
            ag.mouse.move(gb["x"] + 4, gb["y"] + gb["height"] / 2); ag.mouse.down(); ag.mouse.move(gb["x"] - 40, gb["y"] + 100, steps=5); ag.mouse.move(gb["x"] - 80, gb["y"] + 100, steps=5); ag.mouse.up(); ag.wait_for_timeout(250)
            w1 = ag.evaluate("() => document.getElementById('moodleSide').offsetWidth")
            check(f"{did} : largeur modifiable par le bord gauche (+80 px)", abs((w1 - w0) - 80) <= 5 and ag.locator("#moodleSideReset").is_visible(), f"{w0} -> {w1}")
            ag.locator("#moodleSideClose").click(); ag.wait_for_timeout(150); ag.locator("#moodleDoneToggle").click(); ag.wait_for_timeout(250)
            w2 = ag.evaluate("() => document.getElementById('moodleSide').offsetWidth")
            check(f"{did} : largeur choisie mémorisée à la réouverture", abs(w2 - w1) <= 2, f"{w1} -> {w2}")
            ag.locator("#moodleSideReset").click(); ag.wait_for_timeout(250)
            w3 = ag.evaluate("() => document.getElementById('moodleSide').offsetWidth")
            gap3 = ag.evaluate("() => document.getElementById('moodleSide').getBoundingClientRect().left - document.getElementById('notesPanel').getBoundingClientRect().right")
            check(f"{did} : « Taille par défaut » : retour à la largeur d'origine, à 15 px du panneau Notes", abs(w3 - w0) <= 3 and 13 <= gap3 <= 17 and not ag.locator("#moodleSideReset").is_visible(), f"{w0} {w3} {gap3}")
            ag.locator("#moodleSideClose").click(); ag.wait_for_timeout(200)
            check(f"{did} : « Fermer » ne ferme que la fenêtre de droite : le panneau Notes reste ouvert", ag.locator("#moodleSide").count() == 0 and ag.locator("#notesPanel").is_visible() and ag.locator("#moodleDoneToggle").get_attribute("aria-expanded") == "false")
            ag.locator("#moodleDoneToggle").click(); ag.wait_for_timeout(200)
            check(f"{did} : le bouton des notes traitées rouvre la fenêtre", ag.locator("#moodleSide").is_visible())
            ed = ag.locator(".np-moodle-edit", has_text="Contrôle surprise")
            check(f"{did} : note validée listée avec ses réglages, modifiable", ed.count() == 1 and "modifiable" in ed.inner_text().lower() and ed.locator(".mdl-pick").get_attribute("data-value") == "R1.03 : Maths du signal" and ed.locator("input[type=number]").input_value() == "3", ed.inner_text() if ed.count() else "absente")
            check(f"{did} : note validée en vert", ag.evaluate("() => getComputedStyle(document.querySelector('.np-moodle-edit[data-status=validated]')).borderTopColor") == "rgb(22, 138, 85)")
            check(f"{did} : notes refusées absentes de la liste des notes validées (elles sont à la corbeille)", ag.locator("#moodleSide .np-moodle-edit[data-status=refused]").count() == 0 and ag.locator("#moodleSide .np-moodle-edit", has_text="Quizz").count() == 0)
            tb = ag.locator("#moodleTrashBtn")
            tbox = ag.evaluate("() => { const t = document.getElementById('moodleTrashBtn').getBoundingClientRect(), c = document.getElementById('moodleSideClose').getBoundingClientRect(); return [t.right, c.left, t.top, c.top]; }")
            check(f"{did} : bouton « 🗑 Corbeille (n) » juste à côté du bouton Fermer, sur la même ligne", "Corbeille" in tb.inner_text() and 0 <= tbox[1] - tbox[0] <= 16 and abs(tbox[2] - tbox[3]) <= 8, f"{tb.inner_text()} {tbox}")
            ntrash = ag.evaluate("() => document.getElementById('moodleDoneToggle').textContent")
            check(f"{did} : bouton des notes traitées : « (1 ✓ · 🗑 n) »", re.search(r"\(\d+ ✓ · 🗑 \d+\)", ntrash) is not None, ntrash)
            tb.click(); ag.wait_for_timeout(250)
            rows = ag.locator("#moodleSide .np-moodle-trash-row")
            check(f"{did} : corbeille : notes refusées en lignes compactes (sans cartes modifiables)", rows.count() >= 1 and rows.filter(has_text="Quizz n°2").count() == 1 and ag.locator("#moodleSide .np-moodle-edit").count() == 0 and "Corbeille" in ag.locator("#moodleSide .mdl-side-head").inner_text(), str(rows.count()))
            check(f"{did} : corbeille : notes en rouge, avec Restaurer / Supprimer", ag.evaluate("() => getComputedStyle(document.querySelector('.np-moodle-trash-row')).borderTopColor") == "rgb(209, 52, 58)" and rows.first.get_by_role("button", name="Restaurer").is_visible() and rows.first.get_by_role("button", name="Supprimer").is_visible())
            check(f"{did} : corbeille : le même bouton devient « ← Notes validées »", "Notes validées" in ag.locator("#moodleTrashBtn").inner_text())
            ag.locator("#moodleTrashBtn").click(); ag.wait_for_timeout(250)
            check(f"{did} : retour aux notes validées", ag.locator("#moodleSide .np-moodle-edit", has_text="Contrôle surprise").count() == 1 and ag.locator("#moodleSide .np-moodle-trash-row").count() == 0)
            check(f"{did} : boutons Valider en vert, Refuser / Ignorer en rouge", ag.evaluate("() => { const c = document.querySelector('.np-moodle-edit[data-status=validated]'); const bg = (t) => [...c.querySelectorAll('button')].find((b) => b.textContent === t); return [bg('Enregistrer les changements'), bg('🗑 Ignorer la note')].map((b) => getComputedStyle(b).backgroundColor).join('|'); }") == "rgb(22, 138, 85)|rgb(209, 52, 58)")
            pick(ag, ed, "R1.07 : Programmation"); ed.locator("input[type=number]").fill("2")
            ed.get_by_role("button", name="Enregistrer les changements").click(); ag.wait_for_timeout(400)
            ste = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            ite = next(i for i in ste["items"].values() if i["title"] == "Contrôle surprise")
            check(f"{did} : matière et coefficient rechoisis après validation", ite["status"] == "validated" and ite["matiere"] == "R1.07 : Programmation" and ite["coeff"] == 2, str(ite))
            check(f"{did} : le panneau reste ouvert après modification", ag.locator(".np-moodle-edit", has_text="Contrôle surprise").is_visible())
            ag.locator(".np-moodle-edit", has_text="Contrôle surprise").get_by_role("button", name="Ignorer la note").click(); ag.wait_for_timeout(400)
            ste = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            check(f"{did} : note validée puis ignorée : retirée du tableau et de la liste, mise à la corbeille", next(i for i in ste["items"].values() if i["title"] == "Contrôle surprise")["status"] == "refused" and "Contrôle surprise" not in ag.locator(".notes-table").inner_text() and ag.locator("#moodleSide .np-moodle-edit", has_text="Contrôle surprise").count() == 0)
            ag.locator("#moodleTrashBtn").click(); ag.wait_for_timeout(250)
            trow = ag.locator("#moodleSide .np-moodle-trash-row", has_text="Contrôle surprise")
            check(f"{did} : la note ignorée est dans la corbeille", trow.count() == 1)
            trow.get_by_role("button", name="Restaurer").click(); ag.wait_for_timeout(400)
            ste = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            check(f"{did} : restaurer : la note repasse en attente, avec ses réglages, modifiable dans la fenêtre Notes", next(i for i in ste["items"].values() if i["title"] == "Contrôle surprise")["status"] == "pending" and ag.locator(".np-moodle-card", has_text="Contrôle surprise").count() == 1 and ag.locator("#moodleSide .np-moodle-trash-row", has_text="Contrôle surprise").count() == 0)
            ag.locator(".np-moodle-card", has_text="Contrôle surprise").get_by_role("button", name="Valider la note").click(); ag.wait_for_timeout(400)
            ste = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            check(f"{did} : note restaurée puis revalidée", next(i for i in ste["items"].values() if i["title"] == "Contrôle surprise")["status"] == "validated" and "Contrôle surprise" in ag.locator(".notes-table").inner_text())
            # supprimer définitivement, puis vider la corbeille
            ag.locator(".np-moodle-card", has_text="Quiz en pourcentage").get_by_role("button", name="Refuser la note").click(); ag.wait_for_timeout(350)
            check(f"{did} : refuser une note l'envoie automatiquement à la corbeille", ag.locator("#moodleSide .np-moodle-trash-row", has_text="Quiz en pourcentage").count() == 1 and ag.locator("#moodleSide .np-moodle-trash-row").count() >= 2)
            ag.locator("#moodleSide .np-moodle-trash-row", has_text="Quiz en pourcentage").get_by_role("button", name="Supprimer").click(); ag.wait_for_timeout(350)
            ste = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            check(f"{did} : supprimer : retirée de la corbeille, mémorisée (« deleted ») pour ne plus être redemandée", next(i for i in ste["items"].values() if i["title"] == "Quiz en pourcentage")["status"] == "deleted" and ag.locator("#moodleSide .np-moodle-trash-row", has_text="Quiz en pourcentage").count() == 0)
            ag.locator("#moodleTrashEmpty").click(); ag.wait_for_timeout(150)
            check(f"{did} : vider la corbeille : confirmation demandée avant de tout supprimer", "Confirmer" in ag.locator("#moodleTrashEmpty").inner_text() and ag.locator("#moodleSide .np-moodle-trash-row").count() >= 1)
            ag.locator("#moodleTrashEmpty").click(); ag.wait_for_timeout(400)
            ste = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            check(f"{did} : corbeille vidée : plus aucune ligne, notes supprimées définitivement", ag.locator("#moodleSide .np-moodle-trash-row").count() == 0 and "corbeille est vide" in ag.locator("#moodleSide").inner_text().lower() and not [i for i in ste["items"].values() if i["status"] == "refused"])
            ag.locator("#moodleTrashBtn").click(); ag.wait_for_timeout(250)
            check(f"{did} : retour aux notes validées : « 🗑 Corbeille (0) »", "Corbeille (0)" in ag.locator("#moodleTrashBtn").inner_text() and ag.locator("#moodleSide .np-moodle-edit").count() >= 1, ag.locator("#moodleTrashBtn").inner_text())
            ag.close()
            # --- panneau Notes : déplaçable, redimensionnable, position mémorisée
            gp = ctx.new_page(); gp.set_viewport_size({"width": 1400, "height": 900})
            gp.goto(f"{base}/{d['folder']}/agenda.html"); gp.wait_for_timeout(700)
            gp.evaluate("() => localStorage.setItem('uca_notes_geom_v1', JSON.stringify({ x: 30, y: 160, w: 620, h: null }))")
            gp.reload(); gp.wait_for_timeout(900)
            gp.locator("#notesBtn").click(); gp.wait_for_timeout(300)
            rect = lambda: gp.evaluate("() => { const p = document.getElementById('notesPanel'); return [p.offsetLeft, p.offsetTop, p.offsetWidth, p.offsetHeight]; }")
            r0 = rect()
            check(f"{did} : position et largeur mémorisées retrouvées à l'ouverture", abs(r0[0] - 30) <= 2 and abs(r0[1] - 160) <= 2 and abs(r0[2] - 620) <= 3, str(r0))
            bar = gp.locator(".np-dragbar"); bb = bar.bounding_box()
            check(f"{did} : barre de déplacement visible en haut du panneau Notes", bar.is_visible() and bb["width"] > 200)
            gp.evaluate("() => { const p = document.getElementById('notesPanel'); p.scrollTop = 220; }"); gp.wait_for_timeout(150)
            top_hit = gp.evaluate("() => { const p = document.getElementById('notesPanel').getBoundingClientRect(); const e = document.elementFromPoint(p.left + 160, p.top + 3); return !!(e && e.closest('.np-dragbar')); }")
            check(f"{did} : défilement : rien ne passe au-dessus de la barre (elle est collée tout en haut)", top_hit)
            gp.evaluate("() => { document.getElementById('notesPanel').scrollTop = 0; }"); gp.wait_for_timeout(100)
            air = gp.evaluate("() => { const b = document.querySelector('.np-dragbar').getBoundingClientRect(), c = document.getElementById('npContent').getBoundingClientRect(); return [c.top - b.bottom, b.height, document.querySelector('.np-dragbar .np-bar-title').textContent, document.querySelectorAll('.np-dragbar .np-grip i').length]; }")
            check(f"{did} : barre refaite : poignée à 6 points, titre « Notes », 14 px d'espace avant le contenu", air[0] >= 13 and air[1] >= 36 and air[2] == "Notes" and air[3] == 6, str(air))
            gp.mouse.move(bb["x"] + 60, bb["y"] + bb["height"] / 2); gp.mouse.down(); gp.mouse.move(bb["x"] + 160, bb["y"] + 120, steps=6); gp.mouse.move(bb["x"] + 260, bb["y"] + 180, steps=6); gp.mouse.up(); gp.wait_for_timeout(200)
            r1 = rect()
            check(f"{did} : panneau Notes déplaçable à la souris (où on veut sur l'écran)", abs((r1[0] - r0[0]) - 200) <= 3 and abs((r1[1] - r0[1]) - (180 - bb["height"] / 2)) <= 3 and gp.locator("#notesPanel").is_visible(), f"{r0} -> {r1}")
            gp.locator("#notesBtn").click(); gp.wait_for_timeout(150); gp.locator("#notesBtn").click(); gp.wait_for_timeout(250)
            r2 = rect()
            check(f"{did} : position mémorisée à la réouverture", abs(r2[0] - r1[0]) <= 2 and abs(r2[1] - r1[1]) <= 2, f"{r1} -> {r2}")
            gp.locator(".np-dragbar").focus(); gp.keyboard.press("ArrowLeft"); gp.keyboard.press("ArrowDown")
            r3 = rect()
            check(f"{did} : déplacement au clavier (flèches)", abs((r3[0] - r2[0]) + 16) <= 2 and abs((r3[1] - r2[1]) - 16) <= 2, f"{r2} -> {r3}")
            corner = (r3[0] + r3[2] - 5, r3[1] + r3[3] - 5)
            gp.mouse.move(*corner); gp.mouse.down(); gp.mouse.move(corner[0] + 60, corner[1] - 40, steps=6); gp.mouse.move(corner[0] + 110, corner[1] - 90, steps=6); gp.mouse.up(); gp.wait_for_timeout(350)
            r5 = rect()
            check(f"{did} : panneau Notes redimensionnable par le coin (largeur et hauteur), sans se fermer", gp.locator("#notesPanel").is_visible() and r5[2] > r3[2] + 60 and r5[3] < r3[3] - 40, f"{r3} -> {r5}")
            gp.locator("#notesBtn").click(); gp.wait_for_timeout(150); gp.locator("#notesBtn").click(); gp.wait_for_timeout(250)
            r6 = rect()
            check(f"{did} : taille mémorisée à la réouverture, non écrasée par l'ajustement automatique", abs(r6[2] - r5[2]) <= 3 and abs(r6[3] - r5[3]) <= 3, f"{r5} -> {r6}")
            gp.locator(".np-dragbar").dblclick(); gp.wait_for_timeout(250)
            r7 = rect(); gap7 = gp.evaluate("() => document.getElementById('notesPanel').getBoundingClientRect().top - document.getElementById('weekSubLabel').getBoundingClientRect().bottom")
            check(f"{did} : double-clic sur la barre : retour à la position d'origine (10 px sous la barre de la semaine)", abs(gap7 - 10) <= 1.5, f"{r7} / {gap7}")
            gp.evaluate("() => localStorage.removeItem('uca_notes_geom_v1')")
            gp.close()
            # lien de la notification : la carte à confirmer est mise en évidence
            ag2 = ctx.new_page()
            sw.evaluate("(id) => chrome.storage.local.get('uca_moodle').then((d) => { d.uca_moodle.items[id].status = 'pending'; return chrome.storage.local.set({ uca_moodle: d.uca_moodle }); })", itv["id"])
            ag2.goto(f"{base}/{d['folder']}/agenda.html?open=notes&moodle=" + itv["id"]); ag2.wait_for_timeout(1800)
            check(f"{did} : lien de notification : carte de la note mise en évidence", ag2.evaluate("(id) => { const c = [...document.querySelectorAll('.np-moodle-card')].find((x) => x.dataset.moodleId === id); return !!c && c.style.outline !== '' && document.activeElement && c.contains(document.activeElement); }", itv["id"]))
            # --- créer une nouvelle matière depuis le menu
            nc = ag2.locator(".np-moodle-card", has_text="Contrôle surprise")
            nc.locator(".mdl-pick").click(); ag2.locator(".mdl-opt", has_text="Créer une nouvelle matière").first.click(); ag2.wait_for_timeout(150)
            check(f"{did} : « Créer une nouvelle matière » : champ du nom affiché", nc.locator(".mdl-newname").is_visible() and nc.locator(".mdl-pick").get_attribute("data-new") == "1")
            nc.locator(".mdl-newname").fill("Anglais S1")
            nc.get_by_role("button", name="Valider la note").click(); ag2.wait_for_timeout(500)
            stn = sw.evaluate("() => chrome.storage.local.get('uca_moodle').then((d) => d.uca_moodle)")
            itn = next(i for i in stn["items"].values() if i["title"] == "Contrôle surprise")
            tbl = ag2.locator(".notes-table").inner_text()
            check(f"{did} : nouvelle matière créée à la validation (nom saisi, ajoutée au tableau)", itn["status"] == "validated" and itn["isNew"] is True and itn["matiere"] == "Anglais S1" and "Anglais S1" in tbl and "Matières ajoutées" in tbl, str(itn) + tbl[-200:])
            nc2 = ag2.locator(".np-moodle-card").first
            if nc2.count():
                nc2.locator(".mdl-pick").click()
                check(f"{did} : la matière créée est proposée pour les notes suivantes", ag2.locator(".mdl-opt", has_text="Anglais S1").count() == 1 and "créées" in ag2.locator(".mdl-pop").inner_text().lower(), ag2.locator(".mdl-pop").inner_text())
                ag2.keyboard.press("Escape")
            ag2.close(); ag = ctx.new_page(); ag.goto(f"{base}/{d['folder']}/agenda.html"); ag.wait_for_timeout(700); ag.locator("#notesBtn").click(); ag.wait_for_timeout(300)
            over = ag.evaluate("() => { const p = document.getElementById('notesPanel'); return p.scrollWidth - p.clientWidth; }")
            check(f"{did} : fenêtre Notes sans défilement horizontal", over <= 1, str(over))
            ag.close()
        check("aucune erreur JavaScript", not errors, str(errors[:3]))
        ctx.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


main()
