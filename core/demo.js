/* Données factices de la démo du site (page d'accueil). Ne fait rien hors démo (?demo=1, voir core/env.js).
   Chargé juste après env.js : le stockage de démo est en session et sans rapport avec celui de l'app, aucune requête
   n'est faite, aucun nom réel : tout est inventé et calé sur la semaine en cours pour que la démo paraisse vivante. */
(function () {
"use strict";
if (!window.UCA_APP || !window.UCA_APP.demo) return;

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const day = (offset) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const events = [];
function add(d, sh, sm, eh, em, title, teacher, room) {
  events.push({ date: iso(d), year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), startH: sh, startM: sm, endH: eh, endM: em, title, teacher, room, raw: title, color: "#888" });
}
const slots = [
  [8, 0, 10, 0, "R1.01 Développement CM", "M. Dupont", "A101"],
  [10, 15, 12, 15, "R1.02 Web TD", "Mme Martin", "B204"],
  [13, 30, 15, 30, "SAE1.01 Projet TP", "M. Durand, Mme Leroy", "Labo 3"],
  [16, 0, 17, 0, "Tutorat", "M. Bernard", "C001"],
  [18, 0, 20, 0, "R1.05 Anglais", "Mrs Smith", "D12"],
];
for (let i = 0; i < 5; i++) slots.slice(0, 3 + (i % 3)).forEach((s) => add(day(i), ...s));
add(day(3), 8, 0, 10, 0, "R1.03 Maths DS1 Examen", "M. Moreau", "Amphi B");
add(day(7 + 1), 14, 0, 16, 0, "R1.02 Web DS2 Examen", "Mme Martin", "Amphi A");

const ev = (label, coeff, note, moy) => ({ label, key: label, coeff, note, moy: moy === undefined ? null : moy, maxi: null, mini: null });
const releve = { ue: [
  { label: "UE 1.1 Réaliser", coeff: 2, note: null, matieres: [
    { label: "R1.01 : Initiation au développement", coeff: 2, note: null, evals: [ev("DS1 (sur 20.0)", 1, 14, 11), ev("TP noté (sur 20.0)", 1, 16, 12), ev("DS2 (sur 20.0)", 2, null)] },
    { label: "R1.02 : Web", coeff: 1, note: null, evals: [ev("Projet (sur 20.0)", 2, 12, 11), ev("QCM (sur 20.0)", 1, null)] }] },
  { label: "UE 1.2 Optimiser", coeff: 1, note: null, matieres: [
    { label: "R1.03 : Mathématiques", coeff: 1, note: null, evals: [ev("QCM (sur 20.0)", 1, 8, 9), ev("DS1 (sur 20.0)", 3, null)] }] },
] };

const tomorrow = day(((now.getDay() + 6) % 7) + 1);
const data = {
  uca_events: events,
  uca_last_sync: now.toISOString(),
  uca_app_imported_at: now.toISOString(),
  uca_session_expired: false,
  uca_settings: { absenceAlert: 3 },
  uca_releve_notes: releve,
  uca_notes_seen: {},
  uca_absences: { declarees: 3, justifiees: 2, nonJustifiees: 2, avecMotifs: 1, journeesNonJustifiees: 0, declarations: [] },
  uca_tasks: [
    { id: "demo1", title: "Rendre le compte rendu de TP", subject: "SAE1.01", due: iso(tomorrow), done: false, created: 1 },
    { id: "demo2", title: "Réviser le chapitre 3", subject: "R1.03", due: iso(day(((now.getDay() + 6) % 7) + 3)), done: false, created: 2 },
  ],
};
const m = /\/designs\/([\w-]+)\//.exec(location.pathname);
if (m) data.uca_design = m[1];
chrome.storage.local.set(data);

// La démo ne propose que ce qui y fonctionne : pas d'import, pas de réglages ni de changement de design.
const style = document.createElement("style");
style.textContent = "#appImportBtn,#settingsBtn,#designBtn,#helpBtn,#phoneBtn,a[href$=\"aide.html\"]{display:none!important;}";
document.head.appendChild(style);
})();
