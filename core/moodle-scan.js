/* Moteur de recherche des notes Moodle, le même partout : onglet de l'extension, service worker (secours) et WebView de
   l'application Android. Il lit les cours un par un, réessaie les erreurs passagères, reprend après une coupure et rend
   un rapport cours par cours. Règle : un cours n'est « lu » que si sa page est un rapport de notes complet ; une recherche
   n'est « complète » que si tous les cours le sont. Nécessite core/moodle.js (UCA_MOODLE). */
(function (root) {
"use strict";

const OVERVIEW = "/grade/report/overview/index.php";
const MAX_COURSES = 200;
const ATTEMPTS = 3;
const BACKOFF_MS = [1000, 3000];
const DELAY_MIN = 200, DELAY_MAX = 3000;
const SLOW_MS = 3000;
const STOP_AFTER = 4;                       // cours de suite en échec réseau / serveur : inutile d'insister
const CHECKPOINT_MAX_AGE = 30 * 60 * 1000;
const LOGIN_PATH = /\/login\/|\/cas\//i;

/* Lecture d'une page avec la session déjà ouverte (cookies joints par le navigateur, jamais lus ici). */
function pageGet(base, timeoutMs) {
  return async (path) => {
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), timeoutMs || 20000);
    try {
      const r = await fetch(base + path, { credentials: "include", redirect: "follow", signal: stop.signal });
      return { status: r.status, url: r.url || base + path, html: await r.text(), retryAfter: Number(r.headers && r.headers.get && r.headers.get("retry-after")) || 0 };
    } finally { clearTimeout(timer); }
  };
}

/* Secours si la page « Notes » change : la liste de mes cours par le service AJAX que Moodle utilise lui-même (autorisé
   à tout utilisateur connecté). La clé de session est lue dans la page, sert à cette seule demande et n'est pas gardée.
   (Les services AJAX de NOTES testés sur le Moodle de l'UCA sont refusés : les notes restent lues dans les rapports.) */
function pageList(base) {
  return async () => {
    const home = await fetch(base + "/my/", { credentials: "include", redirect: "follow" });
    if (new URL(home.url || base).origin !== base || LOGIN_PATH.test(new URL(home.url || base).pathname)) return null;
    const html = await home.text();
    const key = /"sesskey":"([A-Za-z0-9]+)"/.exec(html), user = /data-userid="(\d+)"/.exec(html) || /"userId":(\d+)/i.exec(html);
    if (!key || !user) return null;
    const r = await fetch(base + "/lib/ajax/service.php?sesskey=" + key[1], { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ index: 0, methodname: "core_course_get_enrolled_courses_by_timeline_classification", args: { classification: "all", limit: 0, offset: 0 } }]) });
    const j = await r.json(), first = Array.isArray(j) ? j[0] : null;
    if (!first || first.error || !first.data || !Array.isArray(first.data.courses)) return null;
    return { userId: user[1], courses: first.data.courses.filter((c) => /^\d+$/.test(String(c.id))).map((c) => ({ id: String(c.id), name: String(c.fullname || c.id).slice(0, 200) })) };
  };
}

async function run(env) {
  const M = root.UCA_MOODLE;
  const now = env.now || (() => Date.now());
  const sleep = env.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const origin = env.origin;
  const startedAt = now();
  let delay = DELAY_MIN, done = 0, total = 0, label = "";
  const progress = () => { if (env.onProgress) env.onProgress({ done, total, label }); };   // une fois par cours

  /* Une page, jusqu'à 3 essais. -> { value } | { session } | { fail, kind: "server"|"network"|"structure"|"denied", attempts } */
  async function load(path, validate) {
    let last = { fail: "échec", kind: "network" };
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      if (env.onBeat) env.onBeat();          // signe de vie (les nouvelles tentatives peuvent durer)
      let res = null;
      const t0 = now();
      try { res = await env.get(path); } catch (e) { last = { fail: "réseau coupé ou délai dépassé", kind: "network" }; }
      if (res) {
        let where = null; try { where = new URL(res.url); } catch (e) { where = null; }
        if (where && (where.origin !== origin || LOGIN_PATH.test(where.pathname))) return { session: true };
        if (res.status === 429 || res.status >= 500) last = { fail: "HTTP " + res.status, kind: "server" };
        else if (res.status < 200 || res.status >= 300) return { fail: "HTTP " + res.status, kind: "denied", attempts: attempt };
        else {
          if (/name\s*=\s*["']username["']/i.test(res.html) && /type\s*=\s*["']password["']/i.test(res.html)) return { session: true };
          const v = validate(res.html);
          if (v.session) return { session: true };
          if (v.ok) {
            // Moodle lent : on espace davantage ; il répond vite : on revient peu à peu au délai normal.
            delay = now() - t0 > SLOW_MS ? Math.min(DELAY_MAX, Math.max(delay, 1000)) : Math.max(DELAY_MIN, Math.round(delay * 0.8));
            return { value: v.value, attempts: attempt };
          }
          last = { fail: v.reason, kind: "structure" };
        }
      }
      delay = Math.min(DELAY_MAX, delay * 2);
      if (attempt < ATTEMPTS) await sleep(res && res.retryAfter ? Math.min(30, res.retryAfter) * 1000 : BACKOFF_MS[attempt - 1]);
    }
    return Object.assign({ attempts: ATTEMPTS }, last);
  }

  const ov = await load(OVERVIEW, (html) => {
    const o = M.parseOverview(html);
    return o.ok && o.courses.length ? { ok: true, value: o } : { reason: o.ok ? "aucun cours dans la page Notes" : "page Notes non reconnue" };
  });
  if (ov.session) return { issue: "session", detail: null };
  let fallback = false;
  if (ov.fail) {
    let other = null;
    if (ov.kind === "structure" && env.listCourses) { try { other = await env.listCourses(); } catch (e) { other = null; } }
    if (!other || !other.courses.length) return { issue: ov.kind === "server" ? "serviceDown" : ov.kind === "structure" ? "structure" : "error", detail: ov.fail };
    ov.value = other; fallback = true;
  }

  const host = new URL(origin).host;
  const userId = ov.value.userId;
  const courses = ov.value.courses.slice(0, env.maxCourses || MAX_COURSES);
  const truncated = ov.value.courses.length - courses.length;
  const cp = env.checkpoint;
  const resume = cp && userId && cp.userId === userId && cp.host === host && now() - cp.at < CHECKPOINT_MAX_AGE && cp.courses ? cp.courses : {};
  const checkpoint = { userId, host, at: Object.keys(resume).length ? cp.at : startedAt, courses: Object.assign({}, resume) };
  const grades = [], readRows = {}, entries = [];
  let session = false, streak = 0, stopped = "";
  total = courses.length;

  const keep = (course, data) => {
    data.grades.forEach((g) => grades.push(Object.assign({ courseId: course.id, course: course.name }, g)));
    // Un cours avec une ligne illisible ne permet pas de dire qu'une note a disparu.
    if (!data.anomalies.length) readRows[course.id] = data.rows;
  };

  for (const course of courses) {
    label = course.name;
    const entry = { id: course.id, name: course.name, status: "non lu", notes: 0, reason: "", attempts: 0, anomalies: [], ignored: [] };
    entries.push(entry);
    if (session || stopped) { entry.reason = session ? "connexion à Moodle perdue" : stopped; continue; }
    progress();
    const saved = resume[course.id];
    if (saved) {
      Object.assign(entry, { status: "lu", notes: saved.grades.length, ignored: saved.ignored, resumed: true });
      keep(course, saved); done++; continue;
    }
    const path = "/course/user.php?mode=grade&id=" + course.id + (userId ? "&user=" + userId : "");
    const page = await load(path, (html) => {
      const r = M.parseReport(html, course.id);
      return r.ok ? { ok: true, value: r } : r.reason === "session" ? { session: true } : { reason: r.reason };
    });
    if (page.session) { session = true; entry.reason = "connexion à Moodle perdue"; continue; }
    done++;
    entry.attempts = page.attempts;
    if (page.fail) {
      entry.status = "échec"; entry.reason = page.fail;
      streak = page.kind === "server" || page.kind === "network" ? streak + 1 : 0;
      if (streak >= STOP_AFTER) stopped = "recherche arrêtée : Moodle ne répond plus";
    } else {
      streak = 0;
      const v = page.value;
      Object.assign(entry, { status: "lu", notes: v.grades.length, anomalies: v.anomalies, ignored: v.ignored });
      if (v.strategy && v.strategy !== "classes") entry.warning = "présentation inhabituelle de Moodle (colonnes reconnues par : " + v.strategy + ")";
      keep(course, v);
      if (!v.anomalies.length) {
        checkpoint.courses[course.id] = { grades: v.grades, anomalies: [], ignored: v.ignored, rows: v.rows };
        if (env.onCheckpoint) env.onCheckpoint(checkpoint);
      }
    }
    if (done < total && !stopped) await sleep(delay);
  }

  const read = entries.filter((e) => e.status === "lu").length;
  const failed = entries.filter((e) => e.status === "échec").length;
  const anomalies = entries.reduce((n, e) => n + e.anomalies.length, 0);
  // Liste obtenue par le moyen de secours : la page « Notes » a changé, on ne peut pas garantir que rien ne manque.
  const complete = read === entries.length && !anomalies && !truncated && !fallback;
  const report = {
    at: now(), startedAt, host, total: entries.length + truncated, read, failed, notRead: entries.length - read - failed + truncated,
    resumed: entries.filter((e) => e.resumed).length, notes: grades.length, anomalies,
    ignored: entries.reduce((n, e) => n + e.ignored.length, 0), truncated, complete,
    level: complete ? "complet" : read ? "incomplet" : "échec", fallback,
    courses: entries,
  };
  const detail = complete ? null : `${read}/${report.total} cours lus` + (failed ? `, ${failed} en échec` : "") + (anomalies ? `, ${anomalies} ligne(s) illisible(s)` : "") + (fallback ? ", page Notes modifiée (liste de secours)" : "");
  const out = { issue: complete ? null : session ? "session" : read ? "partial" : "error", detail, report, read: readRows, checkpoint: complete ? null : checkpoint,
    listed: !fallback && !truncated ? courses.map((c) => c.id) : null };
  if (read) out.data = grades;
  return out;
}

root.UCA_MOODLE_SCAN = { run, pageGet, pageList, CHECKPOINT_MAX_AGE };
})(typeof self !== "undefined" ? self : globalThis);
