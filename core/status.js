/* Statut des sites utilisés par l'extension (Odin, connexion CAS, Moodle, Mail, site de l'extension).
   Chargé par la page Paramètres et par le service worker (alarme de surveillance).
   Une sonde = une requête GET anonyme (credentials:"omit") sur la page d'accueil du site : on teste
   si le serveur répond, jamais ta session ; aucune donnée perso n'est envoyée ni lue.
   - site lisible (host_permissions de l'extension ou CORS ouvert) : code HTTP et titre de la page
     analysés (5xx, 404, « maintenance »… = panne) ;
   - sinon (Moodle, Mail) : requête no-cors, on sait seulement si le serveur est joignable.
   Résultats dans chrome.storage.local.uca_status, avec un petit historique pour la courbe. */
(function (root) {
"use strict";

const SLOW_MS = 2500;
const TIMEOUT_MS = 8000;
const HISTORY = 20;

// full : réponse lisible depuis l'extension (host_permissions) ; cors : lisible aussi depuis l'app.
const SITES = [
  { id: "odin", label: "Odin", url: "https://odin.iut.uca.fr/", host: "odin.iut.uca.fr", full: true, watch: true },
  { id: "cas", label: "Connexion (CAS)", url: "https://ent.uca.fr/", host: "ent.uca.fr", full: true, watch: true },
  { id: "moodle", label: "Moodle", url: "https://moodle.uca.fr/", host: "moodle.uca.fr" },
  { id: "mail", label: "Messagerie UCA", url: "https://mail.uca.fr/zimbra/", host: "mail.uca.fr" },
  { id: "site", label: "Site de l'extension", url: "https://kiricoucou.github.io/uca-extension/", host: "kiricoucou.github.io", full: true, cors: true },
  { id: "updates", label: "Dépôt GitHub (version publique)", url: "https://raw.githubusercontent.com/kiricoucou/uca-extension/main/manifest.json", host: "raw.githubusercontent.com", full: true, cors: true },
];

const ERROR_TITLE = /\b(404|500|502|503|504)\b|introuvable|non trouv[ée]e|erreur (serveur|interne)|indisponible|maintenance|internal server error|not found|service unavailable|bad gateway|gateway timeout/i;

function readable(site) { return !!site.full && (!root.UCA_APP || !!site.cors); }

function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(html || "");
  return m ? m[1].trim() : "";
}

/* -> { id, state: "ok" | "slow" | "down", ms, code, reason, at, exact }
   exact = false quand seule la joignabilité est connue (no-cors). */
async function check(site, fetchImpl) {
  const doFetch = fetchImpl || ((u, o) => fetch(u, o));
  const exact = readable(site);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  const out = { id: site.id, state: "ok", ms: 0, code: 0, reason: "", at: t0, exact };
  try {
    const res = await doFetch(site.url, { method: "GET", cache: "no-store", credentials: "omit", redirect: "follow", mode: exact ? "cors" : "no-cors", signal: ctl.signal });
    out.ms = Date.now() - t0;
    if (exact) {
      out.code = res.status;
      if (res.status >= 500) { out.state = "down"; out.reason = "Erreur serveur " + res.status; }
      else if (res.status === 404) { out.state = "down"; out.reason = "Page introuvable (404)"; }
      else if (/html/i.test(res.headers.get("content-type") || "")) {
        const title = pageTitle((await res.text()).slice(0, 4000));
        if (title && ERROR_TITLE.test(title)) { out.state = "down"; out.reason = "Page d'erreur : " + title.slice(0, 60); }
      }
    }
    if (out.state === "ok" && out.ms > SLOW_MS) out.state = "slow";
  } catch (e) {
    out.ms = Date.now() - t0;
    out.state = "down";
    out.reason = ctl.signal.aborted ? "Pas de réponse après " + TIMEOUT_MS / 1000 + " s" : "Serveur injoignable";
  } finally { clearTimeout(timer); }
  return out;
}

/* Fusionne des résultats dans uca_status ; renvoie { previous, current } pour détecter les changements. */
async function record(results) {
  const { uca_status } = await chrome.storage.local.get("uca_status");
  const previous = (uca_status && uca_status.sites) || {};
  const sites = Object.assign({}, previous);
  results.forEach((r) => {
    const old = previous[r.id];
    const history = ((old && old.history) || []).concat({ ms: r.ms, state: r.state }).slice(-HISTORY);
    sites[r.id] = { state: r.state, ms: r.ms, code: r.code, reason: r.reason, at: r.at, exact: r.exact, history,
      since: old && old.state === r.state ? old.since : r.at };
  });
  await chrome.storage.local.set({ uca_status: { at: Date.now(), sites } });
  return { previous, current: sites };
}

async function checkAll(ids, fetchImpl) {
  const list = SITES.filter((s) => !ids || ids.includes(s.id));
  const results = await Promise.all(list.map((s) => check(s, fetchImpl)));
  return Object.assign(await record(results), { results });
}

root.UCA_STATUS = { SITES, SLOW_MS, check, checkAll, record, readable };
})(self);
