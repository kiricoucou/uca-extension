"""Agenda (v1.36) : prochain cours, jours fériés, couleur par matière, blocs compacts, raccourcis
clavier, examens cliquables, design automatique clair/sombre, entrée « Statut des sites » du menu mobile.

Usage : python -I -X utf8 tests/agenda.py [dossier_captures]
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


def make_event(start, minutes, title, room="Salle X"):
    end = start + datetime.timedelta(minutes=minutes)
    return {"date": start.date().isoformat(), "year": start.year, "month": start.month - 1, "day": start.day, "startH": start.hour,
            "startM": start.minute, "endH": end.hour, "endM": end.minute, "title": title, "teacher": "M. Test", "room": room, "raw": title, "color": "#888"}


def main():
    errors = []
    data = seed()
    now = datetime.datetime.now().replace(second=0, microsecond=0)
    if now.hour >= 21 or now.hour < 1:  # évite qu'un cours simulé passe minuit
        now = now.replace(hour=12)
    soon = make_event(now + datetime.timedelta(minutes=90), 60, "R9.99 Prochain TD")
    exam_day = now + datetime.timedelta(days=3)
    exam = make_event(exam_day.replace(hour=8, minute=0), 120, "R1.01 DS2 Examen", "Amphi B")
    data["uca_events"] = data["uca_events"] + [soon, exam]
    data["uca_settings"] = {}
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})

        # --- jours fériés (calculés)
        hol = lambda y: sw.evaluate("() => 0") if False else None
        pg0 = ctx.new_page(); pg0.goto(f"{base}/{designs()[0]['folder']}/agenda.html"); pg0.wait_for_timeout(500)
        H = lambda y, m, d: pg0.evaluate("([y, m, d]) => UCA_TOOLS.holidayName(new Date(y, m, d))", [y, m, d])
        check("férié 2026 : lundi de Pâques le 6 avril", H(2026, 3, 6) == "Lundi de Pâques", H(2026, 3, 6))
        check("férié 2026 : Ascension le 14 mai, Pentecôte le 25 mai", H(2026, 4, 14) == "Ascension" and H(2026, 4, 25) == "Lundi de Pentecôte")
        check("férié 2025 : lundi de Pâques le 21 avril, Ascension le 29 mai", H(2025, 3, 21) == "Lundi de Pâques" and H(2025, 4, 29) == "Ascension")
        check("férié : dates fixes (1er mai, 14 juillet, 11 novembre, 25 décembre)", H(2026, 4, 1) == "Fête du Travail" and H(2026, 6, 14) == "Fête nationale" and H(2026, 10, 11) == "Armistice 1918" and H(2026, 11, 25) == "Noël")
        check("férié : un jour ordinaire n'en est pas un", H(2026, 9, 22) == "")
        # --- prochain cours (calcul pur)
        base_ev = pg0.evaluate("""() => { const n = new Date(); const mk = (dm, len, t) => { const s = new Date(n.getTime() + dm * 60000), e = new Date(s.getTime() + len * 60000);
          return { date: '', year: s.getFullYear(), month: s.getMonth(), day: s.getDate(), startH: s.getHours(), startM: s.getMinutes(), endH: e.getHours(), endM: e.getMinutes(), title: t, room: 'S1', teacher: '' }; };
          const a = UCA_TOOLS.nextCourse([mk(-30, 60, 'EN COURS'), mk(45, 60, 'PLUS TARD')], n.getTime());
          const b = UCA_TOOLS.nextCourse([mk(45, 60, 'PLUS TARD')], n.getTime());
          return { a: UCA_TOOLS.nextCourseText(a), b: UCA_TOOLS.nextCourseText(b), none: UCA_TOOLS.nextCourse([], n.getTime()) }; }""")
        check("prochain cours : en cours avec fin dans N min", base_ev["a"].startswith("En cours : EN COURS · S1 (fin dans "), base_ev["a"])
        check("prochain cours : dans N min", base_ev["b"].startswith("Prochain : PLUS TARD · S1 · dans "), base_ev["b"])
        check("prochain cours : rien à venir -> aucun texte", base_ev["none"] is None)
        pg0.close()

        sw.evaluate("(d) => chrome.storage.local.set(d)", data)
        for d in designs():
            did = d["id"]
            sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", did)
            sw.evaluate("() => chrome.storage.local.remove(['uca_subject_colors', 'uca_settings'])")
            ag = ctx.new_page()
            ag.on("pageerror", lambda e: errors.append(f"[{did}] {e}"))
            ag.on("console", lambda m: m.type == "error" and errors.append(f"[{did}] {m.text}"))
            ag.goto(f"{base}/{d['folder']}/agenda.html"); ag.wait_for_timeout(900)

            txt = ag.locator("#nextInfo").inner_text() if ag.locator("#nextInfo").count() else ""
            check(f"{did} : prochain cours dans la barre d'info", txt.startswith(("Prochain :", "En cours :")) and "R" in txt, txt)

            # raccourcis clavier
            label = lambda: ag.locator("#periodLabel").inner_text()
            ag.locator("#weekView").click(position={"x": 5, "y": 5}) if False else None
            first = label()
            ag.keyboard.press("ArrowRight"); ag.wait_for_timeout(250)
            moved = label()
            check(f"{did} : flèche droite = période suivante", moved != first, f"{first} -> {moved}")
            ag.keyboard.press("ArrowLeft"); ag.wait_for_timeout(250)
            check(f"{did} : flèche gauche = période précédente", label() == first, label())
            ag.keyboard.press("ArrowRight"); ag.keyboard.press("t"); ag.wait_for_timeout(250)
            check(f"{did} : T = aujourd'hui", label() == first, label())
            ag.keyboard.press("m"); ag.wait_for_timeout(300)
            check(f"{did} : M = vue Mois", ag.locator("#monthView.active, #monthView.view.active").count() == 1 or ag.locator("#viewTabs button[data-view='month'].active, #viewTabs button[data-view='month'][aria-selected='true']").count() == 1 or ag.locator(".month-grid").is_visible())
            ag.keyboard.press("s"); ag.wait_for_timeout(300)
            check(f"{did} : S = vue Semaine", ag.locator(".grid-view").first.is_visible())
            ag.keyboard.press("f"); ag.wait_for_timeout(250)
            check(f"{did} : F = panneau Filtres", ag.locator("#filterPanel.open").count() == 1)
            ag.locator("#filterPanel input[type=search], #filterPanel input[type=text], #filterPanel .fp-search").first.click()
            before = label(); ag.keyboard.type("t"); ag.wait_for_timeout(150)
            check(f"{did} : touches ignorées pendant la saisie", label() == before)
            ag.keyboard.press("Backspace"); ag.wait_for_timeout(150)
            ag.locator("#filterBtn").click()

            # jours fériés : novembre
            ag.keyboard.press("m"); ag.wait_for_timeout(250)
            for _ in range(2):
                if ag.locator(".month-cell.holiday").count() >= 1:
                    break
                ag.locator("#nextBtn").click(); ag.wait_for_timeout(200)
            nh = ag.locator(".month-cell.holiday").count()
            check(f"{did} : jours fériés repérés dans le mois", nh >= 1 and ag.locator(".month-cell.holiday").first.get_attribute("title"), str(nh))
            shot(ag, f"{did}-ferie")
            ag.keyboard.press("t"); ag.keyboard.press("s"); ag.wait_for_timeout(300)

            # couleur par matière
            card = ag.locator(".event-card", has_text="R1.02 Web").first
            card.dispatch_event("click"); ag.wait_for_timeout(300)
            sw_count = ag.locator("#subjectColor .sc-swatch").count()
            check(f"{did} : 10 couleurs + Auto dans le détail du cours", sw_count == 11, str(sw_count))
            ag.locator("#subjectColor .sc-swatch").nth(3).click(); ag.wait_for_timeout(300)
            stored = sw.evaluate("() => chrome.storage.local.get('uca_subject_colors').then(d => d.uca_subject_colors)")
            check(f"{did} : choix mémorisé pour la matière", stored and list(stored.values()) == [2], str(stored))
            ok = ag.evaluate("""() => { const t = document.createElement('i'); t.style.background = UCA_DESIGN.swatch(2); const want = t.style.background;
              const cards = [...document.querySelectorAll('.event-card')].filter(c => c.textContent.includes('R1.02 Web')); return cards.length > 0 && cards.every(c => c.style.background === want); }""")
            check(f"{did} : tous les cours de la matière prennent la couleur", ok)
            shot(ag, f"{did}-couleur")
            ag.locator("#subjectColor .sc-swatch").nth(0).click(); ag.wait_for_timeout(300)
            check(f"{did} : « Auto » rend la couleur du design", sw.evaluate("() => chrome.storage.local.get('uca_subject_colors').then(d => Object.keys(d.uca_subject_colors).length)") == 0)
            ag.locator("#closeDetail").click(); ag.wait_for_timeout(200)

            # blocs compacts
            cardsTxt = lambda: ag.evaluate("() => [...document.querySelectorAll('.view.active .event-card')].map(c => c.textContent).join('|')")
            check(f"{did} : enseignant visible par défaut", "Dupont" in cardsTxt() or "Martin" in cardsTxt())
            sw.evaluate("() => UCA_saveSettings({ compactCards: true })"); ag.wait_for_timeout(400)
            check(f"{did} : blocs compacts sans enseignant", "Dupont" not in cardsTxt() and "Mme Martin" not in cardsTxt() and "A101" in cardsTxt(), cardsTxt()[:120])
            sw.evaluate("() => UCA_saveSettings({ compactCards: false })"); ag.wait_for_timeout(300)

            # examens cliquables
            ag.locator("#notesBtn").click(); ag.wait_for_timeout(300)
            check(f"{did} : examens à venir dans la fenêtre Notes", ag.locator(".np-exam").count() >= 1 and "DS2" in ag.locator(".np-exam").first.inner_text())
            ag.locator(".np-exam").first.click(); ag.wait_for_timeout(300)
            check(f"{did} : clic sur un examen = fenêtre fermée, jour affiché", ag.locator("#notesPanel.open").count() == 0)
            ag.keyboard.press("t")

            # menu mobile
            ag.set_viewport_size({"width": 390, "height": 844}); ag.wait_for_timeout(300)
            ag.locator("#menuBtn").click(); ag.wait_for_timeout(250)
            entry = ag.locator("#mobileMenu .mi", has_text="Statut des sites")
            check(f"{did} : « Statut des sites » dans le menu mobile", entry.count() == 1)
            with ctx.expect_page() as newp:
                entry.click()
            np_ = newp.value; np_.wait_for_load_state()
            check(f"{did} : ouvre Paramètres sur le statut", np_.url.endswith("settings.html#statusSection"), np_.url)
            np_.close()
            ag.set_viewport_size({"width": 1400, "height": 860})
            ag.close()

        # popup : prochain cours
        for d in designs():
            sw.evaluate("(id) => chrome.storage.local.set({uca_design: id})", d["id"])
            pp = ctx.new_page(); pp.on("pageerror", lambda e: errors.append(f"[{d['id']}/popup] {e}"))
            pp.goto(f"{base}/{d['folder']}/popup.html"); pp.wait_for_timeout(700)
            t = pp.locator("#nextCourse").inner_text() if pp.locator("#nextCourse").count() else ""
            check(f"{d['id']} : prochain cours dans le popup", t.startswith(("Prochain :", "En cours :")), t)
            shot(pp, f"{d['id']}-popup-prochain")
            pp.close()

        # --- design automatique clair/sombre
        sw.evaluate("() => chrome.storage.local.set({ uca_design: 'professionnel', uca_settings: { autoDesign: true, designLight: 'professionnel', designDark: 'anime' } })")
        pg = ctx.new_page(); pg.emulate_media(color_scheme="light")
        pg.goto(f"{base}/designs/professionnel/agenda.html"); pg.wait_for_timeout(800)
        check("design auto : thème clair -> design clair", "/designs/professionnel/agenda.html" in pg.url, pg.url)
        pg.emulate_media(color_scheme="dark"); pg.wait_for_timeout(1200)
        check("design auto : le système passe au sombre -> design sombre", "/designs/anime/agenda.html" in pg.url, pg.url)
        check("design auto : choix mémorisé", sw.evaluate("() => chrome.storage.local.get('uca_design').then(d => d.uca_design)") == "anime")
        pg.emulate_media(color_scheme="light"); pg.wait_for_timeout(1200)
        check("design auto : retour au clair -> design clair", "/designs/professionnel/agenda.html" in pg.url, pg.url)
        sw.evaluate("() => UCA_saveSettings({ autoDesign: false })")
        pg.emulate_media(color_scheme="dark"); pg.wait_for_timeout(900)
        check("design auto désactivé : le design ne bouge pas", "/designs/professionnel/agenda.html" in pg.url, pg.url)
        # réglages visibles
        st = ctx.new_page(); st.goto(f"{base}/settings.html"); st.wait_for_timeout(800)
        check("Paramètres : design clair / sombre listent les designs", st.locator("#f-designLight option").count() == len(designs()) and st.locator("#f-designDark option").count() == len(designs()))
        check("Paramètres : blocs compacts", st.locator("#f-compactCards").count() == 1)
        ctx.close()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
