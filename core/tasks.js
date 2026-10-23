/* Devoirs et examens : liste de tâches locale liée aux matières, avec compte à rebours. Les examens viennent
   tout seuls de l'emploi du temps (cours « Examen », DS, Partiel) ; les devoirs sont saisis à la main
   (chrome.storage.local.uca_tasks, jamais envoyé nulle part). Construit avec des nœuds DOM et textContent
   uniquement (aucun innerHTML sur du texte saisi). Commun aux 4 designs ; chargé après tools.js. */
(function (root) {
"use strict";

const KEY = "uca_tasks";
const MAX_TASKS = 200;
const DAY = 86400000;

function pad(n) { return String(n).padStart(2, "0"); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function dayStart(t) { const d = new Date(t === undefined ? Date.now() : t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function parseDue(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* Garde seulement ce qui a la bonne forme (données venues d'un lien de partage ou d'un ancien état). */
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((t) => t && typeof t.title === "string" && t.title.trim()).slice(0, MAX_TASKS).map((t) => ({
    id: typeof t.id === "string" && t.id ? t.id.slice(0, 40) : newId(),
    title: t.title.trim().slice(0, 160),
    subject: typeof t.subject === "string" ? t.subject.slice(0, 60) : "",
    due: parseDue(t.due) !== null ? t.due : "",
    done: !!t.done,
    created: Number(t.created) || Date.now(),
  }));
}

/* « Demain », « Dans 3 jours », « En retard de 2 jours » ; level sert à la couleur. */
function dueInfo(dueMs, now) {
  if (dueMs === null) return { text: "Sans date", level: "none" };
  const days = Math.round((dueMs - dayStart(now)) / DAY);
  if (days < 0) return { text: `En retard de ${-days} jour${days < -1 ? "s" : ""}`, level: "late" };
  if (days === 0) return { text: "Aujourd'hui", level: "today" };
  if (days === 1) return { text: "Demain", level: "soon" };
  return { text: `Dans ${days} jours`, level: days <= 3 ? "soon" : "later" };
}

/* Examens à venir (ou du jour) tirés de l'emploi du temps. */
function examsFrom(events, now) {
  const t = now === undefined ? Date.now() : now;
  return (events || []).filter((e) => !e.cancelled && root.UCA_TOOLS.typeOf(e.title) === "Examen"
    && new Date(e.year, e.month, e.day, e.endH, e.endM).getTime() > t)
    .map((e) => ({ kind: "exam", title: e.title, subject: root.UCA_TOOLS.subjectOf(e.title), dueMs: new Date(e.year, e.month, e.day).getTime(),
      time: `${pad(e.startH)}h${pad(e.startM)}`, room: e.room || "" }))
    .sort((a, b) => a.dueMs - b.dueMs || a.time.localeCompare(b.time));
}

function sortTasks(list) {
  return list.slice().sort((a, b) => {
    const da = parseDue(a.due), db = parseDue(b.due);
    if (da === null && db === null) return a.created - b.created;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
}
function openCount(list) { return (list || []).filter((t) => !t.done).length; }

const STYLE = `
.uca-tasks{padding:4px 0 8px;min-width:320px;}
.uca-tasks .tk-h{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);padding:10px 16px 6px;}
.uca-tasks .tk-form{display:flex;flex-wrap:wrap;gap:6px;padding:4px 16px 8px;}
.uca-tasks .tk-form input,.uca-tasks .tk-form select{height:36px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:13.5px;padding:0 10px;min-width:0;}
.uca-tasks .tk-title{flex:1 1 100%;}
.uca-tasks .tk-subject{flex:1 1 120px;}
.uca-tasks .tk-date{flex:1 1 130px;}
.uca-tasks .tk-add{height:36px;padding:0 16px;border-radius:8px;border:none;background:var(--accent);color:var(--on-accent,#fff);font:inherit;font-weight:600;cursor:pointer;}
.uca-tasks ul{list-style:none;margin:0;padding:0;max-height:300px;overflow-y:auto;}
.uca-tasks li{display:flex;align-items:flex-start;gap:10px;padding:7px 16px;font-size:14px;}
.uca-tasks li:hover{background:var(--accent-light,rgba(127,127,127,.12));}
.uca-tasks .tk-main{flex:1;min-width:0;}
.uca-tasks .tk-name{font-weight:600;overflow-wrap:anywhere;}
.uca-tasks .tk-meta{font-size:12.5px;color:var(--text-dim);margin-top:1px;}
.uca-tasks .tk-due.late{color:var(--danger,#b3261e);font-weight:700;}
.uca-tasks .tk-due.today,.uca-tasks .tk-due.soon{color:#b06000;font-weight:700;}
.uca-tasks .tk-tag{display:inline-block;font-size:11.5px;font-weight:700;padding:1px 7px;border-radius:9px;border:1px solid var(--border);margin-right:6px;}
.uca-tasks .tk-done .tk-name{text-decoration:line-through;color:var(--text-dim);font-weight:500;}
.uca-tasks li input[type=checkbox]{width:20px;height:20px;margin:2px 0 0;flex:none;accent-color:var(--accent);}
.uca-tasks .tk-del{flex:none;width:32px;height:32px;border:none;background:none;color:var(--text-dim);font-size:18px;cursor:pointer;border-radius:8px;}
.uca-tasks .tk-del:hover{color:var(--danger,#b3261e);}
.uca-tasks .tk-empty{font-size:13px;color:var(--text-dim);padding:6px 16px 10px;}
.uca-tasks .tk-foot{display:flex;justify-content:flex-end;padding:4px 16px 0;}
.uca-tasks .tk-clear{border:none;background:none;color:var(--accent);font:inherit;font-size:13px;font-weight:600;cursor:pointer;height:32px;}
`;
function ensureStyle() {
  if (document.getElementById("ucaTasksStyle")) return;
  const s = document.createElement("style"); s.id = "ucaTasksStyle"; s.textContent = STYLE; document.head.appendChild(s);
}

/* Construit le panneau. ctx : { events, tasks, save(list) } ; save() enregistre et déclenche le rendu. */
function buildPanel(panel, ctx) {
  ensureStyle();
  panel.textContent = "";
  panel.classList.add("uca-tasks");
  const tasks = sortTasks(ctx.tasks || []);
  const subjects = [...new Set((ctx.events || []).map((e) => root.UCA_TOOLS.subjectOf(e.title)))].sort((a, b) => a.localeCompare(b, "fr"));

  panel.appendChild(el("div", "tk-h", "Nouveau devoir"));
  const form = el("form", "tk-form");
  const title = el("input", "tk-title"); title.type = "text"; title.maxLength = 160; title.placeholder = "Ex. : rendre le TP 3"; title.setAttribute("aria-label", "Intitulé du devoir");
  const subj = el("select", "tk-subject"); subj.setAttribute("aria-label", "Matière");
  subj.appendChild(Object.assign(el("option", "", "Sans matière"), { value: "" }));
  subjects.forEach((s) => subj.appendChild(Object.assign(el("option", "", s), { value: s })));
  const date = el("input", "tk-date"); date.type = "date"; date.setAttribute("aria-label", "Date de rendu");
  const add = el("button", "tk-add", "Ajouter"); add.type = "submit";
  form.append(title, subj, date, add);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) { title.focus(); return; }
    ctx.save(sanitize(tasks.concat({ id: newId(), title: t, subject: subj.value, due: date.value, done: false, created: Date.now() })));
  });
  panel.appendChild(form);

  const now = Date.now();
  const exams = examsFrom(ctx.events, now);
  const open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
  const items = open.map((t) => ({ kind: "task", t, dueMs: parseDue(t.due) })).concat(exams.map((x) => ({ kind: "exam", x, dueMs: x.dueMs })))
    .sort((a, b) => (a.dueMs === null) - (b.dueMs === null) || (a.dueMs || 0) - (b.dueMs || 0));

  panel.appendChild(el("div", "tk-h", "À faire et examens"));
  const ul = el("ul"); ul.setAttribute("aria-label", "Devoirs et examens à venir");
  items.forEach((it) => {
    const li = el("li");
    const info = dueInfo(it.dueMs, now);
    const main = el("div", "tk-main");
    if (it.kind === "exam") {
      li.appendChild(el("span", "tk-tag", "Examen"));
      main.appendChild(el("div", "tk-name", it.x.title));
      const meta = el("div", "tk-meta");
      meta.append(el("span", "tk-due " + info.level, info.text), document.createTextNode(` · ${it.x.time}${it.x.room ? " · " + it.x.room : ""}`));
      main.appendChild(meta);
      li.appendChild(main);
    } else {
      const cb = el("input"); cb.type = "checkbox"; cb.setAttribute("aria-label", "Terminé : " + it.t.title);
      cb.addEventListener("change", () => ctx.save(tasks.map((x) => (x.id === it.t.id ? Object.assign({}, x, { done: true }) : x))));
      li.appendChild(cb);
      main.appendChild(el("div", "tk-name", it.t.title));
      const meta = el("div", "tk-meta");
      if (it.t.subject) meta.appendChild(el("span", "tk-tag", it.t.subject));
      meta.appendChild(el("span", "tk-due " + info.level, info.text));
      main.appendChild(meta);
      li.appendChild(main);
      const del = el("button", "tk-del", "×"); del.type = "button"; del.setAttribute("aria-label", "Supprimer : " + it.t.title); del.title = "Supprimer";
      del.addEventListener("click", () => ctx.save(tasks.filter((x) => x.id !== it.t.id)));
      li.appendChild(del);
    }
    ul.appendChild(li);
  });
  if (items.length) panel.appendChild(ul);
  else panel.appendChild(el("div", "tk-empty", "Rien à faire pour le moment. Ajoute un devoir ci-dessus ; les examens de ton emploi du temps apparaissent ici tout seuls."));

  if (done.length) {
    panel.appendChild(el("div", "tk-h", `Terminés (${done.length})`));
    const dl = el("ul"); dl.setAttribute("aria-label", "Devoirs terminés");
    done.forEach((t) => {
      const li = el("li", "tk-done");
      const cb = el("input"); cb.type = "checkbox"; cb.checked = true; cb.setAttribute("aria-label", "Terminé : " + t.title + " (décocher pour le remettre à faire)");
      cb.addEventListener("change", () => ctx.save(tasks.map((x) => (x.id === t.id ? Object.assign({}, x, { done: false }) : x))));
      const main = el("div", "tk-main"); main.appendChild(el("div", "tk-name", t.title));
      li.append(cb, main);
      dl.appendChild(li);
    });
    panel.appendChild(dl);
    const foot = el("div", "tk-foot");
    const clear = el("button", "tk-clear", "Effacer les terminés"); clear.type = "button";
    clear.addEventListener("click", () => ctx.save(tasks.filter((t) => !t.done)));
    foot.appendChild(clear); panel.appendChild(foot);
  }
}

root.UCA_TASKS = { KEY, sanitize, dueInfo, examsFrom, sortTasks, openCount, parseDue, buildPanel };
})(self);
