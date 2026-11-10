/* Journal d'activité (la cloche de l'agenda) : ce qui s'est passé à chaque synchro (cours ajouté, annulé,
   déplacé, salle changée, nouvelle note, seuil d'absences), conservé 30 jours dans chrome.storage.local
   (uca_activity) pour être relu quand on veut, au lieu d'une rafale de notifications système.
   Les changements sur des cours déjà passés sont gardés mais marqués « passé » et ne comptent pas comme non lus.
   Partagé par l'arrière-plan (merge, entrées) et les 4 designs (panneau). Panneau construit avec des nœuds DOM
   et textContent uniquement : les intitulés viennent d'Odin. */
(function (root) {
"use strict";

const KEY = "uca_activity", SEEN_KEY = "uca_activity_seen";
const MAX_ENTRIES = 150, TTL_MS = 30 * 86400000;
const KINDS = ["edt", "grade", "absence"];
const ICONS = { added: "➕", cancelled: "🚫", moved: "🔁", room: "🚪", time: "⏰", title: "✏️", teacher: "👤", info: "ℹ️", grade: "📊", absence: "⚠️" };

function clip(s, n) { return String(s === undefined || s === null ? "" : s).slice(0, n); }

/* Garde la bonne forme (stockage ancien, import, lien de partage). */
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((e) => e && typeof e.id === "string" && KINDS.includes(e.kind) && Number.isFinite(Number(e.at))).map((e) => ({
    id: clip(e.id, 160), at: Number(e.at), kind: e.kind, type: clip(e.type, 20),
    title: clip(e.title, 200), text: clip(e.text, 400),
    day: /^\d{4}-\d{2}-\d{2}$/.test(e.day || "") ? e.day : "", past: !!e.past,
  }));
}

/* Ajoute des entrées au journal : doublons (même id) ignorés, plus récent d'abord, 30 jours et 150 entrées max. */
function merge(existing, entries, now) {
  const t = now === undefined ? Date.now() : now;
  const seen = new Set(), out = [];
  sanitize(entries).concat(sanitize(existing)).forEach((e) => {
    if (seen.has(e.id) || t - e.at > TTL_MS) return;
    seen.add(e.id); out.push(e);
  });
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, MAX_ENTRIES);
}

/* Non lus : entrées postérieures à la dernière ouverture de la cloche, sauf celles sur un cours déjà passé. */
function unread(log, seenAt) {
  const s = Number(seenAt) || 0;
  return sanitize(log).filter((e) => e.at > s && !e.past);
}

function when(at, now) {
  const t = now === undefined ? Date.now() : now, min = Math.round((t - at) / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const d0 = new Date(t); d0.setHours(0, 0, 0, 0);
  const hm = new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (at >= d0.getTime()) return `Aujourd'hui, ${hm}`;
  if (at >= d0.getTime() - 86400000) return `Hier, ${hm}`;
  return new Date(at).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + `, ${hm}`;
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

let styled = false;
function addStyle() {
  if (styled || !document.head) return; styled = true;
  const st = document.createElement("style");
  st.textContent = `.act-panel .act-empty{padding:18px 16px;color:var(--text-dim);font-size:13px;text-align:center;}
.act-panel .act-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 14px 8px;font-size:12px;color:var(--text-dim);}
.act-panel .act-head button{font:inherit;font-size:12px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:8px;padding:3px 9px;cursor:pointer;}
.act-panel .act-list{max-height:min(60vh,440px);overflow-y:auto;}
.act-panel .act-day{padding:8px 14px 2px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-dim);}
.act-panel .act-item{display:flex;gap:10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);padding:9px 14px;font:inherit;cursor:default;white-space:normal;box-sizing:border-box;min-width:0;height:auto!important;min-height:0!important;border-radius:0!important;box-shadow:none!important;align-items:flex-start;}
.act-panel button.act-item{cursor:pointer;}
.act-panel .act-item:hover{background:var(--surface-2,rgba(128,128,128,.08));}
.act-panel .act-ic{flex:none;width:22px;text-align:center;}
.act-panel .act-tx{flex:1;min-width:0;}
.act-panel .act-tx b{display:block;font-size:13px;font-weight:700;overflow-wrap:anywhere;}
.act-panel .act-tx span{display:block;font-size:12px;color:var(--text-dim);overflow-wrap:anywhere;}
.act-panel .act-tx small{display:block;font-size:11px;color:var(--text-dim);margin-top:2px;}
.act-panel .act-item.past{opacity:.6;}
.act-panel .act-item.new .act-tx b::after{content:"";display:inline-block;width:7px;height:7px;margin-left:6px;border-radius:50%;background:var(--danger,#d93025);vertical-align:middle;}
.act-panel .act-tag{display:inline-block;margin-left:6px;padding:0 6px;border-radius:6px;border:1px solid var(--border);font-size:10px;font-weight:700;color:var(--text-dim);vertical-align:middle;}`;
  document.head.appendChild(st);
}

/* opts : { log, seenAt, now, onOpenDay(day), onClear() } */
function buildPanel(panel, opts) {
  addStyle();
  const o = opts || {}, log = sanitize(o.log), seenAt = Number(o.seenAt) || 0, now = o.now === undefined ? Date.now() : o.now;
  panel.classList.add("act-panel");
  const keep = panel.querySelector(".panel-modal-topbar");
  panel.textContent = "";
  if (keep) panel.appendChild(keep);
  const head = el("div", "act-head");
  head.appendChild(el("span", "", log.length ? `${log.length} évènement${log.length > 1 ? "s" : ""} · 30 derniers jours` : ""));
  if (log.length && o.onClear) {
    const b = el("button", "", "Tout effacer"); b.type = "button"; b.onclick = () => o.onClear();
    head.appendChild(b);
  }
  panel.appendChild(head);
  if (!log.length) {
    panel.appendChild(el("div", "act-empty", "Rien à signaler pour l'instant. À chaque synchronisation, les changements d'emploi du temps et les nouvelles notes apparaissent ici."));
    return;
  }
  const list = el("div", "act-list"); panel.appendChild(list);
  let lastDay = "";
  log.forEach((e) => {
    const d = new Date(e.at); d.setHours(0, 0, 0, 0);
    const label = (() => { const diff = Math.round((new Date(now).setHours(0, 0, 0, 0) - d.getTime()) / 86400000); return diff <= 0 ? "Aujourd'hui" : diff === 1 ? "Hier" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); })();
    if (label !== lastDay) { list.appendChild(el("div", "act-day", label)); lastDay = label; }
    const clickable = !!(e.day && o.onOpenDay);
    const row = el(clickable ? "button" : "div", "act-item" + (e.past ? " past" : "") + (e.at > seenAt && !e.past ? " new" : ""));
    if (clickable) { row.type = "button"; row.onclick = () => o.onOpenDay(e.day); }
    row.appendChild(el("div", "act-ic", ICONS[e.type] || ICONS[e.kind] || "•"));
    const tx = el("div", "act-tx");
    const b = el("b", "", e.title);
    if (e.past) b.appendChild(el("i", "act-tag", "passé"));
    tx.appendChild(b);
    if (e.text) tx.appendChild(el("span", "", e.text));
    tx.appendChild(el("small", "", when(e.at, now)));
    row.appendChild(tx);
    list.appendChild(row);
  });
}

const api = { KEY, SEEN_KEY, MAX_ENTRIES, TTL_MS, sanitize, merge, unread, when, buildPanel };
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.UCA_ACTIVITY = api;
})(typeof self !== "undefined" ? self : this);
