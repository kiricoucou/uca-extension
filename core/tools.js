/* Filtres et export .ics, communs à tous les designs. Chargé après shared.js, avant agenda.js.
   Expose UCA_TOOLS : état des filtres, test d'un cours, construction des panneaux, export. */
(function () {
"use strict";

const TYPES = ["CM", "TD", "TP", "Examen", "Autre"];
let filters = { q: "", types: [], hidden: [] };
let onChange = () => {};

function pad(n) { return String(n).padStart(2, "0"); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

function typeOf(title) {
  const m = title.match(/\b(CM|TDA?|TPA?|Examen|DS|Partiel)\b/i);
  if (!m) return "Autre";
  const t = m[1].toUpperCase();
  return t.startsWith("TD") ? "TD" : t.startsWith("TP") ? "TP" : t === "CM" ? "CM" : "Examen";
}
function subjectOf(title) {
  const code = title.match(/^(SAE|R)\s?\d+(?:\.\d+)*/i);
  if (code) return code[0].replace(/\s/g, "").toUpperCase();
  return title.replace(/\b(CM|TDA?|TPA?|Examen)\b/gi, "").replace(/[:\-–]\s*$/, "").replace(/\s+/g, " ").trim() || title;
}
function activeCount() { return (filters.q ? 1 : 0) + (filters.types.length ? 1 : 0) + (filters.hidden.length ? 1 : 0); }
function passes(ev) {
  if (filters.types.length && !filters.types.includes(typeOf(ev.title))) return false;
  if (filters.hidden.includes(subjectOf(ev.title))) return false;
  if (filters.q) {
    const hay = `${ev.title} ${ev.teacher || ""} ${ev.room || ""}`.toLowerCase();
    if (!filters.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}
function save() { chrome.storage.local.set({ uca_filters: filters }); onChange(); }

/* ============================= Panneau Filtres ============================= */
function buildFilterPanel(panel, allEvents) {
  panel.innerHTML = "";
  const search = el("input", "fp-search"); search.type = "search"; search.placeholder = "Rechercher une matière, un prof, une salle…";
  search.value = filters.q;
  search.addEventListener("input", () => { filters.q = search.value.trim(); save(); });
  panel.appendChild(search);
  panel.appendChild(el("div", "fp-h", "Type de cours"));
  const chips = el("div", "fp-chips");
  TYPES.forEach((t) => {
    const c = el("button", "fp-chip" + (filters.types.includes(t) ? " on" : ""), t); c.type = "button";
    c.addEventListener("click", () => {
      filters.types = filters.types.includes(t) ? filters.types.filter((x) => x !== t) : filters.types.concat(t);
      c.classList.toggle("on"); save();
    });
    chips.appendChild(c);
  });
  panel.appendChild(chips);
  panel.appendChild(el("div", "fp-h", "Matières affichées"));
  const list = el("div", "fp-list");
  const subjects = [...new Set(allEvents.map((e) => subjectOf(e.title)))].sort((a, b) => a.localeCompare(b, "fr"));
  subjects.forEach((sub) => {
    const row = el("label", "fp-item");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !filters.hidden.includes(sub);
    cb.addEventListener("change", () => {
      filters.hidden = cb.checked ? filters.hidden.filter((x) => x !== sub) : filters.hidden.concat(sub);
      save();
    });
    row.append(cb, el("span", "", sub));
    list.appendChild(row);
  });
  if (!subjects.length) list.appendChild(el("div", "fp-empty", "Synchronise pour voir tes matières."));
  panel.appendChild(list);
  const foot = el("div", "fp-foot");
  const reset = el("button", "fp-reset", "Tout afficher"); reset.type = "button";
  reset.addEventListener("click", () => { filters = { q: "", types: [], hidden: [] }; save(); buildFilterPanel(panel, allEvents); });
  foot.appendChild(reset);
  panel.appendChild(foot);
}

/* ============================= Export .ics ============================= */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];
function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line) {
  const out = []; let cur = line;
  while (cur.length > 73) { out.push(cur.slice(0, 73)); cur = " " + cur.slice(73); }
  out.push(cur);
  return out.join("\r\n");
}
function localStamp(ev, h, m) { return `${ev.year}${pad(ev.month + 1)}${pad(ev.day)}T${pad(h)}${pad(m)}00`; }
function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); }

function buildIcs(evs, { alarmMinutes, eventKey }) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EDT UCA (non officiel)//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Emploi du temps UCA", "X-WR-TIMEZONE:Europe/Paris", ...VTIMEZONE];
  evs.forEach((ev) => {
    lines.push("BEGIN:VEVENT", `UID:${hash(eventKey(ev))}-${ev.date}@edt-uca`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${localStamp(ev, ev.startH, ev.startM)}`, `DTEND;TZID=Europe/Paris:${localStamp(ev, ev.endH, ev.endM)}`,
      `SUMMARY:${icsEscape(ev.title)}`);
    if (ev.room) lines.push(`LOCATION:${icsEscape(ev.room)}`);
    if (ev.teacher) lines.push(`DESCRIPTION:${icsEscape("Enseignant : " + ev.teacher)}`);
    if (alarmMinutes) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${alarmMinutes}M`, "END:VALARM");
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = el("a"); a.href = url; a.download = name;
  // Clic sans propagation : sinon il passe pour un clic hors du panneau ouvert, qui se fermerait.
  document.body.appendChild(a); a.dispatchEvent(new MouseEvent("click", { bubbles: false })); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* opts : { allEvents, weekDays(), eventKey, reminderMinutes } */
function buildExportPanel(panel, opts) {
  panel.innerHTML = "";
  panel.appendChild(el("div", "fp-h", "Exporter vers Google Agenda, Outlook, téléphone…"));
  const ranges = [["week", "Semaine affichée"], ["4w", "4 prochaines semaines"], ["all", "Tout l'emploi du temps synchronisé"]];
  const group = el("div", "xp-group");
  ranges.forEach(([v, l], i) => {
    const row = el("label", "fp-item");
    const r = el("input"); r.type = "radio"; r.name = "xpRange"; r.value = v; r.checked = i === 1;
    row.append(r, el("span", "", l));
    group.appendChild(row);
  });
  panel.appendChild(group);
  const mkCheck = (label, checked) => { const row = el("label", "fp-item"); const cb = el("input"); cb.type = "checkbox"; cb.checked = checked; row.append(cb, el("span", "", label)); panel.appendChild(row); return cb; };
  const useFilters = mkCheck("Appliquer mes filtres", activeCount() > 0);
  const alarm = mkCheck(`Ajouter un rappel ${opts.reminderMinutes} min avant chaque cours`, true);
  const btn = el("button", "xp-go", "Télécharger le fichier .ics"); btn.type = "button";
  const info = el("div", "fp-empty");
  btn.addEventListener("click", () => {
    const range = panel.querySelector("input[name=xpRange]:checked").value;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let evs = opts.allEvents.slice();
    if (range === "week") { const keys = new Set(opts.weekDays().map((d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)); evs = evs.filter((e) => keys.has(e.date)); }
    else if (range === "4w") { const lim = new Date(today.getTime() + 28 * 86400000); evs = evs.filter((e) => { const d = new Date(e.year, e.month, e.day); return d >= today && d < lim; }); }
    if (useFilters.checked) evs = evs.filter(passes);
    evs.sort((a, b) => a.date.localeCompare(b.date) || (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
    if (!evs.length) { info.textContent = "Aucun cours dans cette période."; return; }
    download("emploi-du-temps-uca.ics", buildIcs(evs, { alarmMinutes: alarm.checked ? opts.reminderMinutes : 0, eventKey: opts.eventKey }));
    info.textContent = `${evs.length} cours exportés. Ouvre le fichier pour l'ajouter à ton agenda.`;
  });
  panel.append(btn, info);
  if (opts.onPhone) {
    panel.appendChild(el("div", "fp-h", "Sur ton téléphone"));
    const phone = el("button", "xp-phone", "Envoyer vers l'app téléphone"); phone.type = "button";
    phone.addEventListener("click", () => opts.onPhone());
    panel.appendChild(phone);
  }
}

window.UCA_TOOLS = {
  TYPES, typeOf, subjectOf, passes, activeCount, buildFilterPanel, buildExportPanel, buildIcs,
  load(cb) {
    chrome.storage.local.get("uca_filters", (d) => { filters = Object.assign({ q: "", types: [], hidden: [] }, d.uca_filters); cb(); });
  },
  onChange(fn) { onChange = fn; },
};
})();
