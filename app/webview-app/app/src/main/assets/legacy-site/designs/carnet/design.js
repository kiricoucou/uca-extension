/* Design carnet : papier crème, écriture manuscrite, cours en post-it pastel (icônes SVG
   du sprite de chaque page, trait « dessiné » via le filtre #sketch). */
(function () {
"use strict";

const PASTELS = ["#ffe58f", "#ffc9de", "#c8f0d2", "#c9e4ff", "#e3d4ff", "#ffd8b0", "#d7f0a8", "#b8ece9", "#f8c9c4", "#efe2c8"];
const svg = (id, cls) => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const NOTE_BADGE = `<span class="ev-note-badge" title="Tu as écrit une note sur ce cours">${svg("i-note", "ic")}</span>`;

UCA_defineDesign({
  icon(name) { return svg("i-" + name, "ic sm"); },
  swatch(i) { return PASTELS[i % PASTELS.length]; },
  eventColor(key) { return PASTELS[UCA_DESIGN.hashString(key) % PASTELS.length]; },
  noteBadge(context) {
    return context === "grid" ? `<div class="ev-note">${NOTE_BADGE}</div>` : `<div class="day-note">${NOTE_BADGE}</div>`;
  },
  emptyHtml(kind) {
    if (kind === "notes") return `<svg class="sticker" style="width:56px;height:56px;display:block;margin:0 auto 8px" aria-hidden="true"><use href="#s-empty-notes"/></svg>`;
    return svg(kind === "popup" ? "s-empty-sync" : "s-empty-day", "sticker");
  },
  grid: { overlap: "side", fontScale: false, metaMerged: true },
  dayView: "grid",
  text: {
    noCourse: "Journée libre : rien au programme",
    noEvents: "Ton carnet est encore vide.",
    noEventsHint: "Connecte-toi pour y recopier ton emploi du temps.",
    current: "En ce moment",
    loggedOut: "Déconnecté — à bientôt !",
  },
});
})();
