/* Widgets de My UCA : 25 petits blocs (cours, devoirs, notes, absences, état de la connexion…) partagés entre
   - l'app web (PWA) : écran « Mes widgets » (app/shell.js), rendu HTML par UCA_WIDGETS.render() ;
   - l'app Android : snapshot() résume les données utiles dans un JSON compact, poussé au code natif (pont AndroidUCA),
     qui dessine les vrais widgets de l'écran d'accueil (WidgetModel.kt reprend les calculs de derive()).
   Tout est calculé sur l'appareil, rien n'est envoyé nulle part. Les textes saisis sont toujours échappés. */
(function (root) {
"use strict";

const DAY = 86400000, MIN = 60000;
const pad = (n) => String(n).padStart(2, "0");
const hm = (h, m) => pad(h) + ":" + pad(m);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const SHORT_DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function fmtNote(n) { return n == null || !Number.isFinite(n) ? "—" : (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ","); }
function typeOf(title) {
  const m = String(title || "").match(/\b(CM|TDA?|TPA?|Examen|DS|Partiel)\b/i);
  if (!m) return "Autre";
  const t = m[1].toUpperCase();
  return t.startsWith("TD") ? "TD" : t.startsWith("TP") ? "TP" : t === "CM" ? "CM" : "Examen";
}
function subjectOf(title) {
  title = String(title || "");
  const code = title.match(/^(SAE|R)\s?\d+(?:\.\d+)*/i);
  if (code) return code[0].replace(/\s/g, "").toUpperCase();
  return title.replace(/\b(CM|TDA?|TPA?|Examen)\b/gi, "").replace(/[:\-–]\s*$/, "").replace(/\s+/g, " ").trim() || title;
}
function dayStart(now, off) { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (off || 0)); return d.getTime(); }
function parseDue(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; }
function isoWeek(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / DAY - 3 + ((w1.getDay() + 6) % 7)) / 7); }
function durText(min) { min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h} h ${pad(m)}` : `${h} h`) : `${m} min`; }
function agoText(ms, now) { if (!ms) return "jamais"; const m = Math.max(0, Math.round((now - ms) / MIN)); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 48 * 60 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} jours`; }
function gradeColor(n) { return n == null ? "var(--uw-dim)" : n >= 14 ? "#2fd68f" : n >= 10 ? "#4aa3df" : n >= 8 ? "#ff8c1a" : "#ef6b6b"; }
function dueInfo(dueMs, now) {
  if (dueMs === null) return { text: "Sans date", level: "none", days: null };
  const days = Math.round((dueMs - dayStart(now, 0)) / DAY);
  if (days < 0) return { text: `En retard de ${-days} jour${days < -1 ? "s" : ""}`, level: "late", days };
  if (days === 0) return { text: "Aujourd'hui", level: "today", days };
  if (days === 1) return { text: "Demain", level: "soon", days };
  return { text: `Dans ${days} jours`, level: days <= 3 ? "soon" : "later", days };
}

/* ---------------------------------------------------------------------------------------------
   snapshot : résumé compact (JSON) des données utiles aux widgets. d = contenu du stockage de l'app.
   --------------------------------------------------------------------------------------------- */
function snapshot(d, now) {
  d = d || {}; now = now == null ? Date.now() : now;
  const G = root.UCA_GRADES;
  // Du lundi de la semaine en cours (pour la charge de la semaine) jusqu'à 21 jours devant.
  const mon0 = new Date(dayStart(now, 0)); mon0.setDate(mon0.getDate() - ((mon0.getDay() + 6) % 7));
  const from = mon0.getTime(), to = dayStart(now, 0) + 21 * DAY;
  const all = (Array.isArray(d.uca_events) ? d.uca_events : []).filter((e) => e && Number.isFinite(e.year) && Number.isFinite(e.startH));
  const startMs = (e) => new Date(e.year, e.month, e.day, e.startH, e.startM || 0).getTime();
  const endMs = (e) => new Date(e.year, e.month, e.day, e.endH, e.endM || 0).getTime();
  const comp = (e) => ({ t: String(e.title || "").slice(0, 90), s: subjectOf(e.title).slice(0, 40), k: typeOf(e.title), y: e.year, m: e.month, d: e.day, sh: e.startH, sm: e.startM || 0, eh: e.endH, em: e.endM || 0, r: String(e.room || "").slice(0, 40), p: String(e.teacher || "").slice(0, 60), x: e.cancelled ? 1 : 0 });
  const events = all.map((e) => ({ e, ms: startMs(e) })).filter((o) => o.ms >= from && o.ms < to).sort((a, b) => a.ms - b.ms).slice(0, 250).map((o) => comp(o.e));
  const exams = all.filter((e) => !e.cancelled && typeOf(e.title) === "Examen" && endMs(e) > now && startMs(e) < now + 150 * DAY)
    .sort((a, b) => startMs(a) - startMs(b)).slice(0, 8).map(comp);

  let rel = d.uca_releve_notes || null;
  if (rel && G && G.applyScales) { try { rel = G.applyScales(rel, d.uca_scales || {}); } catch (e) { /* relevé brut */ } }
  let avg = null; const matieres = [], evals = [];
  if (rel && G && Array.isArray(rel.ue)) {
    try { avg = G.generalAvg(rel); } catch (e) { avg = null; }
    rel.ue.forEach((ue) => (ue.matieres || []).forEach((m) => {
      let note = null; try { note = G.matiereNote(m); } catch (e) { note = m.note; }
      if (note != null && Number.isFinite(note) && !matieres.some((x) => x.l === m.label)) matieres.push({ l: String(m.label).slice(0, 50), n: Math.round(note * 100) / 100, a: m.moy == null ? null : Math.round(m.moy * 100) / 100 });
      (m.evals || []).forEach((v) => { if (v && v.note != null && Number.isFinite(v.note)) evals.push({ l: String(v.label || "").replace(/\s*\(\s*sur\s*\d+(?:[.,]\d+)?\s*\)/i, "").slice(0, 60), m: String(m.label).slice(0, 40), n: Math.round(v.note * 100) / 100, a: v.moy == null ? null : Math.round(v.moy * 100) / 100 }); });
    }));
  }
  const history = (Array.isArray(d.uca_notes_history) ? d.uca_notes_history : []).filter((p) => p && Number.isFinite(p.avg)).slice(-12).map((p) => ({ at: p.at, a: Math.round(p.avg * 100) / 100 }));
  const tasksRaw = Array.isArray(d.uca_tasks) ? d.uca_tasks : [];
  const tasks = tasksRaw.filter((t) => t && typeof t.title === "string" && t.title.trim() && !t.done).slice(0, 40).map((t) => ({ t: t.title.trim().slice(0, 120), s: String(t.subject || "").slice(0, 40), due: parseDue(t.due) !== null ? t.due : "" }));
  const ab = d.uca_absences || null;
  const ls = d.uca_last_sync ? (typeof d.uca_last_sync === "number" ? d.uca_last_sync : Date.parse(d.uca_last_sync)) : null;
  return {
    v: 1, at: now, lastSync: Number.isFinite(ls) ? ls : null, sessionExpired: !!d.uca_session_expired, hasData: all.length > 0 || !!rel,
    events, exams, avg: avg == null ? null : Math.round(avg * 100) / 100, matieres: matieres.slice(0, 14), evals: evals.slice(-12).reverse().slice(0, 8), history, tasks,
    absences: ab ? { total: Number(ab.declarees) || 0, justified: Number(ab.justifiees) || 0, unjustified: Number(ab.nonJustifiees) || 0, days: Number(ab.journeesNonJustifiees) || 0 } : null,
  };
}

/* ---------------------------------------------------------------------------------------------
   derive : tout ce qui dépend de l'heure (cours en cours, prochain cours, pauses, retards…), recalculé à chaque affichage.
   --------------------------------------------------------------------------------------------- */
function mkEvent(c) {
  const start = new Date(c.y, c.m, c.d, c.sh, c.sm).getTime(), end = new Date(c.y, c.m, c.d, c.eh, c.em).getTime();
  return { title: c.t, subject: c.s, type: c.k, room: c.r, teacher: c.p, cancelled: !!c.x, start, end, sh: c.sh, sm: c.sm, eh: c.eh, em: c.em };
}
function derive(s, now) {
  s = s || { events: [] }; now = now == null ? Date.now() : now;
  const evs = (s.events || []).map(mkEvent).filter((e) => !e.cancelled).sort((a, b) => a.start - b.start);
  const ofDay = (off) => { const a = dayStart(now, off), b = dayStart(now, off + 1); return evs.filter((e) => e.start >= a && e.start < b); };
  const today = ofDay(0), tomorrow = ofDay(1);
  const dnow = new Date(now);
  const days3 = [0, 1, 2].map((off) => { const t = new Date(dayStart(now, off)); return { label: off === 0 ? "Aujourd'hui" : off === 1 ? "Demain" : `${SHORT_DAYS[t.getDay()]} ${t.getDate()}`, events: ofDay(off) }; });
  const cur = today.find((e) => e.start <= now && e.end > now) || null;
  const next = cur || evs.find((e) => e.end > now) || null;
  const upcoming = evs.filter((e) => e.start > now);
  const after = evs.filter((e) => e.end > now && e !== next).slice(0, 2);
  const progress = cur ? Math.min(1, Math.max(0, (now - cur.start) / (cur.end - cur.start))) : 0;
  const todayRest = today.filter((e) => e.end > now);
  const lastEnd = today.length ? Math.max.apply(null, today.map((e) => e.end)) : null;
  const doneToday = today.length > 0 && !todayRest.length;
  const firstStart = today.length ? today[0].start : null;
  // pause : en cours (entre deux cours) ou à venir (fin du cours en cours avant un créneau libre d'au moins 15 min)
  let pause = null;
  const nextToday = today.find((e) => e.start > now);
  if (!cur && nextToday && today.some((e) => e.end <= now)) pause = { state: "now", until: nextToday.start, min: Math.ceil((nextToday.start - now) / MIN) };
  else if (cur) { const n2 = today.find((e) => e.start >= cur.end); if (n2 && n2.start - cur.end >= 15 * MIN) pause = { state: "soon", from: cur.end, until: n2.start, min: Math.round((n2.start - cur.end) / MIN) }; }
  let freeDay = null;
  for (let off = 1; off <= 21 && !freeDay; off++) {
    const t = new Date(dayStart(now, off)), wd = t.getDay();
    if (wd >= 1 && wd <= 5 && !ofDay(off).length) freeDay = { off, date: t.getTime(), label: `${WEEKDAYS[wd]} ${t.getDate()} ${MONTHS[t.getMonth()]}` };
  }
  const mon = new Date(dayStart(now, 0)); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const weekLoad = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const a = new Date(mon); a.setDate(a.getDate() + i); const b = new Date(a); b.setDate(b.getDate() + 1);
    const min = evs.filter((e) => e.start >= a.getTime() && e.start < b.getTime()).reduce((n, e) => n + (e.end - e.start) / MIN, 0);
    return { letter: ["L", "M", "M", "J", "V", "S", "D"][i], min: Math.round(min), today: dayStart(now, 0) === a.getTime() };
  });
  const tasksAll = (s.tasks || []).map((t) => { const due = parseDue(t.due); return { title: t.t, subject: t.s, due: due, info: dueInfo(due, now) }; })
    .sort((a, b) => (a.due === null) - (b.due === null) || (a.due || 0) - (b.due || 0));
  const exams = (s.exams || []).map(mkEvent).filter((e) => e.end > now).map((e) => ({ ev: e, days: Math.round((dayStart(e.start, 0) - dayStart(now, 0)) / DAY) }));
  const mats = (s.matieres || []).filter((m) => m.n != null).slice().sort((a, b) => b.n - a.n);
  const hist = s.history || [];
  const hr = dnow.getHours();
  return {
    now, hasData: !!s.hasData, sessionExpired: !!s.sessionExpired, lastSync: s.lastSync || null,
    greet: hr < 12 ? "Bonjour" : hr < 18 ? "Bon après-midi" : "Bonsoir",
    weekday: WEEKDAYS[dnow.getDay()], day: dnow.getDate(), month: MONTHS[dnow.getMonth()], week: isoWeek(now),
    dateLabel: `${WEEKDAYS[dnow.getDay()]} ${dnow.getDate()} ${MONTHS[dnow.getMonth()]}`,
    today, tomorrow, days3, cur, next, after, progress, upcoming,
    todayLeftMin: lastEnd && lastEnd > now ? Math.ceil((lastEnd - now) / MIN) : 0, lastEnd, doneToday, firstStart, pause, freeDay, weekLoad,
    tasks: { all: tasksAll, open: tasksAll.length, late: tasksAll.filter((t) => t.info.level === "late").length, today: tasksAll.filter((t) => t.info.level === "today").length },
    exams, avg: s.avg == null ? null : s.avg, avgPrev: hist.length >= 2 ? hist[hist.length - 2].a : null, history: hist,
    matieres: mats, best: mats[0] || null, worst: mats.length > 1 ? mats[mats.length - 1] : null, evals: s.evals || [], absences: s.absences || null,
  };
}

/* ---------------------------------------------------------------------------------------------
   Rendu HTML (PWA). Chaque widget : { id, name, desc, size: S | M | L, icon, render(vm) -> HTML }.
   --------------------------------------------------------------------------------------------- */
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), cal: I('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  pin: I('<path d="M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'), list: I('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  check: I('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>'), alert: I('<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>'),
  star: I('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'), chart: I('<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>'),
  trend: I('<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>'), user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'), sync: I('<path d="M20 12a8 8 0 0 1-14 5.300M4 12a8 8 0 0 1 14-5.300"/><path d="M18 3v4h-4M6 21v-4h4"/>'),
  door: I('<path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M4 21h16M14 12h.01"/>'), flag: I('<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'), moon: I('<path d="M20 14.500A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"/>'),
  bolt: I('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'), cup: I('<path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>'), sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500 19 19M19 5l-1.500 1.500M6.500 17.500 5 19"/>'),
  grid: I('<rect x="4" y="4" width="7" height="7" rx="1.500"/><rect x="13" y="4" width="7" height="7" rx="1.500"/><rect x="4" y="13" width="7" height="7" rx="1.500"/><rect x="13" y="13" width="7" height="7" rx="1.500"/>'),
  link: I('<path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>'), hourglass: I('<path d="M6 3h12M6 21h12M7 3v4a5 5 0 0 0 2.500 4.300L12 12l-2.500.7A5 5 0 0 0 7 17v4M17 3v4a5 5 0 0 1-2.500 4.300L12 12l2.500.7A5 5 0 0 1 17 17v4"/>'),
};
const lab = (t) => `<div class="uw-lab">${esc(t)}</div>`;
const big = (v, unit, color) => `<div class="uw-big${String(v).length > 6 ? " long" : ""}"${color ? ` style="color:${color}"` : ""}>${esc(v)}${unit ? `<small>${esc(unit)}</small>` : ""}</div>`;
const sub = (t) => `<div class="uw-sub">${esc(t)}</div>`;
const empty = (t) => `<div class="uw-empty">${esc(t)}</div>`;
const slot = (e) => `${hm(e.sh, e.sm)}–${hm(e.eh, e.em)}`;
const rel = (ms, now) => { const m = Math.round((ms - now) / MIN); return m <= 0 ? "maintenant" : m < 60 ? `dans ${m} min` : `dans ${durText(m)}`; };
const short = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const goBtn = (go, text) => `<button type="button" class="uw-btn" data-go="${esc(go)}">${esc(text)}</button>`;
const noData = '<div class="uw-empty">Importe tes données pour remplir ce widget.</div>';

function evRow(e, now) {
  const st = e.end <= now ? " past" : e.start <= now ? " live" : "";
  return `<div class="uw-row${st}"><b>${hm(e.sh, e.sm)}</b><span>${esc(short(e.title, 34))}</span><i>${esc(e.room)}</i></div>`;
}
function spark(points, w, h) {
  if (points.length < 2) return "";
  const min = Math.min.apply(null, points) - 0.5, max = Math.max.apply(null, points) + 0.5, X = (i) => 4 + (w - 8) * i / (points.length - 1), Y = (v) => 4 + (h - 8) * (1 - (v - min) / (max - min));
  const d = points.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  return `<svg class="uw-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Évolution de la moyenne"><path d="${d} L${X(points.length - 1).toFixed(1)} ${h} L${X(0).toFixed(1)} ${h}z" fill="currentColor" opacity=".12"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${X(points.length - 1).toFixed(1)}" cy="${Y(points[points.length - 1]).toFixed(1)}" r="3.5" fill="currentColor"/></svg>`;
}

const CATALOG = [
  { id: "next", name: "Prochain cours", desc: "Le cours en cours ou le suivant, avec l'heure et la salle.", size: "S", icon: IC.clock, render: (v) => !v.hasData ? noData : !v.next ? lab("Prochain cours") + big("Rien", "") + sub("Aucun cours à venir") :
      lab(v.cur ? "En cours" : "Prochain cours") + `<div class="uw-ttl">${esc(short(v.next.title, 42))}</div>` + sub(`${slot(v.next)}${v.next.room ? " · " + v.next.room : ""}`) + sub(v.cur ? `fin ${rel(v.next.end, v.now)}` : rel(v.next.start, v.now)) },
  { id: "day", name: "Ma journée", desc: "Tous les cours d'aujourd'hui, le cours en cours est surligné.", size: "M", icon: IC.cal, render: (v) => lab("Aujourd'hui · " + v.dateLabel) + (!v.hasData ? noData : v.today.length ? v.today.map((e) => evRow(e, v.now)).join("") : empty("Pas de cours aujourd'hui")) },
  { id: "days3", name: "3 jours", desc: "Aujourd'hui, demain et après-demain côte à côte.", size: "L", icon: IC.grid, render: (v) => lab("Les 3 prochains jours") + `<div class="uw-cols">${v.days3.map((d) => `<div class="uw-col"><b>${esc(d.label)}</b>${d.events.length ? d.events.slice(0, 6).map((e) => `<div class="uw-mini"><i>${hm(e.sh, e.sm)}</i> ${esc(short(e.title, 22))}</div>`).join("") : '<span class="uw-dim">Libre</span>'}</div>`).join("")}</div>` },
  { id: "week", name: "Charge de la semaine", desc: "Heures de cours par jour, du lundi au dimanche.", size: "M", icon: IC.chart, render: (v) => { const mx = Math.max(60, ...v.weekLoad.map((d) => d.min)), tot = v.weekLoad.reduce((n, d) => n + d.min, 0);
      return lab("Cette semaine · " + durText(tot)) + `<div class="uw-bars">${v.weekLoad.map((d) => `<div class="uw-bar${d.today ? " today" : ""}" title="${d.min ? durText(d.min) : "libre"}"><i style="height:${Math.round(8 + 80 * d.min / mx)}%"></i><span>${d.letter}</span></div>`).join("")}</div>`; } },
  { id: "now", name: "Cours en cours", desc: "Barre de progression du cours actuel et temps restant.", size: "S", icon: IC.hourglass, render: (v) => !v.hasData ? noData : v.cur ? lab("En ce moment") + `<div class="uw-ttl">${esc(short(v.cur.title, 36))}</div><div class="uw-prog"><i style="width:${Math.round(v.progress * 100)}%"></i></div>` + sub(`reste ${durText((v.cur.end - v.now) / MIN)}`) : lab("En ce moment") + big("Libre", "") + sub(v.next ? `Prochain ${rel(v.next.start, v.now)}` : "Aucun cours à venir") },
  { id: "room", name: "Salle du prochain cours", desc: "La salle en gros : on ne la cherche plus.", size: "S", icon: IC.door, render: (v) => !v.hasData ? noData : !v.next ? lab("Salle") + big("—", "") : lab(v.cur ? "Salle (en cours)" : "Prochaine salle") + big(v.next.room || "?", "") + sub(short(v.next.title, 36)) },
  { id: "endday", name: "Fin de journée", desc: "Heure de la dernière fin de cours et temps restant.", size: "S", icon: IC.moon, render: (v) => !v.hasData ? noData : !v.today.length ? lab("Fin de journée") + big("Libre", "") + sub("Pas de cours aujourd'hui") : v.doneToday ? lab("Fin de journée") + big("Terminé", "") + sub(`Dernier cours fini à ${hm(new Date(v.lastEnd).getHours(), new Date(v.lastEnd).getMinutes())}`) : lab("Fin des cours") + big(hm(new Date(v.lastEnd).getHours(), new Date(v.lastEnd).getMinutes()), "") + sub(`dans ${durText(v.todayLeftMin)}`) },
  { id: "break", name: "Prochaine pause", desc: "Combien de temps avant la pause, ou jusqu'à quand elle dure.", size: "S", icon: IC.cup, render: (v) => !v.hasData ? noData : v.pause && v.pause.state === "now" ? lab("En pause") + big(durText(v.pause.min), "") + sub(`jusqu'à ${hm(new Date(v.pause.until).getHours(), new Date(v.pause.until).getMinutes())}`) : v.pause ? lab("Prochaine pause") + big(hm(new Date(v.pause.from).getHours(), new Date(v.pause.from).getMinutes()), "") + sub(`${durText(v.pause.min)} de pause`) : lab("Pause") + big("—", "") + sub("Pas de pause prévue") },
  { id: "freeday", name: "Prochain jour libre", desc: "Le prochain jour de semaine sans aucun cours.", size: "S", icon: IC.sun, render: (v) => !v.hasData ? noData : v.freeDay ? lab("Prochain jour sans cours") + `<div class="uw-ttl">${esc(v.freeDay.label)}</div>` + sub(v.freeDay.off === 1 ? "demain" : `dans ${v.freeDay.off} jours`) : lab("Prochain jour sans cours") + big("—", "") + sub("Aucun dans les 3 semaines") },
  { id: "date", name: "Aujourd'hui", desc: "La date en grand et le numéro de semaine.", size: "S", icon: IC.cal, render: (v) => lab(v.weekday) + big(String(v.day), v.month) + sub("semaine " + v.week) },
  { id: "tasks", name: "Devoirs à faire", desc: "Les devoirs non faits, du plus urgent au moins urgent.", size: "M", icon: IC.list, render: (v) => lab(`Devoirs · ${v.tasks.open} à faire`) + (v.tasks.all.length ? v.tasks.all.slice(0, 5).map((t) => `<div class="uw-row ${t.info.level}"><span>${esc(short(t.title, 34))}</span><i>${esc(t.info.text)}</i></div>`).join("") : empty("Rien à faire pour l'instant")) },
  { id: "late", name: "Devoirs en retard", desc: "Le nombre de devoirs dont la date est passée.", size: "S", icon: IC.alert, render: (v) => lab("En retard") + big(String(v.tasks.late), "", v.tasks.late ? "#ef6b6b" : "") + sub(v.tasks.late ? "à rattraper" : "tout est à jour") },
  { id: "nexttask", name: "Prochain devoir", desc: "Le devoir le plus proche avec sa date limite.", size: "S", icon: IC.flag, render: (v) => { const t = v.tasks.all[0]; return !t ? lab("Prochain devoir") + big("Aucun", "") : lab("Prochain devoir") + `<div class="uw-ttl">${esc(short(t.title, 40))}</div>` + sub(t.info.text + (t.subject ? " · " + t.subject : "")); } },
  { id: "exams", name: "Examens à venir", desc: "Les prochains examens (DS, partiels) avec le compte à rebours.", size: "M", icon: IC.flag, render: (v) => lab("Examens à venir") + (v.exams.length ? v.exams.slice(0, 4).map((x) => `<div class="uw-row"><b>${x.days <= 0 ? "Auj." : "J-" + x.days}</b><span>${esc(short(x.ev.title, 32))}</span><i>${esc(x.ev.room)}</i></div>`).join("") : empty("Aucun examen prévu")) },
  { id: "countdown", name: "Compte à rebours examen", desc: "Le nombre de jours avant le prochain examen.", size: "S", icon: IC.hourglass, render: (v) => { const x = v.exams[0]; return !x ? lab("Prochain examen") + big("—", "") + sub("Aucun examen prévu") : lab("Prochain examen") + big(x.days <= 0 ? "Auj." : "J-" + x.days, "") + sub(short(x.ev.title, 36)); } },
  { id: "avg", name: "Moyenne générale", desc: "Ta moyenne sur 20, avec la tendance depuis la dernière variation.", size: "S", icon: IC.star, render: (v) => v.avg == null ? lab("Moyenne générale") + big("—", "") + sub("Importe tes notes") : lab("Moyenne générale") + big(fmtNote(v.avg), "/20", gradeColor(v.avg)) + sub(v.avgPrev == null ? "" : v.avg > v.avgPrev ? `▲ +${fmtNote(v.avg - v.avgPrev)}` : v.avg < v.avgPrev ? `▼ ${fmtNote(v.avg - v.avgPrev)}` : "= stable") },
  { id: "trend", name: "Évolution de la moyenne", desc: "La courbe de ta moyenne générale au fil des notes.", size: "M", icon: IC.trend, render: (v) => lab("Évolution de la moyenne") + (v.history.length >= 2 ? spark(v.history.map((p) => p.a), 220, 70) + sub(`${fmtNote(v.history[0].a)} → ${fmtNote(v.history[v.history.length - 1].a)}`) : empty("La courbe apparaît dès la 2e valeur de moyenne")) },
  { id: "notes", name: "Notes par matière", desc: "Un graphique en barres : ta note dans chaque matière.", size: "L", icon: IC.chart, render: (v) => { const m = v.matieres.slice(0, 8); return lab("Notes par matière") + (m.length ? `<div class="uw-hbars">${m.map((x) => `<div class="uw-hb"><span>${esc(short(x.l, 26))}</span><div><i style="width:${Math.max(3, Math.min(100, x.n * 5))}%;background:${gradeColor(x.n)}"></i><u style="left:50%"></u></div><b style="color:${gradeColor(x.n)}">${fmtNote(x.n)}</b></div>`).join("")}</div>` : empty("Importe tes notes pour voir le graphique")); } },
  { id: "recent", name: "Dernières notes", desc: "Les notes les plus récentes, avec la moyenne de la classe.", size: "M", icon: IC.list, render: (v) => lab("Dernières notes") + (v.evals.length ? v.evals.slice(0, 5).map((e) => `<div class="uw-row"><span>${esc(short(e.l || e.m, 30))}</span><i>${e.a != null ? "classe " + fmtNote(e.a) : ""}</i><b style="color:${gradeColor(e.n)}">${fmtNote(e.n)}</b></div>`).join("") : empty("Aucune note pour l'instant")) },
  { id: "best", name: "Meilleure matière", desc: "La matière où ta note est la plus haute.", size: "S", icon: IC.star, render: (v) => !v.best ? lab("Meilleure matière") + big("—", "") : lab("Meilleure matière") + big(fmtNote(v.best.n), "/20", gradeColor(v.best.n)) + sub(short(v.best.l, 30)) },
  { id: "worst", name: "Matière à surveiller", desc: "La matière où ta note est la plus basse.", size: "S", icon: IC.alert, render: (v) => !v.worst ? lab("À surveiller") + big("—", "") : lab("À surveiller") + big(fmtNote(v.worst.n), "/20", gradeColor(v.worst.n)) + sub(short(v.worst.l, 30)) },
  { id: "absences", name: "Absences", desc: "Le total d'absences déclarées, justifiées ou non.", size: "S", icon: IC.user, render: (v) => !v.absences ? lab("Absences") + big("—", "") + sub("Importe tes absences") : lab("Absences") + big(String(v.absences.total), "", v.absences.unjustified ? "#ff8c1a" : "") + sub(`${v.absences.justified} justifiée${v.absences.justified > 1 ? "s" : ""} · ${v.absences.unjustified} non justifiée${v.absences.unjustified > 1 ? "s" : ""}`) },
  { id: "status", name: "Connexion", desc: "L'état de tes données et un bouton pour te reconnecter ou importer.", size: "S", icon: IC.link, render: (v) => lab("Connexion") + (v.sessionExpired ? big("Expirée", "", "#ef6b6b") + goBtn("import", "Se connecter") : v.hasData ? big("Connecté", "", "#2fd68f") + sub(agoText(v.lastSync, v.now)) : big("Aucune", "") + goBtn("import", "Importer mes données")) },
  { id: "sync", name: "Dernière synchronisation", desc: "Quand tes données ont été mises à jour pour la dernière fois.", size: "S", icon: IC.sync, render: (v) => lab("Synchronisation") + `<div class="uw-ttl">${esc(agoText(v.lastSync, v.now))}</div>` + goBtn("import", "Resynchroniser") },
  { id: "shortcuts", name: "Raccourcis", desc: "Quatre boutons : agenda, notes, absences, devoirs.", size: "M", icon: IC.bolt, render: () => lab("Raccourcis") + `<div class="uw-keys">${goBtn("tab:agenda", "Agenda")}${goBtn("agenda:notes", "Notes")}${goBtn("agenda:absences", "Absences")}${goBtn("agenda:tasks", "Devoirs")}</div>` },
];

const DEFAULTS = ["next", "day", "tasks", "avg", "absences", "status"];
function byId(id) { return CATALOG.find((w) => w.id === id) || null; }
function render(id, vm) { const w = byId(id); if (!w) return ""; try { return w.render(vm); } catch (e) { return empty("Widget indisponible"); } }

const CSS = `.uw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:row dense;gap:12px;margin:0 0 14px}
@media(min-width:720px){.uw-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(min-width:1100px){.uw-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
.uw{--uw-dim:var(--dim,#8a93a6);position:relative;display:flex;flex-direction:column;gap:4px;min-width:0;min-height:132px;padding:14px;border-radius:20px;background:var(--surface,#171b23);border:1px solid var(--border,rgba(127,127,127,.25));color:var(--text,inherit);overflow:hidden}
.uw.S{grid-column:span 1}.uw.M{grid-column:span 2}.uw.L{grid-column:span 2}
@media(min-width:720px){.uw.L{grid-column:span 4}}@media(min-width:1100px){.uw.L{grid-column:span 3}.uw.M{grid-column:span 2}}
.uw-lab{font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--uw-dim)}
.uw-big{font-size:34px;font-weight:800;line-height:1.05;letter-spacing:-.02em;margin-top:2px}.uw-big.long{font-size:24px}.uw-big small{font-size:14px;font-weight:700;margin-left:4px;color:var(--uw-dim)}
.uw-ttl{font-size:16px;font-weight:800;line-height:1.25;margin-top:2px;overflow-wrap:anywhere}
.uw-sub{font-size:13px;color:var(--uw-dim)}.uw-empty,.uw-dim{color:var(--uw-dim);font-size:13.5px}.uw-empty{margin-top:6px}
.uw-row{display:flex;align-items:baseline;gap:8px;padding:5px 0;border-top:1px solid rgba(127,127,127,.18);font-size:13.5px;min-width:0}.uw-row:first-of-type{border-top:0}
.uw-row b{font-variant-numeric:tabular-nums;flex:none}.uw-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.uw-row i{font-style:normal;color:var(--uw-dim);font-size:12px;flex:none}
.uw-row.past{opacity:.5}.uw-row.live{background:rgba(74,163,223,.14);border-radius:8px;padding-inline:6px}.uw-row.late i{color:#ef6b6b;font-weight:700}.uw-row.today i,.uw-row.soon i{color:#ff8c1a;font-weight:700}
.uw-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:6px}.uw-col{min-width:0;font-size:12.5px}.uw-col b{display:block;margin-bottom:4px;font-size:13px}.uw-mini{padding:3px 0;border-top:1px solid rgba(127,127,127,.18);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.uw-mini i{font-style:normal;font-weight:700;margin-right:4px;font-variant-numeric:tabular-nums}
.uw-bars{display:flex;align-items:flex-end;gap:8px;height:84px;margin-top:6px}.uw-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px}.uw-bar i{display:block;width:100%;border-radius:6px 6px 3px 3px;background:rgba(74,163,223,.45)}.uw-bar.today i{background:#4aa3df}.uw-bar span{font-size:11px;color:var(--uw-dim);font-weight:700}
.uw-prog{height:8px;border-radius:99px;background:rgba(127,127,127,.2);overflow:hidden;margin:6px 0 2px}.uw-prog i{display:block;height:100%;border-radius:99px;background:#4aa3df}
.uw-spark{width:100%;height:70px;color:#4aa3df;margin-top:4px}
.uw-hbars{display:grid;gap:7px;margin-top:6px}.uw-hb{display:grid;grid-template-columns:minmax(80px,32%) 1fr 38px;gap:8px;align-items:center;font-size:12.5px}.uw-hb span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.uw-hb div{position:relative;height:9px;border-radius:99px;background:rgba(127,127,127,.18);overflow:hidden}.uw-hb i{display:block;height:100%;border-radius:99px}.uw-hb u{position:absolute;top:0;bottom:0;width:1px;background:rgba(127,127,127,.55)}.uw-hb b{text-align:right;font-variant-numeric:tabular-nums}
.uw-keys{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:6px}
.uw-btn{margin-top:auto;min-height:36px;padding:0 12px;border-radius:12px;border:1px solid var(--border,rgba(127,127,127,.35));background:transparent;color:inherit;font:inherit;font-weight:700;font-size:13px;cursor:pointer}.uw-btn:hover{border-color:#4aa3df}
.uw-tools{position:absolute;top:8px;right:8px;display:none;gap:4px}.uw-edit .uw-tools{display:flex}.uw-tools button{width:28px;height:28px;border-radius:9px;border:1px solid rgba(127,127,127,.4);background:var(--surface,#171b23);color:inherit;font-size:14px;cursor:pointer;line-height:1}
.uw-add{display:grid;gap:8px}.uw-pick{display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center;padding:10px;border-radius:14px;border:1px solid rgba(127,127,127,.25)}.uw-pick .ic{width:40px;height:40px;border-radius:12px;background:rgba(74,163,223,.16);color:#4aa3df;display:grid;place-items:center}.uw-pick .ic svg{width:22px;height:22px}.uw-pick b{display:block}.uw-pick span{font-size:13px;color:var(--uw-dim)}
@media(prefers-reduced-motion:no-preference){.uw{animation:uwIn .22s ease-out}@keyframes uwIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}`;

root.UCA_WIDGETS = { CATALOG, DEFAULTS, snapshot, derive, render, byId, CSS, fmtNote, durText, agoText, dueInfo, typeOf, subjectOf, isoWeek };
})(typeof self !== "undefined" ? self : this);
