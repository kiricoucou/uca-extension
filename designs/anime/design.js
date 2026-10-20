/* Design animé : sombre turquoise, icônes SVG animées (svg/, tests/gen_help_icons.py), libellés avec emoji. */
(function () {
"use strict";

const ICONS = {
  book: "notes", clock: "time", calendar: "calendar", user: "user",
  pin: "pin", note: "pen", chart: "stats", link: "link",
  mail: "mail", sync: "sync", alert: "lock", key: "lock",
  logout: "bolt", design: "rocket", settings: "gear", filter: "search", export: "calendar", phone: "phone",
};

UCA_defineDesign({
  icon(name, variant) {
    const file = ICONS[name];
    return file ? `<img class="gi${variant === "title" ? " lg" : ""}" src="svg/${file}.svg" alt="">` : "";
  },
  eventColor(key) {
    return `hsl(${UCA_DESIGN.hashString(key) % 360},68%,40%)`;
  },
  noteBadge(context) {
    return context === "grid"
      ? `<div class="ev-note" title="Tu as écrit une note sur ce cours">📝</div>`
      : `<div class="day-note" title="Tu as écrit une note sur ce cours">📝</div>`;
  },
  emptyHtml(kind) {
    return kind === "notes" ? "" : "🗓️";
  },
  grid: { overlap: "side", fontScale: true, metaMerged: false },
  dayView: "list",
  text: {
    view_day: "☀️ Jour", view_3day: "📆 3 jours", view_5day: "🗓️ 5 jours", view_6day: "🗓️ 6 jours",
    view_week: "📅 Semaine", view_month: "🗓️ Mois",
    today: "📍 Aujourd'hui",
    rawData: "📋 Toutes les données (brut) :",
    noCourse: "Aucun cours ce jour-là 😴",
    teacherPrefix: "👤 ", roomPrefix: "📍 ",
    timeSep: "→",
    syncing: "🔄 Synchronisation…",
    loginOpening: "🔑 Ouverture de la connexion UCA…",
    "stage_resync": "🔄 Vérification de ta session…",
    "stage_login-opening": "🔑 Ouverture de la fenêtre de connexion…",
    "stage_login-waiting": "⏳ Connecte-toi (identifiant, 2FA)… prends ton temps.",
    "stage_scraping": "📋 Récupération de ton emploi du temps…",
    syncOk: "✅ Connecté et synchronisé",
    syncSilent: "✅ Resynchronisé automatiquement",
    errorPrefix: "❌ ",
    loggedOut: "👋 Déconnecté",
    current: "● En cours",
  },
});
})();
