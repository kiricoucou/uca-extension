/* Chargé en premier par chaque page de design (popup.html / agenda.html).
   - UCA_defineDesign(spec) : appelé par le design.js du dossier de design. Tout champ
     absent de spec prend la valeur par défaut ci-dessous, donc un nouveau design n'a
     besoin de définir que ce qui change visuellement.
   - UCA_CORE : briques communes (mise à jour GitHub, changement de design). */
(function () {
"use strict";

const DEFAULT_TEXT = {
  view_day: "Jour", view_3day: "3 jours", view_5day: "5 jours", view_6day: "6 jours", view_week: "Semaine", view_month: "Mois",
  today: "Aujourd'hui",
  rawData: "Toutes les données (brut) :",
  noCourse: "Aucun cours ce jour-là",
  teacherPrefix: "", roomPrefix: "",
  timeSep: "–",
  syncing: "Synchronisation…",
  loginOpening: "Ouverture de la connexion UCA…",
  "stage_resync": "Vérification de ta session…",
  "stage_login-opening": "Ouverture de la fenêtre de connexion…",
  "stage_login-waiting": "Connecte-toi (identifiant, 2FA)… prends ton temps.",
  "stage_scraping": "Récupération de ton emploi du temps…",
  syncOk: "Connecté et synchronisé",
  syncSilent: "Resynchronisé automatiquement",
  errorPrefix: "",
  loggedOut: "Déconnecté",
  sessionExpired: "Session expirée, reconnecte-toi",
  noEvents: "Aucun emploi du temps.",
  noEventsHint: "Connecte-toi pour le récupérer.",
  current: "En cours",
};

const DEFAULT_PALETTE = ["#1967d2", "#0b8043", "#8e24aa", "#c5221f", "#b06000", "#3f51b5", "#00796b", "#ad1457", "#5f6368", "#795548"];
function hashString(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }

const DEFAULTS = {
  // icon(name, variant) -> HTML. Noms utilisés par le core : book, clock, calendar, user,
  // pin, note, chart, link, mail, sync, alert, key, logout, design. variant : "title" | undefined.
  icon: () => "",
  eventColor: (key) => DEFAULT_PALETTE[hashString(key) % DEFAULT_PALETTE.length],
  // Indicateur "note personnelle" sur un cours. context : "grid" | "day".
  noteBadge: () => "",
  // Illustration des états vides. kind : "day" | "notes" | "popup".
  emptyHtml: () => "",
  // overlap : "side" (cours simultanés côte à côte) | "cascade" (décalés en escalier).
  // fontScale : police proportionnelle à la hauteur du bloc. metaMerged : prof · salle sur une ligne.
  grid: { overlap: "side", fontScale: false, metaMerged: true },
  // Vue Jour : "grid" (grille horaire) | "list" (liste de cartes).
  dayView: "grid",
  text: {},
};

window.UCA_defineDesign = function (spec) {
  const D = Object.assign({}, DEFAULTS, spec);
  D.grid = Object.assign({}, DEFAULTS.grid, spec.grid);
  D.text = Object.assign({}, DEFAULT_TEXT, spec.text);
  D.t = (key) => (D.text[key] !== undefined ? D.text[key] : "");
  D.hashString = hashString;
  window.UCA_DESIGN = D;
};

function $(id) { return document.getElementById(id); }

window.UCA_CORE = {
  /* Écran (#updateOverlay) ou bandeau (#updateBar) selon ce que le design fournit. */
  renderUpdate(available, current, latest) {
    const el = $("updateOverlay") || $("updateBar");
    if (!el) return;
    el.classList.toggle("hidden", !available);
    if (!available) return;
    if ($("updCurrent")) $("updCurrent").textContent = current || "?";
    if ($("updLatest")) $("updLatest").textContent = latest || "?";
  },
  initUpdate() {
    const refresh = () => chrome.storage.local.get(["uca_update_available", "uca_current_version", "uca_latest_version"], (data) => {
      UCA_CORE.renderUpdate(!!data.uca_update_available, data.uca_current_version, data.uca_latest_version);
    });
    if ($("updApplyBtn")) $("updApplyBtn").addEventListener("click", () => chrome.runtime.sendMessage({ type: "UCA_APPLY_UPDATE" }));
    chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.uca_update_available) refresh(); });
    refresh();
    chrome.runtime.sendMessage({ type: "UCA_FORCE_UPDATE_CHECK" });
  },
  /* Bouton #settingsBtn : ouvre la page Paramètres (commune à tous les designs). */
  openSettings() { chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") }); },
  initSettings() {
    if ($("settingsBtn")) $("settingsBtn").addEventListener("click", UCA_CORE.openSettings);
  },
  /* Bouton #designBtn : rouvre le sélecteur. tabMode : page plein onglet (agenda). */
  initDesignSwitch(tabMode) {
    const btn = $("designBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      location.href = chrome.runtime.getURL("choose.html?change=1" + (tabMode ? "&tab=1" : ""));
    });
  },
};
})();
