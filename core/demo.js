/* Données factices de la démo du site (page d'accueil). Ne fait rien hors démo (?demo=1, voir core/env.js).
   Chargé juste après env.js : le stockage de démo est en session et sans rapport avec celui de l'app, aucune requête
   n'est faite, aucun nom réel : tout est inventé et calé sur la semaine en cours pour que la démo paraisse vivante.
   Même emploi du temps, mêmes notes et mêmes absences quel que soit le design ; seul le scénario de changements d'emploi
   du temps (annulation, déplacement, salle, enseignant, horaire, intitulé, ajout) change d'un design à l'autre. */
(function () {
"use strict";

const isDemo = (window.UCA_APP && window.UCA_APP.demo) || /[?&]demo=1(?:&|$)/.test(location.search);
if (!isDemo) return;

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const nowMs = now.getTime();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const day = (offset) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (daysAgo, h, m) => { const d = new Date(nowMs - daysAgo * DAY); d.setHours(h, m, 0, 0); return d.getTime(); };

/* ---------------------------------------------------------------- emploi du temps jusqu'en septembre 2027 */
const S1 = [   // lundi → vendredi : [début h, m, fin h, m, intitulé, enseignant, salle, semaines (1 impaires, 2 paires, 0 toutes)]
  [[8, 0, 10, 0, "R1.01 Initiation au développement CM", "M. Dupont", "Amphi A", 0], [10, 15, 12, 15, "R1.02 Développement Web TD", "Mme Martin", "B204", 0], [13, 30, 15, 30, "SAE1.01 Projet d'équipe TP", "M. Durand, Mme Leroy", "Labo 3", 0], [16, 0, 17, 0, "Tutorat & Méthodologie", "M. Bernard", "C001", 1]],
  [[8, 0, 10, 0, "R1.03 Mathématiques discrètes CM", "M. Moreau", "Amphi B", 0], [10, 15, 12, 15, "R1.04 Systèmes d'exploitation TP", "M. Girard", "Labo Unix", 0], [13, 30, 15, 30, "R1.05 Anglais professionnel TD", "Mrs Smith", "D12", 0], [15, 45, 17, 45, "R1.06 Communication TD", "Mme Petit", "D05", 2]],
  [[8, 0, 10, 0, "R1.02 Développement Web CM", "Mme Martin", "Amphi A", 0], [10, 15, 12, 15, "R1.01 Développement objet TP", "M. Dupont", "Labo 2", 0], [14, 0, 16, 0, "SAE1.01 Projet d'équipe TP", "M. Durand, Mme Leroy", "Labo 3", 1]],
  [[8, 0, 10, 0, "R1.03 Mathématiques discrètes TD", "M. Moreau", "B101", 0], [10, 15, 12, 15, "R1.04 Systèmes d'exploitation CM", "M. Girard", "Amphi B", 0], [13, 30, 15, 30, "R1.01 Développement TD", "M. Dupont", "B203", 0], [15, 45, 17, 45, "R1.05 Anglais professionnel TD", "Mrs Smith", "D12", 2]],
  [[8, 0, 10, 0, "R1.06 Communication CM", "Mme Petit", "Amphi A", 0], [10, 15, 12, 15, "R1.02 Développement Web TP", "Mme Martin", "Labo 1", 0], [13, 30, 15, 30, "SAE1.01 Suivi de projet", "M. Durand", "Labo 3", 2]],
];
const rename = (tpl, from, to) => tpl.map((d) => d.map((s) => { const c = s.slice(); c[4] = c[4].replace(from, to); return c; }));
const S2 = rename(S1.map((d) => d.map((s) => s.slice())), /^(R|SAE)1\./, (m, a) => a + "2.");
const S3 = rename(S1.map((d) => d.map((s) => s.slice())), /^(R|SAE)1\./, (m, a) => a + "3.");
const OFF = [   // semaines sans cours (lundi de la semaine)
  [2026, 9, 26], [2026, 11, 21], [2026, 11, 28], [2027, 1, 22], [2027, 3, 12], [2027, 3, 19], [2027, 4, 3],
];
const offKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const offSet = new Set(OFF.map(([y, m, dd]) => `${y}-${m}-${dd}`));

const events = [];
function add(d, s) {
  events.push({ date: iso(d), year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), startH: s[0], startM: s[1], endH: s[2], endM: s[3], title: s[4], teacher: s[5], room: s[6], raw: s[4], color: "#888" });
}
const first = day(-70);                                       // dix semaines de passé : de quoi remplir les statistiques
const last = new Date(Math.max(new Date(2027, 8, 24).getTime(), nowMs + 140 * DAY));   // jusqu'à fin septembre 2027
for (let wk = new Date(first); wk <= last; wk.setDate(wk.getDate() + 7)) {
  const mon = new Date(wk);
  if (offSet.has(offKey(mon))) continue;
  if (mon >= new Date(2027, 6, 5) && mon < new Date(2027, 8, 6)) continue;   // juillet-août : stage, pas de cours
  const wnum = Math.floor((mon.getTime() - new Date(2026, 8, 1).getTime()) / (7 * DAY));
  const parity = wnum % 2 === 0 ? 2 : 1;
  const tpl = mon >= new Date(2027, 8, 6) ? S3 : mon >= new Date(2027, 0, 25) ? S2 : S1;
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    tpl[i].forEach((s, k) => {
      if (s[7] && s[7] !== parity) return;
      const c = s.slice();
      if (i === 3 && k === 0 && wnum % 6 === 5) { c[4] = c[4].replace(/TD$/, "DS Examen"); c[6] = "Amphi B"; c[2] = 10; c[3] = 30; }   // un DS toutes les six semaines
      add(d, c);
    });
  }
}
events.sort((a, b) => (a.date + pad(a.startH) + pad(a.startM)).localeCompare(b.date + pad(b.startH) + pad(b.startM)));

/* ---------------------------------------------------------------- scénarios de changements (un par design) */
const eventKey = (ev) => ev.date + "_" + pad(ev.startH) + ":" + pad(ev.startM) + "_" + ev.title;
const snap = (e) => ({ date: e.date, year: e.year, month: e.month, day: e.day, startH: e.startH, startM: e.startM, endH: e.endH, endM: e.endM, title: e.title, room: e.room, teacher: e.teacher });
const rng = (e) => `${pad(e.startH)}:${pad(e.startM)}–${pad(e.endH)}:${pad(e.endM)}`;
const dshort = (e) => new Date(e.year, e.month, e.day).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const find = (dayOff, h, m) => events.find((e) => e.date === iso(day(dayOff)) && e.startH === h && (m === undefined || e.startM === m));
const changes = [], activity = [];
function record(type, ev, before, details, hoursAgo) {
  const t = nowMs - hoursAgo * 3600000;
  changes.push({ type, kinds: [type], details, before: before ? snap(before) : undefined, key: eventKey(ev), ev, at: t });
  const label = { added: "Ajouté", cancelled: "Annulé", moved: "Déplacé", room: "Salle changée", teacher: "Enseignant changé", time: "Horaire modifié", title: "Intitulé modifié", info: "Infos modifiées" }[type];
  activity.push({ id: `edt|${t}|${activity.length}|${eventKey(ev)}`, at: t, kind: "edt", type, day: ev.date, past: false, title: `${label} : ${ev.title}`,
    text: [`${dshort(ev)} ${pad(ev.startH)}:${pad(ev.startM)}`].concat(type !== "added" && type !== "cancelled" ? details : []).join(" — ") });
}
const SCENARIOS = {
  cancel(h, hoursAgo) { const e = find(1, 10, 15); if (!e) return; events.splice(events.indexOf(e), 1); record("cancelled", e, null, [`${dshort(e)} ${rng(e)}, salle ${e.room}`], hoursAgo); },
  room(h, hoursAgo) { const e = find(0, 8, 0); if (!e) return; const o = snap(e); e.room = "Amphi C"; record("room", e, o, [`Salle : ${o.room} → ${e.room}`], hoursAgo); },
  moved(h, hoursAgo) { const e = find(2, 14, 0) || find(2, 10, 15); if (!e) return; const o = snap(e), d = day(4); e.date = iso(d); e.year = d.getFullYear(); e.month = d.getMonth(); e.day = d.getDate(); e.startH = 16; e.startM = 0; e.endH = 18; e.endM = 0;
    record("moved", e, o, [`Jour : ${dshort(o)} → ${dshort(e)}`, `Horaire : ${rng(o)} → ${rng(e)}`], hoursAgo); },
  teacher(h, hoursAgo) { const e = find(3, 10, 15); if (!e) return; const o = snap(e); e.teacher = "Mme Roussel"; record("teacher", e, o, [`Enseignant : ${o.teacher} → ${e.teacher}`], hoursAgo); },
  time(h, hoursAgo) { const e = find(4, 10, 15); if (!e) return; const o = snap(e); e.endH = 11; e.endM = 45; record("time", e, o, [`Horaire : ${rng(o)} → ${rng(e)}`], hoursAgo); },
  title(h, hoursAgo) { const e = find(3, 13, 30); if (!e) return; const o = snap(e); e.title = e.title.replace(/TD$/, "TP"); record("title", e, o, [`Intitulé : ${o.title} → ${e.title}`], hoursAgo); },
  added(h, hoursAgo) { const d = day(3); const ne = { date: iso(d), year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), startH: 18, startM: 0, endH: 19, endM: 30, title: "Conférence cybersécurité (intervenant extérieur)", teacher: "M. Lambert", room: "Amphi B", raw: "Conférence cybersécurité", color: "#888" };
    events.push(ne); record("added", ne, null, [`${dshort(ne)} ${rng(ne)}, salle ${ne.room}`], hoursAgo); },
  added2(h, hoursAgo) { const d = day(1); const ne = { date: iso(d), year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), startH: 17, startM: 45, endH: 18, endM: 45, title: "Rattrapage R1.04 Systèmes d'exploitation", teacher: "M. Girard", room: "Labo Unix", raw: "Rattrapage", color: "#888" };
    events.push(ne); record("added", ne, null, [`${dshort(ne)} ${rng(ne)}, salle ${ne.room}`], hoursAgo); },
};
const PLAN = {   // chaque design a son scénario d'emploi du temps : un cours annulé, ou déplacé, ou une salle changée, etc.
  studio:        [["cancel", 3], ["room", 7], ["added", 20], ["teacher", 30]],
  anime:         [["moved", 2], ["room", 9], ["cancel", 26], ["title", 40]],
  professionnel: [["room", 4], ["time", 8], ["title", 21], ["added2", 30], ["cancel", 52]],
  lumen:         [["cancel", 5], ["teacher", 11], ["moved", 24], ["time", 36]],
  carnet:        [["added", 3], ["added2", 14], ["room", 22], ["moved", 38], ["teacher", 49]],
};
const m = /\/designs\/([\w-]+)\//.exec(location.pathname);
const design = m && PLAN[m[1]] ? m[1] : "professionnel";
PLAN[design].forEach(([name, ago]) => SCENARIOS[name](0, ago));
events.sort((a, b) => (a.date + pad(a.startH) + pad(a.startM)).localeCompare(b.date + pad(b.startH) + pad(b.startM)));

/* ---------------------------------------------------------------- notes (dates de première vue : bulles « note du … » et courbe de la moyenne) */
const seen = { __v: 2 };
const ev = (label, coeff, note, moy, maxi, mini, when) => ({ label, key: label, coeff, note, moy: note === null ? null : moy, maxi: note === null ? null : maxi, mini: note === null ? null : mini, when });
const UE = [
  { label: "UE 1.1 Réaliser un développement", coeff: 5, matieres: [
    { label: "R1.01 : Initiation au développement", coeff: 3, evals: [ev("DS1 (sur 20.0)", 1, 14, 11, 19, 4, at(68, 16, 20)), ev("TP noté (sur 20.0)", 1, 16, 12, 20, 7, at(54, 9, 10)), ev("Projet objet (sur 20.0)", 2, 15, 12.5, 19, 6, at(31, 11, 45)), ev("DS2 (sur 20.0)", 2, 12.5, 11, 18, 3, at(0.6, 8, 40)), ev("DS3 (sur 20.0)", 2, null)] },
    { label: "R1.02 : Développement Web", coeff: 2, evals: [ev("Projet (sur 20.0)", 2, 12, 11, 17, 6, at(47, 14, 5)), ev("QCM (sur 20.0)", 1, 17, 13, 20, 5, at(26, 15, 30)), ev("TP noté (sur 20.0)", 1, 13.5, 12, 19, 7, at(1.4, 17, 15)), ev("Oral (sur 20.0)", 1, null)] },
    { label: "SAE1.01 : Projet d'équipe", coeff: 3, evals: [ev("Livrable 1 (sur 20.0)", 1, 15, 13, 18, 8, at(40, 18, 0)), ev("Soutenance (sur 20.0)", 2, null)] } ] },
  { label: "UE 1.2 Optimiser des applications", coeff: 4, matieres: [
    { label: "R1.03 : Mathématiques discrètes", coeff: 2, evals: [ev("QCM (sur 20.0)", 1, 8, 9, 18, 2, at(60, 10, 30)), ev("DS1 (sur 20.0)", 3, 10.5, 9.5, 17, 3, at(35, 13, 0)), ev("DS2 (sur 20.0)", 3, 7, 9, 18, 1, at(12, 16, 45)), ev("DS3 (sur 20.0)", 3, null)] },
    { label: "R1.04 : Systèmes d'exploitation", coeff: 2, evals: [ev("TP noté (sur 20.0)", 1, 13, 12, 19, 6, at(44, 11, 10)), ev("DS (sur 20.0)", 2, 14.5, 11, 18, 4, at(18, 9, 25)), ev("Projet shell (sur 20.0)", 1, null)] } ] },
  { label: "UE 1.3 Communiquer", coeff: 3, matieres: [
    { label: "R1.05 : Anglais professionnel", coeff: 2, evals: [ev("Oral (sur 20.0)", 1, 16, 14, 20, 9, at(51, 15, 0)), ev("TOEIC blanc (sur 20.0)", 2, 17.5, 14.5, 20, 8, at(8, 10, 0)), ev("Écrit (sur 20.0)", 1, null)] },
    { label: "R1.06 : Communication", coeff: 1, evals: [ev("Dossier (sur 20.0)", 1, 14, 13, 18, 8, at(22, 12, 0)), ev("Présentation (sur 20.0)", 1, 15.5, 13.5, 19, 9, at(2.5, 16, 30))] } ] },
];
const releve = { ue: UE.map((u) => ({ label: u.label, coeff: u.coeff, note: null, matieres: u.matieres.map((mt) => ({ label: mt.label, coeff: mt.coeff, note: null, evals: mt.evals.map((e) => {
  if (e.note !== null && e.when) seen[mt.label + "|" + e.key] = { at: e.when, note: e.note };
  const { when, ...rest } = e; return rest; }) })) })) };
const gradeActivity = [];
UE.forEach((u) => u.matieres.forEach((mt) => mt.evals.forEach((e) => { if (e.note !== null && nowMs - e.when < 6 * DAY) gradeActivity.push({ id: `grade|${e.when}|${mt.label}`, at: e.when, kind: "grade", type: "grade", title: "Nouvelle note", text: `${mt.label.split(" : ")[0]} ${e.label.replace(/ \(sur.*/, "")} : ${String(e.note).replace(".", ",")}` }); })));

/* ---------------------------------------------------------------- absences : toutes justifiées et valides */
const decl = (daysAgo, sh, eh, motif, deposeAgo) => { const a = new Date(nowMs - daysAgo * DAY); a.setHours(sh, 0, 0, 0); const b = new Date(a); b.setHours(eh, 0, 0, 0); return { debut: a.getTime(), fin: b.getTime(), depose: nowMs - deposeAgo * DAY, motif, statut: "justifiee", statutLibelle: "Justifiée" }; };
const declarations = [
  decl(3, 8, 12, "Certificat médical (consultation)", 2), decl(10, 8, 17, "Convocation officielle (journée défense)", 8), decl(19, 13, 17, "Rendez-vous médical (certificat fourni)", 17),
  decl(33, 8, 10, "Retard de transport (grève attestée)", 31), decl(48, 8, 17, "Deuil familial", 46), decl(61, 10, 12, "Entretien de stage (convocation de l'entreprise)", 59),
];

const tomorrow = day(((now.getDay() + 6) % 7) + 1);
const data = {
  uca_events: events,
  uca_last_sync: now.toISOString(),
  uca_app_imported_at: now.toISOString(),
  uca_session_expired: false,
  uca_settings: { absenceAlert: 3, noteNewDays: 2 },
  uca_releve_notes: releve,
  uca_notes_seen: seen,
  uca_notes_history: [],
  uca_edt_changes: changes,
  uca_activity: activity.concat(gradeActivity).sort((a, b) => b.at - a.at),
  uca_absences: { declarees: declarations.length, justifiees: declarations.length, nonJustifiees: 0, avecMotifs: declarations.length, journeesNonJustifiees: 0, declarations },
  uca_tasks: [
    { id: "task1", title: "Rendre le compte-rendu SAE1.01", subject: "SAE1.01", due: iso(tomorrow), done: false, created: 1 },
    { id: "task2", title: "Réviser le DS3 de Mathématiques R1.03", subject: "R1.03", due: iso(day(((now.getDay() + 6) % 7) + 3)), done: false, created: 2 },
    { id: "task3", title: "Préparer l'oral d'anglais (TOEIC)", subject: "R1.05", due: iso(day(((now.getDay() + 6) % 7) + 6)), done: false, created: 3 },
    { id: "task4", title: "Pousser le projet objet sur le dépôt", subject: "R1.01", due: iso(day(((now.getDay() + 6) % 7) - 1)), done: true, created: 4 },
  ],
};
if (m) data.uca_design = m[1];
chrome.storage.local.set(data);

// La démo ne propose que ce qui y fonctionne
const style = document.createElement("style");
style.textContent = "#appImportBtn,#settingsBtn,#designBtn,#helpBtn,#phoneBtn,a[href$=\"aide.html\"]{display:none!important;}";
document.head.appendChild(style);
})();
