/* Design Bulletin (Inspiré d'un relevé officiel académique UCA) : Grille structurée, esthétique universitaire formelle */
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
    return file ? `<img class="gi${variant === "title" ? " lg" : ""}" src="svg/${file}.svg" alt="" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;">` : "";
  },
  noteBadge(context) {
    return context === "grid"
      ? `<div class="ev-note" title="Note personnelle">📝</div>`
      : `<div class="day-note" title="Note personnelle">📝</div>`;
  },
  emptyHtml(kind) {
    return kind === "notes" ? "" : "📜";
  },
  grid: { overlap: "cascade", fontScale: false, metaMerged: true },
  dayView: "list",
  text: {
    view_day: "Jour (Relevé)",
    view_3day: "3 Jours",
    view_5day: "5 Jours",
    view_6day: "6 Jours",
    view_week: "Semaine Académique",
    view_month: "Mois",
    today: "Aujourd'hui",
    rawData: "Données officielles :",
    noCourse: "Aucun cours programmé ce jour",
    teacherPrefix: "Enseignant : ",
    roomPrefix: "Salle : ",
    timeSep: "–",
    syncing: "Synchronisation Odin…",
    loginOpening: "Authentification CAS UCA…",
    "stage_resync": "Contrôle session CAS…",
    "stage_login-opening": "Connexion SSO…",
    "stage_login-waiting": "Saisissez vos identifiants ENT…",
    "stage_scraping": "Récupération de l'emploi du temps…",
    syncOk: "Emploi du temps synchronisé",
    syncSilent: "Actualisé en arrière-plan",
    errorPrefix: "",
    loggedOut: "Déconnecté",
    current: "Cours en cours",
  },
});
})();
