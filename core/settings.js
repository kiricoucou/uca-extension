/* Réglages communs à tous les designs, partagés par les pages et le service worker
   (stockés dans chrome.storage.local.uca_settings ; toute clé absente prend sa valeur par défaut). */
(function (root) {
"use strict";

const DEFAULTS = {
  startView: "auto",   // auto | list | day | 3day | 5day | 6day | week | month
  hideWeekend: false,  // vue Semaine : samedi/dimanche masqués s'il n'y a pas cours
  remindersEnabled: true,
  reminderMinutes: 15, // notification N minutes avant chaque cours
  autoSyncHours: 3,    // 0 = désactivée ; synchro silencieuse uniquement (jamais de fenêtre CAS)
  badgeMode: "next",   // next (prochain cours du jour) | remaining (cours restants aujourd'hui) | off
  notifyEdtChanges: true, // notification quand un cours est ajouté / annulé / déplacé / change de salle
  notifyNewGrades: true,  // notification quand une nouvelle note apparaît
  shareLinkHours: 48,     // durée de validité d'un lien de partage chiffré (core/transfer.js)
  compactCards: false,    // blocs de cours sans le nom de l'enseignant (visible dans le détail)
  autoDesign: false,      // le design suit le thème clair/sombre du système
  designLight: "studio",
  designDark: "anime",
  pinNext: false,         // app seulement : notification « prochain cours » épinglée (mise à jour à l'ouverture)
  taskReminders: true,    // notification la veille à 18 h pour chaque devoir à rendre et chaque examen
  absenceAlert: 0,        // 0 = désactivée ; sinon alerte à N absences non justifiées
  statusWatch: false,     // surveille Odin et la connexion toutes les 5 min, notifie panne / retour
  activityKeepDays: 30,   // jours de conservation des notifications non gardées de la cloche (0 = illimité)
  noteNewDays: 2,         // note affichée en orange pendant N jours, puis en jaune pendant autant
};

function getSettings() {
  return chrome.storage.local.get("uca_settings").then((d) => {
    const st = Object.assign({}, DEFAULTS, d.uca_settings);
    ["designLight", "designDark"].forEach((k) => { if (st[k] === "bulletin") st[k] = "lumen"; }); // « bulletin » est devenu « lumen »
    return st;
  });
}
function saveSettings(patch) {
  return getSettings().then((s) => chrome.storage.local.set({ uca_settings: Object.assign(s, patch) }));
}

/* Fusionne un emploi du temps tout juste synchronisé avec celui déjà enregistré : la synchro ne remplace que les cours
   d'aujourd'hui et à venir ; les jours passés sont déjà connus (anciennes synchros) et restent consultables. Un jour passé
   qu'Odin renvoie encore, mais qu'on n'avait jamais vu, est ajouté. On garde 400 jours d'historique au plus. */
const HISTORY_DAYS = 400;
function mergeSchedule(old, fresh, now) {
  const t = now ? new Date(now) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  const today = t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
  const limit = new Date(t.getTime() - HISTORY_DAYS * 86400000);
  const oldest = limit.getFullYear() + "-" + p(limit.getMonth() + 1) + "-" + p(limit.getDate());
  const oldPast = (Array.isArray(old) ? old : []).filter((e) => e && e.date && e.date < today && e.date >= oldest);
  const knownDays = new Set(oldPast.map((e) => e.date));
  const out = oldPast.concat((fresh || []).filter((e) => e.date < today ? (e.date >= oldest && !knownDays.has(e.date)) : true));
  return out.sort((a, b) => (a.date + p(a.startH) + p(a.startM)).localeCompare(b.date + p(b.startH) + p(b.startM)));
}

root.UCA_mergeSchedule = mergeSchedule;
root.UCA_SETTINGS_DEFAULTS = DEFAULTS;
root.UCA_getSettings = getSettings;
root.UCA_saveSettings = saveSettings;
})(self);
