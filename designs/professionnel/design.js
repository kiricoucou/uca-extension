/* Design Professionnel (Tech & Corporate Slate) : Palette sombre épurée, typographie moderne et organisation orientée productivité */
(function () {
"use strict";

const ICONS = {
  book: "notes", clock: "time", calendar: "calendar", user: "user",
  pin: "pin", note: "pen", chart: "stats", link: "link",
  mail: "mail", sync: "sync", alert: "lock", key: "lock",
  logout: "bolt", tasks: "pen", design: "rocket", settings: "gear", filter: "search", export: "calendar", phone: "phone",
};

UCA_defineDesign({
  icon(name, variant) {
    const file = ICONS[name];
    return file ? `<img class="gi${variant === "title" ? " lg" : ""}" src="svg/${file}.svg" alt="" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;filter:brightness(1.15);">` : "";
  },
  noteBadge(context) {
    return context === "grid"
      ? `<div class="ev-note" title="Mémo pro">📌</div>`
      : `<div class="day-note" title="Mémo pro">📌</div>`;
  },
  emptyHtml(kind) {
    return kind === "notes" ? "" : "💼";
  },
  grid: { overlap: "side", fontScale: false, metaMerged: false },
  dayView: "list",
  text: {
    view_day: "Planning Quotidien",
    view_3day: "3 Jours",
    view_5day: "Semaine Ouvrée (5j)",
    view_6day: "6 Jours",
    view_week: "Vue Hebdo Pro",
    view_month: "Vue Mensuelle",
    today: "Aujourd'hui",
    rawData: "Flux planning brut :",
    noCourse: "Aucune session planifiée",
    teacherPrefix: "Intervenant : ",
    roomPrefix: "Lieu : ",
    timeSep: "–",
    syncing: "Synchronisation...",
    loginOpening: "Accès CAS Entreprise...",
    "stage_resync": "Vérification du token...",
    "stage_login-opening": "Ouverture SSO...",
    "stage_login-waiting": "Authentification requise...",
    "stage_scraping": "Récupération du planning...",
    syncOk: "Planning synchronisé",
    syncSilent: "Synchronisé",
    errorPrefix: "Échec : ",
    loggedOut: "Session clôturée",
    current: "En session",
  },
});
})();
