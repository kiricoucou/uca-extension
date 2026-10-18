(function () {
  "use strict";
  // Les iframes d'une page matchée ne doivent pas pouvoir piloter l'extension.
  if (window.top !== window) return;

  const ALLOWED_MODES = new Set(["resync", "login"]);
  // file:// a une origine "null" (pas utilisable comme targetOrigin) : même fenêtre de toute façon.
  const TARGET_ORIGIN = location.origin === "null" ? "*" : location.origin;
  const post = (msg) => window.postMessage(Object.assign({ source: "uca-extension" }, msg), TARGET_ORIGIN);

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== "uca-site") return;
    if (data.type === "UCA_SYNC_REQUEST" && ALLOWED_MODES.has(data.mode)) {
      chrome.runtime.sendMessage({ type: "UCA_SYNC_REQUEST", mode: data.mode });
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

  post({ type: "UCA_EXTENSION_READY" });
})();
