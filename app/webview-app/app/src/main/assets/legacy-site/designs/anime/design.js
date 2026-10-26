/* Design animé : sombre turquoise, icônes SVG animées (svg/, tests/gen_help_icons.py), libellés avec emoji. */
(function () {
"use strict";

const ICONS = {
  book: "notes", clock: "time", calendar: "calendar", user: "user",
  pin: "pin", note: "pen", chart: "stats", link: "link",
  mail: "mail", sync: "sync", alert: "lock", key: "lock",
  logout: "bolt", tasks: "pen", design: "rocket", settings: "gear", filter: "search", export: "calendar", phone: "phone",
};

/* Couleur d'un cours : teinte au choix, lumière réduite juste ce qu'il faut pour que le texte blanc reste lisible
   (contraste 5,4:1 minimum, pour rester lisible aussi en cours passé, vert / jaune / cyan assombris, bleus et violets inchangés). */
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))));
}
function lum(rgb) { const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); }
function readableHsl(hue) {
  let l = 0.40;
  while (l > 0.2 && 1.05 / (lum(hsl(hue, 0.68, l)) + 0.05) < 5.4) l -= 0.01;
  return `hsl(${hue},68%,${Math.round(l * 100)}%)`;
}

UCA_defineDesign({
  icon(name, variant) {
    const file = ICONS[name];
    return file ? `<img class="gi${variant === "title" ? " lg" : ""}" src="svg/${file}.svg" alt="">` : "";
  },
  swatch(i) { return readableHsl((i * 36) % 360); },
  eventColor(key) {
    return readableHsl(UCA_DESIGN.hashString(key) % 360);
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
