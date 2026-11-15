"""Widgets (core/widgets.js) : résumé des données (snapshot), calculs dépendant de l'heure (derive) et rendu des 25 widgets,
avec une horloge fixe (mercredi 18 novembre 2026, 10 h 30) et des données inventées.

Usage : python -I -X utf8 tests/widgets.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))


JS = r"""
global.self = global;
require('./core/grades.js'); require('./core/widgets.js');
const W = self.UCA_WIDGETS;
const NOW = new Date(2026, 10, 18, 10, 30).getTime();
const ev = (d, sh, sm, eh, em, title, room, extra) => Object.assign({ year: 2026, month: 10, day: d, startH: sh, startM: sm, endH: eh, endM: em, title, room, teacher: 'M. Dupont' }, extra || {});
const data = {
  uca_events: [
    ev(16, 8, 0, 10, 0, 'R1.01 Développement CM', 'A101'), ev(18, 8, 0, 10, 0, 'R1.01 Développement CM', 'A101'),
    ev(18, 10, 15, 12, 15, 'R1.02 Web TD', 'B204'), ev(18, 13, 30, 15, 30, 'SAE1.01 Projet TP', 'Labo 3'), ev(18, 16, 0, 17, 0, 'Tutorat', 'C001'),
    ev(19, 8, 0, 10, 0, 'R1.05 Anglais', 'D12', { cancelled: true }), ev(19, 10, 0, 12, 0, 'R1.03 Réseau TD', 'E5'),
    ev(25, 9, 0, 11, 0, 'R1.02 Examen DS', 'Amphi 1'), ev(20, 8, 0, 9, 0, '<img src=x onerror=alert(1)> piège', '<b>X</b>'),
  ],
  uca_tasks: [
    { id: 'a', title: 'Rendre le TP réseau', subject: 'R1.03', due: '2026-11-16', done: false },
    { id: 'b', title: 'Réviser le DS', subject: 'R1.02', due: '2026-11-18', done: false },
    { id: 'c', title: 'Lire le chapitre 4', subject: '', due: '2026-11-25', done: false },
    { id: 'd', title: 'Déjà fait', subject: '', due: '2026-11-17', done: true },
    { id: 'e', title: 'Sans date', subject: '', due: '', done: false },
  ],
  uca_releve_notes: { ue: [{ label: 'UE 1.1', coeff: 1, note: null, matieres: [
    { label: 'R1.01 : Init dev', coeff: 2, note: null, moy: 11, evals: [{ label: 'DS1 (sur 20.0)', coeff: 1, note: 14, moy: 11 }, { label: 'TP (sur 20.0)', coeff: 1, note: 16, moy: 12 }] },
    { label: 'R1.02 : Web', coeff: 1, note: 8, moy: 10, evals: [{ label: 'QCM (sur 12.0)', coeff: 1, note: 5, moy: 6 }] },
    { label: 'R1.03 : Réseau', coeff: 1, note: 9.5, moy: 10, evals: [] }] }] },
  uca_scales: {},
  uca_absences: { declarees: 3, justifiees: 2, nonJustifiees: 1, journeesNonJustifiees: 1 },
  uca_notes_history: [{ at: 1, avg: 10.5 }, { at: 2, avg: 11.2 }, { at: 3, avg: 12.1 }],
  uca_last_sync: new Date(2026, 10, 18, 9, 0).toISOString(), uca_session_expired: false,
};
const snap = W.snapshot(data, NOW);
const vm = W.derive(snap, NOW);
const out = { n: W.CATALOG.length };
out.snapEvents = snap.events.length; out.snapExams = snap.exams.length; out.snapAvg = snap.avg; out.snapTasks = snap.tasks.length;
out.snapSize = JSON.stringify(snap).length; out.snapMat = snap.matieres.length; out.snapAbs = snap.absences;
out.cur = vm.cur && vm.cur.title; out.next = vm.next && vm.next.title; out.afterN = vm.after.length; out.todayN = vm.today.length;
out.left = vm.todayLeftMin; out.pause = vm.pause; out.progress = Math.round(vm.progress * 100);
out.week = vm.weekLoad.map((d) => d.min).join(','); out.weekToday = vm.weekLoad.findIndex((d) => d.today);
out.tasks = { open: vm.tasks.open, late: vm.tasks.late, today: vm.tasks.today, first: vm.tasks.all[0].title, last: vm.tasks.all[vm.tasks.all.length - 1].title };
out.exams = vm.exams.map((x) => x.days); out.freeDay = vm.freeDay && vm.freeDay.label; out.dateLabel = vm.dateLabel; out.week46 = vm.week;
out.avg = vm.avg; out.avgPrev = vm.avgPrev; out.best = vm.best && vm.best.l; out.worst = vm.worst && vm.worst.l; out.greet = vm.greet;
out.html = {}; W.CATALOG.forEach((w) => { out.html[w.id] = W.render(w.id, vm); });
const empty = W.derive(W.snapshot({}, NOW), NOW); out.emptyHtml = {}; W.CATALOG.forEach((w) => { out.emptyHtml[w.id] = W.render(w.id, empty); });
out.fmt = [W.fmtNote(12), W.fmtNote(12.5), W.fmtNote(12.345), W.fmtNote(null), W.fmtNote(0.5), W.fmtNote(10)];
out.dur = [W.durText(5), W.durText(60), W.durText(135)];
// après la fin des cours (18 h) et le soir
const late = W.derive(snap, new Date(2026, 10, 18, 18, 0).getTime()); out.lateDone = late.doneToday; out.lateHtml = W.render('endday', late);
// samedi : pas de cours, jour libre en semaine
const sat = W.derive(snap, new Date(2026, 10, 21, 12, 0).getTime()); out.satToday = sat.today.length;
console.log(JSON.stringify(out));
"""


def main():
    r = subprocess.run(["node", "-e", JS], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        check("exécution de core/widgets.js sous Node", False, r.stderr[-400:]); sys.exit(1)
    o = json.loads(r.stdout.strip().splitlines()[-1])
    check("25 widgets au catalogue", o["n"] == 25, str(o["n"]))
    check("snapshot : cours de la semaine en cours et des 3 semaines suivantes, examen séparé", o["snapEvents"] == 9 and o["snapExams"] == 1, f"{o['snapEvents']}/{o['snapExams']}")
    check("snapshot : moyenne générale calculée avec UCA_GRADES", o["snapAvg"] is not None and 10 < o["snapAvg"] < 14, str(o["snapAvg"]))
    check("snapshot : devoirs faits exclus", o["snapTasks"] == 4, str(o["snapTasks"]))
    check("snapshot : matières, absences", o["snapMat"] == 3 and o["snapAbs"] == {"total": 3, "justified": 2, "unjustified": 1, "days": 1}, str(o["snapAbs"]))
    check("snapshot compact (< 20 Ko)", o["snapSize"] < 20000, str(o["snapSize"]))
    check("10 h 30 : le cours en cours est « Web TD »", o["cur"] == "R1.02 Web TD" and o["next"] == "R1.02 Web TD", str(o["cur"]))
    check("cours du jour : 4, dont 2 à venir après le cours en cours", o["todayN"] == 4 and o["afterN"] == 2, f"{o['todayN']}/{o['afterN']}")
    check("progression du cours en cours (10:15-12:15, il est 10:30) = 13 % (12,5 arrondi)", o["progress"] == 13, str(o["progress"]))
    check("fin de journée : 17:00 dans 6 h 30 (390 min)", o["left"] == 390, str(o["left"]))
    check("pause à venir : 75 min entre 12:15 et 13:30", o["pause"] and o["pause"]["state"] == "soon" and o["pause"]["min"] == 75, str(o["pause"]))
    check("charge de la semaine (min) : lundi 120, mercredi 420, jeudi 120 (annulé exclu), vendredi 60 ; mercredi marqué", o["week"] == "120,0,420,120,60,0,0" and o["weekToday"] == 2, o["week"])
    check("devoirs : 4 ouverts, 1 en retard, 1 pour aujourd'hui, tri par date, sans date en dernier", o["tasks"] == {"open": 4, "late": 1, "today": 1, "first": "Rendre le TP réseau", "last": "Sans date"}, str(o["tasks"]))
    check("examen dans 7 jours", o["exams"] == [7], str(o["exams"]))
    check("prochain jour sans cours en semaine : vendredi 20 ?", o["freeDay"] is not None, str(o["freeDay"]))
    check("date et semaine : mercredi 18 novembre, semaine 47", o["dateLabel"] == "mercredi 18 novembre" and o["week46"] == 47, f"{o['dateLabel']} s{o['week46']}")
    check("tendance de la moyenne : précédente = 11,2", o["avgPrev"] == 11.2, str(o["avgPrev"]))
    check("meilleure / pire matière", o["best"] == "R1.01 : Init dev" and o["worst"] == "R1.02 : Web", f"{o['best']} / {o['worst']}")
    check("salutation du matin", o["greet"] == "Bonjour")
    check("formats : notes et durées", o["fmt"] == ["12", "12,5", "12,35", "—", "0,5", "10"] and o["dur"] == ["5 min", "1 h", "2 h 15"], str(o["fmt"]) + str(o["dur"]))
    bad = [k for k, h in o["html"].items() if not h.strip() or "undefined" in h or "NaN" in h or "[object" in h]
    check("les 25 widgets se rendent avec des données, sans « undefined » ni « NaN »", not bad, str(bad))
    bad = [k for k, h in o["emptyHtml"].items() if not h.strip() or "undefined" in h or "NaN" in h or "[object" in h]
    check("les 25 widgets se rendent sans aucune donnée (messages vides propres)", not bad, str(bad))
    alltxt = "".join(o["html"].values())
    check("textes saisis échappés (aucune balise <img> ni <b> injectée)", "<img" not in alltxt and "<b>X</b>" not in alltxt)
    check("après 18 h : journée terminée", o["lateDone"] and "Terminé" in o["lateHtml"])
    check("samedi : aucun cours", o["satToday"] == 0)
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
