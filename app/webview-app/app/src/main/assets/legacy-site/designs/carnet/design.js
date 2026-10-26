/* Design Carnet (Style Papeterie & Bloc-notes manuscrit) : Menu riche avec icônes illustrées et dessins manuscrits */
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
    return file ? `<img class="gi${variant === "title" ? " lg" : ""}" src="svg/${file}.svg" alt="" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;filter:sepia(0.5);">` : "";
  },
  noteBadge(context) {
    return context === "grid"
      ? `<div class="ev-note" title="Note manuscrite">✏️</div>`
      : `<div class="day-note" title="Note manuscrite">✏️</div>`;
  },
  emptyHtml(kind) {
    return kind === "notes" ? "" : "📖";
  },
  grid: { overlap: "side", fontScale: true, metaMerged: false },
  dayView: "list",
  text: {
    view_day: "📖 Mon Carnet du Jour", view_3day: "📆 3 Jours", view_5day: "🗓️ 5 Jours", view_6day: "🗓️ 6 Jours",
    view_week: "📅 Semaine Manuscrite", view_month: "🗓️ Calendrier",
    today: "📌 Aujourd'hui",
    rawData: "✏️ Données du carnet :",
    noCourse: "Rien d'inscrit au carnet aujourd'hui ☕",
    teacherPrefix: "✍️ Prof : ", roomPrefix: "📍 Salle : ",
    timeSep: "→",
    syncing: "📖 Mise à jour du carnet…",
    loginOpening: "🔑 Connexion au carnet UCA…",
    "stage_resync": "📖 Vérification du carnet…",
    "stage_login-opening": "🔑 Page de connexion…",
    "stage_login-waiting": "⏳ Connexion en cours…",
    "stage_scraping": "✏️ Écriture des cours…",
    syncOk: "✨ Carnet à jour !",
    syncSilent: "✨ Carnet synchronisé",
    errorPrefix: "⚠️ ",
    loggedOut: "Carnet fermé",
    current: "● Cours en cours",
  },
});
})();
