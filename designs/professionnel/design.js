/* Design professionnel : clair et épuré, icônes SVG (sprite #i-* / #s-* dans chaque page). */
(function () {
"use strict";

const svg = (id, cls) => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const NOTE_BADGE = `<span class="ev-note-badge" title="Tu as écrit une note sur ce cours">${svg("i-note", "ic")}</span>`;

UCA_defineDesign({
  icon(name) {
    return svg("i-" + name, "ic sm");
  },
  noteBadge(context) {
    return context === "grid"
      ? `<div class="ev-note">${NOTE_BADGE}</div>`
      : `<div class="day-note">${NOTE_BADGE}</div>`;
  },
  emptyHtml(kind) {
    if (kind === "notes") return `<svg class="sticker" style="width:56px;height:56px;display:block;margin:0 auto 8px" aria-hidden="true"><use href="#s-empty-notes"/></svg>`;
    return svg(kind === "popup" ? "s-empty-sync" : "s-empty-day", "sticker");
  },
  grid: { overlap: "cascade", fontScale: false, metaMerged: true },
  dayView: "grid",
});
})();
