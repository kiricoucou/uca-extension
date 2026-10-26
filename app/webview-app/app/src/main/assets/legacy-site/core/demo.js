/* Données de démonstration et initialisation automatique pour l'application.
   Activé UNIQUEMENT en mode démo explicite (?demo=1). En production, aucune donnée
   factice n'est injectée, et les éventuelles anciennes données de test sont purgées. */
(function () {
"use strict";

const isDemo = /[?&]demo=1(?:&|$)/.test(location.search) || (window.UCA_APP && window.UCA_APP.demo);

if (!isDemo) {
  // Mode production : nettoyer impérativement les restes de données de test si présentes
  if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
    window.chrome.storage.local.get(["uca_events", "uca_tasks", "uca_absences", "uca_releve_notes"], (res) => {
      if (!res) return;
      const hasMockEvents = res.uca_events && res.uca_events.some(e => e.title && e.title.includes("R1.01 Initiation au développement"));
      const hasMockTasks = res.uca_tasks && res.uca_tasks.some(t => t.id === "task1" || t.title.includes("SAE 1.01"));
      const hasMockAbsences = res.uca_absences && res.uca_absences.declarations && res.uca_absences.declarations.some(d => d.motif && d.motif.includes("Certificat médical"));
      const hasMockNotes = res.uca_releve_notes && res.uca_releve_notes.ue && res.uca_releve_notes.ue.some(u => u.label && u.label.includes("UE 1.1"));
      
      const toRemove = [];
      if (hasMockEvents) toRemove.push("uca_events");
      if (hasMockTasks) toRemove.push("uca_tasks");
      if (hasMockAbsences) toRemove.push("uca_absences");
      if (hasMockNotes) toRemove.push("uca_releve_notes");
      
      if (toRemove.length > 0) {
        window.chrome.storage.local.remove(toRemove);
      }
    });
  }
  return;
}

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

const ev = (label, coeff, note, moy, maxi, mini) => ({
  label, key: label, coeff, note,
  moy: moy === undefined ? 11.5 : moy,
  maxi: maxi === undefined ? 18.5 : maxi,
  mini: mini === undefined ? 4.0 : mini
});

const releve = { ue: [
  {
    label: "UE 1.1 Réaliser un développement d'application",
    coeff: 6,
    note: null,
    matieres: [
      {
        label: "R1.01 : Initiation au développement",
        coeff: 3,
        note: null,
        evals: [
          ev("DS1 Algorithmique (sur 20.0)", 1, 15.5, 11.2, 19.0, 5.5),
          ev("TP noté structures de données (sur 20.0)", 1, 16.0, 12.8, 18.5, 6.0),
          ev("DS2 Programmation avancée (sur 20.0)", 2, null, 11.0, 18.0, 4.0),
        ]
      },
      {
        label: "R1.02 : Développement d'interfaces Web",
        coeff: 2,
        note: null,
        evals: [
          ev("Projet Web dynamique (sur 20.0)", 2, 14.0, 12.0, 17.5, 7.0),
          ev("QCM CSS et accessibilité (sur 20.0)", 1, 13.5, 10.5, 18.0, 3.5),
        ]
      },
      {
        label: "SAE1.01 : Audit et réalisation applicative",
        coeff: 3,
        note: null,
        evals: [
          ev("Soutenance de projet (sur 20.0)", 2, 16.5, 13.5, 19.5, 8.0),
          ev("Rendu de code & livrable (sur 20.0)", 1, 15.0, 12.5, 18.0, 6.5),
        ]
      }
    ]
  },
  {
    label: "UE 1.2 Optimiser des applications informatiques",
    coeff: 4,
    note: null,
    matieres: [
      {
        label: "R1.03 : Mathématiques discrètes & Algèbre",
        coeff: 2,
        note: null,
        evals: [
          ev("Contrôle continu matrices (sur 20.0)", 1, 11.0, 9.8, 17.0, 2.0),
          ev("DS1 Arithmétique & Graphes (sur 20.0)", 2, null, 10.5, 18.0, 3.0),
        ]
      },
      {
        label: "R1.04 : Architecture et systèmes d'exploitation",
        coeff: 2,
        note: null,
        evals: [
          ev("TP commandes Shell Unix (sur 20.0)", 1, 14.5, 12.2, 19.0, 5.0),
          ev("Partiel assembleur et mémoire (sur 20.0)", 2, 12.0, 10.8, 16.5, 4.5),
        ]
      }
    ]
  },
  {
    label: "UE 1.3 Communiquer et collaborer en équipe",
    coeff: 3,
    note: null,
    matieres: [
      {
        label: "R1.05 : Anglais technique et scientifique",
        coeff: 2,
        note: null,
        evals: [
          ev("Présentation orale technique (sur 20.0)", 1, 15.0, 13.0, 18.0, 7.5),
          ev("Synthèse écrite de documentation (sur 20.0)", 1, 14.0, 11.8, 17.0, 6.0),
        ]
      },
      {
        label: "R1.06 : Communication professionnelle & PPP",
        coeff: 1,
        note: null,
        evals: [
          ev("CV et pitch professionnel (sur 20.0)", 1, 16.0, 14.2, 19.0, 9.0),
        ]
      }
    ]
  }
] };

const tomorrow = day(((now.getDay() + 6) % 7) + 1);
const data = {
  uca_events: events,
  uca_last_sync: now.toISOString(),
  uca_app_imported_at: now.toISOString(),
  uca_session_expired: false,
  uca_settings: { absenceAlert: 3 },
  uca_releve_notes: releve,
  uca_notes_seen: { "DS1 Algorithmique (sur 20.0)": 1 },
  uca_absences: {
    declarees: 3,
    justifiees: 2,
    nonJustifiees: 1,
    avecMotifs: 1,
    journeesNonJustifiees: 0,
    declarations: [
      {
        debut: "2026-10-14T08:00",
        fin: "2026-10-14T12:00",
        depose: "2026-10-14T14:30",
        motif: "Certificat médical d'inaptitude temporaire",
        statut: "justifiee",
        statutLibelle: "Justifiée par scolarité"
      },
      {
        debut: "2026-10-06T14:00",
        fin: "2026-10-06T18:00",
        depose: "2026-10-07T09:15",
        motif: "Épreuve du permis de conduire",
        statut: "attente",
        statutLibelle: "En cours d'examen"
      },
      {
        debut: "2026-09-22T10:00",
        fin: "2026-09-22T12:00",
        depose: "2026-09-24T11:00",
        motif: "Retard de transport (Ligne T2 tramway)",
        statut: "refusee",
        statutLibelle: "Motif non recevable"
      }
    ]
  },
  uca_tasks: [
    { id: "task1", title: "Rendre le livrable de projet SAE 1.01", subject: "SAE1.01", due: iso(tomorrow), done: false, created: 1 },
    { id: "task2", title: "Réviser le partiel de Maths (matrices et graphes)", subject: "R1.03", due: iso(day(((now.getDay() + 6) % 7) + 3)), done: false, created: 2 },
    { id: "task3", title: "Préparer l'oral d'anglais technique", subject: "R1.05", due: iso(day(((now.getDay() + 6) % 7) + 5)), done: true, created: 3 },
  ],
};

const m = /\/designs\/([\w-]+)\//.exec(location.pathname);
if (m) data.uca_design = m[1];

// Si le stockage de l'app est vide, on l'initialise avec ces données
if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
  window.chrome.storage.local.get(["uca_events"], (res) => {
    if (!res || !res.uca_events || !res.uca_events.length) {
      window.chrome.storage.local.set(data);
    }
  });
}

// Bouton design toujours accessible
})();

