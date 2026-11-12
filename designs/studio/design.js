/* Design Studio : tableau de bord clair, panneaux blancs très arrondis, cartes pastel, accent marine (mêmes fonctions que les autres designs) */
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
      ? `<div class="ev-note" title="Mémo">📍</div>`
      : `<div class="day-note" title="Mémo">📍</div>`;
  },
  emptyHtml(kind) {
    return kind === "notes" ? "" : "📅";
  },
  grid: { overlap: "cascade", fontScale: false, metaMerged: true },
  dayView: "grid",
  text: {
    view_list: "Liste",
    view_day: "Jour",
    view_3day: "3 Jours",
    view_5day: "5 jours",
    view_6day: "6 Jours",
    view_week: "Semaine",
    view_month: "Mois",
    today: "Aujourd'hui",
    rawData: "Données brutes :",
    noCourse: "Aucun cours",
    teacherPrefix: "",
    roomPrefix: "",
    timeSep: "–",
    syncing: "Synchronisation...",
    loginOpening: "Connexion à l'ENT...",
    "stage_resync": "Vérification...",
    "stage_login-opening": "Ouverture SSO...",
    "stage_login-waiting": "Authentification requise...",
    "stage_scraping": "Récupération du planning...",
    syncOk: "Emploi du temps synchronisé",
    syncSilent: "Synchronisé",
    errorPrefix: "Échec : ",
    loggedOut: "Déconnecté",
    current: "En cours",
  },
});
})();
