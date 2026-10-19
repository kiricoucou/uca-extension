"""Test de bout en bout de l'extension, pour chaque design du registre.

Usage : python -I -X utf8 tests/e2e.py [dossier_captures]
Sort avec un code 1 si une vérification échoue.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fixtures import seed, EXPECTED_AVERAGE  # noqa: E402
from harness import designs, launch  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def shot(page, name):
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT / f"{name}.png"))


JS_OVERFLOWING = """() => [...document.querySelectorAll('.view.active .event-card')].filter(c => {
  const cs = getComputedStyle(c); const room = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let used = 0; for (const k of c.children) { const ks = getComputedStyle(k); if (ks.position !== 'absolute' && ks.display !== 'none') used += k.scrollHeight; }
  return used > room + 2; }).map(c => c.textContent.slice(0, 40))"""
JS_GRID_SCROLL = "() => { const s = document.querySelector('.view.active .grid-scroll'); return s ? s.scrollHeight - s.clientHeight : 0; }"
JS_HEADER = """() => {
  const keep = [...document.querySelector('header').children].filter(e => e.offsetWidth && !e.classList.contains('hdr-break')
    && !['absolute', 'fixed'].includes(getComputedStyle(e).position));
  const centers = keep.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }).sort((a, b) => a - b);
  const rows = []; centers.forEach(c => { if (!rows.length || c - rows[rows.length - 1] > 14) rows.push(c); });
  const KEYS = ['viewTabs', 'prevBtn', 'periodLabel', 'nextBtn', 'todayBtn', 'zoomCtrl', 'absencesWrap', 'notesWrap',
                'settingsBtn', 'designBtn', 'syncBtn'];
  const order = keep.map(e => { const h = e.getAttribute('href') || ''; if (h) return h.includes('moodle') ? 'moodle' : h.includes('mail') ? 'mail' : h.includes('aide') ? 'aide' : h;
    return KEYS.includes(e.id) ? e.id : null; }).filter(Boolean);
  return { rows: rows.length, order: order.join(',') };
}"""


def main():
    errors = []
    data = seed()
    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 860})

        def watch(page, tag):
            page.on("pageerror", lambda e: errors.append(f"[{tag}] {e}"))
            page.on("console", lambda m: m.type == "error" and errors.append(f"[{tag}] {m.text}"))

        opened = False
        for _ in range(25):
            opened = any("choose.html?tab=1" in pg.url for pg in ctx.pages)
            if opened:
                break
            ctx.pages[0].wait_for_timeout(200)
        check("sélecteur ouvert à l'installation", opened)
        check("popup = sélecteur avant choix", sw.evaluate("chrome.action.getPopup({})").endswith("/choose.html"))
        sw.evaluate("(s) => chrome.storage.local.set(s)", data)

        orders = {}
        for d in designs():
            did = d["id"]
            pg = ctx.new_page(); watch(pg, f"{did}/popup")
            pg.set_viewport_size({"width": 400, "height": 600})
            pg.goto(f"{base}/choose.html?change=1"); pg.bring_to_front(); pg.wait_for_timeout(500)
            slides = pg.locator(".card", has_text=d["name"]).first.locator(".slide").count()
            check(f"{did} : galerie ≥ 5 captures", slides >= 5, f"{slides}")
            pg.locator(".card", has_text=d["name"]).first.locator(".choose-btn").click()
            pg.wait_for_url(f"**/{d['folder']}/popup.html", timeout=5000); pg.wait_for_timeout(500)
            check(f"{did} : popup du design appliqué", sw.evaluate("chrome.action.getPopup({})").endswith(f"/{d['folder']}/popup.html"))
            check(f"{did} : connecté → bouton Déconnexion", pg.locator("#logoutBtn").is_visible() and pg.locator("#loginBtn").is_hidden())
            check(f"{did} : boutons Paramètres et Design dans le popup", pg.locator("#settingsBtn").count() == 1 and pg.locator("#designBtn").count() == 1)
            shot(pg, f"{did}-popup"); pg.close()

            ag = ctx.new_page(); watch(ag, f"{did}/agenda")
            ag.goto(f"{base}/{d['folder']}/agenda.html"); ag.bring_to_front(); ag.wait_for_timeout(900)
            for v in ["week", "5day", "6day", "3day", "day"]:
                b = ag.locator(f"#viewTabs button[data-view='{v}']")
                if not b.count():
                    continue
                b.click(); ag.wait_for_timeout(350)
                check(f"{did} : vue {v} sans scroll", ag.evaluate(JS_GRID_SCROLL) <= 0)
                over = ag.evaluate(JS_OVERFLOWING)
                check(f"{did} : vue {v} aucun bloc coupé", not over, str(over))
            ag.locator("#viewTabs button[data-view='week']").click(); ag.wait_for_timeout(300)
            shot(ag, f"{did}-semaine")
            ag.locator("#notesBtn").click(); ag.wait_for_timeout(300)
            check(f"{did} : moyenne générale", ag.locator(".notes-avg .na-val").inner_text().startswith(EXPECTED_AVERAGE))
            cls = ag.evaluate("() => [...document.querySelectorAll('.notes-table td.note')].map(t => t.className)")
            check(f"{did} : note < 2 j orange, < 4 j jaune", sum("note-new" in c for c in cls) == 1 and sum("note-recent" in c for c in cls) == 1)
            check(f"{did} : légende notes récentes", ag.locator(".notes-legend").is_visible())
            ag.locator("#notesBtn").click()
            ag.locator("#absencesBtn").click(); ag.wait_for_timeout(300)
            decl = ag.locator("#absencesPanel .ap-decl").count()
            statuses = ag.evaluate("() => [...document.querySelectorAll('#absencesPanel .ap-status')].map(e => e.textContent).join(',')")
            check(f"{did} : détail des déclarations d'absence", decl == 2 and statuses == "Justifiée,En attente", f"{decl} {statuses}")
            shot(ag, f"{did}-absences")
            ag.locator("#absencesBtn").click()
            for w in (1100, 1400, 1920):
                ag.set_viewport_size({"width": w, "height": 860}); ag.wait_for_timeout(300)
                h = ag.evaluate(JS_HEADER)
                check(f"{did} : barre sur 2 étages à {w}px", h["rows"] == 2, str(h["rows"]))
                orders.setdefault(did, h["order"])
            ag.set_viewport_size({"width": 1400, "height": 860})

            sw.evaluate("chrome.storage.local.set({uca_settings: {hideWeekend: true}})"); ag.wait_for_timeout(400)
            cols = ag.evaluate("() => document.querySelectorAll('.view.active .grid-daycol').length")
            check(f"{did} : réglage « masquer le week-end »", cols == 5, str(cols))
            sw.evaluate("chrome.storage.local.set({uca_settings: {startView: 'month'}})")
            ag.reload(); ag.wait_for_timeout(800)
            check(f"{did} : réglage « vue à l'ouverture »", ag.locator("#monthView.active").count() == 1)
            sw.evaluate("chrome.storage.local.remove('uca_settings')")
            ag.close()

            mob = ctx.new_page(); watch(mob, f"{did}/mobile")
            mob.set_viewport_size({"width": 390, "height": 844})
            mob.goto(f"{base}/{d['folder']}/agenda.html"); mob.bring_to_front(); mob.wait_for_timeout(800)
            check(f"{did} : téléphone → vue Jour en cartes", mob.locator(".m-day-view").count() == 1)
            shot(mob, f"{did}-mobile"); mob.close()

        check("même ordre des boutons dans tous les designs", len(set(orders.values())) == 1, str(orders))
        settings = ctx.new_page(); watch(settings, "settings")
        settings.goto(f"{base}/settings.html"); settings.wait_for_timeout(400)
        settings.select_option("#f-startView", "week"); settings.wait_for_timeout(300)
        check("page Paramètres enregistre", sw.evaluate("chrome.storage.local.get('uca_settings').then(d => d.uca_settings && d.uca_settings.startView)") == "week")
        ctx.close()
    check("aucune erreur JavaScript", not errors, " | ".join(errors[:5]))
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
