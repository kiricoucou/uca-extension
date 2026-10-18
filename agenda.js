(function () {
"use strict";

let events = [];
let notes = {};
let absences = null;
let releveNotes = null;
let currentView = "week";
let refDate = new Date(); refDate.setHours(0, 0, 0, 0);
let pendingEventKey = null;
let zoomLevel = Math.max(0.6, Math.min(1.8, parseFloat(localStorage.getItem("uca_zoom_v1")) || 1));
let autoViewApplied = false;

const DAY_NAMES_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const VIEW_ITEMS = [["day", "☀️ Jour"], ["3day", "📆 3 jours"], ["5day", "🗓️ 5 jours"], ["6day", "🗓️ 6 jours"], ["week", "📅 Semaine"], ["month", "🗓️ Mois"]];

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

function toast(msg, type) {
  const wrap = document.getElementById("toast-wrap");
  const el = document.createElement("div");
  el.className = "toast" + (type === "warn" ? " warn" : type === "ok" ? " ok" : "");
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 4200);
}

function eventsOnDate(d) {
  const key = dateKey(d);
  return events.filter(c => c.date === key).sort((a, b) => (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
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

function fmtPeriodLabel() {
  if (currentView === "month") return capitalize(refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  if (currentView === "day") return capitalize(refDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  if (currentView === "3day") { const end = addDays(refDate, 2); return `${refDate.getDate()} ${monthShort(refDate)} – ${end.getDate()} ${monthShort(end)} ${end.getFullYear()}`; }
  if (currentView === "5day") { const days = getFiveDayDays(); const s = days[0], e = days[days.length - 1]; return `${s.getDate()} ${monthShort(s)} – ${e.getDate()} ${monthShort(e)} ${e.getFullYear()}`; }
  if (currentView === "6day") { const days = getSixDayDays(); const s = days[0], e = days[days.length - 1]; return `${s.getDate()} ${monthShort(s)} – ${e.getDate()} ${monthShort(e)} ${e.getFullYear()}`; }
  if (currentView === "week") { const s = startOfWeek(refDate), e = addDays(s, 6); return `${s.getDate()} ${monthShort(s)} – ${e.getDate()} ${monthShort(e)} ${e.getFullYear()}`; }
  return "";
}
function fmtMonthLabel() { return capitalize(refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })); }
function updateHeader() {
  document.getElementById("periodLabel").textContent = isMobileUI() ? fmtMonthLabel() : fmtPeriodLabel();
  document.querySelectorAll("#viewTabs button").forEach(b => b.classList.toggle("active", b.dataset.view === currentView));
}
function navigate(dir) {
  if (currentView === "month") refDate = new Date(refDate.getFullYear(), refDate.getMonth() + dir, 1);
  else if (currentView === "week") refDate = addDays(refDate, 7 * dir);
  else if (currentView === "3day") refDate = addDays(refDate, 3 * dir);
  else if (currentView === "5day") refDate = addDays(refDate, 7 * dir);
  else if (currentView === "6day") refDate = addDays(refDate, 7 * dir);
  else if (currentView === "day") refDate = addDays(refDate, dir);
  render();
}
function switchView(v) { currentView = v; render(); }

/* ============================= Notes ============================= */
function saveNotes() { chrome.storage.local.set({ uca_notes: notes }); }

/* ============================= Détail / notes modal ============================= */
function openDetail(ev) {
  pendingEventKey = eventKey(ev);
  const noteVal = notes[pendingEventKey] || "";
  document.getElementById("detailTitle").innerHTML = `<img class="gi lg" src="gif/Learning.gif" alt="">${escapeHtml(ev.title)}`;
  document.getElementById("detailBody").innerHTML = `
    <p><img class="gi" src="gif/time.gif" alt=""><strong>Horaire :</strong> ${pad(ev.startH)}:${pad(ev.startM)} – ${pad(ev.endH)}:${pad(ev.endM)}</p>
    <p><img class="gi" src="gif/calendar.gif" alt=""><strong>Date :</strong> ${ev.day}/${pad(ev.month + 1)}/${ev.year}</p>
    ${ev.teacher ? `<p><img class="gi" src="gif/cat_gun.gif" alt=""><strong>Enseignant :</strong> ${escapeHtml(ev.teacher)}</p>` : ""}
    ${ev.room ? `<p><img class="gi" src="gif/ping.gif" alt=""><strong>Salle :</strong> ${escapeHtml(ev.room)}</p>` : ""}
    ${ev.raw ? `<p style="margin-bottom:4px;"><strong>📋 Toutes les données (brut) :</strong></p>
    <pre style="white-space:pre-wrap;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:11.5px;font-family:'Cascadia Code',Consolas,monospace;color:var(--text-dim);margin:0 0 4px;">${escapeHtml(ev.raw)}</pre>` : ""}
    <div class="note-label"><img class="gi" src="gif/a_hand_writing.gif" alt="">Note personnelle (visible seulement par toi) :</div>
    <textarea id="noteArea" placeholder="Ex: réviser le chapitre 3 avant ce cours..."></textarea>
  `;
  document.getElementById("noteArea").value = noteVal;
  document.getElementById("detailOverlay").classList.add("open");
}
function closeDetailAndSaveNote() {
  const area = document.getElementById("noteArea");
  if (area && pendingEventKey) {
    const val = area.value; // texte brut uniquement, jamais interprété comme HTML/JS
    if (val.trim()) notes[pendingEventKey] = val; else delete notes[pendingEventKey];
    saveNotes();
  }
  pendingEventKey = null;
  document.getElementById("detailOverlay").classList.remove("open");
}
document.getElementById("closeDetail").addEventListener("click", closeDetailAndSaveNote);
document.getElementById("detailOverlay").addEventListener("click", (e) => { if (e.target === document.getElementById("detailOverlay")) closeDetailAndSaveNote(); });

/* ============================= RENDER: MONTH ============================= */
function renderMonth() {
  const el = document.getElementById("monthView"); el.innerHTML = "";
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
    evs.slice(0, 3).forEach(ev => { const pill = document.createElement("div"); pill.className = "month-pill"; pill.style.background = ev.color; pill.textContent = `${pad(ev.startH)}:${pad(ev.startM)} ${ev.title}`; pill.addEventListener("click", (e) => { e.stopPropagation(); openDetail(ev); }); cell.appendChild(pill); });
    if (evs.length > 3) { const more = document.createElement("div"); more.style.fontSize = "10.5px"; more.style.color = "var(--text-dim)"; more.textContent = `+${evs.length - 3} autre(s)`; cell.appendChild(more); }
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

/* Hauteur plancher pour qu'horaire + titre + prof + salle restent lisibles
   même sur un créneau d'1h (sinon le texte est coupé, cf. retour utilisateur). */
const MIN_CARD_HEIGHT = 72;

function renderTimeGrid(containerId, days) {
  const el = document.getElementById(containerId); el.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "grid-view";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const headRow = document.createElement("div"); headRow.className = "grid-headrow";
  const gutterHead = document.createElement("div"); gutterHead.className = "grid-timegutter-head"; headRow.appendChild(gutterHead);
  days.forEach(d => { const dh = document.createElement("div"); dh.className = "grid-daycol-head" + (sameDay(d, today) ? " today" : ""); dh.innerHTML = `<div class="dname">${DAY_NAMES_SHORT[d.getDay()]}</div><div class="dnum">${d.getDate()}</div>`; headRow.appendChild(dh); });
  const scroll = document.createElement("div"); scroll.className = "grid-scroll";
  scroll.appendChild(headRow);
  const body = document.createElement("div"); body.className = "grid-body";
  wrap.appendChild(scroll); el.appendChild(wrap);
  const headH = headRow.offsetHeight || 0;
  const containerH = Math.max((scroll.clientHeight - headH) || 0, 200);
  const allEvs = [].concat(...days.map(d => eventsOnDate(d)));
  let rangeStart = 8, rangeEnd = 18;
  if (allEvs.length) {
    let minS = 24, maxE = 0;
    allEvs.forEach(ev => { minS = Math.min(minS, ev.startH + ev.startM / 60); maxE = Math.max(maxE, ev.endH + ev.endM / 60); });
    rangeStart = Math.max(0, Math.floor(minS - 0.5)); rangeEnd = Math.min(24, Math.ceil(maxE + 0.5));
    if (rangeEnd - rangeStart < 2) rangeEnd = rangeStart + 2;
  }
  let totalHours = rangeEnd - rangeStart;
  // La journée entière tient par défaut (zoom 100%) dans le conteneur sans coupure :
  // l'échelle s'ajuste pile sur la hauteur dispo. Les boutons −/+ appliquent un
  // multiplicateur (zoomLevel) par-dessus ; en dessous de 100% tout rétrécit
  // (gain de place), au-dessus un scroll apparaît pour lire plus grand.
  const pxPerHour = (containerH / totalHours) * zoomLevel;
  const bodyHeight = pxPerHour * totalHours;
  body.style.height = bodyHeight + "px";
  const topFor = (h, m) => Math.max(0, Math.min(bodyHeight, ((h + m / 60) - rangeStart) * pxPerHour));
  const gutter = document.createElement("div"); gutter.className = "grid-timegutter"; gutter.style.height = bodyHeight + "px";
  for (let h = Math.ceil(rangeStart); h <= Math.floor(rangeEnd); h++) { if (h < rangeStart || h > rangeEnd) continue; const lbl = document.createElement("div"); lbl.className = "hour-label"; lbl.style.top = topFor(h, 0) + "px"; lbl.textContent = pad(h) + ":00"; gutter.appendChild(lbl); }
  body.appendChild(gutter);
  days.forEach(d => {
    const col = document.createElement("div"); col.className = "grid-daycol"; col.style.height = bodyHeight + "px";
    for (let h = Math.ceil(rangeStart); h <= Math.floor(rangeEnd); h++) { if (h < rangeStart || h > rangeEnd) continue; const line = document.createElement("div"); line.className = "hour-line"; line.style.top = topFor(h, 0) + "px"; col.appendChild(line); }
    const evs = eventsOnDate(d); const laidOut = layoutOverlaps(evs);
    laidOut.forEach(({ ev, col: colIdx, cols }) => {
      const top = topFor(ev.startH, ev.startM);
      let durMin = (ev.endH * 60 + ev.endM) - (ev.startH * 60 + ev.startM); if (durMin <= 0) durMin = 30;
      const height = (durMin / 60) * pxPerHour;
      const scale = Math.max(0.42, Math.min(1.8, height / MIN_CARD_HEIGHT));
      const card = document.createElement("div"); card.className = "event-card";
      card.style.top = top + "px"; card.style.height = height + "px"; card.style.setProperty("--s", scale);
      card.style.left = `calc(${(colIdx / cols) * 100}% + 2px)`; card.style.width = `calc(${100 / cols}% - 4px)`;
      card.style.background = ev.color;
      const hasNote = !!notes[eventKey(ev)];
      card.innerHTML = `${hasNote ? `<div class="ev-note">📝</div>` : ""}<div class="ev-time">${pad(ev.startH)}:${pad(ev.startM)}–${pad(ev.endH)}:${pad(ev.endM)}</div><div class="ev-title" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>${ev.teacher ? `<div class="ev-sub">👤 ${escapeHtml(ev.teacher)}</div>` : ""}${ev.room ? `<div class="ev-sub">📍 ${escapeHtml(ev.room)}</div>` : ""}`;
      card.addEventListener("click", (e) => { e.stopPropagation(); openDetail(ev); });
      col.appendChild(card);
    });
    if (sameDay(d, today)) {
      const now = new Date();
      if (now.getHours() + now.getMinutes() / 60 >= rangeStart && now.getHours() + now.getMinutes() / 60 <= rangeEnd) {
        const nowLine = document.createElement("div"); nowLine.className = "now-line"; nowLine.style.top = topFor(now.getHours(), now.getMinutes()) + "px";
        const dot = document.createElement("div"); dot.className = "now-dot"; nowLine.appendChild(dot); col.appendChild(nowLine);
      }
    }
    body.appendChild(col);
  });
  scroll.appendChild(body);
}

function renderDay() {
  const el = document.getElementById("dayView"); el.innerHTML = "";
  const list = document.createElement("div"); list.className = "day-list";
  const evs = eventsOnDate(refDate);
  if (evs.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="big">🗓️</div><div>Aucun cours ce jour-là 😴</div></div>`;
  } else {
    evs.forEach(ev => {
      const card = document.createElement("div"); card.className = "day-card";
      const hasNote = !!notes[eventKey(ev)];
      card.innerHTML = `<div class="stripe" style="background:${ev.color}"></div><div class="content">${hasNote ? `<div style="position:absolute;top:10px;right:14px;">📝</div>` : ""}<div class="time">${pad(ev.startH)}:${pad(ev.startM)} <small>→ ${pad(ev.endH)}:${pad(ev.endM)}</small></div><div class="title">${escapeHtml(ev.title)}</div><div class="meta">${ev.teacher ? `<span>👤 ${escapeHtml(ev.teacher)}</span>` : ""}${ev.room ? `<span>📍 ${escapeHtml(ev.room)}</span>` : ""}</div></div>`;
      card.style.position = "relative";
      card.addEventListener("click", () => openDetail(ev));
      list.appendChild(card);
    });
  }
  el.appendChild(list);
}

function render() {
  updateHeader();
  let target;
  if (currentView === "month") { renderMonth(); target = "monthView"; }
  else if (currentView === "week") { renderTimeGrid("weekView", Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(refDate), i))); target = "weekView"; }
  else if (currentView === "3day") { renderTimeGrid("threeDayView", Array.from({ length: 3 }, (_, i) => addDays(refDate, i))); target = "threeDayView"; }
  else if (currentView === "5day") { renderTimeGrid("fiveDayView", getFiveDayDays()); target = "fiveDayView"; }
  else if (currentView === "6day") { renderTimeGrid("sixDayView", getSixDayDays()); target = "sixDayView"; }
  else if (currentView === "day") { renderDay(); target = "dayView"; }
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === target));
}

/* ============================= Menu mobile (hamburger) ============================= */
function closeMobileMenu() { document.getElementById("mobileMenu").classList.remove("open"); }
function buildMobileMenu() {
  const m = document.getElementById("mobileMenu"); m.innerHTML = "";
  VIEW_ITEMS.forEach(([v, label]) => {
    const b = document.createElement("button"); b.className = "mi" + (v === currentView ? " active" : ""); b.textContent = label;
    b.onclick = () => { closeMobileMenu(); switchView(v); };
    m.appendChild(b);
  });
  const today = document.createElement("button"); today.className = "mi"; today.textContent = "📍 Aujourd'hui";
  today.onclick = () => { closeMobileMenu(); refDate = new Date(); refDate.setHours(0, 0, 0, 0); render(); };
  m.appendChild(today);
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  const abs = document.createElement("div"); abs.className = "mabs";
  abs.innerHTML = `<img class="gi" src="gif/stat.gif" alt="">` + (absences ? `Absences : ${absences.declarees ?? "?"} déclarée(s), ${absences.nonJustifiees ?? "?"} non justifiée(s)` : "Absences : synchronise pour voir");
  abs.onclick = () => { window.open("https://odin.iut.uca.fr/etudiants/?p=absences", "_blank", "noopener"); };
  m.appendChild(abs);
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  const moodle = document.createElement("button"); moodle.className = "mi"; moodle.innerHTML = `<img class="gi" src="gif/link.gif" alt="">Moodle`;
  moodle.onclick = () => { closeMobileMenu(); window.open("https://moodle.uca.fr/", "_blank", "noopener"); };
  m.appendChild(moodle);
  const mail = document.createElement("button"); mail.className = "mi"; mail.innerHTML = `<img class="gi" src="gif/notification.gif" alt="">Messagerie (Zimbra)`;
  mail.onclick = () => { closeMobileMenu(); window.open("https://mail.uca.fr/zimbra/", "_blank", "noopener"); };
  m.appendChild(mail);
  m.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
  const sync = document.createElement("button"); sync.className = "mi msync primary"; sync.innerHTML = `<img class="gi" src="gif/loading.gif" alt="">Synchroniser`;
  sync.onclick = () => { closeMobileMenu(); triggerSync(); };
  m.appendChild(sync);
  const r = document.getElementById("menuBtn").getBoundingClientRect();
  m.style.top = (r.bottom + 6) + "px"; m.style.left = r.left + "px";
}
document.getElementById("menuBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const m = document.getElementById("mobileMenu");
  if (m.classList.contains("open")) { closeMobileMenu(); return; }
  buildMobileMenu(); m.classList.add("open");
});
document.addEventListener("click", (e) => { if (!e.target.closest("#mobileMenu") && !e.target.closest("#menuBtn")) closeMobileMenu(); });
window.addEventListener("resize", () => { closeMobileMenu(); render(); });

/* ============================= Session expirée ============================= */
function renderSessionState(expired) {
  document.getElementById("sessionWarn").classList.toggle("hidden", !expired);
  document.getElementById("sessionBubble").classList.toggle("show", !!expired && isMobileUI());
}

/* ============================= Sync & chargement ============================= */
function renderSyncInfo(iso) {
  document.getElementById("syncInfo").textContent = iso ? "Dernière synchro : " + new Date(iso).toLocaleString("fr-FR") : "Jamais synchronisé";
}
function loadFromStorage() {
  chrome.storage.local.get(["uca_events", "uca_last_sync", "uca_notes", "uca_absences", "uca_releve_notes", "uca_session_expired"], (data) => {
    events = data.uca_events || [];
    notes = data.uca_notes || {};
    absences = data.uca_absences || null;
    releveNotes = data.uca_releve_notes || null;
    renderSyncInfo(data.uca_last_sync);
    renderSessionState(!!data.uca_session_expired);
    renderAbsencesPanel();
    renderNotesPanel();
    if (!autoViewApplied) {
      autoViewApplied = true;
      if (eventsOnDate(refDate).length === 0) currentView = "5day";
    }
    render();
  });
}

function renderAbsencesPanel() {
  const fmt = (v) => (v === null || v === undefined ? "—" : v);
  document.querySelector("#apDeclarees .ap-val").textContent = absences ? fmt(absences.declarees) : "—";
  document.querySelector("#apJustifiees .ap-val").textContent = absences ? fmt(absences.justifiees) : "—";
  document.querySelector("#apNonJustifiees .ap-val").textContent = absences ? fmt(absences.nonJustifiees) : "—";
  document.querySelector("#apMotifs .ap-val").textContent = absences ? fmt(absences.avecMotifs) : "—";
  document.querySelector("#apJourneesNJ .ap-val").textContent = absences ? fmt(absences.journeesNonJustifiees) : "—";
  const btn = document.getElementById("absencesBtn");
  if (btn) btn.innerHTML = `<img class="gi" src="gif/stat.gif" alt="">Absences` + (absences && absences.nonJustifiees ? ` (${absences.nonJustifiees})` : "");
}
document.getElementById("absencesBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("absencesPanel").classList.toggle("open");
});
document.addEventListener("click", (e) => {
  const panel = document.getElementById("absencesPanel");
  if (panel.classList.contains("open") && !document.getElementById("absencesWrap").contains(e.target)) panel.classList.remove("open");
});

/* Relevé de notes : tableau hiérarchique UE > matière > évaluation (format Odin réel
   confirmé, voir background.js parseNotesText). Construit en DOM (pas d'innerHTML sur
   les libellés, qui viennent du scraping d'une page externe donc non fiables). */
function fmtNote(v) { return v === null || v === undefined ? "—" : String(v).replace(".", ","); }
function ntCell(text, cls) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}
function ntRow(cls, label, labelCls, row) {
  const tr = document.createElement("tr");
  tr.className = cls;
  tr.appendChild(ntCell(label, labelCls));
  tr.appendChild(ntCell(fmtNote(row.coeff), "num"));
  tr.appendChild(ntCell(fmtNote(row.note), "num note"));
  tr.appendChild(ntCell(fmtNote(row.moy), "num"));
  tr.appendChild(ntCell(fmtNote(row.maxi), "num"));
  tr.appendChild(ntCell(fmtNote(row.mini), "num"));
  return tr;
}
// Odin ne remplit souvent la note de matière/UE qu'au jury de semestre (colonne "-"
// avant ça). On reconstruit depuis le niveau en dessous en appliquant le Coeff de
// chaque ligne du tableau (éval -> matière -> UE), jamais un poids par défaut inventé.
function weightedAvg(items, noteOf, coeffOf) {
  let sw = 0, sc = 0;
  items.forEach((it) => {
    const note = noteOf(it);
    const coeff = coeffOf(it);
    if (note == null || coeff == null) return;
    sw += note * coeff; sc += coeff;
  });
  return sc ? sw / sc : null;
}
function matiereEffectiveNote(m) {
  if (m.note != null) return m.note;
  return weightedAvg((m.evals || []).filter((e) => e.note != null), (e) => e.note, (e) => e.coeff);
}
function ueEffectiveNote(ue) {
  if (ue.note != null) return ue.note;
  const mats = (ue.matieres || []).map((m) => ({ note: matiereEffectiveNote(m), coeff: m.coeff })).filter((m) => m.note != null);
  return weightedAvg(mats, (m) => m.note, (m) => m.coeff);
}
function generalAverage() {
  if (!releveNotes || !releveNotes.ue || !releveNotes.ue.length) return null;
  const ues = releveNotes.ue.map((ue) => ({ note: ueEffectiveNote(ue), coeff: ue.coeff })).filter((u) => u.note != null);
  return weightedAvg(ues, (u) => u.note, (u) => u.coeff);
}
function renderNotesAvg() {
  const badge = document.getElementById("notesAvg");
  const avg = generalAverage();
  if (avg == null) { badge.classList.add("hidden"); badge.textContent = ""; return; }
  badge.textContent = avg.toFixed(2).replace(".", ",");
  badge.classList.remove("hidden");
}
function renderNotesPanel() {
  renderNotesAvg();
  const content = document.getElementById("npContent");
  content.innerHTML = "";
  if (!releveNotes || !releveNotes.ue || !releveNotes.ue.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty";
    empty.textContent = "Aucun relevé — synchronise pour voir tes notes";
    content.appendChild(empty);
  } else {
    const table = document.createElement("table");
    table.className = "notes-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Matière</th><th class="num">Coeff</th><th class="num">Note</th><th class="num">Moy</th><th class="num">Maxi</th><th class="num">Mini</th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    // Garde-fou si du relevé mis en cache avant le dédoublonnage côté parsing traîne
    // encore en storage : une matière/éval déjà affichée (même titre exact) ne se
    // réaffiche pas une 2e fois ailleurs dans le tableau.
    const seenMatieres = new Set();
    releveNotes.ue.forEach((ue) => {
      const matieres = (ue.matieres || []).filter((m) => {
        if (seenMatieres.has(m.label)) return false;
        seenMatieres.add(m.label);
        return true;
      });
      if (!matieres.length) return;
      tbody.appendChild(ntRow("ue-row", ue.label, "lbl", ue));
      matieres.forEach((m) => {
        tbody.appendChild(ntRow("matiere-row" + (m.note == null ? " no-grade" : ""), m.label, "lbl", m));
        const seenEvals = new Set();
        (m.evals || []).forEach((ev) => {
          if (seenEvals.has(ev.label)) return;
          seenEvals.add(ev.label);
          tbody.appendChild(ntRow("eval-row", ev.label, "lbl", ev));
        });
      });
    });
    table.appendChild(tbody);
    content.appendChild(table);
  }
  const btn = document.getElementById("notesBtn");
  if (btn) btn.innerHTML = `<img class="gi" src="gif/Learning.gif" alt="">Notes`;
}
document.getElementById("notesBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("notesPanel").classList.toggle("open");
});
document.addEventListener("click", (e) => {
  const panel = document.getElementById("notesPanel");
  if (panel.classList.contains("open") && !document.getElementById("notesWrap").contains(e.target)) panel.classList.remove("open");
});

document.getElementById("viewTabs").addEventListener("click", (e) => { const btn = e.target.closest("button[data-view]"); if (!btn) return; switchView(btn.dataset.view); });
document.getElementById("prevBtn").addEventListener("click", () => navigate(-1));
document.getElementById("nextBtn").addEventListener("click", () => navigate(1));
document.getElementById("todayBtn").addEventListener("click", () => { refDate = new Date(); refDate.setHours(0, 0, 0, 0); render(); });

/* Vue mois : scroller la molette change de mois (la grille ne défile pas elle-même,
   42 cases fixes), avec un cooldown pour qu'un seul cran de molette = un seul mois. */
let monthWheelLock = false;
document.getElementById("monthView").addEventListener("wheel", (e) => {
  if (currentView !== "month" || monthWheelLock) return;
  e.preventDefault();
  monthWheelLock = true;
  navigate(e.deltaY > 0 ? 1 : -1);
  setTimeout(() => { monthWheelLock = false; }, 350);
}, { passive: false });

function setZoom(z) {
  zoomLevel = Math.max(0.6, Math.min(1.8, z));
  localStorage.setItem("uca_zoom_v1", String(zoomLevel));
  document.getElementById("zoomPct").textContent = Math.round(zoomLevel * 100) + "%";
  render();
}
document.getElementById("zoomOutBtn").addEventListener("click", () => setZoom(zoomLevel - 0.15));
document.getElementById("zoomInBtn").addEventListener("click", () => setZoom(zoomLevel + 0.15));
document.getElementById("zoomPct").textContent = Math.round(zoomLevel * 100) + "%";

const syncBtn = document.getElementById("syncBtn");
function triggerSync() {
  syncBtn.disabled = true;
  toast("🔄 Synchronisation…");
  chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: "resync" });
}
syncBtn.addEventListener("click", triggerSync);

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "UCA_SYNC_PROGRESS") {
    const labels = {
      "resync": "🔄 Vérification de ta session…",
      "login-opening": "🔑 Ouverture de la fenêtre de connexion…",
      "login-waiting": "⏳ Connecte-toi (identifiant, 2FA)… prends ton temps.",
      "scraping": "📋 Récupération de ton emploi du temps…"
    };
    if (labels[msg.stage]) toast(labels[msg.stage]);
  } else if (msg.type === "UCA_SYNC_RESULT") {
    syncBtn.disabled = false;
    if (!msg.ok) { toast("❌ " + (msg.error || "Erreur"), "warn"); return; }
    toast(msg.silent ? "✅ Resynchronisé automatiquement" : "✅ Connecté et synchronisé", "ok");
    loadFromStorage();
  } else if (msg.type === "UCA_ABSENCES_RESULT") {
    if (msg.ok) { absences = msg.absences; renderAbsencesPanel(); buildMobileMenu(); }
  } else if (msg.type === "UCA_NOTES_RESULT") {
    if (msg.ok) { releveNotes = msg.releve; renderNotesPanel(); }
  }
});

loadFromStorage();
})();
