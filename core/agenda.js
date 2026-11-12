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
let releveNotes = null;          // relevé avec les barèmes choisis appliqués (voir UCA_GRADES.applyScales)
let releveRaw = null, scales = {}; // relevé tel que lu sur Odin ; barèmes choisis par évaluation (uca_scales)
function setReleve(raw, sc) { releveRaw = raw || null; if (sc) scales = sc; releveNotes = UCA_GRADES.applyScales(releveRaw, scales); }
let notesHistory = [];
let subjectColors = {};
let tasks = [];
let sessionIsExpired = false;
/* Emploi du temps personnel (Odin) et emploi du temps de la classe (ADE) : `events` désigne celui qui est affiché. */
let personalEvents = [], classEvents = [], classGroups = [], classBusy = false, classError = "";
function applyScope() { events = UCA_TOOLS.isClassMode() && classEvents.length ? classEvents : personalEvents; }
function connectClass() {
  classBusy = true; classError = "";
  if (window.AndroidUCA && window.AndroidUCA.requestClass) window.AndroidUCA.requestClass();
  else chrome.runtime.sendMessage({ type: "UCA_CLASS_CONNECT" }, () => void chrome.runtime.lastError);
  if ($("filterPanel") && $("filterPanel").classList.contains("open")) TOOL_PANELS.filterPanel.build($("filterPanel"));
}
let simScope = "", simTarget = 10, chartScope = "overview";
let notesSeen = {};
let activity = [], activitySeenAt = 0; // journal d'activité (cloche) : changements d'EDT, nouvelles notes, absences
let edtChanges = new Map(); // eventKey -> changement (ajouté / déplacé / salle) ; annulés : fantômes
let cancelledGhosts = [];
let settings = Object.assign({}, UCA_SETTINGS_DEFAULTS);
let currentView = "week";
let autoViewApplied = false;
let refDate = new Date(); refDate.setHours(0, 0, 0, 0);
let pendingEventKey = null;
let zoomLevel = Math.max(0.6, Math.min(1.8, parseFloat(localStorage.getItem("uca_zoom_v1")) || 1));

const DAY_NAMES_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_NAMES_FULL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const VIEWS = ["list", "day", "3day", "5day", "6day", "week", "month"];
const VIEW_CONTAINERS = { list: "dayView", day: "dayView", "3day": "threeDayView", "5day": "fiveDayView", "6day": "sixDayView", week: "weekView", month: "monthView" };
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
  if (currentView === "day" || currentView === "list") return capitalize(refDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  if (currentView === "3day") return rangeLabel([refDate, addDays(refDate, 2)]);
  if (currentView === "5day") return rangeLabel(getFiveDayDays());
  if (currentView === "6day") return rangeLabel(getSixDayDays());
  if (currentView === "week") return rangeLabel([startOfWeek(refDate), addDays(startOfWeek(refDate), 6)]);
  return "";
}
function fmtMonthLabel() { return capitalize(refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })); }
function updateHeader() {
  const lbl = $("periodLabel");
  if (lbl) {
    lbl.textContent = isMobileUI() ? fmtMonthLabel() : fmtPeriodLabel();
    lbl.style.whiteSpace = "nowrap";
  }
  let sub = $("weekSubLabel");
  if (!sub) {
    sub = document.createElement("div");
    sub.id = "weekSubLabel"; sub.setAttribute("role", "region"); sub.setAttribute("aria-label", "Période affichée");
    sub.className = "week-sub-label";
    const hdr = document.querySelector("header");
    if (hdr && hdr.nextSibling) hdr.parentNode.insertBefore(sub, hdr.nextSibling);
    else if (hdr) hdr.appendChild(sub);
  }
  const mon = startOfWeek(refDate);
  const sun = addDays(mon, 6);
  const fmtD = (d) => `${DAY_NAMES_FULL[d.getDay()]} ${d.getDate()} ${monthShort(d)}`;
  sub.textContent = `Semaine du ${fmtD(mon)} au ${fmtD(sun)}`;
  document.querySelectorAll("#viewTabs button").forEach(b => b.classList.toggle("active", b.dataset.view === currentView));
}
function navigate(dir) {
  if (currentView === "month") refDate = new Date(refDate.getFullYear(), refDate.getMonth() + dir, 1);
  else if (currentView === "3day") refDate = addDays(refDate, 3 * dir);
  else if (currentView === "day" || currentView === "list") refDate = addDays(refDate, dir);
  else refDate = addDays(refDate, 7 * dir);
  render();
}
function switchView(v) { if (availableViews().includes(v)) currentView = v; render(); }

/* ============================= Aller à un cours ============================= */
function closeAllSheets() {
  Object.keys(TOOL_PANELS).forEach((o) => { if ($(o)) $(o).classList.remove("open"); });
  const bd = $("ucaSheetBackdrop"); if (bd) bd.hidden = true;
}
let calArrow = null, calArrowTimer = 0, calArrowFollow = 0;
function clearCalArrow() {
  clearTimeout(calArrowTimer); clearInterval(calArrowFollow);
  if (calArrow) { calArrow.remove(); calArrow = null; }
  document.querySelectorAll(".cal-target").forEach((n) => n.classList.remove("cal-target"));
}
function goToDate(d) {
  closeAllSheets(); clearCalArrow();
  refDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (currentView === "month") switchView(isMobileUI() ? "list" : "week"); else render();
}
/* Ouvre l'agenda sur le jour du cours et le désigne par une flèche animée. */
function goToEvent(ev) {
  goToDate(new Date(ev.year, ev.month, ev.day));
  const key = eventKey(ev);
  setTimeout(() => {
    const card = [...document.querySelectorAll(".view.active [data-key]")].find((n) => n.dataset.key === key);
    if (!card) return;
    card.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    card.classList.add("cal-target");
    const arrow = document.createElement("div"); arrow.className = "cal-arrow"; arrow.textContent = "⬇"; arrow.setAttribute("aria-hidden", "true");
    document.body.appendChild(arrow); calArrow = arrow;
    const place = () => { const r = card.getBoundingClientRect(); arrow.style.left = Math.max(4, Math.min(window.innerWidth - 32, r.left + r.width / 2 - 13)) + "px"; arrow.style.top = Math.max(4, r.top - 34) + "px"; };
    place();
    calArrowFollow = setInterval(place, 80);
    calArrowTimer = setTimeout(clearCalArrow, 6000);
  }, 150);
}
/* Un devoir mène au cours de sa matière le jour du rendu (ou au premier cours de la matière après), sinon au jour du rendu. */
function goToTask(t) {
  const due = UCA_TASKS.parseDue(t.due);
  if (due === null) return;
  const d = new Date(due), key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
  const same = t.subject ? events.filter((e) => !e.cancelled && UCA_TOOLS.subjectOf(e.title) === t.subject).sort((a, b) => (a.date + pad(a.startH)).localeCompare(b.date + pad(b.startH))) : [];
  const ev = same.find((e) => e.date === key) || same.find((e) => e.date >= key);
  if (ev) goToEvent(ev); else goToDate(d);
}

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
  // Le jour courant a un fond plein (accent) : du rouge dessus serait illisible ; l'infobulle et le libellé disent déjà « férié ».
  if (n && !node.classList.contains("today")) n.style.color = "var(--danger, #c5221f)";
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
  // Un groupe de cours qui se chevauchent en chaîne : chaque cours prend la première colonne libre à son début
  // (au lieu d'une colonne chacun), donc le nombre de colonnes = le plus grand nombre de cours en même temps.
  function flush() {
    if (cluster.length === 0) return;
    const laneEnd = []; const placed = [];
    cluster.forEach(ev => {
      const start = ev.startH * 60 + ev.startM, end = ev.endH * 60 + ev.endM;
      let lane = laneEnd.findIndex(e => e <= start); if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); }
      laneEnd[lane] = end > start ? end : start + 30; placed.push({ ev, col: lane });
    });
    const cols = laneEnd.length; placed.forEach(x => result.push({ ev: x.ev, col: x.col, cols })); cluster = [];
  }
  sorted.forEach(ev => { const start = ev.startH * 60 + ev.startM, end = ev.endH * 60 + ev.endM; if (cluster.length === 0 || start < clusterEnd) { cluster.push(ev); clusterEnd = Math.max(clusterEnd, end); } else { flush(); cluster.push(ev); clusterEnd = end; } });
  flush(); return result;
}

/* Emploi du temps de la classe : un même cours donné en même temps à plusieurs groupes (même titre, même horaire) devient une seule carte,
   avec les profs et salles réunis, au lieu d'une colonne par groupe. */
function mergeSimultaneous(evs) {
  const byKey = new Map(); const out = [];
  evs.forEach(ev => {
    const k = [ev.title, ev.startH, ev.startM, ev.endH, ev.endM, ev.cancelled ? 1 : 0].join("|");
    const prev = byKey.get(k);
    if (!prev) { const copy = { ...ev, _n: 1 }; byKey.set(k, copy); out.push(copy); return; }
    prev._n++;
    const join = (a, b) => { const l = new Set([...(a ? String(a).split(/\s*,\s*/) : []), ...(b ? String(b).split(/\s*,\s*/) : [])].filter(Boolean)); return [...l].join(", "); };
    prev.teacher = join(prev.teacher, ev.teacher); prev.room = join(prev.room, ev.room);
  });
  return out;
}

/* Colonnes étroites (beaucoup de groupes en parallèle) : texte plus petit, mots coupés proprement, prof masqué si la place manque. */
function ensureClassGridStyle() {
  if (document.getElementById("classGridStyle")) return;
  const st = document.createElement("style"); st.id = "classGridStyle";
  st.textContent = ".event-card.cv{padding:3px 4px !important;overflow:hidden;overflow-wrap:anywhere;hyphens:auto;line-height:1.15}"
    + ".event-card.cv .ev-time{font-size:9.5px !important;white-space:normal}"
    + ".event-card.cv .ev-title{font-size:11px !important;white-space:normal;-webkit-line-clamp:4;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}"
    + ".event-card.cv .ev-sub{font-size:9.5px !important;white-space:normal;overflow:hidden;text-overflow:ellipsis}"
    + ".event-card.cv.narrow .ev-prof{display:none}"
    + ".grid-scroll.cv-scroll{overflow-x:auto}"
    + ".grid-scroll.cv-scroll .grid-headrow,.grid-scroll.cv-scroll .grid-body{width:max-content;min-width:100%}"
    + ".grid-scroll.cv-scroll .grid-timegutter,.grid-scroll.cv-scroll .grid-timegutter-head{position:sticky;left:0;z-index:30;background:var(--cv-bg,#111)}";
  document.head.appendChild(st);
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
  while (overflows() && s > 0.6) { s = Math.round((s - 0.04) * 100) / 100; card.style.setProperty("--s", s); }
}

/* Hauteur de référence pour l'échelle de police (designs avec grid.fontScale). */
const MIN_CARD_HEIGHT = 72;

function renderTimeGrid(containerId, days) {
  const el = $(containerId); el.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "grid-view";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const classView = UCA_TOOLS.isClassMode() && classEvents.length > 0 && days.length > 1;
  const dayEvs = days.map(d => classView ? mergeSimultaneous(eventsOnDate(d)) : eventsOnDate(d));
  const dayLay = dayEvs.map(list => layoutOverlaps(list));
  const dayLanes = dayLay.map(l => Math.max(1, ...l.map(x => x.cols)));
  const LANE_MIN = isMobileUI() ? 66 : 96;
  const dayFlex = (i) => classView ? `flex:${dayLanes[i]} 0 ${dayLanes[i] * LANE_MIN}px;min-width:${dayLanes[i] * LANE_MIN}px;` : "";
  if (classView) ensureClassGridStyle();
  const headRow = document.createElement("div"); headRow.className = "grid-headrow";
  const gutterHead = document.createElement("div"); gutterHead.className = "grid-timegutter-head"; headRow.appendChild(gutterHead);
  days.forEach((d, di) => { const dh = document.createElement("div"); dh.className = "grid-daycol-head" + (sameDay(d, today) ? " today" : ""); if (classView) dh.style.cssText = dayFlex(di); dh.innerHTML = `<div class="dname">${DAY_NAMES_SHORT[d.getDay()]}</div><div class="dnum">${d.getDate()}</div>`; markHoliday(dh, d, ".dnum"); headRow.appendChild(dh); });
  const scroll = document.createElement("div"); scroll.className = "grid-scroll";
  if (classView) { scroll.classList.add("cv-scroll"); let bgEl = el, bg = ""; while (bgEl && (!bg || bg === "transparent" || /rgba\(0, 0, 0, 0\)/.test(bg))) { bg = getComputedStyle(bgEl).backgroundColor; bgEl = bgEl.parentElement; } scroll.style.setProperty("--cv-bg", bg && !/rgba\(0, 0, 0, 0\)/.test(bg) ? bg : "#111"); }
  scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Grille horaire des cours (" + days.length + (days.length > 1 ? " jours)" : " jour)"));
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
  const allEvs = [].concat(...dayEvs);
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
  days.forEach((d, di) => {
    const col = document.createElement("div"); col.className = "grid-daycol"; col.style.height = bodyHeight + "px"; if (classView) col.style.cssText += dayFlex(di);
    for (let h = Math.ceil(rangeStart); h <= Math.floor(rangeEnd); h++) { const line = document.createElement("div"); line.className = "hour-line"; line.style.top = topFor(h, 0) + "px"; col.appendChild(line); }
    dayLay[di].forEach(({ ev, col: colIdx, cols }) => {
      const top = topFor(ev.startH, ev.startM);
      let durMin = (ev.endH * 60 + ev.endM) - (ev.startH * 60 + ev.startM); if (durMin <= 0) durMin = 30;
      const height = (durMin / 60) * pxPerHour;
      const mobile = isMobileUI();
      const scale = D.grid.fontScale && !mobile ? Math.max(0.9, Math.min(1.8, height / MIN_CARD_HEIGHT)) : 1;
      const card = document.createElement("div"); card.dataset.key = eventKey(ev); card.className = "event-card" + (classView ? " cv" + (dayLanes[di] > 1 && cols > 1 && LANE_MIN <= 70 ? " narrow" : "") : "") + (height < 26 ? " tiny" : "") + (ev.cancelled ? " ev-cancelled" : changeOf(ev) ? " ev-changed" : "");
      if (sameDay(d, today)) { const nm = new Date().getHours() * 60 + new Date().getMinutes(), sm = ev.startH * 60 + ev.startM, em = ev.endH * 60 + ev.endM; if (nm >= em) card.classList.add("past"); else if (nm >= sm) card.classList.add("current"); } else if (d < today) card.classList.add("past");
      card.style.top = top + "px"; card.style.height = height + "px"; card.style.setProperty("--s", scale);
      if (cols > 1 && D.grid.overlap === "cascade") { const step = Math.min(28, 60 / cols); card.classList.add("cascade"); card.style.left = `calc(${colIdx * step}% + 2px)`; card.style.width = `calc(${100 - colIdx * step}% - 4px)`; card.style.zIndex = String(2 + colIdx); }
      else { card.style.left = `calc(${(colIdx / cols) * 100}% + 2px)`; card.style.width = `calc(${100 / cols}% - 4px)`; }
      card.style.background = ev.color; card.style.setProperty("--evc", ev.color);
      const badge = notes[eventKey(ev)] ? D.noteBadge("grid") : "";
      const timeStr = `${pad(ev.startH)}:${pad(ev.startM)} – ${pad(ev.endH)}:${pad(ev.endM)}`;
      const teacherPart = ev.teacher ? `<div class="ev-sub ev-prof">👤 ${escapeHtml(ev.teacher)}</div>` : "";
      const roomPart = ev.room ? `<div class="ev-sub ev-room">📍 ${escapeHtml(ev.room)}</div>` : "";
      if (mobile) {
        card.classList.add("m");
        card.innerHTML = `${badge}<div class="ev-time">${timeStr}</div><div class="ev-title" title="${escapeHtml(ev.title)}">${changeBadgeHtml(ev)}${escapeHtml(ev.title)}</div>${teacherPart}${roomPart}`;
      } else {
        card.innerHTML = `${badge}<div class="ev-time">${timeStr}</div><div class="ev-title" title="${escapeHtml(ev.title)}">${changeBadgeHtml(ev)}${escapeHtml(ev.title)}</div>${metaHtml(ev, "div")}`;
      }
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
    const card = document.createElement("div"); card.dataset.key = eventKey(ev); card.className = "m-card" + (state ? " " + state : "") + (ev.cancelled ? " ev-cancelled" : changeOf(ev) ? " ev-changed" : "");
    card.style.setProperty("--evc", ev.color);
    card.style.flexShrink = "0";
    card.style.minHeight = "fit-content";
    const teacherHtml = `<div class="m-meta">${D.icon("user")}<span>${escapeHtml(ev.teacher || "Enseignant non précisé")}</span></div>`;
    const roomHtml = `<div class="m-meta">${D.icon("pin")}<span>${escapeHtml(ev.room || "Salle à définir")}</span></div>`;
    card.innerHTML = `<div class="m-time"><b>${pad(ev.startH)}:${pad(ev.startM)}</b><span>${pad(ev.endH)}:${pad(ev.endM)}</span></div>
      <div class="m-body">${state === "current" ? `<span class="m-badge">${escapeHtml(T("current"))}</span>` : ""}<div class="m-title">${changeBadgeHtml(ev)}${escapeHtml(ev.title)}</div>
      ${teacherHtml}
      ${roomHtml}</div>
      ${notes[eventKey(ev)] ? D.noteBadge("day") : ""}`;
    card.addEventListener("click", () => openDetail(ev));
    list.appendChild(card);
  });
  view.appendChild(list);
  el.appendChild(view);
  const sel = strip.querySelector(".selected"); if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
}
/* Glisser le doigt vers la gauche / la droite change de période (téléphone) : jour, 3 jours, 5 jours, 6 jours, semaine, mois.
   Un geste commencé dans une zone qui défile elle-même à l'horizontale n'est pas pris pour un changement de période. */
let touchStart = null;
function scrollsHorizontally(node, stop) {
  for (let n = node; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
}
["dayView", "threeDayView", "fiveDayView", "sixDayView", "weekView", "monthView"].forEach((id) => {
  const view = $(id);
  if (!view) return;
  view.addEventListener("touchstart", (e) => {
    touchStart = e.touches.length === 1 && !scrollsHorizontally(e.target, view)
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  view.addEventListener("touchend", (e) => {
    if (!touchStart || !isMobileUI()) return;
    const dx = e.changedTouches[0].clientX - touchStart.x, dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1);
  }, { passive: true });
  view.addEventListener("touchcancel", () => { touchStart = null; }, { passive: true });
});

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
  else if (currentView === "list") { if (isMobileUI()) renderMobileDay(); else renderDayList(); }
  else if (currentView === "day") renderTimeGrid("dayView", [new Date(refDate)]);
  const target = VIEW_CONTAINERS[currentView];
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === target));
}

/* ============================= Menu mobile (hamburger) ============================= */
function closeMobileMenu() { $("mobileMenu").classList.remove("open"); }
/* Importer le lien de partage d'un ami (ou le sien) : emploi du temps passé et à venir, notes, notes personnelles. */
function openImportLinkModal() {
  let ov = document.getElementById("importLinkOverlay");
  if (ov) ov.remove();
  ov = document.createElement("div"); ov.id = "importLinkOverlay"; ov.className = "modal-overlay open";
  ov.innerHTML = `<div class="modal grade-modal-box" role="dialog" aria-modal="true" aria-labelledby="ilTitle">
    <div class="modal-head"><h3 id="ilTitle">Importer un lien de partage</h3><button class="close-x" id="ilClose" aria-label="Fermer">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
      <label>Lien reçu<input id="ilLink" type="text" inputmode="url" autocomplete="off" placeholder="https://kiricoucou.github.io/uca-extension/#e=…" style="width:100%;box-sizing:border-box;padding:8px;margin-top:3px;font:inherit;"></label>
      <label>Code de partage<input id="ilCode" type="text" autocomplete="off" autocapitalize="characters" maxlength="12" placeholder="ABC123" style="width:100%;box-sizing:border-box;padding:8px;margin-top:3px;font:inherit;letter-spacing:.12em;text-transform:uppercase;"></label>
      <div style="opacity:.8;font-size:12px;">Remplace les données de cet appareil (emploi du temps passé et à venir, notes, notes personnelles) par celles du lien.</div>
      <div id="ilMsg" role="status" style="min-height:1.3em;font-weight:700;"></div>
      <button id="ilGo" type="button" style="font:inherit;font-weight:800;padding:10px;border-radius:10px;cursor:pointer;">Importer</button>
    </div></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove(), msg = (t, bad) => { const m = ov.querySelector("#ilMsg"); m.textContent = t; m.style.color = bad ? "var(--danger,#d93025)" : ""; };
  ov.querySelector("#ilClose").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("#ilGo").onclick = async () => {
    const raw = ov.querySelector("#ilLink").value.trim(), code = ov.querySelector("#ilCode").value;
    const i = raw.indexOf("#"); if (i < 0) { msg("Colle le lien complet (il contient « #e= »).", true); return; }
    try {
      msg("Déchiffrement…");
      const snap = await UCA_TRANSFER.fromLinkHash(raw.slice(i), code);
      const res = await UCA_TRANSFER.applyImport(snap);
      msg(`Importé : ${res.events} cours. Rechargement…`);
      setTimeout(() => location.reload(), 700);
    } catch (e) { msg(e && e.message ? e.message : "Import impossible.", true); }
  };
  ov.querySelector("#ilLink").focus();
}
function menuButton(cls, html, onClick) {
  const b = document.createElement("button"); b.className = cls; b.innerHTML = html;
  b.onclick = () => { closeMobileMenu(); onClick(); };
  return b;
}
function buildMobileMenu() {
  const m = $("mobileMenu"); m.innerHTML = "";

  const head = document.createElement("div");
  head.className = "mobile-menu-header";
  let curDesign = "Design Actuel";
  try {
    const p = location.pathname;
    if (p.includes("bulletin")) curDesign = "Design Bulletin (Académique)";
    else if (p.includes("professionnel")) curDesign = "Design Professionnel (Tech & Slate)";
    else if (p.includes("anime")) curDesign = "Design Animé (Studio)";
    else if (p.includes("carnet")) curDesign = "Design Carnet (Papier)";
  } catch(e) {}
  head.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:12px 14px 10px;border-bottom:1px solid var(--border);background:var(--accent-tint, rgba(0,191,165,0.08));">
      <span style="font-size:20px;">🎓</span>
      <div>
        <div style="font-size:13.5px;font-weight:800;color:var(--text);">My UCA — Emploi du temps</div>
        <div style="font-size:11px;color:var(--accent, #00bfa5);font-weight:700;">${curDesign}</div>
      </div>
    </div>
  `;
  m.appendChild(head);

  const viewIcons = {
    list: "📋",
    day: "☀️",
    "3day": "📆",
    "5day": "🗓️",
    "6day": "🗓️",
    week: "📅",
    month: "🗓️"
  };

  // Certains designs mettent déjà un emoji dans le libellé : on n'en ajoute un que s'il n'y en a pas (jamais deux).
  const withIcon = (icon, label) => (/^\p{Extended_Pictographic}/u.test(label) ? label : `${icon} ${label}`);
  availableViews().forEach(v => {
    const icon = viewIcons[v] || "📅";
    m.appendChild(menuButton("mi" + (v === currentView ? " active" : ""), escapeHtml(withIcon(icon, T("view_" + v))), () => switchView(v)));
  });
  m.appendChild(menuButton("mi", escapeHtml(withIcon("📍", T("today"))), () => { refDate = new Date(); refDate.setHours(0, 0, 0, 0); render(); }));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  const avg = generalAverage();
  m.appendChild(menuButton("mi", "🎓 Notes & Moyennes" + (avg != null ? ` — moyenne ${fmtNote(avg)}` : ""), () => openToolPanel("notesPanel", true)));
  m.appendChild(menuButton("mi", "📊 " + escapeHtml(absences ? `Absences : ${plural(absences.declarees, "déclarée")}, ${plural(absences.nonJustifiees, "non justifiée")}` : "Absences"), () => openToolPanel("absencesPanel", true)));
  ((absences && absences.declarations) || []).slice(0, 3).forEach(d => { const n = declarationNode(d); n.classList.add("m-decl"); m.appendChild(n); });
  { const nb = UCA_ACTIVITY.unread(activity, activitySeenAt).length; m.appendChild(menuButton("mi", "🔔 Activité" + (nb ? ` (${nb})` : ""), () => openToolPanel("bellPanel", true))); }
  m.appendChild(menuButton("mi", "📝 Devoirs et examens" + (UCA_TASKS.openCount(tasks) ? ` (${UCA_TASKS.openCount(tasks)})` : ""), () => openToolPanel("tasksPanel", true)));
  m.appendChild(menuButton("mi", "🔗 Liens utiles (accueil, aide…)", () => openToolPanel("linksPanel", true)));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  m.appendChild(menuButton("mi", "🌐 Moodle UCA", () => window.open(MOODLE_URL, "_blank", "noopener")));
  m.appendChild(menuButton("mi", "✉️ Messagerie Zimbra", () => window.open(MAIL_URL, "_blank", "noopener")));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  if ($("filterPanel")) m.appendChild(menuButton("mi", "🔍 Filtres" + (UCA_TOOLS.activeCount() ? ` (${UCA_TOOLS.activeCount()})` : ""), () => openToolPanel("filterPanel", true)));
  if ($("exportPanel")) m.appendChild(menuButton("mi", "📤 Exporter (.ics)", () => openToolPanel("exportPanel", true)));
  if (!window.UCA_APP || window.AndroidUCA) m.appendChild(menuButton("mi", "📥 Importer un lien de partage", () => openImportLinkModal()));
  if (!window.AndroidUCA) m.appendChild(menuButton("mi", "⚙️ Paramètres", () => UCA_CORE.openSettings()));
  if (!window.UCA_APP) m.appendChild(menuButton("mi", "🚦 Statut des sites (Odin, CAS…)", () => UCA_CORE.openSettings("#statusSection")));
  if (window.UCA_APP && !window.AndroidUCA && !(matchMedia("(display-mode: standalone)").matches || navigator.standalone === true)) {
    m.appendChild(menuButton("mi", D.icon("phone") + "Installer l'app sur l'écran d'accueil", () => { location.href = chrome.runtime.getURL("app/install.html?force=1"); }));
  }
  m.appendChild(menuButton("mi", "🎨 Changer de design", () => { location.href = chrome.runtime.getURL("choose.html?change=1&tab=1"); }));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  if (window.UCA_APP && window.UCA_APP.extensionReady && !window.UCA_APP.demo && !window.AndroidUCA) m.appendChild(menuButton("mi", "📥 Importer mes données", () => { location.href = chrome.runtime.getURL("app/import.html"); }));
  if (window.AndroidUCA && sessionIsExpired) m.appendChild(menuButton("mi", "🔑 Se connecter (session expirée)", () => window.AndroidUCA.requestSync("login")));
  m.appendChild(menuButton("mi msync primary", window.UCA_APP && !window.UCA_APP.extensionReady ? "📥 Importer mes données" : "🔄 Synchroniser Odin", triggerSync));
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
  requestAnimationFrame(() => {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;
    const h = mainEl.clientHeight;
    if (Math.abs(h - lastMainHeight) > 1) { lastMainHeight = h; render(); }
  });
}).observe(document.querySelector("main"));

/* ============================= Session expirée ============================= */
function renderSessionState(expired) {
  sessionIsExpired = !!expired;
  $("sessionWarn").classList.toggle("hidden", !expired);
  // Dans l'app Android, le bandeau rouge natif (en bas à gauche) joue le même rôle que ce bouton.
  $("sessionBubble").classList.remove("show");
  renderSessionFab(!!expired && !window.AndroidUCA && !window.UCA_APP);
}
/* Bouton fixe, en bas à gauche, rouge et clignotant : un clic ouvre la connexion officielle (CAS). */
function renderSessionFab(show) {
  let b = document.getElementById("ucaSessionFab");
  if (!show) { if (b) b.remove(); return; }
  if (b) return;
  if (!document.getElementById("ucaSessionFabCss")) {
    const st = document.createElement("style"); st.id = "ucaSessionFabCss";
    st.textContent = `#ucaSessionFab{position:fixed;left:14px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:9px;max-width:calc(100vw - 28px);padding:10px 16px 10px 12px;border:2px solid #fff;border-radius:999px;background:#d93025;color:#fff;font:700 13.5px/1.25 system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(217,48,37,.55);animation:ucaFabBlink 1.2s ease-in-out infinite;}
#ucaSessionFab:hover{background:#b3261e}#ucaSessionFab:focus-visible{outline:3px solid #ffd23f;outline-offset:2px}#ucaSessionFab[disabled]{animation:none;opacity:.8;cursor:wait}
#ucaSessionFab svg{flex:0 0 auto;width:26px;height:26px;transform-origin:50% 20%;animation:ucaFabKey 1.2s ease-in-out infinite}
@keyframes ucaFabBlink{0%,100%{opacity:1;box-shadow:0 6px 20px rgba(217,48,37,.55),0 0 0 0 rgba(217,48,37,.7)}50%{opacity:.72;box-shadow:0 6px 20px rgba(217,48,37,.55),0 0 0 10px rgba(217,48,37,0)}}
@keyframes ucaFabKey{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}75%{transform:rotate(14deg)}}
@media (prefers-reduced-motion:reduce){#ucaSessionFab,#ucaSessionFab svg{animation:none}}`;
    document.head.appendChild(st);
  }
  b = document.createElement("button"); b.type = "button"; b.id = "ucaSessionFab";
  b.setAttribute("aria-label", "Session expirée. Veuillez vous reconnecter.");
  b.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="14" width="20" height="14" rx="3" fill="#fff"/><path d="M10 14v-4a6 6 0 0 1 12 0v4" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="20" r="2.4" fill="#d93025"/><rect x="15" y="21" width="2" height="4" rx="1" fill="#d93025"/></svg><span>Session expirée.<br>Veuillez vous reconnecter</span>';
  b.addEventListener("click", () => {
    b.disabled = true; b.querySelector("span").textContent = "Ouverture de la connexion…";
    chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: "login" });
    setTimeout(() => { b.disabled = false; b.querySelector("span").innerHTML = "Session expirée.<br>Veuillez vous reconnecter"; }, 15000);
  });
  document.body.appendChild(b);
}

/* ============================= Sync & chargement ============================= */
let syncInfoArgs = [null, null];
const STALE_HOURS = 24;
/* Des données de plus de 24 h ne reflètent plus l'emploi du temps : rappel en rouge dans la ligne d'info.
   App : lien direct vers l'import (elle ne se synchronise pas seule). Extension : bouton « Resynchroniser »
   (même chemin que le bouton Synchroniser). Recalculé toutes les 10 min. */
function renderStaleReminder(iso, importedAt) {
  const appImport = window.UCA_APP && !window.AndroidUCA; // l'app Android se synchronise seule, comme l'extension
  const info = $("syncInfo"), old = info.querySelector("#staleInfo"); if (old) old.remove();
  const t = new Date(appImport ? (iso || importedAt) : iso).getTime();
  if ((appImport && !importedAt) || Number.isNaN(t)) return;
  const hours = (Date.now() - t) / 3600000;
  if (hours < STALE_HOURS) return;
  const span = document.createElement("span"); span.id = "staleInfo"; span.setAttribute("role", "status");
  span.style.cssText = "margin-left:12px;font-weight:600;color:var(--danger, #b3261e);";
  const days = Math.floor(hours / 24);
  span.append(document.createTextNode(days >= 2 ? `Données vieilles de ${days} jours. ` : appImport ? "Données de plus de 24 h. " : `Données vieilles de ${Math.floor(hours)} h. `));
  let a;
  if (appImport) { a = document.createElement("a"); a.href = chrome.runtime.getURL("app/import.html"); a.textContent = "Refaire un transfert"; }
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
  if (window.UCA_APP && !window.UCA_APP.demo && !window.AndroidUCA) {
    $("syncInfo").textContent = importedAt ? `Données de l'ordinateur du ${fmt(iso || importedAt)} — refais un transfert après une synchro` : "Aucune donnée : importe-les depuis l'extension";
    renderStaleReminder(iso, importedAt);
    return;
  }
  $("syncInfo").textContent = iso ? "Dernière synchro : " + new Date(iso).toLocaleString("fr-FR") : "Jamais synchronisé";
  if (scrapeIssues.edt && scrapeIssues.edt.issue === "maintenance") {
    const m = document.createElement("span"); m.id = "maintenanceInfo"; m.setAttribute("role", "status");
    m.style.cssText = "margin-left:12px;font-weight:600;color:var(--danger, #b3261e);";
    m.textContent = "Odin est en maintenance : ancien emploi du temps conservé.";
    $("syncInfo").appendChild(m);
  }
  renderStaleReminder(iso, null);
}
/* Prochain cours (ou cours en cours) dans la ligne d'info, mis à jour chaque 30 s. */
function renderNextInfo() {
  const info = $("syncInfo"); if (!info) return;
  const old = info.querySelector("#nextInfo"); if (old) old.remove();
  updatePinnedNext();
  const text = UCA_TOOLS.nextCourseText(UCA_TOOLS.nextCourse(events));
  if (!text) return;
  const span = document.createElement("span"); span.id = "nextInfo"; span.textContent = text;
  span.style.cssText = "margin-left:14px;font-weight:600;";
  info.appendChild(span);
}
setInterval(renderNextInfo, 30000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") renderNextInfo(); });
/* App : notification « prochain cours » épinglée (réglage pinNext). L'app n'a pas de serveur de push (rien ne part
   de l'appareil) : le texte se met à jour à chaque ouverture, retour au premier plan et minute tant que l'app vit.
   Ce n'est donc pas un widget : il reste ce qu'il affichait à la dernière mise à jour. */
async function updatePinnedNext() {
  if (!window.UCA_APP || !("Notification" in window) || !navigator.serviceWorker) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const old = await reg.getNotifications({ tag: "uca-next" });
    if (!settings.pinNext || Notification.permission !== "granted") { old.forEach((n) => n.close()); return; }
    const text = UCA_TOOLS.nextCourseText(UCA_TOOLS.nextCourse(events));
    if (!text) { old.forEach((n) => n.close()); return; }
    if (old.length && old[0].body === text) return;
    await reg.showNotification("Prochain cours", { body: text, tag: "uca-next", renotify: false, silent: true, requireInteraction: true,
      icon: chrome.runtime.getURL("app/icons/icon-192.png") });
  } catch (e) { /* notification indisponible : sans conséquence */ }
}
function loadFromStorage() {
  chrome.storage.local.get(["uca_events", "uca_class_events", "uca_my_groups", "uca_last_sync", "uca_notes", "uca_absences", "uca_releve_notes", "uca_session_expired", "uca_notes_seen", "uca_settings", "uca_edt_changes", "uca_app_imported_at", "uca_scrape_issues", "uca_notes_history", "uca_subject_colors", "uca_tasks", "uca_activity", "uca_activity_seen", "uca_scales"], (data) => {
    // Hors Android natif (qui a sa propre synchro CAS en arrière-plan) : sans données, écran d'import.
    if (window.UCA_APP && !window.AndroidUCA && !(data.uca_events || []).length && !sessionStorage.getItem("uca_import_skip")) {
      location.href = chrome.runtime.getURL("app/import.html");
      return;
    }
    settings = Object.assign({}, UCA_SETTINGS_DEFAULTS, data.uca_settings);
    subjectColors = data.uca_subject_colors || {};
    tasks = UCA_TASKS.sanitize(data.uca_tasks);
    activity = UCA_ACTIVITY.sanitize(data.uca_activity); activitySeenAt = Number(data.uca_activity_seen) || 0; renderBellButton();
    personalEvents = (data.uca_events || []).map(ev => ({ ...ev, color: colorOf(ev.title) }));
    classEvents = (data.uca_class_events || []).map(ev => ({ ...ev, color: colorOf(ev.title) }));
    classGroups = data.uca_my_groups || [];
    applyScope();
    notes = data.uca_notes || {};
    absences = data.uca_absences || null;
    scrapeIssues = data.uca_scrape_issues || {};
    notesHistory = data.uca_notes_history || [];
    subjectColors = data.uca_subject_colors || {};
    setReleve(data.uca_releve_notes, data.uca_scales || {});
    notesSeen = data.uca_notes_seen || {};
    setEdtChanges(data.uca_edt_changes);
    if (!autoViewApplied) {
      autoViewApplied = true;
      const params = new URLSearchParams(location.search);
      if (params.get("view") && availableViews().includes(params.get("view"))) { settings = Object.assign({}, settings, { startView: params.get("view") }); }
      if (params.get("open")) setTimeout(() => openToolPanel(params.get("open") + "Panel", isMobileUI()), 300);
      if (location.hash === "#phone" && !window.UCA_APP) setTimeout(openPhoneModal, 300);
      if (settings.startView !== "auto" && availableViews().includes(settings.startView)) currentView = settings.startView;
      else if (isMobileUI()) currentView = "list";
      else if (eventsOnDate(refDate).length === 0 && availableViews().includes("5day")) currentView = "5day";
    }
    renderSyncInfo(data.uca_last_sync, data.uca_app_imported_at);
    renderNextInfo();
    renderSessionState(!!data.uca_session_expired);
    renderAbsencesPanel();
    renderNotesPanel();
    renderTasksButton();
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
  maintenance: "Odin est en maintenance : ces données datent de la dernière synchro réussie.",
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
  renderAbsenceDot();
}
/* Pastille d'alerte sur le bouton Absences (réglage absenceAlert) : orange à un pas du seuil, rouge une fois atteint. */
function renderAbsenceDot() {
  const btn = $("absencesBtn"), th = Number(settings.absenceAlert) || 0, n = (absences && absences.nonJustifiees) || 0;
  const level = !th || !n ? "" : n >= th ? "reached" : n >= th - 1 ? "near" : "";
  if (!level) { btn.title = "Voir mes absences"; return; }
  const dot = document.createElement("span"); dot.className = "abs-dot " + level; dot.setAttribute("role", "img");
  const label = level === "reached" ? `Seuil d'absences atteint (${n} sur ${th})` : `Seuil d'absences bientôt atteint (${n} sur ${th})`;
  dot.setAttribute("aria-label", label);
  dot.style.cssText = `display:inline-block;width:9px;height:9px;border-radius:50%;margin-left:6px;vertical-align:middle;background:${level === "reached" ? "var(--danger, #b3261e)" : "#f29900"};`;
  btn.appendChild(dot); btn.title = label;
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
// Échelle : nouvelle (< N j, orange), récente (< 2N j, jaune), cette semaine (< 7 j, bleu), il y a quinze jours (< 15 j, violet),
// plus ancienne (rouge). Une note sans date connue (relevé d'avant le suivi) compte comme ancienne.
function noteAgeClass(seenKey, note) {
  if (note == null) return "";
  const seen = seenKey && notesSeen[seenKey];
  if (!seen || !seen.at || Number(seen.note) !== Number(note)) return " note-old";
  const day = 86400000, n = noteDays(), days = (Date.now() - seen.at) / day;
  return days < n ? " note-new" : days < 2 * n ? " note-recent" : days < 7 ? " note-week" : days < 15 ? " note-fortnight" : " note-old";
}
(function injectNoteScale() {
  const st = document.createElement("style");
  st.textContent = ".notes-table td.note.note-week{color:#4d9fff!important;font-weight:800}.notes-table td.note.note-fortnight{color:#a78bfa!important;font-weight:800}.notes-table td.note.note-old{color:#ef6b6b!important}.event-card .ev-note{bottom:7px!important;right:8px!important;line-height:1.15!important;font-size:calc(15px * var(--s,1))!important;overflow:visible!important;z-index:2}.event-card:has(.ev-note){padding-bottom:max(var(--pb,0px),4px)}.day-note{line-height:1.2;padding:2px 3px;overflow:visible}";
  document.head.appendChild(st);
})();
function noteAgeTitle(cls) {
  const n = noteDays();
  return { " note-new": `Nouvelle note (moins de ${n} jour${n > 1 ? "s" : ""})`, " note-recent": `Note récente (moins de ${2 * n} jours)`, " note-week": "Note de cette semaine (moins de 7 jours)",
    " note-fortnight": "Note d'il y a une à deux semaines (moins de 15 jours)", " note-old": "Note ancienne (plus de 15 jours)" }[cls] || "";
}
function openGradeDetailModal(label, row) {
  let overlay = $("gradeDetailOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "gradeDetailOverlay";
    overlay.className = "modal-overlay";
    overlay.style.zIndex = "6000"; // au-dessus du panneau Notes (z-index 150) et de ses feuilles : le détail passe au premier plan
    overlay.innerHTML = `
      <div class="modal grade-modal-box">
        <div class="modal-head">
          <h3 id="gdmTitle">Évaluation</h3>
          <button class="close-x" id="closeGdm" aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body" id="gdmBody"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("#closeGdm").onclick = () => overlay.classList.remove("open");
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove("open"); };
  }
  $("gdmTitle").textContent = label;
  const note = row.note != null ? fmtNote(row.note) + " / 20" : "En attente de notation";
  const coeff = row.coeff != null ? fmtNote(row.coeff) : "1.0";
  const moy = row.moy != null ? fmtNote(row.moy) + " / 20" : "—";
  const maxi = row.maxi != null ? fmtNote(row.maxi) + " / 20" : "—";
  const mini = row.mini != null ? fmtNote(row.mini) + " / 20" : "—";
  const diff = (row.note != null && row.moy != null) ? (row.note - row.moy) : null;
  const diffHtml = diff != null ? `<span style="font-weight:700;color:${diff >= 0 ? '#2fd68f' : '#f87171'};">${diff >= 0 ? '+' : ''}${diff.toFixed(2)} pts</span> par rapport à la moyenne de promo` : "";

  $("gdmBody").innerHTML = `
    <div style="background:var(--accent-light, rgba(0,191,165,0.12));border:1px solid var(--accent,#00bfa5);border-radius:12px;padding:14px;text-align:center;margin-bottom:12px;">
      <div style="font-size:11.5px;color:var(--text-dim);font-weight:700;text-transform:uppercase;">Note obtenue</div>
      <div style="font-size:26px;font-weight:900;color:var(--accent,#00bfa5);margin:4px 0;">${note}</div>
      <div style="font-size:12px;color:var(--text);">${diffHtml}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
      <div style="background:var(--surface,#1e2229);border:1px solid var(--border);padding:9px 11px;border-radius:8px;">
        <span style="color:var(--text-dim);font-size:11px;display:block;">Coefficient</span>
        <strong>${coeff}</strong>
      </div>
      <div style="background:var(--surface,#1e2229);border:1px solid var(--border);padding:9px 11px;border-radius:8px;">
        <span style="color:var(--text-dim);font-size:11px;display:block;">Moyenne promo</span>
        <strong>${moy}</strong>
      </div>
      <div style="background:var(--surface,#1e2229);border:1px solid var(--border);padding:9px 11px;border-radius:8px;">
        <span style="color:var(--text-dim);font-size:11px;display:block;">Note la plus haute</span>
        <strong style="color:#2fd68f;">${maxi}</strong>
      </div>
      <div style="background:var(--surface,#1e2229);border:1px solid var(--border);padding:9px 11px;border-radius:8px;">
        <span style="color:var(--text-dim);font-size:11px;display:block;">Note la plus basse</span>
        <strong style="color:#f87171;">${mini}</strong>
      </div>
    </div>
    <div style="margin-top:12px;font-size:11.5px;color:var(--text-dim);text-align:center;">
      Données officielles synchronisées avec le portail Odin UCA.
    </div>
  `;
  overlay.classList.add("open");
}

/* Barème d'une évaluation « (sur 12.0) » : tant que l'utilisateur n'a pas dit si la note est déjà sur 20 ou sur 12, deux
   boutons sous la ligne ; ensuite le barème choisi suivi d'une flèche pour basculer vite. Les notes sur 20 n'ont rien.
   Renvoie [nœud d'intitulé, nœud de question ou null], ou null si l'évaluation n'est pas concernée. */
function setScale(key, value) {
  const next = Object.assign({}, scales, { [key]: value });
  const panel = $("notesPanel"), top = panel ? panel.scrollTop : 0;
  scales = next; setReleve(releveRaw); renderNotesPanel();
  if (panel) panel.scrollTop = top;
  chrome.storage.local.set({ uca_scales: next });
}
(function injectScaleStyle() {
  const st = document.createElement("style");
  st.textContent = `.sc-ask{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:5px 0 2px;font-size:12px;white-space:normal}
.sc-ask button,.sc-flip{font:inherit;font-size:12px;border:1px solid var(--border,#888);background:var(--surface,transparent);color:var(--text,inherit);border-radius:8px;padding:3px 10px;cursor:pointer;min-height:28px}
.sc-ask button:hover,.sc-flip:hover{border-color:var(--accent,#18b7b0);color:var(--accent,#18b7b0)}
.sc-flip{padding:0 6px!important;margin-left:4px;height:22px!important;min-height:0!important;line-height:18px;vertical-align:baseline;border-radius:8px!important}
.sc-ask button{height:auto!important;min-height:30px!important}
.sc-ask .sc-q{font-weight:700;color:var(--danger,#d93025)}
.note-val.sc-note-ask{color:var(--sc-ask,#a78bfa)!important;font-weight:800}
.note-val.sc-note-done{color:var(--sc-done,#f472b6)!important;font-weight:800}
.notes-avg .na-lbl,.notes-avg .na-val{white-space:nowrap}`;
  document.head.appendChild(st);
})();
function scaleBlock(key, ev, label, inTable) {
  if (!ev || !ev.max || ev.max === 20 || (ev.note == null && ev.rawNote == null)) return null;
  const fmtMax = (n) => String(n).replace(".", ",");
  const title = document.createElement("span");
  // Le barème est toujours rajouté par ce bloc : on retire celui de l'intitulé (« (sur 22.0) ») pour ne pas l'afficher deux fois.
  title.append(document.createTextNode(String(label).replace(/\s*\(\s*sur\s*\d+(?:[.,]\d+)?\s*\)/i, "")));
  let ask = null;
  if (ev.choice == null) {
    title.append(document.createTextNode(` (sur ${fmtMax(ev.max)})`));
    ask = document.createElement("div"); ask.className = "sc-ask";
    const q = document.createElement("span"); q.className = "sc-q"; q.textContent = `Cette note (${fmtNote(ev.rawNote)}) est sur combien ?`;
    ask.appendChild(q);
    [20, ev.max].forEach((v) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = "sur " + fmtMax(v);
      b.addEventListener("click", (e) => { e.stopPropagation(); setScale(key, v); });
      ask.appendChild(b);
    });
  } else {
    title.append(document.createTextNode(` (sur ${fmtMax(ev.choice)})`));
    const other = ev.choice === 20 ? ev.max : 20;
    const flip = document.createElement("button"); flip.type = "button"; flip.className = "sc-flip"; flip.textContent = "⇄";
    flip.title = `Changer : passer en « sur ${fmtMax(other)} »`;
    flip.setAttribute("aria-label", `Barème de ${label} : actuellement sur ${fmtMax(ev.choice)}, passer sur ${fmtMax(other)}`);
    flip.addEventListener("click", (e) => { e.stopPropagation(); setScale(key, other); });
    title.appendChild(flip);
    if (ev.scaled) title.append(document.createTextNode(` = ${fmtNote(ev.note)} / 20`));
  }
  return [title, ask];
}

function ntRow(cls, label, row, seenKey) {
  const tr = document.createElement("tr");
  tr.className = cls + " clickable-grade-row";
  tr.title = "Cliquer pour voir le détail de cette évaluation";
  tr.addEventListener("click", () => {
    openGradeDetailModal(label, row);
  });
  const lblTd = ntCell(label, "lbl");
  if (cls.startsWith("eval-row")) { const sc = scaleBlock(seenKey, row, label, true); if (sc) { lblTd.textContent = ""; lblTd.append(...sc.filter(Boolean)); } }
  tr.appendChild(lblTd);
  tr.appendChild(ntCell(fmtNote(row.coeff), "num"));
  const ageCls = noteAgeClass(seenKey, row.rawNote !== undefined ? row.rawNote : row.note);
  const noteTd = ntCell(fmtNote(row.note), "num note note-val" + ageCls);
  if (ageCls) noteTd.title = noteAgeTitle(ageCls);
  // Note dont le barème peut changer (sur 20 ou sur N) : violette tant que l'étudiant n'a pas répondu, rose ensuite.
  if (cls.startsWith("eval-row") && row.max && row.max !== 20 && (row.note != null || row.rawNote != null)) {
    const asked = row.choice == null;
    noteTd.classList.add(asked ? "sc-note-ask" : "sc-note-done");
    noteTd.title = asked ? "Barème à confirmer : réponds « sur 20 » ou « sur " + String(row.max).replace(".", ",") + " »" : "Barème choisi (⇄ pour le changer)";
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
    const go = () => goToEvent(ev);
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
  box.appendChild(projectionBlock());
  const prio = prioritiesBlock(() => simTarget);
  box.appendChild(prio.node);
  inp.addEventListener("input", prio.update);
  return box;
}
/* Projection du semestre : moyenne générale selon la note obtenue sur tout le reste. */
function projectionBlock() {
  const rows = UCA_GRADES.projection(releveNotes, [6, 8, 10, 12, 14, 16, 18]);
  const node = npEl("div", "np-proj");
  if (!rows.length) return node;
  node.appendChild(npEl("div", "fp-h", "Projection du semestre"));
  const ul = npEl("ul", "np-proj-list"); ul.setAttribute("aria-label", "Moyenne générale selon la note obtenue sur toutes les évaluations à venir");
  ul.style.cssText = "list-style:none;margin:0;padding:0 16px;display:flex;flex-wrap:wrap;gap:6px;";
  rows.forEach((r) => {
    const li = npEl("li", "", `${fmtNote(r.x)} partout → ${fmtNote(r.avg)}`);
    li.style.cssText = "font-size:12.5px;padding:3px 9px;border:1px solid var(--border);border-radius:12px;" + (r.avg >= 10 ? "font-weight:700;" : "color:var(--text-dim);");
    ul.appendChild(li);
  });
  node.appendChild(ul);
  return node;
}
/* Matières à prioriser : celles qui peuvent le plus faire bouger la moyenne générale. */
function prioritiesBlock(getTarget) {
  const node = npEl("div", "np-prio");
  const update = () => {
    node.textContent = "";
    const list = UCA_GRADES.priorities(releveNotes, getTarget()).slice(0, 5);
    if (!list.length) return;
    node.appendChild(npEl("div", "fp-h", "Matières à prioriser"));
    const ol = npEl("ol", "np-prio-list"); ol.setAttribute("aria-label", "Matières classées par effet possible sur la moyenne générale");
    ol.style.cssText = "margin:0;padding:0 16px 0 34px;font-size:13px;line-height:1.45;";
    list.forEach((p) => {
      const hint = p.status === "reached" ? "objectif déjà atteint dans la matière" : p.status === "impossible" ? "objectif hors d'atteinte dans la matière" : `il faut ${fmtNote(p.needed)} / 20 pour ${fmtNote(getTarget())} dans la matière`;
      const li = npEl("li", "", `${p.label} : jusqu'à ${fmtNote(p.lever)} pt sur la moyenne générale (${p.pending} évaluation${p.pending > 1 ? "s" : ""}, coeff ${fmtNote(p.coeff)}) — ${hint}.`);
      li.style.marginBottom = "4px";
      ol.appendChild(li);
    });
    node.appendChild(ol);
  };
  update();
  return { node, update };
}

/* Couleur d'une note sur 20 : vert ≥ 14, jaune de 10 à 14, orange sous 10. */
function gradeColor(v) { return v >= 14 ? "#2fd68f" : v >= 10 ? "#ffd23f" : "#ff8c1a"; }
/* Légende des couleurs du graphique des notes : même seuils que gradeColor. */
function gradeLegend() {
  const box = npEl("div", "grade-legend"); box.setAttribute("role", "list");
  box.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;padding:8px 16px 2px;font-size:12.5px;line-height:1.3;";
  [[gradeColor(15), 1, "14 et plus : très bien"], [gradeColor(12), 1, "de 10 à 14 : correct"], [gradeColor(5), 1, "moins de 10 : à améliorer"], ["currentColor", .35, "moyenne de la classe"], ["#a78bfa", 1, "violet : barème à choisir (sur 20 ou sur N)"], ["#f472b6", 1, "rose : barème choisi"]].forEach(([c, op, txt]) => {
    const it = npEl("span", ""); it.setAttribute("role", "listitem"); it.style.cssText = "display:inline-flex;align-items:center;gap:6px;";
    const sw = npEl("i", ""); sw.setAttribute("aria-hidden", "true"); sw.style.cssText = `width:12px;height:12px;border-radius:3px;background:${c};opacity:${op};flex:none;`;
    it.append(sw, document.createTextNode(txt)); box.appendChild(it);
  });
  return box;
}
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) { const e = document.createElementNS(SVG_NS, tag); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); return e; }
/* Largeur en pixels (pas 100 %) : plus il y a de matières, plus le graphique est large et défile à l'horizontale
   dans son cadre, au lieu d'écraser les barres. min-width:100% l'étire quand le cadre est plus large. */
(function injectNotesStyles() {
  if (document.getElementById("ucaNotesExtra")) return;
  const st = document.createElement("style"); st.id = "ucaNotesExtra";
  st.textContent = `
.np-chart-scroll{overflow-x:auto;overscroll-behavior-x:contain;padding-bottom:4px;scrollbar-width:thin;}
.np-chart-scroll svg text.np-lab{cursor:pointer;text-decoration:underline dotted;}
.np-chart-scroll svg text.np-lab:hover,.np-chart-scroll svg text.np-lab:focus{fill:var(--accent);outline:none;}
.np-chart-scroll svg rect.np-bar{cursor:pointer;}
.np-mat-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-weight:700;font-size:13px;}
.np-mat-head .np-mat-name{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;}
.np-mat-head .np-mat-val{flex:0 0 auto;white-space:nowrap;}
.np-arrow{display:inline-block;color:var(--accent);font-weight:900;margin-right:6px;animation:np-point .6s ease-in-out infinite;}
@keyframes np-point{0%,100%{transform:translateX(0)}50%{transform:translateX(7px)}}
.np-mat{scroll-margin-top:72px;}
.np-mat.np-flash{border-radius:8px;animation:np-flash 1.2s ease-out 2;}
@keyframes np-flash{0%{background:rgba(127,127,127,.3)}100%{background:transparent}}
.cal-arrow{position:fixed;z-index:400;pointer-events:none;font-size:26px;line-height:1;font-weight:900;color:var(--accent,#00bfa5);text-shadow:0 1px 3px rgba(0,0,0,.5);animation:cal-bounce .6s ease-in-out infinite;}
@keyframes cal-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
.cal-target{animation:cal-pulse 1.1s ease-in-out 5;}
@keyframes cal-pulse{0%,100%{box-shadow:0 0 0 0 var(--accent,#00bfa5)}50%{box-shadow:0 0 0 5px var(--accent,#00bfa5)}}
@media (max-width:700px){
  .notes-panel.as-sheet{position:fixed!important;left:20px!important;right:20px!important;top:calc(env(safe-area-inset-top,0px) + 56px)!important;bottom:auto!important;transform:none!important;width:calc(100vw - 40px)!important;max-width:none!important;
    height:calc(100vh - 120px)!important;max-height:calc(100vh - 120px)!important;height:calc(100dvh - 120px)!important;max-height:calc(100dvh - 120px)!important;
    overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin;border-radius:18px!important;}
  .notes-panel.as-sheet::-webkit-scrollbar{width:6px}
  .notes-panel.as-sheet::-webkit-scrollbar-thumb{background:rgba(127,127,127,.6);border-radius:3px}
  .notes-panel.as-sheet .panel-modal-topbar{position:sticky;top:0;z-index:5;background:var(--surface,#1e2229);}
  .notes-panel.as-sheet .panel-close-x{width:44px;height:44px;min-width:44px;font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;}
}`;
  document.head.appendChild(st);
})();
let npNeed = 0;
/* La fenêtre des notes s'élargit à la largeur du graphique (dans la limite de l'écran) : le défilement horizontal
   n'apparaît que si l'écran lui-même est trop étroit. */
function fitNotesPanel() {
  const p = $("notesPanel"); if (!p) return;
  if (window.innerWidth <= 700 || npNeed <= 440) { p.style.removeProperty("max-width"); p.style.removeProperty("width"); return; }
  const w = Math.round(Math.min(npNeed + 84, window.innerWidth * 0.96));
  p.style.setProperty("max-width", w + "px", "important"); p.style.setProperty("width", w + "px", "important");
}
function chartSvg(w, h) {
  npNeed = Math.max(npNeed, w);
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, role: "group", width: String(w) });
  svg.style.cssText = `display:block;margin:4px 0 0;min-width:100%;max-width:none;width:${w}px;`;
  return svg;
}
function chartScroll(svg) {
  const sc = npEl("div", "np-chart-scroll"); sc.appendChild(svg); return sc;
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
  const W = Math.max(360, 40 + series.length * 70), H = 150, L = 24, T = 10, B = 30, gw = (W - L - 8) / series.length, bw = Math.min(22, gw / 2.6);
  const y = (v) => T + (H - T - B) * (1 - v / 20);
  const svg = chartSvg(W, H); svg.setAttribute("aria-label", `Notes de ${label}, comparées à la moyenne de la classe`);
  [0, 10, 20].forEach((v) => {
    svg.appendChild(svgEl("line", { x1: L, x2: W - 8, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": v === 10 ? ".4" : ".15", "stroke-dasharray": v === 10 ? "3 3" : "" }));
    svg.appendChild(svgText(L - 4, y(v) + 3, v, "end"));
  });
  const gAvg = generalAverage();
  if (gAvg != null) {
    svg.appendChild(svgEl("line", { x1: L, x2: W - 8, y1: y(gAvg), y2: y(gAvg), stroke: "var(--accent)", "stroke-width": 1.4, "stroke-dasharray": "5 4" }));
    svg.appendChild(svgText(W - 8, 8, `- - moy. générale ${fmtNote(gAvg)}`, "end"));
  }
  series.forEach((e, i) => {
    const cx = L + gw * (i + .5);
    const bars = [[cx - bw - 1, e.note, gradeColor(e.note), 1, "Ta note"], [cx + 1, e.moy, "currentColor", .35, "Moyenne de la classe"]];
    bars.forEach(([bx, v, fill, op, what]) => {
      if (v == null) return;
      const r = svgEl("rect", { x: bx, y: y(v), width: bw, height: Math.max(1, y(0) - y(v)), fill, "fill-opacity": op, rx: 2 });
      const tt = svgEl("title"); tt.textContent = `${e.label} — ${what} : ${fmtNote(v)} / 20`; r.appendChild(tt);
      svg.appendChild(r);
    });
    svg.appendChild(svgText(cx, H - 16, e.label.length > 12 ? e.label.slice(0, 11) + "…" : e.label));
    svg.appendChild(svgText(cx, H - 5, fmtNote(e.note)));
  });
  wrap.appendChild(chartScroll(svg));
  wrap.appendChild(gradeLegend());
  const legend = npEl("div", "fp-empty", "Barre pleine : ta note · barre claire : moyenne de la classe · trait pointillé : moyenne générale");
  wrap.appendChild(legend);
  return wrap;
}
/* Moyenne de la classe sur toutes les matières : moyenne pondérée (coefficients du relevé) des moyennes de classe. */
function classGeneralAvg() {
  const seen = new Set(), items = [];
  ((releveNotes && releveNotes.ue) || []).forEach((ue) => (ue.matieres || []).forEach((m) => {
    if (seen.has(m.label)) return; seen.add(m.label);
    if (m.moy != null) items.push({ note: m.moy, coeff: m.coeff });
  }));
  return UCA_GRADES.weightedAvg(items);
}
const NBSP = "\u00a0";
/* Va à la matière cliquée sous le graphique : défilement doux, flèche animée devant son titre, léger clignotement. */
function goToMatiere(i) {
  const box = document.getElementById("np-mat-" + i);
  if (!box) return;
  document.querySelectorAll("#npContent .np-arrow").forEach((a) => a.remove());
  document.querySelectorAll("#npContent .np-flash").forEach((a) => a.classList.remove("np-flash"));
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  const arrow = npEl("span", "np-arrow", "➜"); arrow.setAttribute("aria-hidden", "true");
  const head = box.querySelector(".np-mat-head");
  if (head) head.insertBefore(arrow, head.firstChild);
  box.classList.add("np-flash");
  setTimeout(() => { arrow.remove(); box.classList.remove("np-flash"); }, 6000);
}
/* Moyenne générale : une barre par matière (ta note + moyenne de la classe en plus clair), le trait pointillé horizontal
   de ta moyenne générale, un trait transparent pour celle de la classe ; les matières du bas sont cliquables. */
function overviewChart() {
  const wrap = npEl("div", "np-chart-body"), seen = new Set(), mats = [];
  ((releveNotes && releveNotes.ue) || []).forEach((ue) => (ue.matieres || []).forEach((m) => {
    if (seen.has(m.label)) return; seen.add(m.label);
    const note = UCA_GRADES.matiereNote(m);
    if (note != null) mats.push({ label: m.label, note, moy: m.moy, evals: (m.evals || []).filter((e) => e.note != null) });
  }));
  if (!mats.length) { wrap.appendChild(npEl("div", "fp-empty", "Aucune note pour l'instant.")); return wrap; }
  const gAvg = generalAverage(), cAvg = classGeneralAvg();
  const W = Math.max(360, 40 + mats.length * 64), H = 200, L = 24, T = 30, B = 58, gw = (W - L - 8) / mats.length, bw = Math.min(20, gw * .38);
  const y = (v) => T + (H - T - B) * (1 - v / 20);
  const svg = chartSvg(W, H);
  svg.setAttribute("aria-label", `Moyenne générale ${gAvg != null ? fmtNote(gAvg) : ""} sur 20, moyenne de la classe et moyenne de chaque matière`);
  [0, 5, 10, 15, 20].forEach((v) => {
    svg.appendChild(svgEl("line", { x1: L, x2: W - 8, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": ".15" }));
    svg.appendChild(svgText(L - 4, y(v) + 3, v, "end"));
  });
  mats.forEach((m, i) => {
    const cx = L + gw * (i + .5);
    const go = () => goToMatiere(i);
    [[cx - bw - 1, m.note, gradeColor(m.note), 1, "Ta note"], [cx + 1, m.moy, "currentColor", .3, "Moyenne de la classe"]].forEach(([bx, v, fill, op, what]) => {
      if (v == null) return;
      const r = svgEl("rect", { x: bx, y: y(v), width: bw, height: Math.max(1, y(0) - y(v)), fill, "fill-opacity": op, rx: 3, class: "np-bar" });
      const tt = svgEl("title"); tt.textContent = `${m.label} — ${what} : ${fmtNote(v)} / 20`; r.appendChild(tt);
      r.addEventListener("click", go); svg.appendChild(r);
    });
    svg.appendChild(svgText(cx - bw / 2, y(m.note) - 3, fmtNote(m.note)));
    const code = (m.label.match(/^(R|SAE)\d+(\.\d+)*/i) || [m.label.slice(0, 8)])[0];
    const lab = svgText(cx, H - 22, code); lab.setAttribute("transform", `rotate(-40 ${cx} ${H - 22})`); lab.setAttribute("text-anchor", "end");
    lab.setAttribute("class", "np-lab"); lab.setAttribute("role", "button"); lab.setAttribute("tabindex", "0"); lab.setAttribute("aria-label", `Aller à ${m.label}`);
    lab.setAttribute("opacity", "1");
    lab.addEventListener("click", go); lab.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    svg.appendChild(lab);
  });
  if (cAvg != null) {
    svg.appendChild(svgEl("line", { x1: L, x2: W - 8, y1: y(cAvg), y2: y(cAvg), stroke: "currentColor", "stroke-opacity": ".4", "stroke-width": 2, "stroke-dasharray": "2 4" }));
    svg.appendChild(svgText(W - 8, 20, `··· moyenne de la classe ${fmtNote(cAvg)}`, "end"));
  }
  if (gAvg != null) {
    svg.appendChild(svgEl("line", { x1: L, x2: W - 8, y1: y(gAvg), y2: y(gAvg), stroke: "var(--accent)", "stroke-width": 1.6, "stroke-dasharray": "5 4" }));
    svg.appendChild(svgText(W - 8, 8, `- - ta moyenne générale ${fmtNote(gAvg)}`, "end"));
  }
  wrap.appendChild(chartScroll(svg));
  wrap.appendChild(gradeLegend());
  wrap.appendChild(npEl("div", "fp-empty", "Barre pleine : ta note · barre claire : moyenne de la classe · trait pointillé : ta moyenne générale · trait transparent : moyenne générale de la classe. Touche une matière sous le graphique pour y aller."));
  // Les notes de chaque matière, sous le graphique, chacune avec le repère de ta moyenne générale.
  mats.forEach((m, i) => {
    const box = npEl("div", "np-mat"); box.id = "np-mat-" + i; box.style.cssText = "margin-top:12px;";
    const head = npEl("div", "np-mat-head");
    head.append(npEl("span", "np-mat-name", m.label), npEl("span", "np-mat-val", `${fmtNote(m.note)}${NBSP}/${NBSP}20`));
    head.lastChild.style.color = gradeColor(m.note);
    box.appendChild(head);
    m.evals.forEach((e) => {
      const row = npEl("div", ""); row.style.cssText = "display:grid;grid-template-columns:1fr 42px;gap:8px;align-items:center;font-size:12px;margin-top:5px;";
      const left = npEl("div", "");
      const bare = e.label.replace(/\s*\(\s*sur\s*\d+(?:[.,]\d+)?\s*\)/i, "");
      const sc = scaleBlock(m.label + "|" + (e.key || e.label), e, bare, false);
      const titleLine = npEl("div", ""); titleLine.append(sc ? sc[0] : document.createTextNode(bare), document.createTextNode(`${e.coeff != null ? ` · coeff ${fmtNote(e.coeff)}` : ""}${e.moy != null ? ` · classe ${fmtNote(e.moy)}` : ""}`));
      left.append(titleLine); if (sc && sc[1]) left.append(sc[1]);
      const track = npEl("div", ""); track.style.cssText = "position:relative;height:8px;border-radius:4px;background:rgba(127,127,127,.18);margin-top:3px;";
      const fill = npEl("div", ""); fill.style.cssText = `height:100%;width:${Math.max(2, Math.min(100, e.note / 20 * 100))}%;border-radius:4px;background:${gradeColor(e.note)};`;
      track.appendChild(fill);
      if (gAvg != null) { const mark = npEl("div", ""); mark.style.cssText = `position:absolute;top:-3px;bottom:-3px;left:${gAvg / 20 * 100}%;border-left:2px dotted var(--accent);`; mark.title = `Ta moyenne générale ${fmtNote(gAvg)}`; track.appendChild(mark); }
      left.appendChild(track);
      if (e.moy != null) { const ct = npEl("div", ""); ct.style.cssText = `height:5px;border-radius:3px;margin-top:3px;width:${Math.max(2, Math.min(100, e.moy / 20 * 100))}%;background:currentColor;opacity:.3;`; ct.title = `Moyenne de la classe : ${fmtNote(e.moy)}`; left.appendChild(ct); }
      const val = npEl("div", "", fmtNote(e.note)); val.style.cssText = `text-align:right;font-weight:700;color:${gradeColor(e.note)};`;
      row.append(left, val); box.appendChild(row);
    });
    wrap.appendChild(box);
  });
  return wrap;
}
/* ---- Compétences (UE) : moyenne de chaque UE, seuil de validation à 10, par semestre et par année ---- */
let compView = false;
function compBarColor(v) { return v == null ? "currentColor" : v >= 10 ? "#2fd68f" : "#ff8c1a"; }
function yearChart(yr) {
  const ues = yr.ues, n = ues.length, W = Math.max(300, 44 + n * 70), H = 220, L = 28, T = 30, B = 62;
  const gw = (W - L - 10) / n, bw = Math.min(30, gw * .55), y = (v) => T + (H - T - B) * (1 - v / 20);
  const svg = chartSvg(W, H);
  svg.setAttribute("aria-label", `Année ${yr.year} : moyenne de chaque UE sur 20, seuil de validation à 10`);
  [0, 5, 15, 20].forEach((v) => {
    svg.appendChild(svgEl("line", { x1: L, x2: W - 6, y1: y(v), y2: y(v), stroke: "currentColor", opacity: ".15" }));
    svg.appendChild(svgText(L - 4, y(v) + 3, String(v), "end"));
  });
  // Semestres : fond alterné et nom du semestre sous les barres.
  let at = 0;
  yr.sems.forEach((sm, k) => {
    const x0 = L + at * gw, w = sm.ues.length * gw; at += sm.ues.length;
    if (k % 2 === 0) svg.appendChild(svgEl("rect", { x: x0, y: T - 14, width: w, height: H - T - B + 14, fill: "currentColor", opacity: ".06", rx: 6 }));
    svg.appendChild(svgText(x0 + w / 2, H - 8, (w >= 150 ? "Semestre " : "S") + sm.sem + (sm.avg != null ? " · moy. " + fmtNote(sm.avg) : ""), "middle"));
  });
  ues.forEach((u, i) => {
    const cx = L + gw * i + gw / 2, v = u.note;
    if (v != null) {
      const bar = svgEl("rect", { x: cx - bw / 2, y: y(v), width: bw, height: Math.max(2, y(0) - y(v)), rx: 4, fill: compBarColor(v) });
      const tt = svgEl("title", {}); tt.textContent = `${u.label} : ${fmtNote(v)} / 20 — ${v >= 10 ? "validée" : "sous 10"}`; bar.appendChild(tt);
      svg.appendChild(bar);
      svg.appendChild(svgText(cx, y(v) - 5, fmtNote(v), "middle"));
    } else svg.appendChild(svgText(cx, y(0) - 6, "—", "middle"));
    svg.appendChild(svgText(cx, y(0) + 14, "UE " + u.short.replace(/^\S+\s/, ""), "middle"));
  });
  // Seuil de validation : trait pointillé à 10, par-dessus les barres.
  svg.appendChild(svgEl("line", { x1: L, x2: W - 6, y1: y(10), y2: y(10), stroke: "#18b7b0", "stroke-width": 2, "stroke-dasharray": "6 4" }));
  svg.appendChild(svgText(L - 4, y(10) + 3, "10", "end"));
  const lab = svgText(W - 8, y(10) - 4, "seuil 10", "end"); lab.setAttribute("fill", "#18b7b0"); lab.setAttribute("opacity", "1"); svg.appendChild(lab);
  return chartScroll(svg);
}
function competencesView() {
  const wrap = npEl("div", "np-comp");
  const { years } = UCA_GRADES.competences(releveNotes);
  if (!years.length) { wrap.appendChild(npEl("div", "fp-empty", "Aucune UE reconnue (titres de la forme « UE RT 1.1 - … ») dans ton relevé.")); return wrap; }
  wrap.appendChild(npEl("div", "fp-empty", "Chaque UE doit atteindre 10 / 20 de moyenne : le trait pointillé marque ce seuil. Vert : validée · orange : sous 10."));
  years.forEach((yr) => {
    const sec = npEl("section", "np-year"); sec.style.cssText = "margin:12px 0 18px;";
    sec.appendChild(npEl("div", "fp-h", `Année ${yr.year} (BUT ${yr.year})${yr.avg != null ? " — moyenne des UE : " + fmtNote(yr.avg) + " / 20" : ""}`));
    sec.appendChild(yearChart(yr));
    sec.appendChild(npEl("div", "fp-empty", "Moyenne par compétence sur l'année : " + yr.comps.map((c) => `UE ${c.idx} ${c.avg != null ? fmtNote(c.avg) + (c.avg >= 10 ? " ✓" : " ✗") : "—"}`).join(" · ")));
    const ul = npEl("ul", ""); ul.style.cssText = "list-style:none;margin:6px 0 0;padding:0 4px;display:flex;flex-direction:column;gap:5px;font-size:13px;";
    yr.ues.forEach((u) => {
      const li = npEl("li", ""); li.style.cssText = "display:flex;gap:8px;justify-content:space-between;align-items:baseline;";
      const t = npEl("span", "", `${u.short} · ${u.title || u.label}`);
      const v = npEl("b", "", u.note == null ? "—" : `${fmtNote(u.note)} ${u.note >= 10 ? "✓ validée" : "✗ sous 10"}`); v.style.cssText = `white-space:nowrap;color:${compBarColor(u.note)};`;
      li.append(t, v); ul.appendChild(li);
    });
    sec.appendChild(ul);
    wrap.appendChild(sec);
  });
  return wrap;
}
function chartBlock() {
  const box = npEl("div", "np-chart");
  box.appendChild(npEl("div", "fp-h", "Évolution des notes"));
  const sel = npEl("select", "fp-search"); sel.id = "chartScope"; sel.setAttribute("aria-label", "Graphique à afficher");
  const ov = npEl("option", "", "Moyenne générale — toutes les matières"); ov.value = "overview"; sel.appendChild(ov);
  const g = npEl("option", "", "Moyenne générale (historique)"); g.value = "general"; sel.appendChild(g);
  UCA_GRADES.gradedMatieres(releveNotes).forEach((m) => { const o = npEl("option", "", m); o.value = "mat:" + m; sel.appendChild(o); });
  if (![...sel.options].some((o) => o.value === chartScope)) chartScope = "overview";
  sel.value = chartScope;
  const body = npEl("div"); body.style.cssText = "padding:4px 16px 0;";
  const draw = () => { chartScope = sel.value; body.innerHTML = ""; body.appendChild(chartScope === "overview" ? overviewChart() : chartScope === "general" ? historyChart() : matiereChart(chartScope.slice(4))); inkify(body); };
  sel.addEventListener("change", draw);
  box.append(sel, body); draw();
  return box;
}
function renderNotesPanel() {
  const content = $("npContent");
  content.innerHTML = "";
  npNeed = 0;
  const issueNode = scrapeIssueNode("notes"); if (issueNode) content.appendChild(issueNode);
  const avg = generalAverage();
  if (!releveNotes || !releveNotes.ue || !releveNotes.ue.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty";
    empty.innerHTML = D.emptyHtml("notes") + escapeHtml("Aucun relevé — synchronise pour voir tes notes");
    content.appendChild(empty);
    const exams = examsBlock(); if (exams) content.appendChild(inkify(exams));
    fitNotesPanel();
  } else {
    if (avg != null) {
      const avgBar = document.createElement("div"); avgBar.className = "notes-avg";
      avgBar.innerHTML = `<span class="na-lbl">Moyenne générale ›</span><span class="na-val">${fmtNote(avg)} / 20</span>`;
      avgBar.setAttribute("role", "button"); avgBar.tabIndex = 0; avgBar.style.cursor = "pointer";
      avgBar.setAttribute("aria-label", `Moyenne générale ${fmtNote(avg)} sur 20 : afficher le graphique de toutes les matières`);
      const openChart = () => { chartScope = "overview"; renderNotesPanel(); const c = $("npContent").querySelector(".np-chart"); if (c) c.scrollIntoView({ block: "start", behavior: "smooth" }); };
      avgBar.addEventListener("click", openChart);
      avgBar.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openChart(); } });
      content.appendChild(avgBar);
    }
    const hasComp = UCA_GRADES.competences(releveNotes).years.length > 0;
    if (compView && hasComp) {
      const back = npEl("button", "np-comp-btn", "← Retour aux notes"); back.type = "button"; back.id = "compBack";
      back.style.cssText = "margin:8px 16px;color:inherit;background:transparent;border:1px solid currentColor;padding:6px 12px;border-radius:10px;font:inherit;font-weight:700;cursor:pointer;min-height:32px;";
      back.addEventListener("click", () => { compView = false; renderNotesPanel(); });
      content.appendChild(inkify(Object.assign(npEl("div", ""), {}))); content.lastChild.appendChild(back);
      content.appendChild(inkify(npEl("div", "fp-h", "Mes compétences (UE)")));
      content.appendChild(inkify(competencesView()));
      fitNotesPanel();
      const badge0 = $("notesAvg"); if (badge0) { badge0.textContent = avg != null ? fmtNote(avg) : ""; badge0.classList.toggle("hidden", avg == null); }
      return;
    }
    if (hasComp) {
      const eye = npEl("button", "np-comp-btn", "👁 Voir mes compétences"); eye.type = "button"; eye.id = "compBtn";
      eye.setAttribute("aria-label", "Voir mes compétences : moyenne de chaque UE, seuil de validation à 10");
      eye.style.cssText = "margin:0;color:inherit;background:transparent;border:1px solid currentColor;padding:6px 12px;border-radius:10px;font:inherit;font-weight:700;cursor:pointer;min-height:32px;";
      eye.addEventListener("click", () => { compView = true; renderNotesPanel(); });
      const eyeBox = npEl("div", ""); eyeBox.style.cssText = "padding:8px 16px 0;"; eyeBox.appendChild(eye); content.appendChild(inkify(eyeBox));
    }
    [examsBlock(), simulatorBlock(), chartBlock(), npEl("div", "fp-h", "Détail des notes")].forEach((b) => { if (b) content.appendChild(inkify(b)); });
    fitNotesPanel();
    const hintPill = document.createElement("div");
    hintPill.className = "notes-hint-pill";
    hintPill.textContent = "💡 Touche une ligne du tableau pour afficher le détail officiel (coeff, promo, min/max)";
    content.appendChild(hintPill);
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
    const tableWrap = document.createElement("div"); tableWrap.className = "notes-table-wrap"; tableWrap.style.cssText = "overflow-x:auto;";
    tableWrap.appendChild(table);
    content.appendChild(tableWrap);
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
if (/[?&]openNotes=1/.test(location.search)) {
  setTimeout(() => { if ($("notesBtn")) $("notesBtn").click(); }, 300);
}
if (/[?&]openAbsences=1/.test(location.search)) {
  setTimeout(() => { if ($("absencesBtn")) $("absencesBtn").click(); }, 300);
}

/* ============================= Filtres / export =============================
   Panneau déroulant sur ordinateur ; sur téléphone, feuille en bas d'écran. */
function displayedDays() {
  const start = startOfWeek(refDate);
  if (currentView === "month") { const n = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate(); return Array.from({ length: n }, (_, i) => new Date(refDate.getFullYear(), refDate.getMonth(), i + 1)); }
  if (currentView === "5day") return getFiveDayDays();
  if (currentView === "6day") return getSixDayDays();
  if (currentView === "3day") return [0, 1, 2].map(i => addDays(refDate, i));
  if (currentView === "day" || currentView === "list") return [new Date(refDate)];
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
/* Devoirs : bouton et panneau ajoutés ici (même place et même ordre dans les 4 designs), juste après Notes. */
(function setupTasksUI() {
  const after = $("notesWrap"), tpl = $("linksWrap");
  if (!after || !tpl || $("tasksWrap")) return;
  if (!document.getElementById("i-tasks")) {
    const sprite = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sprite.setAttribute("style", "display:none"); sprite.setAttribute("aria-hidden", "true");
    sprite.innerHTML = '<symbol id="i-tasks" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 6h11M9 12h11M9 18h11M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/></symbol>';
    document.body.appendChild(sprite);
  }
  const wrap = tpl.cloneNode(false); wrap.id = "tasksWrap";
  const btn = document.createElement("button"); btn.id = "tasksBtn"; btn.type = "button"; btn.title = "Devoirs à rendre et examens à venir";
  const panel = document.createElement("div"); panel.className = "absences-panel tool-panel"; panel.id = "tasksPanel";
  wrap.append(btn, panel);
  after.after(wrap);
  const st = document.createElement("style");
  st.textContent = "@media (min-width:821px) and (max-width:1180px){ #tasksBtn .li-txt{display:none;} #tasksBtn{padding:0 10px;} header{column-gap:5px;} }";
  document.head.appendChild(st);
})();
/* Cloche : journal de ce qui s'est passé à chaque synchro (cours modifiés, nouvelles notes, absences), même place
   dans les 4 designs (juste avant « Synchroniser »). Les changements sur des cours déjà passés y sont lisibles
   mais ne comptent pas comme non lus. */
(function setupBellUI() {
  const before = $("syncBtn"), tpl = $("linksWrap");
  if (!before || !tpl || $("bellWrap")) return;
  const wrap = tpl.cloneNode(false); wrap.id = "bellWrap";
  const btn = document.createElement("button"); btn.id = "bellBtn"; btn.type = "button"; btn.title = "Ce qui s'est passé à chaque synchronisation";
  const panel = document.createElement("div"); panel.className = "absences-panel tool-panel"; panel.id = "bellPanel";
  wrap.append(btn, panel);
  before.before(wrap);
  const st = document.createElement("style");
  st.textContent = "@media (min-width:821px){ #bellBtn{padding:0 9px;min-width:0;} #bellBtn .filter-count{margin-left:2px;} } @media (min-width:821px) and (max-width:1180px){ #filterBtn>:is(.ic,.gi),#exportBtn>:is(.ic,.gi),#designBtn>:is(.ic,.gi){display:none;} }";
  document.head.appendChild(st);
})();
function renderBellButton() {
  const btn = $("bellBtn"); if (!btn) return;
  const n = UCA_ACTIVITY.unread(activity, activitySeenAt).length;
  btn.textContent = "🔔";
  if (n) { const c = document.createElement("span"); c.className = "filter-count"; c.textContent = n > 99 ? "99+" : String(n); btn.append(" ", c); }
  btn.setAttribute("aria-label", n ? `Activité, ${n} nouveau${n > 1 ? "x" : ""}` : "Activité");
}
function buildBellPanel(p) {
  UCA_ACTIVITY.buildPanel(p, { log: activity, seenAt: activitySeenAt,
    onOpenDay: (day) => { const [y, m, d] = day.split("-").map(Number); p.classList.remove("open"); if ($("ucaSheetBackdrop")) $("ucaSheetBackdrop").hidden = true; goToDate(new Date(y, m - 1, d)); },
    onClear: () => { activity = []; chrome.storage.local.set({ uca_activity: [] }); renderBellButton(); buildBellPanel(p); } });
  // Lu : les pastilles « nouveau » restent affichées dans ce panneau, le compteur repart à zéro.
  if (UCA_ACTIVITY.unread(activity, activitySeenAt).length) chrome.storage.local.set({ uca_activity_seen: Date.now() });
}
function renderTasksButton() {
  const btn = $("tasksBtn"); if (!btn) return;
  const n = UCA_TASKS.openCount(tasks);
  btn.innerHTML = D.icon("tasks") + '<span class="li-txt">Devoirs</span>' + (n ? ` <span class="filter-count">${n}</span>` : "");
  btn.setAttribute("aria-label", n ? `Devoirs et examens, ${n} à faire` : "Devoirs et examens");
}
function saveTasks(list) {
  tasks = list; renderTasksButton();
  chrome.storage.local.set({ uca_tasks: list }, () => { if ($("tasksPanel") && $("tasksPanel").classList.contains("open")) TOOL_PANELS.tasksPanel.build($("tasksPanel")); });
}
const TOOL_PANELS = {
  tasksPanel: { wrap: "tasksWrap", build: (p) => UCA_TASKS.buildPanel(p, { events, tasks, save: saveTasks, openEvent: goToEvent, openTask: goToTask,
    noteItems: events.filter((ev) => notes[eventKey(ev)]).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40).map((ev) => ({ ev, text: String(notes[eventKey(ev)]) })) }) },
  bellPanel: { wrap: "bellWrap", build: (p) => buildBellPanel(p) },
  notesPanel: { wrap: "notesWrap", build: () => {} },
  absencesPanel: { wrap: "absencesWrap", build: () => {} },
  filterPanel: { wrap: "filterWrap", build: (p) => UCA_TOOLS.buildFilterPanel(p, personalEvents, { classCount: classEvents.length, classGroups, classBusy, classError, onConnect: connectClass }) },
  exportPanel: { wrap: "exportWrap", build: (p) => UCA_TOOLS.buildExportPanel(p, { tasks, shareImage: { day: () => ({ date: new Date(refDate), events: events.filter(UCA_TOOLS.passes) }), week: () => ({ days: Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(refDate), i)), events: events.filter(UCA_TOOLS.passes) }) }, allEvents: events, weekDays: displayedDays, eventKey, reminderMinutes: settings.reminderMinutes, onPhone: window.UCA_APP ? null : openPhoneModal, shareLink: window.UCA_APP ? null : () => UCA_TRANSFER.makeShareLink(), canShare: window.UCA_APP ? null : UCA_TRANSFER.canShare, sendLink: UCA_TRANSFER.shareLink }) },
  linksPanel: { wrap: "linksWrap", build: (p) => UCA_TOOLS.buildLinksPanel(p) },
};
function ensurePanelHeader(panel, id) {
  if (panel.querySelector(".panel-modal-topbar")) return;
  const titles = {
    notesPanel: "📊 Relevé de Notes",
    absencesPanel: "⚠️ Mes Absences",
    tasksPanel: "📝 Devoirs & Examens",
    bellPanel: "🔔 Activité",
    filterPanel: "🔍 Filtres de Cours",
    exportPanel: "📅 Exporter l'Agenda",
    linksPanel: "🔗 Liens Universitaires"
  };
  const top = document.createElement("div");
  top.className = "panel-modal-topbar";
  top.innerHTML = `<button type="button" class="panel-back-btn" title="Retour">← Retour</button><span class="panel-modal-title">${titles[id] || "Détails"}</span><button type="button" class="panel-close-x" title="Fermer">✕</button>`;
  const close = () => { panel.classList.remove("open"); const bd = $("ucaSheetBackdrop"); if (bd) bd.hidden = true; };
  top.querySelector(".panel-back-btn").onclick = close;
  top.querySelector(".panel-close-x").onclick = close;
  panel.insertBefore(top, panel.firstChild);
}
function openToolPanel(id, asSheet) {
  const panel = $(id), conf = TOOL_PANELS[id];
  if (!panel) return;
  Object.keys(TOOL_PANELS).forEach(o => { if (o !== id && $(o)) $(o).classList.remove("open"); });
  if (asSheet) {
    document.body.appendChild(panel);
    panel.classList.add("as-sheet");
    ensurePanelHeader(panel, id);
    showSheetBackdrop(panel);
  }
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
["filterPanel", "exportPanel", "linksPanel", "tasksPanel", "bellPanel"].forEach(id => {
  const btn = $(id.replace("Panel", "Btn"));
  if (!btn) return;
  btn.addEventListener("click", (e) => { e.stopPropagation(); openToolPanel(id, false); });
  closeOnOutsideClick(id, TOOL_PANELS[id].wrap);
});
UCA_TOOLS.onChange(() => { applyScope(); renderFilterButton(); render(); });

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
  else if (k === "l" && availableViews().includes("list")) switchView("list");
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
    syncBtn.title = importer ? "Importer les données depuis l'extension de l'ordinateur" : "Synchroniser avec Odin";
  };
  setSyncLabel(!window.UCA_APP.extensionReady);
  window.addEventListener("uca-extension-ready", () => {
    setSyncLabel(false);
    // "Synchroniser" passe par l'extension : on garde quand même un bouton Importer (lien/QR/fichier).
    if (!$("appImportBtn") && !isMobileUI()) {
      const imp = document.createElement("button");
      imp.id = "appImportBtn"; imp.type = "button"; imp.className = syncBtn.className.replace("primary", "").trim() + " mobile-hide-zoom";
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
  } else if (msg.type === "UCA_CLASS_RESULT") {
    classBusy = false;
    if (msg.ok) { classError = ""; toast("Emploi du temps de la classe récupéré (" + msg.count + " cours).", "ok"); }
    else { classError = msg.cancelled ? "Connexion annulée." : (msg.error || "Échec"); toast("Emploi du temps de la classe : " + classError, "warn"); }
    if ($("filterPanel") && $("filterPanel").classList.contains("open")) TOOL_PANELS.filterPanel.build($("filterPanel"));
  } else if (msg.type === "UCA_SYNC_RESULT") {
    UCA_CORE.loginHelp(false);
    if (!msg.ok) {
      if (msg.error && /maintenance/i.test(msg.error)) {
        toast("⚠️ Site Odin en maintenance : le portail IUT est temporairement indisponible.", "warn");
      } else if (msg.error && (/aucun/i.test(msg.error) || /emploi/i.test(msg.error))) {
        toast("ℹ️ Authentification réussie, mais aucun emploi du temps disponible pour votre groupe.", "warn");
      } else {
        toast(T("errorPrefix") + (msg.error || "Erreur"), "warn");
      }
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
    if (msg.ok) chrome.storage.local.get(["uca_notes_seen", "uca_notes_history"], (data) => { setReleve(msg.releve); notesSeen = data.uca_notes_seen || {}; notesHistory = data.uca_notes_history || notesHistory; renderNotesPanel(); });
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
  if (changes.uca_settings) { settings = Object.assign({}, UCA_SETTINGS_DEFAULTS, changes.uca_settings.newValue); render(); renderNotesPanel(); renderAbsencesPanel(); updatePinnedNext(); }
  if (changes.uca_notes_seen || changes.uca_releve_notes) {
    if (changes.uca_notes_seen) notesSeen = changes.uca_notes_seen.newValue || {};
    if (changes.uca_releve_notes) setReleve(changes.uca_releve_notes.newValue);
    renderNotesPanel();
  }
  if (changes.uca_scales) { scales = changes.uca_scales.newValue || {}; setReleve(releveRaw); renderNotesPanel(); }
  if (changes.uca_notes_history) { notesHistory = changes.uca_notes_history.newValue || []; renderNotesPanel(); }
  if (changes.uca_scrape_issues) { scrapeIssues = changes.uca_scrape_issues.newValue || {}; renderAbsencesPanel(); renderNotesPanel(); if (syncInfoArgs[0] || syncInfoArgs[1]) { renderSyncInfo(...syncInfoArgs); renderNextInfo(); } }
  if (changes.uca_subject_colors) { subjectColors = changes.uca_subject_colors.newValue || {}; [personalEvents, classEvents].forEach((l) => l.forEach((e) => { e.color = colorOf(e.title); })); render(); }
  if (changes.uca_edt_changes) { setEdtChanges(changes.uca_edt_changes.newValue); render(); }
  // Réinitialisation (ou son annulation) depuis Paramètres, dans un autre onglet : reflète tout de suite.
  if (changes.uca_events) { personalEvents = (changes.uca_events.newValue || []).map(ev => ({ ...ev, color: colorOf(ev.title) })); applyScope(); render(); renderNextInfo(); }
  if (changes.uca_class_events) { classEvents = (changes.uca_class_events.newValue || []).map(ev => ({ ...ev, color: colorOf(ev.title) })); classBusy = false; applyScope(); render(); }
  if (changes.uca_my_groups) { classGroups = changes.uca_my_groups.newValue || []; }
  if (changes.uca_notes) { notes = changes.uca_notes.newValue || {}; render(); }
  if (changes.uca_tasks) { tasks = UCA_TASKS.sanitize(changes.uca_tasks.newValue); renderTasksButton(); }
  if (changes.uca_activity) { activity = UCA_ACTIVITY.sanitize(changes.uca_activity.newValue); renderBellButton(); }
  if (changes.uca_activity_seen) { activitySeenAt = Number(changes.uca_activity_seen.newValue) || 0; renderBellButton(); }
  if (changes.uca_absences) { absences = changes.uca_absences.newValue || null; renderAbsencesPanel(); }
});
UCA_TOOLS.load(() => { renderFilterButton(); loadFromStorage(); });
})();
