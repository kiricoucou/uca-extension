"""Cloche « Activité » de l'extension : garder, supprimer, filtrer, tout supprimer sauf les gardées, durée de conservation
réglable (les gardées ne sont jamais supprimées, les supprimées ne reviennent pas à la synchro suivante), 5 designs.
Teste aussi la logique pure (node) et le réglage dans Paramètres.

Usage : python -I -X utf8 tests/activity_manage.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import ROOT, designs, launch  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


NODE = r"""
const A = require(process.argv[1]);
const DAY = 86400000, now = Date.now();
const e = (id, ageDays, extra) => Object.assign({ id, at: now - ageDays * DAY, kind: 'edt', type: 'moved', title: id, text: '' }, extra || {});
const out = {};
out.defaut30 = A.merge([e('a', 1), e('b', 40)], [], now).map((x) => x.id);
out.garde = A.merge([e('a', 1), e('b', 400, { kept: true })], [], now, { keepDays: 7 }).map((x) => x.id);
out.illimite = A.merge([e('a', 1), e('b', 400)], [], now, { keepDays: 0 }).map((x) => x.id);
out.supprime = A.merge([e('a', 1)], [e('x', 0), e('a', 0)], now, { dismissed: ['x'] }).map((x) => x.id);
out.plafond = A.merge(Array.from({ length: 160 }, (_, i) => e('n' + i, 0.001 * i)), [], now).length;
out.plafondGardees = A.merge(Array.from({ length: 160 }, (_, i) => e('n' + i, 0.001 * i, i < 3 ? { kept: true } : {})), [], now).filter((x) => x.kept).length;
out.toggle = A.toggleKeep([e('a', 1)], 'a')[0].kept;
out.remove = A.remove([e('a', 1), e('b', 1)], 'a').map((x) => x.id);
out.clear = A.clearExceptKept([e('a', 1, { kept: true }), e('b', 1)]).map((x) => x.id);
out.filtre = [A.filterLog([e('a', 1, { kept: true }), e('b', 1)], 'kept', 0).length, A.filterLog([e('a', 1), e('b', 1, { past: true })], 'unread', 0).length];
console.log(JSON.stringify(out));
"""


def seed_entries():
    now = int(time.time() * 1000)
    day = 86400000
    mk = lambda i, kind, ty, title, age, kept=False: {"id": i, "at": now - int(age * day), "kind": kind, "type": ty, "title": title, "text": "détail " + i, "day": "2026-11-10", "past": False, "kept": kept}
    return [mk("a1", "edt", "moved", "Cours déplacé : R1.01", 0.01), mk("a2", "grade", "grade", "Nouvelle note : DS1", 0.5), mk("a3", "edt", "room", "Salle changée : TD2", 2),
            mk("a4", "edt", "cancelled", "Cours annulé : TP1", 5)]


def main():
    r = subprocess.run(["node", "-e", NODE, (ROOT / "core" / "activity.js").as_posix()], capture_output=True, text=True, encoding="utf-8")
    o = json.loads(r.stdout or "{}")
    check("durée 30 j par défaut : l'entrée de 40 j disparaît", o.get("defaut30") == ["a"], str(o))
    check("une entrée gardée de 400 j survit à une durée de 7 j", o.get("garde") == ["a", "b"] or sorted(o.get("garde", [])) == ["a", "b"], str(o.get("garde")))
    check("durée illimitée : tout reste", sorted(o.get("illimite", [])) == ["a", "b"])
    check("une notification supprimée n'est jamais ré-ajoutée", o.get("supprime") == ["a"] or sorted(o.get("supprime", [])) == ["a"], str(o.get("supprime")))
    check("plafond de 150 entrées non gardées", o.get("plafond") == 150, str(o.get("plafond")))
    check("les gardées ne comptent pas dans le plafond", o.get("plafondGardees") == 3)
    check("garder / supprimer / tout supprimer sauf gardées / filtres", o.get("toggle") is True and o.get("remove") == ["b"] and o.get("clear") == ["a"] and o.get("filtre") == [1, 1], str(o))

    with sync_playwright() as p:
        ctx, sw, base = launch(p, viewport={"width": 1400, "height": 900})
        try:
            for d in designs():
                sw.evaluate("(a) => chrome.storage.local.set({ uca_activity: a, uca_activity_dismissed: [], uca_activity_seen: 0 })", seed_entries())
                pg = ctx.new_page(); errors = []
                pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(f"{base}/{d['folder']}/agenda.html"); pg.wait_for_timeout(1500)
                pg.locator("#bellBtn").click(); pg.wait_for_timeout(500)
                n0 = pg.locator("#bellPanel .act-item").count()
                check(f"{d['id']} : entrées listées avec filtres et actions", n0 == 4 and pg.locator("#bellPanel .act-chip").count() == 3 and pg.locator("#bellPanel .act-acts button").count() == 8, str(n0))
                pg.locator("#bellPanel .act-acts button", has_text="Garder").nth(1).click(); pg.wait_for_timeout(250)
                check(f"{d['id']} : garder une entrée (★)", pg.locator("#bellPanel .act-item.kept").count() == 1)
                pg.locator("#bellPanel .act-chip", has_text="Gardées").click(); pg.wait_for_timeout(200)
                check(f"{d['id']} : filtre « Gardées »", pg.locator("#bellPanel .act-item").count() == 1)
                pg.locator("#bellPanel .act-chip", has_text="Toutes").click(); pg.wait_for_timeout(200)
                pg.locator("#bellPanel .act-acts button.del").first.click(); pg.wait_for_timeout(300)
                check(f"{d['id']} : supprimer une entrée", pg.locator("#bellPanel .act-item").count() == 3)
                dism = sw.evaluate("chrome.storage.local.get('uca_activity_dismissed').then(d => d.uca_activity_dismissed || [])")
                check(f"{d['id']} : l'entrée supprimée est mémorisée (ne reviendra pas)", len(dism) == 1, str(dism))
                pg.locator("#bellPanel .act-head button", has_text="Tout supprimer sauf les gardées").click(); pg.wait_for_timeout(300)
                left = sw.evaluate("chrome.storage.local.get('uca_activity').then(d => (d.uca_activity || []).map(e => [e.id, e.kept]))")
                check(f"{d['id']} : tout supprimer garde la gardée (stockage)", len(left) == 1 and left[0][1] is True, str(left))
                check(f"{d['id']} : aucune erreur JavaScript", not errors, "; ".join(errors)[:200])
                pg.close()
            # réglage dans Paramètres
            pg = ctx.new_page(); pg.goto(f"{base}/settings.html"); pg.wait_for_timeout(1000)
            sel = pg.locator("select#activityKeepDays, [data-key=activityKeepDays] select, select[name=activityKeepDays]")
            found = pg.evaluate("() => document.body.innerText.includes('Conserver les notifications de la cloche')")
            check("Paramètres : réglage « Conserver les notifications de la cloche »", found)
            pg.close()
        finally:
            ctx.close()
    ok = sum(results)
    print(f"\n{ok}/{len(results)} vérifications OK")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
