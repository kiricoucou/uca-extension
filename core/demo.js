/* Données factices de la démo du site (page d'accueil). Ne fait rien hors démo (?demo=1, voir core/env.js).
   Chargé juste après env.js : le stockage de démo est en session et sans rapport avec celui de l'app, aucune requête
   n'est faite, aucun nom réel : tout est inventé et calé sur la semaine en cours pour que la démo paraisse vivante. */
(function () {
"use strict";

const isDemo = (window.UCA_APP && window.UCA_APP.demo) || /[?&]demo=1(?:&|$)/.test(location.search);
if (!isDemo) return;

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
  [8, 0, 10, 0, "R1.01 Initiation au développement CM", "M. Dupont", "Amphi A"],
  [10, 15, 12, 15, "R1.02 Développement Web TD", "Mme Martin", "B204"],
  [13, 30, 15, 30, "SAE1.01 Projet d'équipe TP", "M. Durand, Mme Leroy", "Labo 3"],
  [16, 0, 17, 0, "Tutorat & Méthodologie", "M. Bernard", "C001"],
  [18, 0, 20, 0, "R1.05 Anglais professionnel", "Mrs Smith", "D12"],
];
for (let i = 0; i < 5; i++) slots.slice(0, 3 + (i % 3)).forEach((s) => add(day(i), ...s));
add(day(2), 16, 0, 18, 0, "R1.04 Systèmes d'exploitation TP", "M. Girard", "Labo Unix");
add(day(3), 8, 0, 10, 0, "R1.03 Mathématiques discrètes DS1 Examen", "M. Moreau", "Amphi B");
add(day(4), 14, 0, 16, 0, "R1.01 Dév objet TP noté", "M. Dupont", "Labo 2");
add(day(7 + 1), 14, 0, 16, 0, "R1.02 Web DS2 Examen", "Mme Martin", "Amphi A");
add(day(7 + 3), 10, 0, 12, 0, "R1.03 Algèbre linéaire DS2", "M. Moreau", "Amphi B");

const ev = (label, coeff, note, moy, maxi = null, mini = null) => ({ label, key: label, coeff, note, moy: moy === undefined ? null : moy, maxi, mini });
const releve = { ue: [
  { label: "UE 1.1 Réaliser", coeff: 2, note: null, matieres: [
    { label: "R1.01 : Init dev", coeff: 2, note: null, evals: [ev("DS1 (sur 20.0)", 1, 14, 11, 19, 4), ev("TP noté (sur 20.0)", 1, 16, 12, 20, 7), ev("DS2 (sur 20.0)", 2, null, null, null, null)] },
    { label: "R1.02 : Web", coeff: 1, note: null, evals: [ev("Projet (sur 20.0)", 2, 12, 11, 17, 6), ev("QCM (sur 20.0)", 1, null, null, null, null)] }] },
  { label: "UE 1.2 Optimiser", coeff: 1, note: null, matieres: [
    { label: "R1.03 : Maths", coeff: 1, note: null, evals: [ev("QCM (sur 20.0)", 1, 8, 9, 18, 2), ev("DS1 (sur 20.0)", 3, null, null, null, null)] }] },
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
  uca_absences: { declarees: 3, justifiees: 2, nonJustifiees: 1, avecMotifs: 1, journeesNonJustifiees: 0, declarations: [
    { date: iso(day(-3)), motif: "Certificat médical (Dr. Martin)", statut: "Justifiée" },
    { date: iso(day(-10)), motif: "Convocation officielle", statut: "Justifiée" },
    { date: iso(day(-15)), motif: "Absence non justifiée", statut: "Non justifiée" }
  ] },
  uca_tasks: [
    { id: "task1", title: "Rendre le compte-rendu SAE1.01", subject: "SAE1.01", due: iso(tomorrow), done: false, created: 1 },
    { id: "task2", title: "Réviser le DS1 Mathématiques R1.03", subject: "R1.03", due: iso(day(((now.getDay() + 6) % 7) + 3)), done: false, created: 2 },
  ],
};
const m = /\/designs\/([\w-]+)\//.exec(location.pathname);
if (m) data.uca_design = m[1];
chrome.storage.local.set(data);

// La démo ne propose que ce qui y fonctionne
const style = document.createElement("style");
style.textContent = "#appImportBtn,#settingsBtn,#designBtn,#helpBtn,#phoneBtn,a[href$=\"aide.html\"]{display:none!important;}";
document.head.appendChild(style);
})();
