"""v1.40 : bandeau « données vieilles », rappels, devoirs, objectifs de moyenne, .ics, prochain cours / examen,
partage en image… Une section par lot (ajoutées au fil des versions). Aucun accès réseau réel.

Usage : python -I -X utf8 tests/lots.py [dossier_captures]
"""
import datetime
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed  # noqa: E402
from harness import designs, launch  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []


def check(name, ok, detail=""):
    ok = bool(ok); results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def shot(page, name):
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT / f"{name}.png"))


def open_agenda(ctx, base, folder, size):
    pg = ctx.new_page(); pg.set_viewport_size(size)
    pg.goto(f"{base}/{folder}/agenda.html"); pg.wait_for_timeout(900)
    return pg


def lot1(ctx, sw, base, errors):
    for d in designs():
        sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", d["id"])
        old = (datetime.datetime.now() - datetime.timedelta(hours=30)).isoformat()
        sw.evaluate("(iso) => chrome.storage.local.set({uca_last_sync: iso})", old)
        for label, size in (("ordinateur", {"width": 1400, "height": 860}), ("téléphone", {"width": 390, "height": 844})):
            pg = open_agenda(ctx, base, d["folder"], size)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            txt = pg.locator("#staleInfo").inner_text() if pg.locator("#staleInfo").count() else ""
            check(f"{d['id']} {label} : bandeau « Données vieilles de 30 h »", "Données vieilles de 30 h" in txt, txt)
            check(f"{d['id']} {label} : bouton Resynchroniser présent", pg.locator("#staleSyncBtn").count() == 1)
            pg.evaluate("() => { window.__sent = []; const o = chrome.runtime.sendMessage.bind(chrome.runtime); chrome.runtime.sendMessage = (m, cb) => { window.__sent.push(m); if (m && m.type === 'UCA_SYNC_REQUEST') return Promise.resolve(); return o(m, cb); }; }")
            if pg.locator("#staleSyncBtn").count():
                pg.locator("#staleSyncBtn").evaluate("b => b.click()")
                pg.wait_for_timeout(200)
                sent = pg.evaluate("() => window.__sent.filter(m => m && m.type === 'UCA_SYNC_REQUEST').map(m => m.mode)")
                check(f"{d['id']} {label} : un clic lance une resynchro", sent == ["resync"], str(sent))
            if label == "ordinateur":
                shot(pg, f"lot1-stale-{d['id']}")
            pg.close()
        sw.evaluate("() => chrome.storage.local.set({uca_last_sync: new Date().toISOString()})")
        pg = open_agenda(ctx, base, d["folder"], {"width": 1400, "height": 860})
        check(f"{d['id']} : données récentes -> pas de bandeau", pg.locator("#staleInfo").count() == 0)
        pg.close()


def make_event(start, minutes, title, room="Salle X"):
    end = start + datetime.timedelta(minutes=minutes)
    return {"date": start.date().isoformat(), "year": start.year, "month": start.month - 1, "day": start.day, "startH": start.hour,
            "startM": start.minute, "endH": end.hour, "endM": end.minute, "title": title, "teacher": "M. Test", "room": room, "raw": title, "color": "#888"}


XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">'


def tasks_of(sw):
    return sw.evaluate("() => chrome.storage.local.get('uca_tasks').then(d => d.uca_tasks || [])")


def lot2(ctx, sw, base, errors):
    now = datetime.datetime.now().replace(second=0, microsecond=0)
    exam_day = (now + datetime.timedelta(days=3)).replace(hour=8, minute=0)
    data = seed()
    data["uca_events"] = data["uca_events"] + [make_event(exam_day, 120, "R1.01 DS2 Examen", "Amphi B")]
    data["uca_tasks"] = []
    data["uca_settings"] = {"absenceAlert": 2}
    data["uca_absences"] = dict(data["uca_absences"], nonJustifiees=1)
    sw.evaluate("(d) => chrome.storage.local.set(d)", data)
    tomorrow = (now + datetime.timedelta(days=1)).date().isoformat()
    for d in designs():
        i = d["id"]
        sw.evaluate("(id) => chrome.storage.local.set({uca_design: id, uca_tasks: []})", i)
        pg = open_agenda(ctx, base, d["folder"], {"width": 1400, "height": 860})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        check(f"{i} : bouton Devoirs présent", pg.locator("#tasksBtn").is_visible())
        pg.locator("#tasksBtn").click(); pg.wait_for_timeout(300)
        check(f"{i} : panneau Devoirs ouvert", pg.locator("#tasksPanel.open").count() == 1)
        txt = pg.locator("#tasksPanel").inner_text()
        check(f"{i} : l'examen de l'emploi du temps est listé avec son compte à rebours", "R1.01 DS2 Examen" in txt and "Dans 3 jours" in txt, txt[:200])
        pg.locator("#tasksPanel .tk-title").fill("Rendre le TP 3")
        pg.locator("#tasksPanel .tk-subject").select_option(index=1)
        pg.locator("#tasksPanel .tk-date").fill(tomorrow)
        pg.locator("#tasksPanel .tk-add").click(); pg.wait_for_timeout(400)
        stored = tasks_of(sw)
        check(f"{i} : devoir enregistré (titre, matière, date)", len(stored) == 1 and stored[0]["title"] == "Rendre le TP 3" and stored[0]["due"] == tomorrow and stored[0]["subject"], str(stored))
        check(f"{i} : « Demain » affiché et compteur sur le bouton", "Demain" in pg.locator("#tasksPanel").inner_text() and pg.locator("#tasksBtn .filter-count").inner_text() == "1")
        shot(pg, "lot2-tasks-" + i)
        pg.locator("#tasksPanel .tk-title").fill(XSS)
        pg.locator("#tasksPanel .tk-add").click(); pg.wait_for_timeout(400)
        check(f"{i} : titre piégé affiché comme texte, aucun script exécuté", pg.evaluate("() => window.__xss || 0") == 0 and pg.locator("#tasksPanel img[src='x']").count() == 0 and "<img src=x" in pg.locator("#tasksPanel").inner_text())
        pg.locator("#tasksPanel li input[type=checkbox]").first.click(); pg.wait_for_timeout(400)
        stored = tasks_of(sw)
        check(f"{i} : cocher termine le devoir", sum(1 for t in stored if t["done"]) == 1 and "terminés (1)" in pg.locator("#tasksPanel").inner_text().lower(), str(stored))
        pg.locator("#tasksPanel .tk-clear").click(); pg.wait_for_timeout(400)
        stored = tasks_of(sw)
        check(f"{i} : « Effacer les terminés »", len(stored) == 1 and not stored[0]["done"], str(stored))
        pg.locator("#tasksPanel .tk-del").first.click(); pg.wait_for_timeout(300)
        check(f"{i} : supprimer", len(tasks_of(sw)) == 0)
        dot = pg.locator("#absencesBtn .abs-dot")
        check(f"{i} : pastille orange à un pas du seuil d'absences", dot.count() == 1 and "near" in (dot.get_attribute("class") or ""), str(dot.count()))
        pg.close()
        pg = open_agenda(ctx, base, d["folder"], {"width": 390, "height": 844})
        pg.locator("#menuBtn").click(); pg.wait_for_timeout(300)
        item = pg.locator("#mobileMenu .mi", has_text="Devoirs et examens")
        check(f"{i} téléphone : « Devoirs et examens » dans le menu", item.count() == 1)
        item.click(); pg.wait_for_timeout(400)
        check(f"{i} téléphone : le panneau s'ouvre en feuille", pg.locator("#tasksPanel.as-sheet.open").is_visible())
        shot(pg, "lot2-tasks-mobile-" + i)
        pg.close()

    sw.evaluate("() => chrome.storage.local.set({uca_settings: {absenceAlert: 1}})")
    pg = open_agenda(ctx, base, designs()[0]["folder"], {"width": 1400, "height": 860})
    check("pastille rouge quand le seuil d'absences est atteint", "reached" in (pg.locator("#absencesBtn .abs-dot").get_attribute("class") or ""))
    pg.close()
    sw.evaluate("() => chrome.storage.local.set({uca_settings: {}})")

    plan = sw.evaluate("""() => {
      const now = new Date(2030, 4, 10, 10, 0).getTime();
      const ev = (d, h, t) => ({ year: 2030, month: 4, day: d, startH: h, startM: 0, endH: h + 2, endM: 0, title: t, room: 'Amphi B', date: '2030-05-' + d });
      return taskReminderPlan([
        { id: 'a', title: 'Demain matin', due: '2030-05-11', done: false, subject: 'R1.01' },
        { id: 'b', title: 'Aujourdhui', due: '2030-05-10', done: false },
        { id: 'c', title: 'Fait', due: '2030-05-12', done: true },
        { id: 'd', title: 'Sans date', due: '', done: false },
        { id: 'e', title: 'Trop loin', due: '2030-09-01', done: false },
      ], [ev(12, 8, 'R1.01 DS2 Examen'), ev(12, 14, 'R1.02 Web TD')], now).map(r => [r.name, new Date(r.when).getDate(), new Date(r.when).getHours(), r.title, r.message]);
    }""")
    names = [x[0] for x in plan]
    tsk_a = [x for x in plan if x[0] == "uca_tsk|a"]
    check("rappels : devoir de demain -> notification ce soir 18 h", len(tsk_a) == 1 and tsk_a[0][1:3] == [10, 18], str(plan))
    check("rappels : devoir du jour, terminé, sans date ou trop loin ignorés", not any(n in names for n in ("uca_tsk|b", "uca_tsk|c", "uca_tsk|d", "uca_tsk|e")), str(names))
    exam = [x for x in plan if x[0].startswith("uca_exm|")]
    check("rappels : seul l'examen (pas le TD) est annoncé la veille à 18 h", len(exam) == 1 and exam[0][1:3] == [11, 18] and "Examen à 08h00" in exam[0][4] and "Amphi B" in exam[0][4], str(exam))

    pg = open_agenda(ctx, base, designs()[0]["folder"], {"width": 1400, "height": 860})
    texts = pg.evaluate("""() => {
      const now = new Date(2030, 4, 10, 10, 0).getTime();
      const ev = (d, h, t) => ({ year: 2030, month: 4, day: d, startH: h, startM: 0, endH: h + 2, endM: 0, title: t, room: 'A1', teacher: '', date: '2030-05-' + d });
      const T = UCA_TOOLS.nextCourseText, N = UCA_TOOLS.nextCourse;
      return [
        T(N([ev(10, 11, 'R1.02 Web TD'), ev(13, 8, 'R1.01 DS2 Examen')], now), now),
        T(N([ev(10, 14, 'R1.01 DS2 Examen')], now), now),
        T(N([ev(13, 8, 'R1.01 DS2 Examen')], now), now),
        T(N([ev(10, 9, "R1.01 DS2 Examen")], now), now),
        T(N([ev(10, 11, 'R1.02 Web TD')], now), now),
      ];
    }""")
    check("prochain cours + examen à venir", texts[0] == "Prochain : R1.02 Web TD · A1 · dans 1 h · Examen dans 3 jours", texts[0])
    check("examen le jour même : « Examen dans 4 h »", texts[1] == "Examen dans 4 h : R1.01 DS2 Examen · A1", texts[1])
    check("examen dans 3 jours", texts[2] == "Examen dans 3 jours : R1.01 DS2 Examen · A1", texts[2])
    check("examen en cours", texts[3].startswith("En cours : Examen · R1.01 DS2 Examen"), texts[3])
    check("sans examen : texte inchangé", texts[4] == "Prochain : R1.02 Web TD · A1 · dans 1 h", texts[4])
    pg.close()


def lot2_ics(ctx, sw, base):
    due = (datetime.datetime.now() + datetime.timedelta(days=2)).date()
    sw.evaluate("(due) => chrome.storage.local.set({uca_design: 'professionnel', uca_tasks: [{ id: 't1', title: 'Rendre le TP; 3', subject: 'R1.01', due, done: false, created: 1 }, { id: 't2', title: 'Fait', subject: '', due, done: true, created: 2 }]})", due.isoformat())
    pg = open_agenda(ctx, base, "designs/professionnel", {"width": 1400, "height": 860})
    pg.locator("#exportBtn").click(); pg.wait_for_timeout(300)
    check("export .ics : case « Ajouter mes devoirs » (1 devoir à rendre)", "devoirs à rendre (1)" in pg.locator("#exportPanel").inner_text())
    pg.locator("#exportPanel input[value=all]").check()
    with pg.expect_download() as dl:
        pg.locator("#exportPanel .xp-go").click()
    ics = open(dl.value.path(), encoding="utf-8", newline="").read()
    nxt = (due + datetime.timedelta(days=1)).strftime("%Y%m%d")
    check("export .ics : devoir en journée entière avec rappel la veille", "DTSTART;VALUE=DATE:" + due.strftime("%Y%m%d") in ics and "DTEND;VALUE=DATE:" + nxt in ics and "SUMMARY:Devoir : Rendre le TP\\; 3" in ics and "TRIGGER:-PT6H" in ics, ics[-600:])
    check("export .ics : le devoir terminé n'est pas exporté", "Devoir : Fait" not in ics)
    pg.close()
    sw.evaluate("() => chrome.storage.local.set({uca_tasks: []})")


def png_size(path):
    import struct
    b = open(path, "rb").read(32)
    return struct.unpack(">II", b[16:24]) if b[:8] == bytes([137, 80, 78, 71, 13, 10, 26, 10]) else (0, 0)


def lot3_image(ctx, sw, base, errors):
    sw.evaluate("(d) => chrome.storage.local.set(d)", seed())
    for d in designs():
        sw.evaluate("(id) => chrome.storage.local.set({uca_design: id, uca_settings: {}})", d["id"])
        pg = open_agenda(ctx, base, d["folder"], {"width": 1400, "height": 860})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.evaluate("() => { navigator.canShare = () => false; }")
        pg.locator("#exportBtn").click(); pg.wait_for_timeout(300)
        check(f"{d['id']} : boutons « Partager une image » (jour, semaine)", pg.locator("#exportPanel .xp-image").count() == 2)
        for kind, minw in (("day", 1080), ("week", 1800)):
            with pg.expect_download() as dl:
                pg.locator(f"#exportPanel .xp-image[data-kind={kind}]").click()
            w, h = png_size(dl.value.path())
            check(f"{d['id']} : image {kind} téléchargée en PNG ({w}x{h})", w == minw and h > 500 and dl.value.suggested_filename.startswith("edt-uca-"), dl.value.suggested_filename)
            if d["id"] in ("professionnel", "carnet", "anime") and OUT:
                OUT.mkdir(parents=True, exist_ok=True)
                dl.value.save_as(str(OUT / f"lot3-image-{kind}-{d['id']}.png"))
        pg.close()
    # Partage natif : fichier PNG remis à navigator.share
    pg = open_agenda(ctx, base, "designs/professionnel", {"width": 390, "height": 844})
    pg.evaluate("() => { window.__shared = null; navigator.canShare = (d) => !!(d && d.files && d.files.length); navigator.share = async (d) => { window.__shared = { type: d.files[0].type, name: d.files[0].name, size: d.files[0].size }; }; }")
    pg.locator("#menuBtn").click(); pg.wait_for_timeout(300)
    pg.locator("#mobileMenu .mi", has_text="Exporter").click(); pg.wait_for_timeout(400)
    pg.locator("#exportPanel .xp-image[data-kind=day]").click(); pg.wait_for_timeout(800)
    shared = pg.evaluate("() => window.__shared")
    check("partage natif : le PNG est remis à la feuille de partage", shared and shared["type"] == "image/png" and shared["size"] > 3000 and shared["name"].endswith(".png"), str(shared))
    check("partage natif : message de confirmation", "Image partagée" in pg.locator("#exportPanel").inner_text())
    shot(pg, "lot3-export-mobile")
    pg.close()


def main():
    errors = []
    data = seed()
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})
        sw.evaluate("(d) => chrome.storage.local.set(d)", data)
        lot1(ctx, sw, base, errors)
        lot2(ctx, sw, base, errors)
        lot2_ics(ctx, sw, base)
        lot3_image(ctx, sw, base, errors)
        check("aucune erreur JavaScript", not errors, " | ".join(errors[:3]))
        ctx.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
