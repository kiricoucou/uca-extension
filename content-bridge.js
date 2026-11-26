(function () {
  "use strict";
  // Les iframes d'une page matchée ne doivent pas pouvoir piloter l'extension.
  if (window.top !== window) return;

  // Seul le site officiel peut piloter l'extension et recevoir ses messages. Les pages file:// et localhost / 127.0.0.1
  // (matchées pour le développement et les tests) restent inertes, sauf si le drapeau « uca_dev_bridge » a été posé dans le
  // stockage de l'extension (inaccessible à une page web). Sans cela, n'importe quelle page locale pourrait lancer une
  // connexion Odin et lire l'état de session / les résultats de synchro.
  const OFFICIAL_ORIGIN = "https://kiricoucou.github.io";
  if (location.origin === OFFICIAL_ORIGIN) { init(); }
  else { try { chrome.storage.local.get(["uca_dev_bridge"], (d) => { if (d && d.uca_dev_bridge === true) init(); }); } catch (_) {} }

  function init() {
  const ALLOWED_MODES = new Set(["resync", "login"]);
  // file:// a une origine "null" (pas utilisable comme targetOrigin) : même fenêtre de toute façon.
  const TARGET_ORIGIN = location.origin === "null" ? "*" : location.origin;
  const post = (msg) => window.postMessage(Object.assign({ source: "uca-extension" }, msg), TARGET_ORIGIN);

  /* ---------- Page « Statut » du site : détection de la version et mise à jour autorisées par l'utilisateur ----------
     Le site ne peut rien décider seul : chaque droit est demandé par une fenêtre dessinée ICI, par l'extension (racine
     fermée, seuls les vrais clics comptent : un clic simulé par la page est ignoré).
     - détection : lire la version installée. Autorisation mémorisée (retirable depuis la page) ;
     - mise à jour : autoriser le site à écrire la nouvelle version dans le dossier de l'extension puis à la recharger.
       Valable 10 minutes, jamais mémorisée. Le dossier lui-même est choisi dans la boîte du navigateur. */
  const KEY_DETECT = "uca_site_detect";
  let updateGrantUntil = 0, askBusy = false;
  const manifest = chrome.runtime.getManifest();
  const browserName = /Firefox\//.test(navigator.userAgent) ? "firefox" : "chrome";
  function askUser(title, text, okLabel, noLabel) {
    return new Promise((resolve) => {
      if (askBusy) { resolve(false); return; }
      askBusy = true;
      const host = document.createElement("div");
      host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
      const root = host.attachShadow({ mode: "closed" });
      const st = document.createElement("style");
      st.textContent = ".bd{position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;font:15px/1.45 system-ui,sans-serif}"
        + ".bx{width:min(440px,calc(100vw - 32px));background:#fff;color:#14202b;border-radius:16px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.45)}"
        + "@media (prefers-color-scheme:dark){.bx{background:#18232d;color:#eaf1f6}}"
        + ".tag{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.65;margin:0 0 6px}"
        + "h2{margin:0 0 8px;font-size:19px}p{margin:0 0 18px;opacity:.88}"
        + ".ac{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}"
        + "button{font:inherit;font-weight:700;border-radius:11px;padding:10px 18px;cursor:pointer;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit}"
        + "button.ok{background:#0e8f8a;border-color:#0e8f8a;color:#fff}button:focus-visible{outline:3px solid #f5b400;outline-offset:2px}";
      const bd = document.createElement("div"); bd.className = "bd";
      const bx = document.createElement("div"); bx.className = "bx"; bx.setAttribute("role", "alertdialog"); bx.setAttribute("aria-modal", "true");
      const tag = document.createElement("p"); tag.className = "tag"; tag.textContent = "Extension Emploi du temps UCA";
      const h = document.createElement("h2"); h.textContent = title;
      const pp = document.createElement("p"); pp.textContent = text;
      const ac = document.createElement("div"); ac.className = "ac";
      const no = document.createElement("button"); no.type = "button"; no.textContent = noLabel;
      const ok = document.createElement("button"); ok.type = "button"; ok.className = "ok"; ok.textContent = okLabel;
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
      const done = (v) => { host.remove(); askBusy = false; document.removeEventListener("keydown", onKey, true); resolve(v); };
      no.addEventListener("click", (e) => { if (e.isTrusted) done(false); });
      ok.addEventListener("click", (e) => { if (e.isTrusted) done(true); });
      document.addEventListener("keydown", onKey, true);
      ac.append(no, ok); bx.append(tag, h, pp, ac); bd.appendChild(bx); root.append(st, bd);
      (document.documentElement || document.body).appendChild(host);
      no.focus();
    });
  }
  const getFlag = () => new Promise((res) => { try { chrome.storage.local.get([KEY_DETECT], (d) => res(!!(d && d[KEY_DETECT] === true))); } catch (_) { res(false); } });
  async function onStatusRequest(reqId) {
    let granted = await getFlag();
    if (!granted) {
      post({ type: "UCA_STATUS_PENDING", reqId });
      granted = await askUser("Autoriser le site à voir ta version ?", "Le site kiricoucou.github.io pourra lire le numéro de version de l'extension installée, pour te dire si elle est à jour. Rien d'autre n'est lu ni envoyé.", "Autoriser", "Refuser");
      if (granted) { try { chrome.storage.local.set({ [KEY_DETECT]: true }); } catch (_) {} }
    }
    post({ type: "UCA_STATUS_RESPONSE", reqId, granted, version: granted ? manifest.version : null, browser: granted ? browserName : null });
  }
  async function onUpdatePermission(reqId) {
    post({ type: "UCA_UPDATE_PENDING", reqId });
    const granted = await askUser("Autoriser le site à mettre à jour l'extension ?", "Le site va télécharger la dernière version officielle (signature vérifiée), l'écrire dans le dossier de l'extension que tu vas choisir, puis recharger l'extension. Tes données et réglages ne sont pas touchés.", "Autoriser la mise à jour", "Refuser");
    updateGrantUntil = granted ? Date.now() + 10 * 60 * 1000 : 0;
    post({ type: "UCA_UPDATE_PERMISSION_RESPONSE", reqId, granted });
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== "uca-site") return;
    if (data.type === "UCA_STATUS_REQUEST") { onStatusRequest(data.reqId); return; }
    if (data.type === "UCA_STATUS_REVOKE") { try { chrome.storage.local.remove(KEY_DETECT); } catch (_) {} updateGrantUntil = 0; post({ type: "UCA_STATUS_REVOKED", reqId: data.reqId }); return; }
    if (data.type === "UCA_UPDATE_PERMISSION_REQUEST") { onUpdatePermission(data.reqId); return; }
    if (data.type === "UCA_RELOAD_REQUEST") {
      if (Date.now() < updateGrantUntil) { updateGrantUntil = 0; post({ type: "UCA_RELOAD_ACK", reqId: data.reqId, ok: true }); setTimeout(() => { try { chrome.runtime.sendMessage({ type: "UCA_RELOAD_EXTENSION" }); } catch (_) {} }, 400); }
      else post({ type: "UCA_RELOAD_ACK", reqId: data.reqId, ok: false });
      return;
    }
    if (data.type === "UCA_SYNC_REQUEST" && ALLOWED_MODES.has(data.mode)) {
      chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: data.mode });
    }
    if (data.type === "UCA_OPEN_AGENDA") chrome.runtime.sendMessage({ type: "UCA_OPEN_AGENDA", auto: data.auto === true });
    if (data.type === "UCA_T2C_DEPARTURES_REQUEST") {
      // Accusé immédiat : la page sait que l'extension est là et attend la réponse du serveur au lieu d'abandonner.
      post({ type: "UCA_T2C_DEPARTURES_PENDING", reqId: data.reqId });
      chrome.runtime.sendMessage({ type: "UCA_T2C_DEPARTURES_REQUEST", stopId: data.stopId }, (res) => {
        post({ type: "UCA_T2C_DEPARTURES_RESPONSE", reqId: data.reqId, res: res });
      });
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && (msg.type === "UCA_SYNC_RESULT" || msg.type === "UCA_SYNC_PROGRESS" || msg.type === "UCA_ABSENCES_RESULT" || msg.type === "UCA_NOTES_RESULT")) {
      post(msg);
    }
  });

  chrome.storage.local.get(["uca_session_expired"], (data) => {
    post({ type: "UCA_SESSION_STATE", expired: !!data.uca_session_expired });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.uca_session_expired) {
      post({ type: "UCA_SESSION_STATE", expired: !!changes.uca_session_expired.newValue });
    }
  });

  // Détection de l'app : sa page a été ouverte dans ce navigateur (l'extension y est injectée). Sert au bouton
  // « Envoyer les données à l'app » sur iPhone ; jamais envoyé nulle part, stocké localement.
  if (location.origin === "https://kiricoucou.github.io") {
    try { chrome.storage.local.set({ uca_app_seen: Date.now() }); } catch (_) {}
  }

  post({ type: "UCA_EXTENSION_READY" });
  }
})();
