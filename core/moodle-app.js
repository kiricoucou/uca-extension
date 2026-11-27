/* App Android : lecture des notes DEPUIS la page Moodle (même origine, donc avec la session de l'utilisateur).
   Injecté par UcaMoodle.kt après core/moodle.js, dans une WebView invisible qui n'affiche que Moodle. Même lecture que
   moodleInPageScrape dans background.js. Rien n'est envoyé ailleurs : l'application relit window.__ucaMoodleJob. */
(function () {
"use strict";
if (window.__ucaMoodleJob) return;
const job = window.__ucaMoodleJob = { done: 0, total: 0, label: "", result: null };
const MAX = 60;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (path) => {
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 20000);
  try {
    const r = await fetch(path, { credentials: "same-origin", redirect: "follow", signal: stop.signal });
    const u = new URL(r.url, location.href);
    if (u.origin !== location.origin || /\/login\/|\/cas\//i.test(u.pathname)) return { issue: "session" };
    if (!r.ok) return { issue: r.status >= 500 ? "serviceDown" : "error", detail: "HTTP " + r.status };
    return { html: await r.text() };
  } catch (e) { return { issue: "error", detail: "redirections ou réseau" }; }
  finally { clearTimeout(timer); }
};
(async () => {
  const ov = await get("/grade/report/overview/index.php");
  if (ov.issue) return ov;
  const { userId, courses } = UCA_MOODLE.parseOverview(ov.html);
  if (!courses.length) return { issue: "structure" };
  const list = courses.slice(0, MAX), data = [];
  let failed = 0;
  job.total = list.length;
  for (const c of list) {
    job.label = c.name;
    const r = await get("/course/user.php?mode=grade&id=" + c.id + (userId ? "&user=" + userId : ""));
    job.done++;
    if (r.issue === "session") return r;
    if (r.issue) { failed++; continue; }
    UCA_MOODLE.parseCourseGrades(r.html).forEach((g) => data.push(Object.assign({ courseId: c.id, course: c.name }, g)));
    await wait(200);
  }
  return failed === list.length ? { issue: "error", detail: "aucun cours lisible" } : { data };
})().then((r) => { job.result = r; }, (e) => { job.result = { issue: "error", detail: String((e && e.message) || e).slice(0, 80) }; });
})();
