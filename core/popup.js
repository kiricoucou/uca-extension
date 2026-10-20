/* Logique du popup, commune à tous les designs (visuel : window.UCA_DESIGN). */
(function () {
"use strict";

const D = window.UCA_DESIGN;
const T = D.t;

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function pad(n) { return String(n).padStart(2, "0"); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function $(id) { return document.getElementById(id); }
let changes = new Map();
function eventKey(ev) { return ev.date + "_" + pad(ev.startH) + ":" + pad(ev.startM) + "_" + ev.title; }
function eventColorKey(title) { return title.replace(/\b(CM|TD|TDA|TP|TPA)\b/gi, "").trim() || title; }

function setStatus(msg) {
  const el = $("status");
  if (!msg) { el.classList.remove("show"); el.textContent = ""; return; }
  el.textContent = msg; el.classList.add("show");
}

function setBusy(busy) {
  $("loginBtn").disabled = busy;
  $("syncBtn").disabled = busy;
}

function renderLastSync(iso) {
  $("lastSync").textContent = iso ? "Dernière synchro : " + new Date(iso).toLocaleString("fr-FR") : "Jamais synchronisé";
}

function metaText(ev) {
  if (D.grid.metaMerged) return [ev.teacher, ev.room].filter(Boolean).join(" · ");
  return [ev.teacher && T("teacherPrefix") + ev.teacher, ev.room && T("roomPrefix") + ev.room].filter(Boolean).join(" ");
}

function renderEvents(events) {
  const list = $("list");
  list.innerHTML = "";
  if (!events || events.length === 0) {
    list.innerHTML = `<div class="empty"><div class="big">${D.emptyHtml("popup")}</div>${escapeHtml(T("noEvents"))}<br>${escapeHtml(T("noEventsHint"))}</div>`;
    return;
  }
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
  const upcoming = events.filter(e => e.date >= todayKey && UCA_TOOLS.passes(e)).sort((a, b) => a.date.localeCompare(b.date) || (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
  const groups = {};
  upcoming.slice(0, 40).forEach(e => { (groups[e.date] = groups[e.date] || []).push(e); });
  Object.keys(groups).sort().forEach(dk => {
    const items = groups[dk];
    const d = new Date(items[0].year, items[0].month, items[0].day);
    const g = document.createElement("div"); g.className = "day-group";
    const head = document.createElement("div"); head.className = "day-head";
    head.textContent = DAY_NAMES[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
    g.appendChild(head);
    items.forEach(ev => {
      const isToday = dk === todayKey;
      const state = isToday && nowMin >= ev.endH * 60 + ev.endM ? "past" : (isToday && nowMin >= ev.startH * 60 + ev.startM ? "current" : "");
      const row = document.createElement("div"); row.className = "ev" + (state ? " " + state : "");
      row.innerHTML = `<div class="stripe" style="background:${D.eventColor(eventColorKey(ev.title))}"></div>
        <div class="time">${pad(ev.startH)}:${pad(ev.startM)}–${pad(ev.endH)}:${pad(ev.endM)}${state === "current" ? `<span class="ev-state">${escapeHtml(T("current"))}</span>` : ""}</div>
        <div class="info"><div class="title">${changes.has(eventKey(ev)) ? D.changeBadge(changes.get(eventKey(ev)).type) : ""}${escapeHtml(ev.title)}</div>
        <div class="meta">${escapeHtml(metaText(ev))}</div></div>`;
      g.appendChild(row);
    });
    list.appendChild(g);
  });
}

function renderSessionState(expired) {
  if (expired) $("lastSync").innerHTML = `<span class="session-expired">${D.icon("alert")}${escapeHtml(T("sessionExpired"))}</span>`;
}

function renderConnectionButtons(connected) {
  $("loginBtn").classList.toggle("hidden", connected);
  $("logoutBtn").classList.toggle("hidden", !connected);
}

function loadFromStorage() {
  chrome.storage.local.get(["uca_events", "uca_last_sync", "uca_session_expired", "uca_edt_changes"], (data) => {
    changes = new Map((data.uca_edt_changes || []).filter(c => c.type !== "cancelled").map(c => [c.key, c]));
    renderLastSync(data.uca_last_sync);
    renderEvents(data.uca_events);
    renderSessionState(!!data.uca_session_expired);
    renderConnectionButtons(!!data.uca_last_sync && !data.uca_session_expired);
  });
}

/* ============================= Déconnexion ============================= */
function formatDuration(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts = [];
  if (days) parts.push(days + " jour" + (days > 1 ? "s" : ""));
  if (hours) parts.push(hours + " heure" + (hours > 1 ? "s" : ""));
  if (minutes || parts.length === 0) parts.push(minutes + " minute" + (minutes > 1 ? "s" : ""));
  return parts.join(" ");
}

$("logoutBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "UCA_SESSION_INFO_REQUEST" }, (res) => {
    const dur = res && formatDuration(res.ms);
    $("logoutText").textContent = dur
      ? `Voulez-vous vraiment vous déconnecter ? Votre session reste valable encore ${dur}.`
      : "Voulez-vous vraiment vous déconnecter ?";
    $("logoutOverlay").classList.remove("hidden");
  });
});
$("logoutCancelBtn").addEventListener("click", () => $("logoutOverlay").classList.add("hidden"));
$("logoutConfirmBtn").addEventListener("click", () => {
  const btn = $("logoutConfirmBtn");
  btn.disabled = true;
  chrome.runtime.sendMessage({ type: "UCA_LOGOUT_REQUEST" }, () => {
    btn.disabled = false;
    $("logoutOverlay").classList.add("hidden");
    setStatus(T("loggedOut"));
    setTimeout(() => setStatus(null), 2500);
    loadFromStorage();
  });
});

/* ============================= Actions ============================= */
$("agendaBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: new URL("agenda.html", location.href).href });
});
$("loginBtn").addEventListener("click", () => {
  setBusy(true); setStatus(T("loginOpening"));
  chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: "login" });
});
$("syncBtn").addEventListener("click", () => {
  setBusy(true); setStatus(T("syncing"));
  chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: "resync" });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "UCA_SYNC_PROGRESS") {
    const label = T("stage_" + msg.stage);
    if (label) setStatus(label);
  } else if (msg.type === "UCA_SYNC_RESULT") {
    setBusy(false);
    if (!msg.ok) { setStatus(T("errorPrefix") + (msg.error || "Erreur")); return; }
    setStatus(msg.silent ? T("syncSilent") : T("syncOk"));
    setTimeout(() => setStatus(null), 3000);
    loadFromStorage();
  } else if (msg.type === "UCA_UPDATE_STATE") {
    UCA_CORE.renderUpdate(msg.updateAvailable, msg.current, msg.latest);
  }
});

UCA_CORE.initUpdate();
UCA_CORE.initDesignSwitch(false);
UCA_CORE.initSettings();
UCA_TOOLS.load(loadFromStorage);
})();
