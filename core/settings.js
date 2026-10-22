/* Réglages communs à tous les designs, partagés par les pages et le service worker
   (stockés dans chrome.storage.local.uca_settings ; toute clé absente prend sa valeur par défaut). */
(function (root) {
"use strict";

const DEFAULTS = {
  startView: "auto",   // auto | day | 3day | 5day | 6day | week | month
  hideWeekend: false,  // vue Semaine : samedi/dimanche masqués s'il n'y a pas cours
  remindersEnabled: true,
  reminderMinutes: 15, // notification N minutes avant chaque cours
  autoSyncHours: 3,    // 0 = désactivée ; synchro silencieuse uniquement (jamais de fenêtre CAS)
  badgeMode: "next",   // next (prochain cours du jour) | remaining (cours restants aujourd'hui) | off
  notifyEdtChanges: true, // notification quand un cours est ajouté / annulé / déplacé / change de salle
  notifyNewGrades: true,  // notification quand une nouvelle note apparaît
  shareLinkHours: 48,     // durée de validité d'un lien de partage chiffré (core/transfer.js)
  absenceAlert: 0,        // 0 = désactivée ; sinon alerte à N absences non justifiées
  statusWatch: false,     // surveille Odin et la connexion toutes les 5 min, notifie panne / retour
  noteNewDays: 2,         // note affichée en orange pendant N jours, puis en jaune pendant autant
};

function getSettings() {
  return chrome.storage.local.get("uca_settings").then((d) => Object.assign({}, DEFAULTS, d.uca_settings));
}
function saveSettings(patch) {
  return getSettings().then((s) => chrome.storage.local.set({ uca_settings: Object.assign(s, patch) }));
}

root.UCA_SETTINGS_DEFAULTS = DEFAULTS;
root.UCA_getSettings = getSettings;
root.UCA_saveSettings = saveSettings;
})(self);
