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
