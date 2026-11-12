/* Journal d'activité (la cloche de l'agenda) : ce qui s'est passé à chaque synchro (cours ajouté, annulé,
   déplacé, salle changée, nouvelle note, seuil d'absences), conservé 30 jours (réglable : 7 à 90 jours ou illimité) dans chrome.storage.local
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
    day: /^\d{4}-\d{2}-\d{2}$/.test(e.day || "") ? e.day : "", past: !!e.past, kept: !!e.kept,
  }));
}

/* Ajoute des entrées au journal : doublons (même id) ignorés, plus récent d'abord. opts : { keepDays (0 = illimité, défaut 30),
   dismissed (ids supprimés par l'utilisateur : jamais ré-ajoutés) }. Les entrées « gardées » ne sont jamais supprimées ni
   comptées dans la limite de 150. */
function merge(existing, entries, now, opts) {
  const t = now === undefined ? Date.now() : now, o = opts || {};
  const days = o.keepDays === undefined ? 30 : Number(o.keepDays);
  const ttl = days > 0 ? days * 86400000 : Infinity;
  const gone = new Set(o.dismissed || []);
  const seen = new Set(), out = [];
  sanitize(entries).concat(sanitize(existing)).forEach((e) => {
    if (seen.has(e.id) || gone.has(e.id)) return;
    if (!e.kept && t - e.at > ttl) return;
    seen.add(e.id); out.push(e);
  });
  out.sort((a, b) => b.at - a.at);
  const kept = out.filter((e) => e.kept), rest = out.filter((e) => !e.kept).slice(0, MAX_ENTRIES);
  return kept.concat(rest).sort((a, b) => b.at - a.at);
}

/* Gestion par l'utilisateur (renvoient un nouveau journal). */
function toggleKeep(log, id) { return sanitize(log).map((e) => (e.id === id ? Object.assign({}, e, { kept: !e.kept }) : e)); }
function remove(log, id) { return sanitize(log).filter((e) => e.id !== id); }
function clearExceptKept(log) { return sanitize(log).filter((e) => e.kept); }
function filterLog(log, mode, seenAt) {
  const s = Number(seenAt) || 0;
  return sanitize(log).filter((e) => (mode === "unread" ? e.at > s && !e.past : mode === "kept" ? e.kept : true));
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
.act-panel .act-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px;}
.act-panel .act-chip{font:inherit;font-size:12px;min-height:28px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:999px;padding:3px 11px;cursor:pointer;}
.act-panel .act-chip.on{background:var(--accent);color:var(--on-accent,#fff);border-color:transparent;font-weight:700;}
.act-panel .act-item.kept .act-tx b::before{content:"★ ";color:var(--accent);}
.act-panel .act-acts{display:flex;gap:6px;margin-top:6px;}
.act-panel .act-acts button{font:inherit;font-size:11.5px;min-height:26px;border:1px solid var(--border);background:transparent;color:var(--text);border-radius:8px;padding:2px 9px;cursor:pointer;}
.act-panel .act-acts button.del{color:var(--danger,#d93025);}
.act-panel .act-tx.go{cursor:pointer;}
.act-panel .act-item.new .act-tx b::after{content:"";display:inline-block;width:7px;height:7px;margin-left:6px;border-radius:50%;background:var(--danger,#d93025);vertical-align:middle;}
.act-panel .act-tag{display:inline-block;margin-left:6px;padding:0 6px;border-radius:6px;border:1px solid var(--border);font-size:10px;font-weight:700;color:var(--text-dim);vertical-align:middle;}`;
  document.head.appendChild(st);
}

/* opts : { log, seenAt, now, onOpenDay(day), onChange(nouveauJournal, idsSupprimes) } */
function buildPanel(panel, opts) {
  addStyle();
  const o = opts || {}, all = sanitize(o.log), seenAt = Number(o.seenAt) || 0, now = o.now === undefined ? Date.now() : o.now;
  const mode = panel._actFilter || "all";
  const log = filterLog(all, mode, seenAt);
  panel.classList.add("act-panel");
  const keep = panel.querySelector(".panel-modal-topbar");
  panel.textContent = "";
  if (keep) panel.appendChild(keep);
  const redraw = () => buildPanel(panel, Object.assign({}, o, { log: panel._actLog || all }));
  const change = (next, removed) => { panel._actLog = next; if (o.onChange) o.onChange(next, removed || []); redraw(); };
  const head = el("div", "act-head");
  head.appendChild(el("span", "", all.length ? `${all.length} évènement${all.length > 1 ? "s" : ""}` : ""));
  if (all.length && o.onChange) {
    const b = el("button", "", "Tout supprimer sauf les gardées"); b.type = "button";
    b.onclick = () => change(clearExceptKept(all), all.filter((e) => !e.kept).map((e) => e.id));
    head.appendChild(b);
  }
  panel.appendChild(head);
  if (all.length) {
    const chips = el("div", "act-chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Filtrer");
    const unreadN = filterLog(all, "unread", seenAt).length, keptN = all.filter((e) => e.kept).length;
    [["all", "Toutes"], ["unread", "Non lues" + (unreadN ? ` (${unreadN})` : "")], ["kept", "Gardées" + (keptN ? ` (${keptN})` : "")]].forEach(([id, label]) => {
      const c = el("button", "act-chip" + (mode === id ? " on" : ""), label); c.type = "button"; c.setAttribute("aria-pressed", String(mode === id));
      c.onclick = () => { panel._actFilter = id; redraw(); };
      chips.appendChild(c);
    });
    panel.appendChild(chips);
  }
  if (!all.length) {
    panel.appendChild(el("div", "act-empty", "Rien à signaler pour l'instant. À chaque synchronisation, les changements d'emploi du temps et les nouvelles notes apparaissent ici."));
    return;
  }
  if (!log.length) { panel.appendChild(el("div", "act-empty", mode === "kept" ? "Aucune notification gardée : touche « Garder » sur celles à conserver." : "Rien de non lu.")); return; }
  const list = el("div", "act-list"); panel.appendChild(list);
  let lastDay = "";
  log.forEach((e) => {
    const d = new Date(e.at); d.setHours(0, 0, 0, 0);
    const label = (() => { const diff = Math.round((new Date(now).setHours(0, 0, 0, 0) - d.getTime()) / 86400000); return diff <= 0 ? "Aujourd'hui" : diff === 1 ? "Hier" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); })();
    if (label !== lastDay) { list.appendChild(el("div", "act-day", label)); lastDay = label; }
    const clickable = !!(e.day && o.onOpenDay);
    const row = el("div", "act-item" + (e.past ? " past" : "") + (e.at > seenAt && !e.past ? " new" : "") + (e.kept ? " kept" : ""));
    row.appendChild(el("div", "act-ic", ICONS[e.type] || ICONS[e.kind] || "•"));
    const tx = el("div", "act-tx" + (clickable ? " go" : ""));
    if (clickable) { tx.setAttribute("role", "button"); tx.tabIndex = 0; tx.onclick = () => o.onOpenDay(e.day); tx.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); o.onOpenDay(e.day); } }; }
    const b = el("b", "", e.title);
    if (e.past) b.appendChild(el("i", "act-tag", "passé"));
    tx.appendChild(b);
    if (e.text) tx.appendChild(el("span", "", e.text));
    tx.appendChild(el("small", "", when(e.at, now)));
    if (o.onChange) {
      const acts = el("div", "act-acts");
      const k = el("button", "", e.kept ? "★ Gardée" : "☆ Garder"); k.type = "button"; k.setAttribute("aria-pressed", String(!!e.kept));
      k.onclick = (ev) => { ev.stopPropagation(); change(toggleKeep(all, e.id)); };
      const x = el("button", "del", "Supprimer"); x.type = "button";
      x.onclick = (ev) => { ev.stopPropagation(); change(remove(all, e.id), [e.id]); };
      acts.append(k, x); tx.appendChild(acts);
    }
    row.appendChild(tx);
    list.appendChild(row);
  });
}

const api = { KEY, SEEN_KEY, MAX_ENTRIES, TTL_MS, sanitize, merge, toggleKeep, remove, clearExceptKept, filterLog, unread, when, buildPanel };
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.UCA_ACTIVITY = api;
})(typeof self !== "undefined" ? self : this);
