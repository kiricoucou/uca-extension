(function () {
"use strict";

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function pad(n) { return String(n).padStart(2, "0"); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function setStatus(msg) {
  const el = document.getElementById("status");
  if (!msg) { el.classList.remove("show"); el.textContent = ""; return; }
  el.textContent = msg; el.classList.add("show");
}

function setBusy(busy) {
  document.getElementById("loginBtn").disabled = busy;
  document.getElementById("syncBtn").disabled = busy;
}

function renderLastSync(iso) {
  const el = document.getElementById("lastSync");
  if (!iso) { el.textContent = "Jamais synchronisé"; return; }
  el.textContent = "Dernière synchro : " + new Date(iso).toLocaleString("fr-FR");
}

function renderEvents(events) {
  const list = document.getElementById("list");
  list.innerHTML = "";
  if (!events || events.length === 0) {
    list.innerHTML = `<div class="empty"><div class="big">🗓️</div>Aucun emploi du temps.<br>Connecte-toi pour le récupérer.</div>`;
    return;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
  const upcoming = events.filter(e => e.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date) || (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
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
      const row = document.createElement("div"); row.className = "ev";
      row.innerHTML = `<div class="stripe" style="background:${ev.color}"></div>
        <div class="time">${pad(ev.startH)}:${pad(ev.startM)}–${pad(ev.endH)}:${pad(ev.endM)}</div>
        <div class="info"><div class="title">${escapeHtml(ev.title)}</div>
        <div class="meta">${ev.teacher ? "👤 " + escapeHtml(ev.teacher) + " " : ""}${ev.room ? "📍 " + escapeHtml(ev.room) : ""}</div></div>`;
      g.appendChild(row);
    });
    list.appendChild(g);
  });
}

function renderSessionState(expired) {
  const el = document.getElementById("lastSync");
  if (expired) { el.innerHTML = `<span style="color:var(--danger);font-weight:700;"><img class="gi" src="gif/security.gif" alt="">Session expirée, reconnecte-toi</span>`; }
}

function loadFromStorage() {
  chrome.storage.local.get(["uca_events", "uca_last_sync", "uca_session_expired"], (data) => {
    renderLastSync(data.uca_last_sync);
    renderEvents(data.uca_events);
    renderSessionState(!!data.uca_session_expired);
  });
}

document.getElementById("agendaBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("agenda.html") });
});
document.getElementById("loginBtn").addEventListener("click", () => {
  setBusy(true); setStatus("🔑 Ouverture de la connexion UCA…");
  chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: "login" });
});
document.getElementById("syncBtn").addEventListener("click", () => {
  setBusy(true); setStatus("🔄 Synchronisation…");
  chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: "resync" });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "UCA_SYNC_PROGRESS") {
    const labels = {
      "resync": "🔄 Vérification de ta session…",
      "login-opening": "🔑 Ouverture de la fenêtre de connexion…",
      "login-waiting": "⏳ Connecte-toi (identifiant, 2FA)…",
      "scraping": "📋 Récupération de ton emploi du temps…"
    };
    if (labels[msg.stage]) setStatus(labels[msg.stage]);
  } else if (msg.type === "UCA_SYNC_RESULT") {
    setBusy(false);
    if (!msg.ok) { setStatus("❌ " + (msg.error || "Erreur")); return; }
    setStatus(msg.silent ? "✅ Resynchronisé automatiquement" : "✅ Connecté et synchronisé");
    setTimeout(() => setStatus(null), 3000);
    loadFromStorage();
  }
});

loadFromStorage();
})();
