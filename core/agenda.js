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
let releveNotes = null;
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
  edtChanges = new Map(); cancelledGhosts = [];
  (list || []).forEach(c => {
    if (c.type === "cancelled") cancelledGhosts.push({ ...c.ev, cancelled: true, color: D.eventColor(eventColorKey(c.ev.title)) });
    else edtChanges.set(c.key, c);
  });
}
function eventsOnDate(d) {
  const key = dateKey(d);
  return events.concat(cancelledGhosts).filter(c => c.date === key && UCA_TOOLS.passes(c)).sort((a, b) => (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
}
function changeOf(ev) { return ev.cancelled ? { type: "cancelled" } : edtChanges.get(eventKey(ev)); }
function changeBadgeHtml(ev) { const c = changeOf(ev); return c ? D.changeBadge(c.type) : ""; }
function changeDetailHtml(ev) {
  const c = changeOf(ev);
  if (!c) return "";
  const b = c.before || {};
  const detail = c.type === "room" ? `ancienne salle : ${b.room || "—"}`
    : c.type === "moved" ? `avant : ${pad(b.startH)}:${pad(b.startM)} – ${pad(b.endH)}:${pad(b.endM)}`
    : c.type === "cancelled" ? "ce cours n'apparaît plus sur Odin" : "ajouté depuis la synchro précédente";
  return `<p>${D.changeBadge(c.type)} ${escapeHtml(detail)}</p>`;
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
    <div class="note-label">${D.icon("note")}Note personnelle (visible seulement par toi) :</div>
    <textarea id="noteArea" placeholder="Ex: réviser le chapitre 3 avant ce cours..."></textarea>
  `;
  $("noteArea").value = noteVal;
  $("detailOverlay").classList.add("open");
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
  if (D.grid.metaMerged) {
    const meta = [ev.teacher, ev.room].filter(Boolean).join(" · ");
    return meta ? `<${tag} class="ev-sub" title="${escapeHtml(meta)}">${escapeHtml(meta)}</${tag}>` : "";
  }
  return (ev.teacher ? `<${tag} class="ev-sub">${escapeHtml(T("teacherPrefix") + ev.teacher)}</${tag}>` : "")
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
  days.forEach(d => { const dh = document.createElement("div"); dh.className = "grid-daycol-head" + (sameDay(d, today) ? " today" : ""); dh.innerHTML = `<div class="dname">${DAY_NAMES_SHORT[d.getDay()]}</div><div class="dnum">${d.getDate()}</div>`; headRow.appendChild(dh); });
  const scroll = document.createElement("div"); scroll.className = "grid-scroll";
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
  const head = document.createElement("div"); head.className = "m-date";
  head.textContent = capitalize(refDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
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
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  m.appendChild(menuButton("mi", D.icon("link") + "Moodle", () => window.open(MOODLE_URL, "_blank", "noopener")));
  m.appendChild(menuButton("mi", D.icon("mail") + "Messagerie (Zimbra)", () => window.open(MAIL_URL, "_blank", "noopener")));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  if ($("filterPanel")) m.appendChild(menuButton("mi", D.icon("filter") + "Filtres" + (UCA_TOOLS.activeCount() ? ` (${UCA_TOOLS.activeCount()})` : ""), () => openToolPanel("filterPanel", true)));
  if ($("exportPanel")) m.appendChild(menuButton("mi", D.icon("export") + "Exporter (.ics)", () => openToolPanel("exportPanel", true)));
  m.appendChild(menuButton("mi", D.icon("settings") + "Paramètres", UCA_CORE.openSettings));
  m.appendChild(menuButton("mi", D.icon("design") + "Changer de design", () => { location.href = chrome.runtime.getURL("choose.html?change=1&tab=1"); }));
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  m.appendChild(menuButton("mi msync primary", D.icon("sync") + (window.UCA_APP ? "Importer mes données" : "Synchroniser"), triggerSync));
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
function renderSyncInfo(iso, importedAt) {
  const fmt = (d) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (window.UCA_APP) {
    $("syncInfo").textContent = importedAt ? `Données de l'ordinateur du ${fmt(iso || importedAt)} — refais un transfert après une synchro` : "Aucune donnée : importe-les depuis l'extension";
    return;
  }
  $("syncInfo").textContent = iso ? "Dernière synchro : " + new Date(iso).toLocaleString("fr-FR") : "Jamais synchronisé";
}
function loadFromStorage() {
  chrome.storage.local.get(["uca_events", "uca_last_sync", "uca_notes", "uca_absences", "uca_releve_notes", "uca_session_expired", "uca_notes_seen", "uca_settings", "uca_edt_changes", "uca_app_imported_at"], (data) => {
    if (window.UCA_APP && !(data.uca_events || []).length && !sessionStorage.getItem("uca_import_skip")) { location.href = chrome.runtime.getURL("app/import.html"); return; }
    settings = Object.assign({}, UCA_SETTINGS_DEFAULTS, data.uca_settings);
    events = (data.uca_events || []).map(ev => ({ ...ev, color: D.eventColor(eventColorKey(ev.title)) }));
    notes = data.uca_notes || {};
    absences = data.uca_absences || null;
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
    renderSessionState(!!data.uca_session_expired);
    renderAbsencesPanel();
    renderNotesPanel();
    render();
  });
}
function eventColorKey(title) { return title.replace(/\b(CM|TD|TDA|TP|TPA)\b/gi, "").trim() || title; }

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

function renderAbsencesPanel() {
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
// Note apparue il y a moins de 2 jours : orange ; moins de 4 jours : jaune ; ensuite normale.
const NOTE_NEW_MS = 2 * 86400000, NOTE_RECENT_MS = 4 * 86400000;
function noteAgeClass(seenKey, note) {
  const seen = seenKey && notesSeen[seenKey];
  if (note == null || !seen || seen.note !== note || !seen.at) return "";
  const age = Date.now() - seen.at;
  return age < NOTE_NEW_MS ? " note-new" : age < NOTE_RECENT_MS ? " note-recent" : "";
}
function ntRow(cls, label, row, seenKey) {
  const tr = document.createElement("tr");
  tr.className = cls;
  tr.appendChild(ntCell(label, "lbl"));
  tr.appendChild(ntCell(fmtNote(row.coeff), "num"));
  const ageCls = noteAgeClass(seenKey, row.note);
  const noteTd = ntCell(fmtNote(row.note), "num note note-val" + ageCls);
  if (ageCls) noteTd.title = ageCls === " note-new" ? "Nouvelle note (moins de 2 jours)" : "Note récente (moins de 4 jours)";
  tr.appendChild(noteTd);
  tr.appendChild(ntCell(fmtNote(row.moy), "num"));
  tr.appendChild(ntCell(fmtNote(row.maxi), "num"));
  tr.appendChild(ntCell(fmtNote(row.mini), "num"));
  return tr;
}
// Odin ne remplit souvent la note de matière/UE qu'au jury de semestre ("-" avant ça) :
// on la reconstruit depuis le niveau en dessous avec le Coeff de chaque ligne du tableau
// (éval -> matière -> UE), jamais avec un poids par défaut inventé.
function weightedAvg(items) {
  let sw = 0, sc = 0;
  items.forEach(({ note, coeff }) => { if (note == null || coeff == null) return; sw += note * coeff; sc += coeff; });
  return sc ? sw / sc : null;
}
function matiereEffectiveNote(m) {
  if (m.note != null) return m.note;
  return weightedAvg(m.evals || []);
}
function ueEffectiveNote(ue) {
  if (ue.note != null) return ue.note;
  return weightedAvg((ue.matieres || []).map(m => ({ note: matiereEffectiveNote(m), coeff: m.coeff })));
}
function generalAverage() {
  if (!releveNotes || !releveNotes.ue || !releveNotes.ue.length) return null;
  return weightedAvg(releveNotes.ue.map(ue => ({ note: ueEffectiveNote(ue), coeff: ue.coeff })));
}
function renderNotesPanel() {
  const content = $("npContent");
  content.innerHTML = "";
  const avg = generalAverage();
  if (!releveNotes || !releveNotes.ue || !releveNotes.ue.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty";
    empty.innerHTML = D.emptyHtml("notes") + escapeHtml("Aucun relevé — synchronise pour voir tes notes");
    content.appendChild(empty);
  } else {
    if (avg != null) {
      const avgBar = document.createElement("div"); avgBar.className = "notes-avg";
      avgBar.innerHTML = `<span class="na-lbl">Moyenne générale</span><span class="na-val">${fmtNote(avg)} / 20</span>`;
      content.appendChild(avgBar);
    }
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
      tbody.appendChild(ntRow("ue-row", ue.label, ue));
      matieres.forEach((m) => {
        tbody.appendChild(ntRow("matiere-row" + (m.note == null ? " no-grade" : ""), m.label, m, m.label + "|"));
        const seenEvals = new Set();
        (m.evals || []).forEach((ev) => {
          if (seenEvals.has(ev.label)) return;
          seenEvals.add(ev.label);
          tbody.appendChild(ntRow("eval-row", ev.label, ev, m.label + "|" + ev.label));
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
  exportPanel: { wrap: "exportWrap", build: (p) => UCA_TOOLS.buildExportPanel(p, { allEvents: events, weekDays: displayedDays, eventKey, reminderMinutes: settings.reminderMinutes, onPhone: window.UCA_APP ? null : openPhoneModal, shareLink: window.UCA_APP ? null : () => UCA_TRANSFER.snapshot().then(UCA_TRANSFER.buildShareLink) }) },
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
["filterPanel", "exportPanel"].forEach(id => {
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
      <p class="phone-step"><b>2.</b> Dans l'app : « Importer » puis « Scanner », et vise le code animé. Ou, plus simple, envoie-toi le lien ci-dessous (SMS, mail, messagerie...) et ouvre-le sur ton téléphone. Le lien contient tes données lui-même, jamais gardées par GitHub ni aucun serveur — et il expire au bout de 2 jours.</p>
      <div class="phone-actions"><button class="primary" id="phoneStart">Afficher le code animé</button><button id="phoneLink">Copier un lien</button><button id="phoneFile">Fichier de secours (.ucasync)</button></div>
    </div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePhoneModal(); });
  $("phoneClose").addEventListener("click", closePhoneModal);
  T_.drawQr($("phoneQrApp"), T_.DOWNLOAD_URL, 220);
  const snap = await T_.snapshot();
  $("phoneFile").addEventListener("click", () => T_.exportFile(snap));
  $("phoneLink").addEventListener("click", async () => {
    const link = await T_.buildShareLink(snap);
    try {
      await navigator.clipboard.writeText(link);
      const btn = $("phoneLink"), original = btn.textContent;
      btn.textContent = "Le lien est bien copié"; btn.disabled = true;
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
      toast("Lien copié — colle-le dans un SMS, un mail...", "ok");
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
  window.addEventListener("uca-extension-ready", () => setSyncLabel(false));
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
  } else if (msg.type === "UCA_SYNC_RESULT") {
    syncBtn.disabled = false;
    if (!msg.ok) { toast(T("errorPrefix") + (msg.error || "Erreur"), "warn"); return; }
    toast(msg.silent ? T("syncSilent") : T("syncOk"), "ok");
    loadFromStorage();
  } else if (msg.type === "UCA_ABSENCES_RESULT") {
    if (msg.ok) { absences = msg.absences; renderAbsencesPanel(); }
  } else if (msg.type === "UCA_NOTES_RESULT") {
    if (msg.ok) chrome.storage.local.get("uca_notes_seen", (data) => { releveNotes = msg.releve; notesSeen = data.uca_notes_seen || {}; renderNotesPanel(); });
  } else if (msg.type === "UCA_UPDATE_STATE") {
    UCA_CORE.renderUpdate(msg.updateAvailable, msg.current, msg.latest);
  }
});

UCA_CORE.initUpdate();
UCA_CORE.initDesignSwitch(true);
UCA_CORE.initSettings();
renderFilterButton();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.uca_settings) { settings = Object.assign({}, UCA_SETTINGS_DEFAULTS, changes.uca_settings.newValue); render(); }
  if (changes.uca_edt_changes) { setEdtChanges(changes.uca_edt_changes.newValue); render(); }
});
UCA_TOOLS.load(() => { renderFilterButton(); loadFromStorage(); });
})();
