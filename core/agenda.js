/* Logique de l'agenda, commune à tous les designs. Tout ce qui est visuel (icônes,
   textes, couleurs, variantes de mise en page) vient de window.UCA_DESIGN, défini par
   le design.js du dossier de design chargé juste avant ce fichier (voir core/design-api.js). */
(function () {
"use strict";

const D = window.UCA_DESIGN;
const T = D.t;

let events = [];
let notes = {};
let absences = null;
let scrapeIssues = {};
let releveNotes = null;
let notesHistory = [];
let subjectColors = {};
let simScope = "", simTarget = 10, chartScope = "general";
let notesSeen = {};
let edtChanges = new Map(); // eventKey -> changement (ajouté / déplacé / salle) ; annulés : fantômes
let cancelledGhosts = [];
let settings = Object.assign({}, UCA_SETTINGS_DEFAULTS);
let currentView = "week";
let autoViewApplied = false;
let refDate = new Date(); refDate.setHours(0, 0, 0, 0);
let pendingEventKey = null;
let zoomLevel = Math.max(0.6, Math.min(1.8, parseFloat(localStorage.getItem("uca_zoom_v1")) || 1));

const DAY_NAMES_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const VIEWS = ["day", "3day", "5day", "6day", "week", "month"];
const VIEW_CONTAINERS = { day: "dayView", "3day": "threeDayView", "5day": "fiveDayView", "6day": "sixDayView", week: "weekView", month: "monthView" };
const MOODLE_URL = "https://moodle.uca.fr/";
const MAIL_URL = "https://mail.uca.fr/zimbra/";

function pad(n) { return String(n).padStart(2, "0"); }
function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); const day = (r.getDay() + 6) % 7; r.setDate(r.getDate() - day); return r; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function monthShort(d) { return d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function eventKey(ev) { return ev.date + "_" + pad(ev.startH) + ":" + pad(ev.startM) + "_" + ev.title; }
function isMobileUI() { return window.matchMedia("(max-width:820px)").matches; }
function $(id) { return document.getElementById(id); }
function availableViews() { return VIEWS.filter(v => $(VIEW_CONTAINERS[v])); }

function toast(msg, type) {
  const wrap = $("toast-wrap");
  const el = document.createElement("div");
  el.className = "toast" + (type === "warn" ? " warn" : type === "ok" ? " ok" : "");
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 4200);
}

function setEdtChanges(list) {
  edtChanges = new Map(); cancelledGhosts = []; cancelledChanges.clear();
  (list || []).forEach(c => {
    if (c.type === "cancelled") { cancelledGhosts.push({ ...c.ev, cancelled: true, color: colorOf(c.ev.title) }); cancelledChanges.set(c.key, c); }
    else edtChanges.set(c.key, c);
  });
}
function eventsOnDate(d) {
  const key = dateKey(d);
  return events.concat(cancelledGhosts).filter(c => c.date === key && UCA_TOOLS.passes(c)).sort((a, b) => (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
}
const cancelledChanges = new Map();
function changeOf(ev) { return ev.cancelled ? (cancelledChanges.get(eventKey(ev)) || { type: "cancelled" }) : edtChanges.get(eventKey(ev)); }
function changeBadgeHtml(ev) { const c = changeOf(ev); return c ? D.changeBadge(c.type) : ""; }
function changeDetailHtml(ev) {
  const c = changeOf(ev);
  if (!c) return "";
  const b = c.before || {};
  const intro = c.type === "cancelled" ? "Ce cours n'apparaît plus sur Odin."
    : c.type === "added" ? "Ajouté depuis la synchro précédente."
    : "Modifié depuis la synchro précédente :";
  // Anciennes entrées (avant le détail des changements) : seulement salle ou horaire d'avant.
  const details = c.details && c.type !== "added" && c.type !== "cancelled" ? c.details
    : c.type === "room" ? [`Ancienne salle : ${b.room || "—"}`]
    : c.type === "moved" && b.startH != null ? [`Avant : ${pad(b.startH)}:${pad(b.startM)} – ${pad(b.endH)}:${pad(b.endM)}`] : [];
  const when = c.at ? ` <small>(détecté le ${new Date(c.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})</small>` : "";
  return `<p>${D.changeBadge(c.type)} ${escapeHtml(intro)}${when}</p>${details.length ? `<ul class="chg-details">${details.map(d => `<li>${escapeHtml(d)}</li>`).join("")}</ul>` : ""}`;
}
function getFiveDayDays() {
  const start = startOfWeek(refDate);
  const days = Array.from({ length: 5 }, (_, i) => addDays(start, i));
  const sat = addDays(start, 5), sun = addDays(start, 6);
  if (eventsOnDate(sat).length > 0) days.push(sat);
  if (eventsOnDate(sun).length > 0) days.push(sun);
  return days;
}
function getSixDayDays() {
  const start = startOfWeek(refDate);
  return Array.from({ length: 6 }, (_, i) => addDays(start, i));
}

function rangeLabel(days) { const s = days[0], e = days[days.length - 1]; return `${s.getDate()} ${monthShort(s)} – ${e.getDate()} ${monthShort(e)} ${e.getFullYear()}`; }
function fmtPeriodLabel() {
  if (currentView === "month") return capitalize(refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  if (currentView === "day") return capitalize(refDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  if (currentView === "3day") return rangeLabel([refDate, addDays(refDate, 2)]);
  if (currentView === "5day") return rangeLabel(getFiveDayDays());
  if (currentView === "6day") return rangeLabel(getSixDayDays());
  if (currentView === "week") return rangeLabel([startOfWeek(refDate), addDays(startOfWeek(refDate), 6)]);
  return "";
}
function fmtMonthLabel() { return capitalize(refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })); }
function updateHeader() {
  $("periodLabel").textContent = isMobileUI() ? fmtMonthLabel() : fmtPeriodLabel();
  document.querySelectorAll("#viewTabs button").forEach(b => b.classList.toggle("active", b.dataset.view === currentView));
}
function navigate(dir) {
  if (currentView === "month") refDate = new Date(refDate.getFullYear(), refDate.getMonth() + dir, 1);
  else if (currentView === "3day") refDate = addDays(refDate, 3 * dir);
  else if (currentView === "day") refDate = addDays(refDate, dir);
  else refDate = addDays(refDate, 7 * dir);
  render();
}
function switchView(v) { if (availableViews().includes(v)) currentView = v; render(); }

/* ============================= Notes personnelles ============================= */
function saveNotes() { chrome.storage.local.set({ uca_notes: notes }); }

function openDetail(ev) {
  pendingEventKey = eventKey(ev);
  const noteVal = notes[pendingEventKey] || "";
  $("detailTitle").innerHTML = D.icon("book", "title") + escapeHtml(ev.title);
  $("detailBody").innerHTML = `
    ${changeDetailHtml(ev)}
    <p>${D.icon("clock")}<strong>Horaire :</strong> ${pad(ev.startH)}:${pad(ev.startM)} – ${pad(ev.endH)}:${pad(ev.endM)}</p>
    <p>${D.icon("calendar")}<strong>Date :</strong> ${ev.day}/${pad(ev.month + 1)}/${ev.year}</p>
    ${ev.teacher ? `<p>${D.icon("user")}<strong>Enseignant :</strong> ${escapeHtml(ev.teacher)}</p>` : ""}
    ${ev.room ? `<p>${D.icon("pin")}<strong>Salle :</strong> ${escapeHtml(ev.room)}</p>` : ""}
    ${ev.raw ? `<p style="margin-bottom:4px;"><strong>${escapeHtml(T("rawData"))}</strong></p>
    <pre style="white-space:pre-wrap;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:11.5px;font-family:'Cascadia Code',Consolas,monospace;color:var(--text-dim);margin:0 0 4px;">${escapeHtml(ev.raw)}</pre>` : ""}
    <div class="subject-color" id="subjectColor"></div>
    <div class="note-label">${D.icon("note")}Note personnelle (visible seulement par toi) :</div>
    <textarea id="noteArea" placeholder="Ex: réviser le chapitre 3 avant ce cours..."></textarea>
  `;
  $("noteArea").value = noteVal;
  renderSubjectColorPicker(ev);
  $("detailOverlay").classList.add("open");
}
/* Couleur d'une matière : 10 pastilles tirées de la palette du design (ou « Auto »), mémorisées par matière
   et appliquées à tous ses cours. */
function renderSubjectColorPicker(ev) {
  const box = $("subjectColor"); if (!box) return;
  const key = eventColorKey(ev.title), cur = subjectColors[key];
  box.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:10px 0 4px;";
  const lab = document.createElement("span"); lab.textContent = "Couleur de la matière :"; lab.style.cssText = "font-size:13px;margin-right:4px;";
  box.appendChild(lab);
  const pick = (slot) => {
    if (slot === null) delete subjectColors[key]; else subjectColors[key] = slot;
    chrome.storage.local.set({ uca_subject_colors: subjectColors });
    events.forEach((e) => { e.color = colorOf(e.title); });
    cancelledGhosts.forEach((e) => { e.color = colorOf(e.title); });
    box.innerHTML = ""; renderSubjectColorPicker(ev);
    render();
  };
  const mk = (label, bg, active, slot) => {
    const b = document.createElement("button"); b.type = "button"; b.title = label; b.setAttribute("aria-label", label); b.setAttribute("aria-pressed", active ? "true" : "false");
    b.className = "sc-swatch";
    b.style.cssText = `width:24px;height:24px;border-radius:50%;padding:0;cursor:pointer;background:${bg};border:2px solid ${active ? "var(--text, #222)" : "var(--border, #bbb)"};${active ? "box-shadow:0 0 0 2px var(--surface, #fff) inset;" : ""}font:inherit;font-size:11px;line-height:1;color:var(--text, #222);`;
    if (slot === null) b.textContent = "A";
    b.addEventListener("click", () => pick(slot));
    box.appendChild(b);
  };
  mk("Couleur automatique", "transparent", !Number.isInteger(cur), null);
  for (let i = 0; i < 10; i++) mk("Couleur " + (i + 1), D.swatch(i), cur === i, i);
}
function closeDetailAndSaveNote() {
  const area = $("noteArea");
  if (area && pendingEventKey) {
    const val = area.value; // texte brut uniquement, jamais interprété comme HTML/JS
    if (val.trim()) notes[pendingEventKey] = val; else delete notes[pendingEventKey];
    saveNotes();
  }
  pendingEventKey = null;
  $("detailOverlay").classList.remove("open");
  render();
}
$("closeDetail").addEventListener("click", closeDetailAndSaveNote);
$("detailOverlay").addEventListener("click", (e) => { if (e.target === $("detailOverlay")) closeDetailAndSaveNote(); });

/* ============================= RENDER: MONTH ============================= */
/* Jour férié : infobulle + numéro du jour en couleur d'alerte ; le nom est aussi dit aux lecteurs d'écran. */
function markHoliday(node, d, numSel) {
  const name = UCA_TOOLS.holidayName(d);
  if (!name) return;
  node.classList.add("holiday"); node.title = name; node.setAttribute("aria-label", `${d.getDate()}, jour férié : ${name}`);
  const n = numSel ? node.querySelector(numSel) : node;
  if (n) n.style.color = "var(--danger, #c5221f)";
}
function renderMonth() {
  const el = $("monthView"); el.innerHTML = "";
  const grid = document.createElement("div"); grid.className = "month-grid";
  DAY_NAMES_SHORT.slice(1).concat(DAY_NAMES_SHORT[0]).forEach(n => { const h = document.createElement("div"); h.className = "weekday-head"; h.textContent = n; grid.appendChild(h); });
  const year = refDate.getFullYear(), month = refDate.getMonth();
  const gridStart = startOfWeek(new Date(year, month, 1));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i); const cell = document.createElement("div"); cell.className = "month-cell"; cell.style.cursor = "pointer";
    if (d.getMonth() !== month) cell.classList.add("other-month");
    if (sameDay(d, today)) cell.classList.add("today");
    const num = document.createElement("div"); num.className = "month-daynum"; num.textContent = d.getDate(); cell.appendChild(num);
    markHoliday(cell, d, ".month-daynum");
    const evs = eventsOnDate(d);
    if (isMobileUI()) {
      if (evs.length) {
        const dots = document.createElement("div"); dots.className = "month-dots";
        evs.slice(0, 6).forEach(ev => { const dot = document.createElement("i"); dot.className = "month-dot"; dot.style.background = ev.color; dots.appendChild(dot); });
        cell.appendChild(dots);
      }
    } else evs.slice(0, 3).forEach(ev => { const pill = document.createElement("div"); pill.className = "month-pill"; pill.style.background = ev.color; pill.textContent = `${pad(ev.startH)}:${pad(ev.startM)} ${ev.title}`; pill.addEventListener("click", (e) => { e.stopPropagation(); openDetail(ev); }); cell.appendChild(pill); });
    if (evs.length > 3 && !isMobileUI()) { const more = document.createElement("div"); more.className = "month-more"; more.textContent = `+${evs.length - 3} autre${evs.length - 3 > 1 ? "s" : ""}`; cell.appendChild(more); }
    cell.addEventListener("click", (e) => { if (e.target.classList.contains("month-pill")) return; refDate = d; switchView("day"); });
    grid.appendChild(cell);
  }
  el.appendChild(grid);
}

function layoutOverlaps(evs) {
  const sorted = [...evs].sort((a, b) => (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
  const result = []; let cluster = []; let clusterEnd = -1;
  function flush() { if (cluster.length === 0) return; const cols = cluster.length; cluster.forEach((ev, i) => result.push({ ev, col: i, cols })); cluster = []; }
  sorted.forEach(ev => { const start = ev.startH * 60 + ev.startM, end = ev.endH * 60 + ev.endM; if (cluster.length === 0 || start < clusterEnd) { cluster.push(ev); clusterEnd = Math.max(clusterEnd, end); } else { flush(); cluster.push(ev); clusterEnd = end; } });
  flush(); return result;
}

function metaHtml(ev, tag) {
  const teacher = settings.compactCards ? "" : ev.teacher;
  if (D.grid.metaMerged) {
    const meta = [teacher, ev.room].filter(Boolean).join(" · ");
    return meta ? `<${tag} class="ev-sub" title="${escapeHtml(meta)}">${escapeHtml(meta)}</${tag}>` : "";
  }
  return (teacher ? `<${tag} class="ev-sub">${escapeHtml(T("teacherPrefix") + teacher)}</${tag}>` : "")
    + (ev.room ? `<${tag} class="ev-sub">${escapeHtml(T("roomPrefix") + ev.room)}</${tag}>` : "");
}

/* Bloc trop court pour tout afficher (cours d'1h...) : l'horaire passe sur la ligne du
   titre, puis la police réduit par petits pas jusqu'à ce que tout tienne. */
function fitCard(card) {
  // Hauteur réelle du texte (scrollHeight : une ligne compressée par flex garde sa vraie
  // hauteur). Les badges positionnés en absolu ne comptent pas.
  const overflows = () => {
    const cs = getComputedStyle(card);
    const room = card.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    let used = 0;
    for (const k of card.children) {
      const ks = getComputedStyle(k);
      if (ks.position === "absolute" || ks.display === "none") continue;
      used += k.scrollHeight + (parseFloat(ks.marginTop) || 0) + (parseFloat(ks.marginBottom) || 0);
    }
    return used > room + 1;
  };
  if (!overflows()) return;
  const time = card.querySelector(".ev-time"), title = card.querySelector(".ev-title");
  if (time && title) { title.insertBefore(document.createTextNode(time.textContent + " · "), title.firstChild); time.remove(); }
  let s = parseFloat(card.style.getPropertyValue("--s")) || 1;
  while (overflows() && s > 0.66) { s = Math.round((s - 0.04) * 100) / 100; card.style.setProperty("--s", s); }
}

/* Hauteur de référence pour l'échelle de police (designs avec grid.fontScale). */
const MIN_CARD_HEIGHT = 72;

function renderTimeGrid(containerId, days) {
  const el = $(containerId); el.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "grid-view";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const headRow = document.createElement("div"); headRow.className = "grid-headrow";
  const gutterHead = document.createElement("div"); gutterHead.className = "grid-timegutter-head"; headRow.appendChild(gutterHead);
  days.forEach(d => { const dh = document.createElement("div"); dh.className = "grid-daycol-head" + (sameDay(d, today) ? " today" : ""); dh.innerHTML = `<div class="dname">${DAY_NAMES_SHORT[d.getDay()]}</div><div class="dnum">${d.getDate()}</div>`; markHoliday(dh, d, ".dnum"); headRow.appendChild(dh); });
  const scroll = document.createElement("div"); scroll.className = "grid-scroll";
  scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Grille horaire des cours");
  scroll.appendChild(headRow);
  const body = document.createElement("div"); body.className = "grid-body";
  scroll.appendChild(body);
  wrap.appendChild(scroll); el.appendChild(wrap);
  const headH = headRow.offsetHeight || 0;
  // Les libellés d'heure sont centrés sur leur ligne : la moitié du premier et du dernier
  // dépasse du corps de grille. On réserve cette marge en haut et en bas.
  const probe = document.createElement("div"); probe.className = "hour-label"; probe.textContent = "00:00"; probe.style.visibility = "hidden";
  body.appendChild(probe);
  const labelHalf = Math.ceil(probe.offsetHeight / 2) + 1;
  probe.remove();
  const edge = Math.max(parseFloat(getComputedStyle(body).marginTop) || 0, labelHalf);
  body.style.marginTop = edge + "px"; body.style.marginBottom = edge + "px";
  const containerH = Math.max((scroll.clientHeight - headH - 2 * edge) || 0, 200);
  const allEvs = [].concat(...days.map(d => eventsOnDate(d)));
  let rangeStart = 8, rangeEnd = 18;
  if (allEvs.length) {
    let minS = 24, maxE = 0;
    allEvs.forEach(ev => { minS = Math.min(minS, ev.startH + ev.startM / 60); maxE = Math.max(maxE, ev.endH + ev.endM / 60); });
    rangeStart = Math.max(0, Math.floor(minS - 0.5)); rangeEnd = Math.min(24, Math.ceil(maxE + 0.5));
    if (rangeEnd - rangeStart < 2) rangeEnd = rangeStart + 2;
  }
  const totalHours = rangeEnd - rangeStart;
  // À 100% la journée la plus longue tient pile dans la hauteur dispo (aucun scroll).
  // −/+ appliquent un multiplicateur : au-dessus de 100% un scroll apparaît.
  const pxPerHour = (containerH / totalHours) * zoomLevel;
  const bodyHeight = pxPerHour * totalHours;
  body.style.height = bodyHeight + "px";
  const topFor = (h, m) => Math.max(0, Math.min(bodyHeight, ((h + m / 60) - rangeStart) * pxPerHour));
  const gutter = document.createElement("div"); gutter.className = "grid-timegutter"; gutter.style.height = bodyHeight + "px";
  for (let h = Math.ceil(rangeStart); h <= Math.floor(rangeEnd) && h < 24; h++) { const lbl = document.createElement("div"); lbl.className = "hour-label"; lbl.style.top = topFor(h, 0) + "px"; lbl.textContent = pad(h) + ":00"; gutter.appendChild(lbl); }
  body.appendChild(gutter);
  days.forEach(d => {
    const col = document.createElement("div"); col.className = "grid-daycol"; col.style.height = bodyHeight + "px";
    for (let h = Math.ceil(rangeStart); h <= Math.floor(rangeEnd); h++) { const line = document.createElement("div"); line.className = "hour-line"; line.style.top = topFor(h, 0) + "px"; col.appendChild(line); }
    layoutOverlaps(eventsOnDate(d)).forEach(({ ev, col: colIdx, cols }) => {
      const top = topFor(ev.startH, ev.startM);
      let durMin = (ev.endH * 60 + ev.endM) - (ev.startH * 60 + ev.startM); if (durMin <= 0) durMin = 30;
      const height = (durMin / 60) * pxPerHour;
      const mobile = isMobileUI();
      const scale = D.grid.fontScale && !mobile ? Math.max(0.9, Math.min(1.8, height / MIN_CARD_HEIGHT)) : 1;
      const card = document.createElement("div"); card.className = "event-card" + (height < 26 ? " tiny" : "") + (ev.cancelled ? " ev-cancelled" : changeOf(ev) ? " ev-changed" : "");
      if (sameDay(d, today)) { const nm = new Date().getHours() * 60 + new Date().getMinutes(), sm = ev.startH * 60 + ev.startM, em = ev.endH * 60 + ev.endM; if (nm >= em) card.classList.add("past"); else if (nm >= sm) card.classList.add("current"); } else if (d < today) card.classList.add("past");
      card.style.top = top + "px"; card.style.height = height + "px"; card.style.setProperty("--s", scale);
      if (cols > 1 && D.grid.overlap === "cascade") { const step = Math.min(28, 60 / cols); card.classList.add("cascade"); card.style.left = `calc(${colIdx * step}% + 2px)`; card.style.width = `calc(${100 - colIdx * step}% - 4px)`; card.style.zIndex = String(2 + colIdx); }
      else { card.style.left = `calc(${(colIdx / cols) * 100}% + 2px)`; card.style.width = `calc(${100 / cols}% - 4px)`; }
      card.style.background = ev.color; card.style.setProperty("--evc", ev.color);
      const badge = notes[eventKey(ev)] ? D.noteBadge("grid") : "";
      if (mobile) {
        card.classList.add("m");
        card.innerHTML = `${badge}<div class="ev-title" title="${escapeHtml(ev.title)}">${escapeHtml(shortTitle(ev.title))}</div>${ev.room ? `<div class="ev-sub">${escapeHtml(ev.room)}</div>` : ""}`;
      } else card.innerHTML = `${badge}<div class="ev-time">${pad(ev.startH)}:${pad(ev.startM)}–${pad(ev.endH)}:${pad(ev.endM)}</div><div class="ev-title" title="${escapeHtml(ev.title)}">${changeBadgeHtml(ev)}${escapeHtml(ev.title)}</div>${metaHtml(ev, "div")}`;
      card.addEventListener("click", (e) => { e.stopPropagation(); openDetail(ev); });
      col.appendChild(card);
    });
    if (sameDay(d, today)) {
      const now = new Date(); const nowH = now.getHours() + now.getMinutes() / 60;
      if (nowH >= rangeStart && nowH <= rangeEnd) {
        const nowLine = document.createElement("div"); nowLine.className = "now-line"; nowLine.style.top = topFor(now.getHours(), now.getMinutes()) + "px";
        const dot = document.createElement("div"); dot.className = "now-dot"; nowLine.appendChild(dot); col.appendChild(nowLine);
      }
    }
    body.appendChild(col);
  });
  if (!isMobileUI()) {
    // Deux passes : tout de suite, puis une fois polices et images du header chargées.
    const fitAll = () => body.querySelectorAll(".event-card").forEach(fitCard);
    fitAll();
    requestAnimationFrame(fitAll);
    if (document.fonts) document.fonts.ready.then(fitAll);
    window.addEventListener("load", fitAll, { once: true });
  }
}

/* ============================= Vue Jour mobile =============================
   Bandeau de la semaine (points = cours) + cartes lisibles, pauses entre cours. */
function shortTitle(title) {
  const m = title.match(/^(SAE|R)\s?\d+(?:\.\d+)*/i);
  return m ? m[0].replace(/\s/g, "") : title.split(/\s+/).slice(0, 2).join(" ");
}
function fmtGap(min) { const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h${m ? " " + pad(m) : ""}` : `${m} min`; }
function nextCourseAfter(d) {
  const key = dateKey(d);
  return events.filter(e => e.date > key).sort((a, b) => a.date.localeCompare(b.date) || (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM))[0];
}
function renderMobileDay() {
  const el = $("dayView"); el.innerHTML = "";
  const view = document.createElement("div"); view.className = "m-day-view";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const strip = document.createElement("div"); strip.className = "m-strip";
  const start = startOfWeek(refDate);
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i); const evs = eventsOnDate(d);
    if (i >= 5 && !evs.length && !sameDay(d, refDate)) continue;
    const b = document.createElement("button");
    b.className = "m-strip-day" + (sameDay(d, refDate) ? " selected" : "") + (sameDay(d, today) ? " today" : "");
    b.innerHTML = `<span class="m-dn">${DAY_NAMES_SHORT[d.getDay()]}</span><span class="m-dd">${d.getDate()}</span><span class="m-dots">${evs.slice(0, 4).map(e => `<i style="background:${e.color}"></i>`).join("")}</span>`;
    b.addEventListener("click", () => { refDate = d; render(); });
    strip.appendChild(b);
  }
  view.appendChild(strip);
  const list = document.createElement("div"); list.className = "m-list";
  list.tabIndex = 0; list.setAttribute("role", "region"); list.setAttribute("aria-label", "Cours du jour");
  const head = document.createElement("div"); head.className = "m-date";
  head.textContent = capitalize(refDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })) + (UCA_TOOLS.holidayName(refDate) ? " · " + UCA_TOOLS.holidayName(refDate) : "");
  list.appendChild(head);
  const evs = eventsOnDate(refDate);
  if (!evs.length) {
    const empty = document.createElement("div"); empty.className = "m-empty";
    empty.innerHTML = `<div class="big">${D.emptyHtml("day")}</div><div>${escapeHtml(T("noCourse"))}</div>`;
    const next = nextCourseAfter(refDate);
    if (next) {
      const btn = document.createElement("button"); btn.className = "m-next";
      const nd = new Date(next.year, next.month, next.day);
      btn.textContent = `Prochain cours : ${DAY_NAMES_SHORT[nd.getDay()]} ${nd.getDate()} ${monthShort(nd)} · ${pad(next.startH)}:${pad(next.startM)}`;
      btn.addEventListener("click", () => { refDate = nd; render(); });
      empty.appendChild(btn);
    }
    list.appendChild(empty);
  }
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = sameDay(refDate, today);
  evs.forEach((ev, i) => {
    const sm = ev.startH * 60 + ev.startM, em = ev.endH * 60 + ev.endM;
    if (i > 0) {
      const prevEnd = evs[i - 1].endH * 60 + evs[i - 1].endM;
      if (sm - prevEnd >= 30) { const gap = document.createElement("div"); gap.className = "m-gap"; gap.textContent = "Pause · " + fmtGap(sm - prevEnd); list.appendChild(gap); }
    }
    const state = (isToday && nowMin >= em) || refDate < today ? "past" : (isToday && nowMin >= sm ? "current" : "");
    const card = document.createElement("div"); card.className = "m-card" + (state ? " " + state : "") + (ev.cancelled ? " ev-cancelled" : changeOf(ev) ? " ev-changed" : "");
    card.style.setProperty("--evc", ev.color);
    card.innerHTML = `<div class="m-time"><b>${pad(ev.startH)}:${pad(ev.startM)}</b><span>${pad(ev.endH)}:${pad(ev.endM)}</span></div>
      <div class="m-body">${state === "current" ? `<span class="m-badge">${escapeHtml(T("current"))}</span>` : ""}<div class="m-title">${changeBadgeHtml(ev)}${escapeHtml(ev.title)}</div>
      ${ev.teacher ? `<div class="m-meta">${D.icon("user")}<span>${escapeHtml(ev.teacher)}</span></div>` : ""}
      ${ev.room ? `<div class="m-meta">${D.icon("pin")}<span>${escapeHtml(ev.room)}</span></div>` : ""}</div>
      ${notes[eventKey(ev)] ? D.noteBadge("day") : ""}`;
    card.addEventListener("click", () => openDetail(ev));
    list.appendChild(card);
  });
  view.appendChild(list);
  el.appendChild(view);
  const sel = strip.querySelector(".selected"); if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
}
let touchStart = null;
$("dayView").addEventListener("touchstart", (e) => { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
$("dayView").addEventListener("touchend", (e) => {
  if (!touchStart || currentView !== "day" || !isMobileUI()) return;
  const dx = e.changedTouches[0].clientX - touchStart.x, dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1);
}, { passive: true });

function renderDayList() {
  const el = $("dayView"); el.innerHTML = "";
  const list = document.createElement("div"); list.className = "day-list";
  const evs = eventsOnDate(refDate);
  if (evs.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="big">${D.emptyHtml("day")}</div><div>${escapeHtml(T("noCourse"))}</div></div>`;
  } else {
    evs.forEach(ev => {
      const card = document.createElement("div"); card.className = "day-card"; card.style.position = "relative";
      const badge = notes[eventKey(ev)] ? D.noteBadge("day") : "";
      card.innerHTML = `<div class="stripe" style="background:${ev.color}"></div><div class="content">${badge}<div class="time">${pad(ev.startH)}:${pad(ev.startM)} <small>${escapeHtml(T("timeSep"))} ${pad(ev.endH)}:${pad(ev.endM)}</small></div><div class="title">${changeBadgeHtml(ev)}${escapeHtml(ev.title)}</div><div class="meta">${metaHtml(ev, "span")}</div></div>`;
      card.addEventListener("click", () => openDetail(ev));
      list.appendChild(card);
    });
  }
  el.appendChild(list);
}

function render() {
  if (!availableViews().includes(currentView)) currentView = availableViews().includes("week") ? "week" : availableViews()[0];
  updateHeader();
  const week = () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(refDate), i))
    .filter((d, i) => !settings.hideWeekend || i < 5 || eventsOnDate(d).length > 0);
  if (currentView === "month") renderMonth();
  else if (currentView === "week") renderTimeGrid("weekView", week());
  else if (currentView === "3day") renderTimeGrid("threeDayView", Array.from({ length: 3 }, (_, i) => addDays(refDate, i)));
  else if (currentView === "5day") renderTimeGrid("fiveDayView", getFiveDayDays());
  else if (currentView === "6day") renderTimeGrid("sixDayView", getSixDayDays());
  else if (currentView === "day") { if (isMobileUI()) renderMobileDay(); else if (D.dayView === "list") renderDayList(); else renderTimeGrid("dayView", [new Date(refDate)]); }
  const target = VIEW_CONTAINERS[currentView];
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === target));
}

/* ============================= Menu mobile (hamburger) ============================= */
function closeMobileMenu() { $("mobileMenu").classList.remove("open"); }
function menuButton(cls, html, onClick) {
  const b = document.createElement("button"); b.className = cls; b.innerHTML = html;
  b.onclick = () => { closeMobileMenu(); onClick(); };
  return b;
}
function buildMobileMenu() {
  const m = $("mobileMenu"); m.innerHTML = "";
  availableViews().forEach(v => m.appendChild(menuButton("mi" + (v === currentView ? " active" : ""), escapeHtml(T("view_" + v)), () => switchView(v))));
  m.appendChild(menuButton("mi", escapeHtml(T("today")), () => { refDate = new Date(); refDate.setHours(0, 0, 0, 0); render(); }));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  const avg = generalAverage();
  m.appendChild(menuButton("mi", D.icon("book") + "Notes" + (avg != null ? ` — moyenne ${fmtNote(avg)}` : ""), () => openToolPanel("notesPanel", true)));
  m.appendChild(menuButton("mi", D.icon("chart") + escapeHtml(absences ? `Absences : ${plural(absences.declarees, "déclarée")}, ${plural(absences.nonJustifiees, "non justifiée")}` : "Absences"), () => openToolPanel("absencesPanel", true)));
  ((absences && absences.declarations) || []).slice(0, 3).forEach(d => { const n = declarationNode(d); n.classList.add("m-decl"); m.appendChild(n); });
  m.appendChild(menuButton("mi", D.icon("link") + "Liens (accueil, aide, installation…)", () => openToolPanel("linksPanel", true)));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  m.appendChild(menuButton("mi", D.icon("link") + "Moodle", () => window.open(MOODLE_URL, "_blank", "noopener")));
  m.appendChild(menuButton("mi", D.icon("mail") + "Messagerie (Zimbra)", () => window.open(MAIL_URL, "_blank", "noopener")));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  if ($("filterPanel")) m.appendChild(menuButton("mi", D.icon("filter") + "Filtres" + (UCA_TOOLS.activeCount() ? ` (${UCA_TOOLS.activeCount()})` : ""), () => openToolPanel("filterPanel", true)));
  if ($("exportPanel")) m.appendChild(menuButton("mi", D.icon("export") + "Exporter (.ics)", () => openToolPanel("exportPanel", true)));
  m.appendChild(menuButton("mi", D.icon("settings") + "Paramètres", () => UCA_CORE.openSettings()));
  if (!window.UCA_APP) m.appendChild(menuButton("mi", D.icon("link") + "Statut des sites (Odin, CAS…)", () => UCA_CORE.openSettings("#statusSection")));
  m.appendChild(menuButton("mi", D.icon("design") + "Changer de design", () => { location.href = chrome.runtime.getURL("choose.html?change=1&tab=1"); }));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  // Même logique que le bouton desktop (setSyncLabel ci-dessous) : "Importer" seulement si on est
  // dans l'app ET que l'extension n'est pas détectée dans ce navigateur ; sinon "Synchroniser" fait
  // une vraie synchro Odin via le pont (voir core/env.js). Le menu est reconstruit à chaque ouverture,
  // donc ce test reflète toujours l'état courant d'extensionReady sans écouteur supplémentaire.
  m.appendChild(menuButton("mi msync primary", D.icon("sync") + (window.UCA_APP && !window.UCA_APP.extensionReady ? "Importer mes données" : "Synchroniser"), triggerSync));
  const r = $("menuBtn").getBoundingClientRect();
  m.style.top = (r.bottom + 6) + "px"; m.style.left = r.left + "px";
}
$("menuBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const m = $("mobileMenu");
  if (m.classList.contains("open")) { closeMobileMenu(); return; }
  buildMobileMenu(); m.classList.add("open");
});
document.addEventListener("click", (e) => { if (!e.target.closest("#mobileMenu") && !e.target.closest("#menuBtn")) closeMobileMenu(); });
window.addEventListener("resize", () => { closeMobileMenu(); render(); });
// La barre peut changer de hauteur sans redimensionner la fenêtre (police chargée après
// coup, passage à la ligne) : la grille se recalcule pour que la journée tienne toujours.
let lastMainHeight = 0;
new ResizeObserver(() => {
  const h = document.querySelector("main").clientHeight;
  if (Math.abs(h - lastMainHeight) > 1) { lastMainHeight = h; render(); }
}).observe(document.querySelector("main"));

/* ============================= Session expirée ============================= */
function renderSessionState(expired) {
  $("sessionWarn").classList.toggle("hidden", !expired);
  $("sessionBubble").classList.toggle("show", !!expired && isMobileUI());
}

/* ============================= Sync & chargement ============================= */
let syncInfoArgs = [null, null];
const STALE_HOURS = 24;
/* Des données de plus de 24 h ne reflètent plus l'emploi du temps : rappel en rouge dans la ligne d'info.
   App : lien direct vers l'import (elle ne se synchronise pas seule). Extension : bouton « Resynchroniser »
   (même chemin que le bouton Synchroniser). Recalculé toutes les 10 min. */
function renderStaleReminder(iso, importedAt) {
  const info = $("syncInfo"), old = info.querySelector("#staleInfo"); if (old) old.remove();
  const t = new Date(window.UCA_APP ? (iso || importedAt) : iso).getTime();
  if ((window.UCA_APP && !importedAt) || Number.isNaN(t)) return;
  const hours = (Date.now() - t) / 3600000;
  if (hours < STALE_HOURS) return;
  const span = document.createElement("span"); span.id = "staleInfo"; span.setAttribute("role", "status");
  span.style.cssText = "margin-left:12px;font-weight:600;color:var(--danger, #b3261e);";
  const days = Math.floor(hours / 24);
  span.append(document.createTextNode(days >= 2 ? `Données vieilles de ${days} jours. ` : window.UCA_APP ? "Données de plus de 24 h. " : `Données vieilles de ${Math.floor(hours)} h. `));
  let a;
  if (window.UCA_APP) { a = document.createElement("a"); a.href = chrome.runtime.getURL("app/import.html"); a.textContent = "Refaire un transfert"; }
  else {
    a = document.createElement("button"); a.type = "button"; a.id = "staleSyncBtn"; a.textContent = "Resynchroniser";
    a.addEventListener("click", () => { if (!syncBtn.disabled) triggerSync(); });
  }
  a.style.cssText = "color:inherit;text-decoration:underline;background:none;border:none;font:inherit;font-weight:600;cursor:pointer;padding:0 2px;";
  span.appendChild(a);
  info.appendChild(span);
}
setInterval(() => { renderSyncInfo(...syncInfoArgs); renderNextInfo(); }, 10 * 60 * 1000);
function renderSyncInfo(iso, importedAt) {
  syncInfoArgs = [iso, importedAt];
  const fmt = (d) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (window.UCA_APP) {
    $("syncInfo").textContent = importedAt ? `Données de l'ordinateur du ${fmt(iso || importedAt)} — refais un transfert après une synchro` : "Aucune donnée : importe-les depuis l'extension";
    renderStaleReminder(iso, importedAt);
    return;
  }
  $("syncInfo").textContent = iso ? "Dernière synchro : " + new Date(iso).toLocaleString("fr-FR") : "Jamais synchronisé";
  renderStaleReminder(iso, null);
}
/* Prochain cours (ou cours en cours) dans la ligne d'info, mis à jour chaque 30 s. */
function renderNextInfo() {
  const info = $("syncInfo"); if (!info) return;
  const old = info.querySelector("#nextInfo"); if (old) old.remove();
  const text = UCA_TOOLS.nextCourseText(UCA_TOOLS.nextCourse(events));
  if (!text) return;
  const span = document.createElement("span"); span.id = "nextInfo"; span.textContent = text;
  span.style.cssText = "margin-left:14px;font-weight:600;";
  info.appendChild(span);
}
setInterval(renderNextInfo, 30000);
function loadFromStorage() {
  chrome.storage.local.get(["uca_events", "uca_last_sync", "uca_notes", "uca_absences", "uca_releve_notes", "uca_session_expired", "uca_notes_seen", "uca_settings", "uca_edt_changes", "uca_app_imported_at", "uca_scrape_issues", "uca_notes_history", "uca_subject_colors"], (data) => {
    if (window.UCA_APP && !(data.uca_events || []).length && !sessionStorage.getItem("uca_import_skip")) { location.href = chrome.runtime.getURL("app/import.html"); return; }
    settings = Object.assign({}, UCA_SETTINGS_DEFAULTS, data.uca_settings);
    subjectColors = data.uca_subject_colors || {};
    events = (data.uca_events || []).map(ev => ({ ...ev, color: colorOf(ev.title) }));
    notes = data.uca_notes || {};
    absences = data.uca_absences || null;
    scrapeIssues = data.uca_scrape_issues || {};
    notesHistory = data.uca_notes_history || [];
    subjectColors = data.uca_subject_colors || {};
    releveNotes = data.uca_releve_notes || null;
    notesSeen = data.uca_notes_seen || {};
    setEdtChanges(data.uca_edt_changes);
    if (!autoViewApplied) {
      autoViewApplied = true;
      const params = new URLSearchParams(location.search);
      if (params.get("view") && availableViews().includes(params.get("view"))) { settings = Object.assign({}, settings, { startView: params.get("view") }); }
      if (params.get("open")) setTimeout(() => openToolPanel(params.get("open") + "Panel", isMobileUI()), 300);
      if (location.hash === "#phone" && !window.UCA_APP) setTimeout(openPhoneModal, 300);
      if (settings.startView !== "auto" && availableViews().includes(settings.startView)) currentView = settings.startView;
      else if (isMobileUI()) currentView = "day";
      else if (eventsOnDate(refDate).length === 0 && availableViews().includes("5day")) currentView = "5day";
    }
    renderSyncInfo(data.uca_last_sync, data.uca_app_imported_at);
    renderNextInfo();
    renderSessionState(!!data.uca_session_expired);
    renderAbsencesPanel();
    renderNotesPanel();
    render();
  });
}
function eventColorKey(title) { return title.replace(/\b(CM|TD|TDA|TP|TPA)\b/gi, "").trim() || title; }
function colorOf(title) {
  const key = eventColorKey(title), slot = subjectColors[key];
  return Number.isInteger(slot) ? D.swatch(slot) : D.eventColor(key);
}

/* Un panneau ancré à droite de son bouton peut sortir de l'écran si le header passe
   sur plusieurs lignes : on le recale dans la fenêtre à l'ouverture. */
function togglePanel(panel) {
  panel.style.left = ""; panel.style.right = "";
  panel.classList.toggle("open");
  if (!panel.classList.contains("open")) return;
  const r = panel.getBoundingClientRect();
  if (r.left < 8) { panel.style.left = "0"; panel.style.right = "auto"; }
  else if (r.right > window.innerWidth - 8) { panel.style.right = "0"; panel.style.left = "auto"; }
}

/* ============================= Absences ============================= */
function plural(n, w) { if (n === null || n === undefined) return "? " + w; return n + " " + w + (n > 1 ? "s" : ""); }
/* Déclarations d'absence (dates, horaires, motif, statut) sous les compteurs. */
const DECL_STATUS = { justifiee: "Justifiée", refusee: "Refusée", attente: "En attente" };
function fmtDeclWhen(d) {
  const a = new Date(d.debut), b = new Date(d.fin);
  const day = (x) => capitalize(x.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }));
  const hm = (x) => pad(x.getHours()) + ":" + pad(x.getMinutes());
  return sameDay(a, b) ? `${day(a)}, ${hm(a)} → ${hm(b)}` : `${day(a)} ${hm(a)} → ${day(b)} ${hm(b)}`;
}
function declarationNode(d) {
  const item = document.createElement("div"); item.className = "ap-decl";
  const top = document.createElement("div"); top.className = "ap-decl-top";
  const when = document.createElement("span"); when.className = "ap-decl-when"; when.textContent = fmtDeclWhen(d);
  const st = document.createElement("span"); st.className = "ap-status " + d.statut;
  st.textContent = DECL_STATUS[d.statut] || d.statutLibelle || "Statut inconnu";
  if (d.statutLibelle) st.title = d.statutLibelle;
  top.append(when, st);
  item.appendChild(top);
  if (d.motif) { const m = document.createElement("div"); m.className = "ap-decl-motif"; m.textContent = d.motif; item.appendChild(m); }
  const dep = document.createElement("div"); dep.className = "ap-decl-dep";
  dep.textContent = "Déposée le " + new Date(d.depose).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  item.appendChild(dep);
  return item;
}
function renderDeclarations() {
  const panel = $("absencesPanel");
  let box = panel.querySelector(".ap-details");
  if (!box) { box = document.createElement("div"); box.className = "ap-details"; panel.insertBefore(box, panel.querySelector(".ap-link")); }
  box.innerHTML = "";
  const list = absences && absences.declarations;
  if (!list) return;
  const head = document.createElement("div"); head.className = "ap-dh"; head.textContent = `Mes déclarations (${list.length})`;
  box.appendChild(head);
  if (!list.length) { const e = document.createElement("div"); e.className = "ap-decl-empty"; e.textContent = "Aucune déclaration."; box.appendChild(e); }
  list.forEach(d => box.appendChild(declarationNode(d)));
  const note = document.createElement("div"); note.className = "ap-decl-note";
  note.textContent = "Odin ne détaille pas les absences relevées sans déclaration (seulement leur nombre).";
  box.appendChild(note);
}


/* Problème rencontré à la dernière lecture d'Odin (page d'erreur, structure changée...) : on garde les
   anciennes données et on le dit, au lieu d'afficher un résultat vide sans explication. */
const SCRAPE_ISSUE_TEXT = {
  session: "Session Odin expirée : reconnecte-toi.",
  serviceDown: "Odin est indisponible : ces données datent de la dernière synchro réussie.",
  structure: "Odin semble avoir changé sa page : ces données datent de la dernière synchro réussie. Signale-le dans l'aide si ça dure.",
  error: "Lecture impossible cette fois : ces données datent de la dernière synchro réussie.",
};
function scrapeIssueNode(kind) {
  const i = scrapeIssues[kind];
  if (!i || !SCRAPE_ISSUE_TEXT[i.issue]) return null;
  const n = document.createElement("div");
  n.className = "scrape-issue"; n.setAttribute("role", "status");
  n.style.cssText = "margin:0 0 8px;padding:8px 10px;border:1px solid var(--danger);border-radius:8px;color:var(--danger);font-size:12.5px;line-height:1.4;";
  n.textContent = SCRAPE_ISSUE_TEXT[i.issue] + " (" + new Date(i.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + ")";
  return n;
}
function renderAbsencesIssue() {
  const panel = $("absencesPanel");
  const old = panel.querySelector(".scrape-issue"); if (old) old.remove();
  const n = scrapeIssueNode("absences");
  if (n) panel.insertBefore(n, panel.firstChild);
}
function renderAbsenceAlert() {
  const panel = $("absencesPanel");
  const old = panel.querySelector(".absence-alert"); if (old) old.remove();
  const th = Number(settings.absenceAlert) || 0, n = absences && absences.nonJustifiees;
  if (!th || !n || n < th) return;
  const node = document.createElement("div");
  node.className = "absence-alert"; node.setAttribute("role", "status");
  node.style.cssText = "margin:0 0 8px;padding:8px 10px;border:1px solid var(--danger);border-radius:8px;color:var(--danger);font-size:12.5px;line-height:1.4;font-weight:600;";
  node.textContent = `${n} absence${n > 1 ? "s" : ""} non justifiée${n > 1 ? "s" : ""} : le seuil d'alerte (${th}) est atteint. Pense à déposer un justificatif sur Odin.`;
  const issue = panel.querySelector(".scrape-issue");
  panel.insertBefore(node, issue ? issue.nextSibling : panel.firstChild);
}
function renderAbsencesPanel() {
  renderAbsencesIssue();
  renderAbsenceAlert();
  const fmt = (v) => (v === null || v === undefined ? "—" : v);
  const set = (id, key) => { document.querySelector(`#${id} .ap-val`).textContent = absences ? fmt(absences[key]) : "—"; };
  set("apDeclarees", "declarees"); set("apJustifiees", "justifiees"); set("apNonJustifiees", "nonJustifiees");
  set("apMotifs", "avecMotifs"); set("apJourneesNJ", "journeesNonJustifiees");
  renderDeclarations();
  $("absencesBtn").innerHTML = D.icon("chart") + '<span class="btn-label">Absences</span>' + (absences && absences.nonJustifiees ? ` (${absences.nonJustifiees})` : "");
}
$("absencesBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("notesPanel").classList.remove("open");
  togglePanel($("absencesPanel"));
});
// Ferme le panneau sur un clic dehors. Le panneau peut être déplacé en feuille (téléphone) :
// un clic dedans, dans le menu qui l'ouvre ou sur un élément qu'il vient de reconstruire ne compte pas.
function closeOnOutsideClick(panelId, wrapId) {
  document.addEventListener("click", (e) => {
    const p = $(panelId);
    if (!p.classList.contains("open") || !document.contains(e.target)) return;
    if (p.contains(e.target) || $(wrapId).contains(e.target) || e.target.closest("#mobileMenu")) return;
    p.classList.remove("open");
    if ($("ucaSheetBackdrop")) $("ucaSheetBackdrop").hidden = true;
  });
}
closeOnOutsideClick("absencesPanel", "absencesWrap");

/* ============================= Relevé de notes =============================
   Tableau hiérarchique UE > matière > évaluation (format Odin, voir background.js
   parseNotesText). Construit en DOM : les libellés viennent d'une page externe. */
function fmtNote(v) { return v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 }); }
function ntCell(text, cls) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}
// Note apparue (ou modifiée) depuis moins de N jours (Paramètres, 2 par défaut) : orange ;
// moins de 2N jours : jaune ; ensuite normale. Comparaison numérique : 12 et 12.0 sont la même note.
function noteDays() { return Math.max(1, Number(settings.noteNewDays) || 2); }
function noteAgeClass(seenKey, note) {
  const seen = seenKey && notesSeen[seenKey];
  if (note == null || !seen || !seen.at || Number(seen.note) !== Number(note)) return "";
  const age = Date.now() - seen.at, day = 86400000;
  return age < noteDays() * day ? " note-new" : age < 2 * noteDays() * day ? " note-recent" : "";
}
function ntRow(cls, label, row, seenKey) {
  const tr = document.createElement("tr");
  tr.className = cls;
  tr.appendChild(ntCell(label, "lbl"));
  tr.appendChild(ntCell(fmtNote(row.coeff), "num"));
  const ageCls = noteAgeClass(seenKey, row.note);
  const noteTd = ntCell(fmtNote(row.note), "num note note-val" + ageCls);
  if (ageCls) {
    const n = noteDays();
    noteTd.title = ageCls === " note-new" ? `Nouvelle note (moins de ${n} jour${n > 1 ? "s" : ""})` : `Note récente (moins de ${2 * n} jours)`;
  }
  tr.appendChild(noteTd);
  tr.appendChild(ntCell(fmtNote(row.moy), "num"));
  tr.appendChild(ntCell(fmtNote(row.maxi), "num"));
  tr.appendChild(ntCell(fmtNote(row.mini), "num"));
  return tr;
}
// Odin ne remplit souvent la note de matière/UE qu'au jury de semestre ("-" avant ça) :
// on la reconstruit depuis le niveau en dessous avec le Coeff de chaque ligne du tableau
// (éval -> matière -> UE), jamais avec un poids par défaut inventé.
const weightedAvg = UCA_GRADES.weightedAvg;
const matiereEffectiveNote = UCA_GRADES.matiereNote;
const ueEffectiveNote = UCA_GRADES.ueNote;
function generalAverage() { return UCA_GRADES.generalAvg(releveNotes); }


/* ---- Outils de la fenêtre Notes : examens à venir, simulateur d'objectif, évolution ----
   Construits avec les classes communes (.fp-h, .fp-search, .fp-empty) : chaque design les habille. */
function npEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const NP_ROW = "display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:4px 16px;font-size:13px;";
const NP_EXAM = "display:flex;flex-direction:column;gap:1px;padding:5px 16px;font-size:13px;line-height:1.35;";
/* Les fenêtres des designs ont leurs propres fonds (parfois sombres même en thème clair) : le texte des
   blocs ajoutés suit la luminosité réelle du fond de la fenêtre Notes, pas le thème de la page. */
function panelInk() {
  let n = $("notesPanel");
  while (n) {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(n).backgroundColor || "");
    if (m) {
      const [r, g, b, al] = m[1].split(",").map((x) => parseFloat(x));
      if (al === undefined || al > 0.5) return (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? "#ececec" : "#1f1f1f";
    }
    n = n.parentElement;
  }
  return "#1f1f1f";
}
function inkify(node) {
  if (!node) return node;
  const ink = panelInk();
  node.style.color = ink;
  node.querySelectorAll(".fp-h, .fp-empty").forEach((e) => { e.style.color = ink; e.style.opacity = ".72"; });
  return node;
}
function daysUntil(ev) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(ev.year, ev.month, ev.day) - t) / 86400000);
}
function countdownText(n) { return n <= 0 ? "Aujourd'hui" : n === 1 ? "Demain" : `Dans ${n} jours`; }
function upcomingExams() {
  const now = Date.now();
  return events.filter((ev) => UCA_TOOLS.typeOf(ev.title) === "Examen" && new Date(ev.year, ev.month, ev.day, ev.endH, ev.endM).getTime() > now)
    .sort((a, b) => new Date(a.year, a.month, a.day, a.startH, a.startM) - new Date(b.year, b.month, b.day, b.startH, b.startM)).slice(0, 12);
}
function examsBlock() {
  const exams = upcomingExams();
  if (!exams.length) return null;
  const box = npEl("div", "np-exams");
  box.appendChild(npEl("div", "fp-h", "Examens à venir"));
  exams.forEach((ev) => {
    const row = npEl("div", "np-exam"); row.style.cssText = NP_EXAM;
    const left = npEl("b", "", ev.title);
    const hm = `${String(ev.startH).padStart(2, "0")}h${String(ev.startM).padStart(2, "0")}`;
    const date = new Date(ev.year, ev.month, ev.day).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    const right = npEl("span", "", `${countdownText(daysUntil(ev))} · ${date} ${hm}${ev.room ? " · " + ev.room : ""}`);
    right.style.opacity = ".85";
    row.append(left, right); box.appendChild(row);
    // Un clic ouvre le jour de l'examen dans l'agenda.
    row.tabIndex = 0; row.setAttribute("role", "button"); row.style.cursor = "pointer"; row.title = "Voir ce jour dans l'agenda";
    const go = () => { refDate = new Date(ev.year, ev.month, ev.day); $("notesPanel").classList.remove("open"); if (currentView === "month") switchView("day"); else render(); };
    row.addEventListener("click", go); row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  return box;
}

function simResultText(r, target, label) {
  const f = fmtNote, n = r.pending, ev = `${n} évaluation${n > 1 ? "s" : ""} à venir (coeff ${f(r.coeff)})`;
  const cur = r.current == null ? "" : ` Actuellement : ${f(r.current)} / 20.`;
  if (r.status === "nothing") return "Aucune évaluation à venir à simuler ici.";
  if (r.status === "reached") return `Objectif déjà atteint : ${f(target)} en ${label}, même avec 0 sur les ${ev}.${cur}`;
  if (r.status === "impossible") return `Impossible d'atteindre ${f(target)} en ${label} : même 20 / 20 sur les ${ev} donne ${r.max == null ? "—" : f(r.max)}.${cur}`;
  return `Il faut au moins ${f(r.needed)} / 20 de moyenne sur les ${ev} pour atteindre ${f(target)} en ${label}.${cur}`;
}
function simulatorBlock() {
  const list = UCA_GRADES.scopes(releveNotes);
  const box = npEl("div", "np-sim");
  box.appendChild(npEl("div", "fp-h", "Simulateur d'objectif"));
  if (!list.length) { box.appendChild(npEl("div", "fp-empty", "Aucune évaluation à venir dans ton relevé : rien à simuler.")); return box; }
  if (!list.some((x) => x.id === simScope)) simScope = list[0].id;
  const sel = npEl("select", "fp-search"); sel.id = "simScope"; sel.setAttribute("aria-label", "Matière, UE ou moyenne à viser");
  list.forEach((x) => { const o = npEl("option", "", x.label); o.value = x.id; sel.appendChild(o); });
  sel.value = simScope;
  const row = npEl("div", "np-sim-row"); row.style.cssText = NP_ROW + "align-items:center;";
  const lbl = npEl("label", "", "Objectif (sur 20)"); lbl.htmlFor = "simTarget";
  const inp = npEl("input", "fp-search"); inp.id = "simTarget"; inp.type = "number"; inp.min = "0"; inp.max = "20"; inp.step = "0.5"; inp.value = String(simTarget);
  inp.style.cssText = "width:96px;margin:0;display:inline-block;";
  row.append(lbl, inp);
  const out = npEl("div", "np-sim-out"); out.id = "simOut"; out.setAttribute("role", "status"); out.setAttribute("aria-live", "polite");
  out.style.cssText = "padding:6px 16px 4px;font-size:13px;line-height:1.45;";
  const update = () => {
    const t = Math.max(0, Math.min(20, parseFloat(String(inp.value).replace(",", "."))));
    if (Number.isNaN(t)) { out.textContent = "Entre un objectif entre 0 et 20."; return; }
    simTarget = t; simScope = sel.value;
    out.textContent = simResultText(UCA_GRADES.simulate(releveNotes, simScope, t), t, (list.find((x) => x.id === simScope) || {}).label || "");
  };
  sel.addEventListener("change", update); inp.addEventListener("input", update);
  box.append(sel, row, out); update();
  return box;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) { const e = document.createElementNS(SVG_NS, tag); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); return e; }
function chartSvg(w, h) {
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", width: "100%" });
  svg.style.cssText = "display:block;margin:4px 0 0;max-width:100%;";
  return svg;
}
function svgText(x, y, text, anchor) { const t = svgEl("text", { x, y, "font-size": 10, "text-anchor": anchor || "middle", fill: "currentColor", opacity: ".75" }); t.textContent = text; return t; }
function historyChart() {
  const pts = notesHistory;
  const wrap = npEl("div", "np-chart-body");
  if (pts.length < 2) {
    wrap.appendChild(npEl("div", "fp-empty", pts.length ? `Moyenne actuelle : ${fmtNote(pts[0].avg)} / 20. La courbe se dessine à chaque synchro où ta moyenne change.` : "Pas encore d'historique : la courbe se dessine à chaque synchro où ta moyenne change."));
    return wrap;
  }
  const W = 360, H = 150, L = 30, Rr = 12, T = 12, B = 24;
  const lo = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.avg)) - 1)), hi = Math.min(20, Math.ceil(Math.max(...pts.map((p) => p.avg)) + 1));
  const x = (i) => L + (W - L - Rr) * i / (pts.length - 1), y = (v) => T + (H - T - B) * (1 - (v - lo) / Math.max(1, hi - lo));
  const svg = chartSvg(W, H); svg.setAttribute("aria-label", `Évolution de la moyenne générale : de ${fmtNote(pts[0].avg)} à ${fmtNote(pts[pts.length - 1].avg)}`);
  [lo, (lo + hi) / 2, hi].forEach((v) => {
    svg.appendChild(svgEl("line", { x1: L, x2: W - Rr, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": ".15" }));
    svg.appendChild(svgText(L - 4, y(v) + 3, fmtNote(v), "end"));
  });
  if (lo < 10 && hi > 10) svg.appendChild(svgEl("line", { x1: L, x2: W - Rr, y1: y(10), y2: y(10), stroke: "currentColor", "stroke-opacity": ".4", "stroke-dasharray": "3 3" }));
  svg.appendChild(svgEl("polyline", { points: pts.map((p, i) => `${x(i)},${y(p.avg)}`).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 2, "stroke-linejoin": "round" }));
  pts.forEach((p, i) => {
    const c = svgEl("circle", { cx: x(i), cy: y(p.avg), r: 3, fill: "var(--accent)" });
    const tt = svgEl("title"); tt.textContent = `${new Date(p.at).toLocaleDateString("fr-FR")} : ${fmtNote(p.avg)} / 20`; c.appendChild(tt);
    svg.appendChild(c);
  });
  const d = (p) => new Date(p.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  svg.appendChild(svgText(L, H - 6, d(pts[0]), "start")); svg.appendChild(svgText(W - Rr, H - 6, d(pts[pts.length - 1]), "end"));
  wrap.appendChild(svg);
  return wrap;
}
function matiereChart(label) {
  const series = UCA_GRADES.matiereSeries(releveNotes, label), wrap = npEl("div", "np-chart-body");
  if (!series.length) { wrap.appendChild(npEl("div", "fp-empty", "Aucune note dans cette matière pour l'instant.")); return wrap; }
  const W = 360, H = 150, L = 24, T = 10, B = 30, gw = (W - L - 8) / series.length, bw = Math.min(22, gw / 2.6);
  const y = (v) => T + (H - T - B) * (1 - v / 20);
  const svg = chartSvg(W, H); svg.setAttribute("aria-label", `Notes de ${label}, comparées à la moyenne de la classe`);
  [0, 10, 20].forEach((v) => {
    svg.appendChild(svgEl("line", { x1: L, x2: W - 8, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": v === 10 ? ".4" : ".15", "stroke-dasharray": v === 10 ? "3 3" : "" }));
    svg.appendChild(svgText(L - 4, y(v) + 3, v, "end"));
  });
  series.forEach((e, i) => {
    const cx = L + gw * (i + .5);
    const bars = [[cx - bw - 1, e.note, "var(--accent)", 1, "Ta note"], [cx + 1, e.moy, "currentColor", .35, "Moyenne de la classe"]];
    bars.forEach(([bx, v, fill, op, what]) => {
      if (v == null) return;
      const r = svgEl("rect", { x: bx, y: y(v), width: bw, height: Math.max(1, y(0) - y(v)), fill, "fill-opacity": op, rx: 2 });
      const tt = svgEl("title"); tt.textContent = `${e.label} — ${what} : ${fmtNote(v)} / 20`; r.appendChild(tt);
      svg.appendChild(r);
    });
    svg.appendChild(svgText(cx, H - 16, e.label.length > 12 ? e.label.slice(0, 11) + "…" : e.label));
    svg.appendChild(svgText(cx, H - 5, fmtNote(e.note)));
  });
  wrap.appendChild(svg);
  const legend = npEl("div", "fp-empty", "Barre pleine : ta note · barre claire : moyenne de la classe");
  wrap.appendChild(legend);
  return wrap;
}
function chartBlock() {
  const box = npEl("div", "np-chart");
  box.appendChild(npEl("div", "fp-h", "Évolution des notes"));
  const sel = npEl("select", "fp-search"); sel.id = "chartScope"; sel.setAttribute("aria-label", "Graphique à afficher");
  const g = npEl("option", "", "Moyenne générale (historique)"); g.value = "general"; sel.appendChild(g);
  UCA_GRADES.gradedMatieres(releveNotes).forEach((m) => { const o = npEl("option", "", m); o.value = "mat:" + m; sel.appendChild(o); });
  if (![...sel.options].some((o) => o.value === chartScope)) chartScope = "general";
  sel.value = chartScope;
  const body = npEl("div"); body.style.cssText = "padding:4px 16px 0;";
  const draw = () => { chartScope = sel.value; body.innerHTML = ""; body.appendChild(chartScope === "general" ? historyChart() : matiereChart(chartScope.slice(4))); inkify(body); };
  sel.addEventListener("change", draw);
  box.append(sel, body); draw();
  return box;
}
function renderNotesPanel() {
  const content = $("npContent");
  content.innerHTML = "";
  const issueNode = scrapeIssueNode("notes"); if (issueNode) content.appendChild(issueNode);
  const avg = generalAverage();
  if (!releveNotes || !releveNotes.ue || !releveNotes.ue.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty";
    empty.innerHTML = D.emptyHtml("notes") + escapeHtml("Aucun relevé — synchronise pour voir tes notes");
    content.appendChild(empty);
    const exams = examsBlock(); if (exams) content.appendChild(inkify(exams));
  } else {
    if (avg != null) {
      const avgBar = document.createElement("div"); avgBar.className = "notes-avg";
      avgBar.innerHTML = `<span class="na-lbl">Moyenne générale</span><span class="na-val">${fmtNote(avg)} / 20</span>`;
      content.appendChild(avgBar);
    }
    [examsBlock(), simulatorBlock(), chartBlock(), npEl("div", "fp-h", "Détail des notes")].forEach((b) => { if (b) content.appendChild(inkify(b)); });
    const table = document.createElement("table");
    table.className = "notes-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Matière</th><th class="num">Coeff</th><th class="num">Note</th><th class="num">Moy</th><th class="num">Maxi</th><th class="num">Mini</th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    // Une matière déjà affichée (même titre exact, présente sous plusieurs UE) ne se réaffiche pas.
    const seenMatieres = new Set();
    releveNotes.ue.forEach((ue) => {
      const matieres = (ue.matieres || []).filter((m) => {
        if (seenMatieres.has(m.label)) return false;
        seenMatieres.add(m.label);
        return true;
      });
      if (!matieres.length) return;
      tbody.appendChild(ntRow("ue-row", ue.label, ue, "UE|" + ue.label));
      matieres.forEach((m) => {
        tbody.appendChild(ntRow("matiere-row" + (m.note == null ? " no-grade" : ""), m.label, m, m.label + "|"));
        const seenEvals = new Set();
        (m.evals || []).forEach((ev) => {
          const key = ev.key || ev.label;
          if (seenEvals.has(key)) return;
          seenEvals.add(key);
          tbody.appendChild(ntRow("eval-row", ev.label, ev, m.label + "|" + key));
        });
      });
    });
    table.appendChild(tbody);
    content.appendChild(table);
  }
  const badge = $("notesAvg");
  if (badge) {
    badge.textContent = avg != null ? fmtNote(avg) : "";
    badge.classList.toggle("hidden", avg == null);
    $("notesBtn").innerHTML = D.icon("book") + '<span class="btn-label">Notes</span>';
  } else {
    $("notesBtn").innerHTML = D.icon("book") + '<span class="btn-label">Notes</span>' + (avg != null ? ` <span class="notes-avg-inline">${fmtNote(avg)}</span>` : "");
  }
}
$("notesBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("absencesPanel").classList.remove("open");
  togglePanel($("notesPanel"));
});
closeOnOutsideClick("notesPanel", "notesWrap");

/* ============================= Filtres / export =============================
   Panneau déroulant sur ordinateur ; sur téléphone, feuille en bas d'écran. */
function displayedDays() {
  const start = startOfWeek(refDate);
  if (currentView === "month") { const n = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate(); return Array.from({ length: n }, (_, i) => new Date(refDate.getFullYear(), refDate.getMonth(), i + 1)); }
  if (currentView === "5day") return getFiveDayDays();
  if (currentView === "6day") return getSixDayDays();
  if (currentView === "3day") return [0, 1, 2].map(i => addDays(refDate, i));
  if (currentView === "day") return [new Date(refDate)];
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
const TOOL_PANELS = {
  notesPanel: { wrap: "notesWrap", build: () => {} },
  absencesPanel: { wrap: "absencesWrap", build: () => {} },
  filterPanel: { wrap: "filterWrap", build: (p) => UCA_TOOLS.buildFilterPanel(p, events) },
  exportPanel: { wrap: "exportWrap", build: (p) => UCA_TOOLS.buildExportPanel(p, { allEvents: events, weekDays: displayedDays, eventKey, reminderMinutes: settings.reminderMinutes, onPhone: window.UCA_APP ? null : openPhoneModal, shareLink: window.UCA_APP ? null : () => UCA_TRANSFER.makeShareLink(), canShare: window.UCA_APP ? null : UCA_TRANSFER.canShare, sendLink: UCA_TRANSFER.shareLink }) },
  linksPanel: { wrap: "linksWrap", build: (p) => UCA_TOOLS.buildLinksPanel(p) },
};
function openToolPanel(id, asSheet) {
  const panel = $(id), conf = TOOL_PANELS[id];
  if (!panel) return;
  Object.keys(TOOL_PANELS).forEach(o => { if (o !== id && $(o)) $(o).classList.remove("open"); });
  if (asSheet) { document.body.appendChild(panel); panel.classList.add("as-sheet"); showSheetBackdrop(panel); }
  else if (panel.parentNode !== $(conf.wrap)) { $(conf.wrap).appendChild(panel); panel.classList.remove("as-sheet"); }
  if (!panel.classList.contains("open")) conf.build(panel);
  if (asSheet) panel.classList.add("open"); else togglePanel(panel);
}
// Fond assombri derrière une feuille (téléphone) : un appui dessus ferme la feuille.
function showSheetBackdrop(panel) {
  let bd = $("ucaSheetBackdrop");
  if (!bd) {
    bd = document.createElement("div"); bd.id = "ucaSheetBackdrop";
    bd.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:139;";
    document.body.appendChild(bd);
  }
  bd.hidden = false;
  bd.onclick = () => { panel.classList.remove("open"); bd.hidden = true; };
}
function renderFilterButton() {
  if (!$("filterBtn")) return;
  const n = UCA_TOOLS.activeCount();
  $("filterBtn").innerHTML = D.icon("filter") + '<span class="btn-label">Filtres</span>' + (n ? ` <span class="filter-count">${n}</span>` : "");
  $("filterBtn").classList.toggle("active", n > 0);
}
["filterPanel", "exportPanel", "linksPanel"].forEach(id => {
  const btn = $(id.replace("Panel", "Btn"));
  if (!btn) return;
  btn.addEventListener("click", (e) => { e.stopPropagation(); openToolPanel(id, false); });
  closeOnOutsideClick(id, TOOL_PANELS[id].wrap);
});
UCA_TOOLS.onChange(() => { renderFilterButton(); render(); });

/* Menu "plus" optionnel (#moreBtn / #morePanel) fourni par certains designs. */
if ($("moreBtn")) {
  $("moreBtn").addEventListener("click", (e) => { e.stopPropagation(); togglePanel($("morePanel")); });
  document.addEventListener("click", (e) => { if (!$("moreWrap").contains(e.target)) $("morePanel").classList.remove("open"); });
}

/* ============================= Envoi vers le téléphone (extension) =============================
   Fenêtre construite avec les classes de modale du design (.modal-overlay / .modal). */
let phoneTimer = 0;
function closePhoneModal() { clearInterval(phoneTimer); const o = $("phoneOverlay"); if (o) o.remove(); }
async function openPhoneModal() {
  closePhoneModal();
  // Ferme les panneaux Notes/Absences/Filtres/Exporter encore ouverts : sinon la modale
  // téléphone se superpose au panneau qui l'a ouverte (chevauchement visuel).
  Object.keys(TOOL_PANELS).forEach((id) => { if ($(id)) $(id).classList.remove("open"); });
  if ($("ucaSheetBackdrop")) $("ucaSheetBackdrop").hidden = true;
  const T_ = UCA_TRANSFER;
  const overlay = document.createElement("div"); overlay.className = "modal-overlay open"; overlay.id = "phoneOverlay";
  overlay.innerHTML = `<div class="modal phone-modal">
    <div class="modal-head"><h3>${D.icon("phone")}Envoyer vers mon téléphone</h3><button class="close-x" id="phoneClose" aria-label="Fermer">${D.icon("close") || "✕"}</button></div>
    <div class="modal-body">
      <p class="phone-step"><b>1.</b> Sur ton téléphone, scanne ce code pour ouvrir l'app (puis « Ajouter à l'écran d'accueil »). Déjà installée ? Passe à l'étape 2.</p>
      <div class="phone-qr"><canvas id="phoneQrApp"></canvas></div>
      <p class="phone-url"><a href="${escapeHtml(T_.DOWNLOAD_URL)}" target="_blank" rel="noopener">${escapeHtml(T_.DOWNLOAD_URL)}</a></p>
      <p class="phone-step"><b>2.</b> Dans l'app : « Importer » puis « Scanner », et vise le code animé. Ou, plus simple, envoie-toi le lien ci-dessous (SMS, mail, messagerie...) et ouvre-le sur ton téléphone. Le lien contient tes données chiffrées (illisibles sans ton code de partage), jamais gardées par GitHub ni aucun serveur, et il expire au bout du délai choisi dans Paramètres.</p>
      <div class="phone-actions"><button class="primary" id="phoneStart">Afficher le code animé</button><button id="phoneLink">Copier un lien</button>${T_.canShare() ? '<button id="phoneShare">Partager le lien…</button>' : ""}<button id="phoneFile">Fichier de secours (.ucasync)</button></div>
    </div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePhoneModal(); });
  $("phoneClose").addEventListener("click", closePhoneModal);
  T_.drawQr($("phoneQrApp"), T_.DOWNLOAD_URL, 220);
  const snap = await T_.snapshot();
  $("phoneFile").addEventListener("click", () => T_.exportFile(snap));
  $("phoneLink").addEventListener("click", async () => {
    const share = await T_.makeShareLink(snap);
    const link = share.link;
    let info = $("phoneShareInfo");
    if (!info) { info = document.createElement("p"); info.id = "phoneShareInfo"; info.className = "phone-step"; overlay.querySelector(".phone-actions").after(info); }
    info.textContent = share.message;
    try {
      await navigator.clipboard.writeText(link);
      const btn = $("phoneLink"), original = btn.textContent;
      btn.textContent = "Le lien est bien copié"; btn.disabled = true;
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
      toast("Lien copié — " + share.message, "ok");
    } catch {
      // Presse-papiers inaccessible (permission refusée, contexte non sécurisé...) : champ à copier à la main.
      let box = $("phoneLinkFallback");
      if (!box) {
        box = document.createElement("input"); box.id = "phoneLinkFallback"; box.readOnly = true;
        box.className = "phone-link-fallback";
        overlay.querySelector(".phone-actions").after(box);
      }
      box.value = link;
      box.hidden = false;
      box.focus(); box.select();
    }
  });
  if ($("phoneShare")) $("phoneShare").addEventListener("click", async () => {
    const share = await T_.makeShareLink(snap);
    let info = $("phoneShareInfo");
    if (!info) { info = document.createElement("p"); info.id = "phoneShareInfo"; info.className = "phone-step"; overlay.querySelector(".phone-actions").after(info); }
    info.textContent = share.message;
    try { if (await T_.shareLink(share)) toast("Lien partagé — " + share.message, "ok"); }
    catch (e) { info.textContent = "Partage impossible : utilise « Copier un lien ». " + share.message; }
  });
  $("phoneStart").addEventListener("click", async () => {
    const frames = await T_.encodeFrames(snap);
    const box = overlay.querySelector(".phone-qr");
    box.innerHTML = `<canvas id="phoneQrData"></canvas><div class="phone-counter" id="phoneCounter"></div>`;
    overlay.querySelectorAll(".phone-step, .phone-url").forEach((e, i) => { if (i < 2) e.remove(); });
    $("phoneStart").textContent = "Le code tourne en boucle : garde le téléphone pointé dessus";
    $("phoneStart").disabled = true;
    let i = 0;
    const show = () => { T_.drawQr($("phoneQrData"), frames[i], 300); $("phoneCounter").textContent = `Trame ${i + 1} / ${frames.length}`; i = (i + 1) % frames.length; };
    show();
    phoneTimer = setInterval(show, 280);
  });
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePhoneModal(); });

/* Raccourcis clavier : ← → période précédente / suivante, T aujourd'hui, F filtres, M mois, S semaine, J jour.
   Ignorés dans un champ de saisie, avec Ctrl/Alt/Méta ou quand une fenêtre de détail est ouverte. */
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
  const t = e.target, tag = t && t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
  if ($("detailOverlay").classList.contains("open") || ($("ucaSheetBackdrop") && !$("ucaSheetBackdrop").hidden)) return;
  const k = e.key.toLowerCase();
  if (k === "arrowleft") navigate(-1);
  else if (k === "arrowright") navigate(1);
  else if (k === "t") { refDate = new Date(); refDate.setHours(0, 0, 0, 0); render(); }
  else if (k === "f" && $("filterBtn")) { e.preventDefault(); $("filterBtn").click(); }
  else if (k === "m" && availableViews().includes("month")) switchView("month");
  else if (k === "s" && availableViews().includes("week")) switchView("week");
  else if (k === "j" && availableViews().includes("day")) switchView("day");
  else return;
  e.preventDefault();
});

/* ============================= Navigation / zoom ============================= */
$("viewTabs").addEventListener("click", (e) => { const btn = e.target.closest("button[data-view]"); if (!btn) return; switchView(btn.dataset.view); });
$("prevBtn").addEventListener("click", () => navigate(-1));
$("nextBtn").addEventListener("click", () => navigate(1));
$("todayBtn").addEventListener("click", () => { refDate = new Date(); refDate.setHours(0, 0, 0, 0); render(); });

// Vue mois : un cran de molette = un mois (la grille de 42 cases ne défile pas).
let monthWheelLock = false;
$("monthView").addEventListener("wheel", (e) => {
  if (currentView !== "month" || monthWheelLock) return;
  e.preventDefault();
  monthWheelLock = true;
  navigate(e.deltaY > 0 ? 1 : -1);
  setTimeout(() => { monthWheelLock = false; }, 350);
}, { passive: false });

function setZoom(z) {
  zoomLevel = Math.max(0.6, Math.min(1.8, z));
  localStorage.setItem("uca_zoom_v1", String(zoomLevel));
  $("zoomPct").textContent = Math.round(zoomLevel * 100) + "%";
  render();
}
$("zoomOutBtn").addEventListener("click", () => setZoom(zoomLevel - 0.15));
$("zoomInBtn").addEventListener("click", () => setZoom(zoomLevel + 0.15));
$("zoomPct").textContent = Math.round(zoomLevel * 100) + "%";

/* ============================= Synchronisation ============================= */
const syncBtn = $("syncBtn");
if (window.UCA_APP) {
  // Par défaut, pas d'extension détectée dans ce navigateur : "Synchroniser" ne veut rien dire
  // (pas d'accès à Odin depuis une page web) -> "Importer" (transfert par lien/QR/fichier).
  // Si l'extension répond (core/env.js, pont avec content-bridge.js), le bouton redevient une
  // vraie synchro Odin, exactement comme dans l'extension.
  const setSyncLabel = (importer) => {
    const walker = document.createTreeWalker(syncBtn, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (importer && /Synchroniser/.test(n.textContent)) n.textContent = n.textContent.replace("Synchroniser", "Importer");
      else if (!importer && /Importer/.test(n.textContent)) n.textContent = n.textContent.replace("Importer", "Synchroniser");
    }
    syncBtn.title = importer ? "Importer les données depuis l'extension de l'ordinateur" : "Synchroniser avec Odin (extension détectée dans ce navigateur)";
  };
  setSyncLabel(!window.UCA_APP.extensionReady);
  window.addEventListener("uca-extension-ready", () => {
    setSyncLabel(false);
    // "Synchroniser" passe par l'extension : on garde quand même un bouton Importer (lien/QR/fichier).
    if (!$("appImportBtn")) {
      const imp = document.createElement("button");
      imp.id = "appImportBtn"; imp.type = "button"; imp.className = syncBtn.className.replace("primary", "").trim();
      imp.innerHTML = D.icon("export") + "Importer";
      imp.title = "Importer un lien, un QR ou un fichier .ucasync";
      imp.addEventListener("click", () => { location.href = chrome.runtime.getURL("app/import.html"); });
      syncBtn.before(imp);
    }
    // Synchro automatique si la dernière date de plus que le réglage "synchro auto" (0 = jamais).
    chrome.storage.local.get("uca_last_sync", (d) => {
      const hours = settings.autoSyncHours;
      const age = d.uca_last_sync ? Date.now() - new Date(d.uca_last_sync).getTime() : Infinity;
      if (hours > 0 && age > hours * 3600000) triggerSync();
    });
  });
}
function triggerSync() {
  syncBtn.disabled = true;
  toast(T("syncing"));
  chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: "resync" });
}
syncBtn.addEventListener("click", triggerSync);

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "UCA_SYNC_PROGRESS") {
    const label = T("stage_" + msg.stage);
    if (label) toast(label);
    UCA_CORE.loginHelp(msg.stage === "login-waiting");
  } else if (msg.type === "UCA_SYNC_RESULT") {
    UCA_CORE.loginHelp(false);
    if (!msg.ok) {
      toast(T("errorPrefix") + (msg.error || "Erreur"), "warn");
      // Annulation (onglet/fenêtre fermé par l'utilisateur) : le bouton redevient cliquable tout
      // de suite. Échec réel (Odin en panne, rien détecté...) : pause avant de réessayer.
      if (msg.retryAfterMs) UCA_CORE.syncCooldown([syncBtn], msg.retryAfterMs);
      else syncBtn.disabled = false;
      return;
    }
    syncBtn.disabled = false;
    toast(msg.silent ? T("syncSilent") : T("syncOk"), "ok");
    loadFromStorage();
  } else if (msg.type === "UCA_ABSENCES_RESULT") {
    if (msg.ok) { absences = msg.absences; renderAbsencesPanel(); }
  } else if (msg.type === "UCA_NOTES_RESULT") {
    if (msg.ok) chrome.storage.local.get(["uca_notes_seen", "uca_notes_history"], (data) => { releveNotes = msg.releve; notesSeen = data.uca_notes_seen || {}; notesHistory = data.uca_notes_history || notesHistory; renderNotesPanel(); });
  } else if (msg.type === "UCA_UPDATE_STATE") {
    UCA_CORE.renderUpdate(msg.updateAvailable, msg.current, msg.latest);
  }
});

UCA_CORE.initUpdate();
/* Lecteurs d'écran : titre de page, zone de synchro repérée, bouton « Aujourd'hui » nommé même sans libellé visible. */
(function () {
  if (!document.querySelector("h1")) {
    const h = document.createElement("h1"); h.textContent = "Emploi du temps UCA";
    h.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;";
    (document.querySelector("header") || document.body).insertBefore(h, (document.querySelector("header") || document.body).firstChild);
  }
  const info = $("syncInfo");
  if (info) { info.setAttribute("role", "region"); info.setAttribute("aria-label", "Dernière synchronisation et prochain cours"); }
  if ($("todayBtn")) { $("todayBtn").setAttribute("aria-label", "Aujourd'hui"); if (!$("todayBtn").title) $("todayBtn").title = "Aujourd'hui"; }
})();
UCA_CORE.initDesignSwitch(true);
UCA_CORE.initAutoDesign();
UCA_CORE.initSettings();
renderFilterButton();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.uca_settings) { settings = Object.assign({}, UCA_SETTINGS_DEFAULTS, changes.uca_settings.newValue); render(); renderNotesPanel(); renderAbsencesPanel(); }
  if (changes.uca_notes_seen || changes.uca_releve_notes) {
    if (changes.uca_notes_seen) notesSeen = changes.uca_notes_seen.newValue || {};
    if (changes.uca_releve_notes) releveNotes = changes.uca_releve_notes.newValue || null;
    renderNotesPanel();
  }
  if (changes.uca_notes_history) { notesHistory = changes.uca_notes_history.newValue || []; renderNotesPanel(); }
  if (changes.uca_scrape_issues) { scrapeIssues = changes.uca_scrape_issues.newValue || {}; renderAbsencesPanel(); renderNotesPanel(); }
  if (changes.uca_subject_colors) { subjectColors = changes.uca_subject_colors.newValue || {}; events.forEach((e) => { e.color = colorOf(e.title); }); render(); }
  if (changes.uca_edt_changes) { setEdtChanges(changes.uca_edt_changes.newValue); render(); }
  // Réinitialisation (ou son annulation) depuis Paramètres, dans un autre onglet : reflète tout de suite.
  if (changes.uca_events) { events = (changes.uca_events.newValue || []).map(ev => ({ ...ev, color: colorOf(ev.title) })); render(); renderNextInfo(); }
  if (changes.uca_notes) { notes = changes.uca_notes.newValue || {}; render(); }
  if (changes.uca_absences) { absences = changes.uca_absences.newValue || null; renderAbsencesPanel(); }
});
UCA_TOOLS.load(() => { renderFilterButton(); loadFromStorage(); });
})();
