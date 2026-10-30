/* =========================================================================
   My UCA — GitHub Auto-Updater & Hard-Block System
   Surveille la branche 'main' du dépôt GitHub et verrouille l'application
   dès qu'une nouvelle version ou un nouveau push est détecté.
   ========================================================================= */
(function() {
  "use strict";

  if (window.AndroidUCA) {
    // Dans l'app Android native, MainActivity.kt gère déjà la détection de mise à jour,
    // l'écran bloquant natif et le téléchargement OTA. Aucun overlay DOM JS nécessaire.
    return;
  }

  const GITHUB_REPO = "kiricoucou/uca-extension";
  const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/" + GITHUB_REPO + "/main/";
  const GITHUB_VERSION_URL = GITHUB_RAW_BASE + "version.json";
  const GITHUB_COMMITS_URL = "https://api.github.com/repos/" + GITHUB_REPO + "/commits/main";
  const BAKED_VERSION = "1.3.0"; // version embarquée dans ces fichiers (à aligner sur version.json à chaque publication)
  const LS_APPLIED = "uca_updater_applied";   // dernière version appliquée (sinon la mise à jour se redemandait en boucle)
  const LS_DISMISSED = "uca_updater_dismissed"; // dernière version repoussée avec « Plus tard »
  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (_) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  const LOCAL_CURRENT_VERSION = (function () {
    const a = lsGet(LS_APPLIED);
    return a && compareSemver(a, BAKED_VERSION) >= 0 ? a : BAKED_VERSION;
  })();
  const LOCAL_CURRENT_COMMIT = "dcf1390";

  function compareSemver(a, b) {
    const pa = String(a).split(".").map(n => parseInt(n, 10) || 0);
    const pb = String(b).split(".").map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const va = pa[i] || 0, vb = pb[i] || 0;
      if (va !== vb) return va - vb;
    }
    return 0;
  }

  function injectBlockerStyles() {
    if (document.getElementById("uca-blocker-styles")) return;
    const style = document.createElement("style");
    style.id = "uca-blocker-styles";
    style.textContent = `
      .github-blocker-overlay {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        background: rgba(13, 21, 39, 0.98) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 16px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        color: #f2f3f5 !important;
        box-sizing: border-box !important;
      }
      .github-blocker-card {
        background: #162032 !important;
        border: 1px solid rgba(255, 107, 107, 0.45) !important;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.75), 0 0 35px rgba(255, 107, 107, 0.2) !important;
        border-radius: 20px !important;
        padding: 24px !important;
        max-width: 440px !important;
        width: 100% !important;
        text-align: center !important;
        animation: blocker-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      @keyframes blocker-pop {
        from { transform: scale(0.92); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      .blocker-alert-badge {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        background: rgba(255, 107, 107, 0.15) !important;
        border: 1px solid rgba(255, 107, 107, 0.4) !important;
        color: #ff6b6b !important;
        font-size: 11.5px !important;
        font-weight: 800 !important;
        letter-spacing: 0.8px !important;
        padding: 6px 14px !important;
        border-radius: 999px !important;
        margin-bottom: 12px !important;
      }
      .pulse-dot {
        width: 8px !important;
        height: 8px !important;
        background: #ff6b6b !important;
        border-radius: 50% !important;
        animation: pulse-red 1.5s infinite !important;
      }
      @keyframes pulse-red {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7); }
        70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(255, 107, 107, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 107, 107, 0); }
      }
      .blocker-title {
        font-size: 20px !important;
        font-weight: 800 !important;
        color: #ffffff !important;
        margin: 0 0 8px 0 !important;
      }
      .blocker-sub {
        font-size: 12.5px !important;
        color: #9aa0ab !important;
        line-height: 1.5 !important;
        margin: 0 0 16px 0 !important;
      }
      .blocker-version-box {
        background: #0f1726 !important;
        border: 1px solid #2a3548 !important;
        border-radius: 14px !important;
        padding: 14px !important;
        margin-bottom: 18px !important;
        text-align: left !important;
      }
      .version-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        margin-bottom: 6px !important;
      }
      .current-v { color: #9aa0ab !important; }
      .latest-v { color: #00bfa5 !important; font-weight: 700 !important; }
      .commit-row {
        font-size: 11.5px !important;
        color: #64748b !important;
        margin-bottom: 10px !important;
      }
      .changelog-box {
        border-top: 1px solid #1e293b !important;
        padding-top: 8px !important;
      }
      .changelog-title {
        font-size: 11.5px !important;
        font-weight: 700 !important;
        color: #cbd5e1 !important;
        margin-bottom: 4px !important;
      }
      .changelog-box ul {
        margin: 0 !important;
        padding-left: 16px !important;
        font-size: 11.5px !important;
        color: #94a3b8 !important;
        line-height: 1.4 !important;
      }
      .btn-blocker-primary {
        display: block !important;
        width: 100% !important;
        background: linear-gradient(135deg, #00bfa5, #00897b) !important;
        color: #05211f !important;
        border: none !important;
        border-radius: 12px !important;
        padding: 13px !important;
        font-size: 13.5px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        box-shadow: 0 4px 14px rgba(0, 191, 165, 0.4) !important;
        margin-bottom: 8px !important;
        transition: transform 0.15s ease !important;
      }
      .btn-blocker-primary:active { transform: scale(0.98) !important; }
      .btn-blocker-secondary {
        display: block !important;
        width: 100% !important;
        background: #1e293b !important;
        color: #f1f5f9 !important;
        border: 1px solid #334155 !important;
        border-radius: 12px !important;
        padding: 11px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        text-decoration: none !important;
        box-sizing: border-box !important;
        margin-bottom: 8px !important;
      }
      .btn-blocker-link {
        display: inline-block !important;
        color: #38bdf8 !important;
        font-size: 11.5px !important;
        text-decoration: underline !important;
        margin-top: 4px !important;
      }
      .btn-blocker-dev {
        display: block !important;
        background: transparent !important;
        border: none !important;
        color: #64748b !important;
        font-size: 11px !important;
        margin-top: 10px !important;
        cursor: pointer !important;
        text-decoration: underline !important;
      }
    `;
    document.head.appendChild(style);
  }

  function showGithubUpdateBlocker(info) {
    injectBlockerStyles();
    let overlay = document.getElementById("githubUpdateBlockerOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "githubUpdateBlockerOverlay";
      overlay.className = "github-blocker-overlay";
      document.body.appendChild(overlay);
    }

    const currentV = info.currentVersion || LOCAL_CURRENT_VERSION;
    const latestV = info.latestVersion || info.version || "1.2.0";
    const commitSha = (info.commitSha || info.commit_sha || "main").substring(0, 7);
    const changelogItems = (info.changelog || [
      "Nouveau push validé sur la branche main",
      "Mise à jour obligatoire de sécurité et de conformité",
      "Actualisation des cours et synchronisation Odin"
    ]).map(c => `<li>${c}</li>`).join("");

    overlay.innerHTML = `
      <div class="github-blocker-card" role="alertdialog" aria-modal="true" aria-labelledby="blockerTitle">
        <div class="blocker-header">
          <div class="blocker-alert-badge" style="background:rgba(0,191,165,0.15)!important;border-color:rgba(0,191,165,0.4)!important;color:#00bfa5!important;">
            <span class="pulse-dot" style="background:#00bfa5!important;"></span> ⚡ MISE À JOUR RAPIDE (OTA - 2 SEC)
          </div>
          <h2 class="blocker-title" id="blockerTitle">Nouvelle version détectée sur GitHub</h2>
          <p class="blocker-sub">Un nouveau push a été validé sur la branche <code>main</code>. L'application va se mettre à jour à chaud en 2 secondes sans retélécharger l'APK complet.</p>
        </div>

        <div class="blocker-version-box">
          <div class="version-row">
            <span class="v-label">Actuelle : <b class="current-v">v${currentV}</b></span>
            <span class="v-arrow">➔</span>
            <span class="v-label">Nouvelle : <b class="latest-v">v${latestV}</b></span>
          </div>
          <div class="commit-row">
            <span>Branche : <b>main</b></span> · <span>Commit : <code>${commitSha}</code></span>
          </div>
          <div class="changelog-box">
            <div class="changelog-title">Nouveautés &amp; Correctifs :</div>
            <ul>${changelogItems}</ul>
          </div>
        </div>

        <div class="blocker-actions">
          <button id="btnBlockerApplyUpdate" class="btn-blocker-primary">
            ⚡ Mettre à jour en 2 secondes (OTA)
          </button>
          <a id="btnBlockerDownloadApk" href="./EdtUca.apk" download class="btn-blocker-secondary">
            📦 Télécharger l'APK complet (48 Mo)
          </a>
          <a id="btnBlockerOpenGithub" href="https://github.com/${GITHUB_REPO}" target="_blank" rel="noopener noreferrer" class="btn-blocker-link">
            🔗 Voir le dépôt sur GitHub
          </a>
          <button id="btnBlockerBypassDev" class="btn-blocker-dev">
            Plus tard
          </button>
        </div>
      </div>
    `;

    document.getElementById("btnBlockerApplyUpdate").addEventListener("click", async () => {
      lsSet(LS_APPLIED, latestV);
      const btn = document.getElementById("btnBlockerApplyUpdate");
      btn.textContent = "Nettoyage du cache & Mise à jour...";
      btn.disabled = true;
      try {
        try { localStorage.setItem("uca_updater_applied", latestV); } catch (_) {}
        if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
          await window.chrome.storage.local.set({
            uca_update_available: false,
            uca_current_version: latestV,
            uca_latest_version: latestV
          });
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter(k => k !== "uca-share").map(k => caches.delete(k)));
        }
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
      } catch (_) {}
      window.location.reload(true);
    });

    document.getElementById("btnBlockerBypassDev").addEventListener("click", () => {
      lsSet(LS_DISMISSED, latestV);
      overlay.remove();
    });
  }

  async function checkGitHubPushUpdate() {
    try {
      const res = await fetch(GITHUB_VERSION_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const remote = await res.json();
      if (!remote) return;

      const remoteVer = remote.version || "";
      const appliedVer = lsGet(LS_APPLIED);
      if (appliedVer && compareSemver(appliedVer, remoteVer) >= 0) {
        return; // Version déjà appliquée
      }
      const isNewer = compareSemver(remoteVer, LOCAL_CURRENT_VERSION) > 0 || (remote.force_update && remoteVer !== LOCAL_CURRENT_VERSION);

      if (isNewer && lsGet(LS_DISMISSED) !== remoteVer) {
        showGithubUpdateBlocker({
          currentVersion: LOCAL_CURRENT_VERSION,
          latestVersion: remoteVer,
          commitSha: remote.commit_sha || "main",
          changelog: remote.changelog,
          publishedAt: remote.published_at
        });
      }
    } catch (_) {
      // Pas de connexion ou GitHub inaccessible : ne bloque pas hors-ligne
    }
  }

  window.UCA_GITHUB_UPDATER = {
    checkNow: checkGitHubPushUpdate,
    simulateBlock: () => showGithubUpdateBlocker({
      currentVersion: LOCAL_CURRENT_VERSION,
      latestVersion: "1.2.0",
      commitSha: "a8f3b92",
      changelog: [
        "Nouveau push détecté sur la branche main",
        "Blocage automatique de sécurité et de conformité",
        "Mise à jour directe de l'APK Android et rechargement PWA"
      ]
    }),
    dismissDev: () => {
      const el = document.getElementById("githubUpdateBlockerOverlay");
      if (el) el.remove();
    }
  };

  // Vérification au chargement
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => checkGitHubPushUpdate());
  } else {
    checkGitHubPushUpdate();
  }

  // Vérification périodique toutes les 15 minutes
  setInterval(checkGitHubPushUpdate, 15 * 60 * 1000);
})();
