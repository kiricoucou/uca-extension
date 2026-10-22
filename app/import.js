(function () {
"use strict";

const $ = (id) => document.getElementById(id);
let stream = null, running = false;

function status(text, kind) { $("status").textContent = text; $("status").className = "status" + (kind ? " " + kind : ""); }

async function finish(snap) {
  stopScan();
  try {
    const res = await UCA_TRANSFER.applyImport(snap);
    const when = res.exportedAt ? new Date(res.exportedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    status(`${res.events} cours importés${when ? " (données du " + when + ")" : ""}.`, "ok");
    $("openBtn").classList.remove("hidden");
    $("chooseCard").classList.add("hidden");
    setTimeout(() => location.replace("index.html"), 1400);
  } catch (e) {
    status(e.message, "err");
  }
}

/* ---------- Scanner ---------- */
function stopScan() {
  running = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  $("scanCard").classList.add("hidden");
  $("chooseCard").classList.remove("hidden");
}

async function startScan() {
  status("");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
  } catch (e) {
    status("Caméra inaccessible : autorise-la dans les réglages, ou utilise le fichier .ucasync.", "err");
    return;
  }
  $("chooseCard").classList.add("hidden");
  $("scanCard").classList.remove("hidden");
  $("stopBtn").focus();
  const video = $("video");
  video.srcObject = stream;
  await video.play();
  const canvas = $("frame"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  const col = UCA_TRANSFER.collector();
  running = true;
  const tick = async () => {
    if (!running) return;
    if (video.readyState >= 2) {
      const side = Math.min(video.videoWidth, video.videoHeight), scale = Math.min(1, 720 / side);
      canvas.width = Math.round(side * scale); canvas.height = canvas.width;
      ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
      const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
      if (code) {
        const r = col.add(code.data);
        if (r.ok) {
          $("bar").style.width = Math.round(100 * r.received / r.total) + "%";
          $("scanInfo").textContent = `${r.received} / ${r.total} trames reçues`;
          if (navigator.vibrate) navigator.vibrate(8);
          if (r.done) {
            running = false;
            try { await finish(await col.result()); } catch (e) { status(e.message, "err"); stopScan(); }
            return;
          }
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Fichier ---------- */
async function importText(text) {
  try { await finish(UCA_TRANSFER.validate(JSON.parse(text))); }
  catch (e) { status(e instanceof SyntaxError ? "Fichier illisible." : e.message, "err"); }
}
$("fileInput").addEventListener("change", async () => {
  const f = $("fileInput").files[0];
  if (f) importText(await f.text());
});

/* Fichier partagé vers l'app (Android, « Partager » → EDT UCA) : déposé par sw.js. */
if (new URLSearchParams(location.search).has("shared") && "caches" in window) {
  caches.open("uca-share").then((c) => c.match("shared-file")).then((r) => r && r.text()).then((t) => {
    if (t) { importText(t); caches.open("uca-share").then((c) => c.delete("shared-file")); }
  });
}

/* Lien partagé chiffré (#e=…, voir core/transfer.js buildShareLink) : import direct, sans caméra
   ni fichier. Le code de partage peut être mémorisé sur ce téléphone (stockage local uniquement). */
const SAVED_CODE = "uca_share_code_saved";
let pendingHash = null;
function showCodeCard(h, message) {
  pendingHash = h;
  ["chooseCard", "linkCard"].forEach((id) => $(id).classList.add("hidden"));
  $("codeCard").classList.remove("hidden");
  try {
    const p = UCA_TRANSFER.parseLinkHash(h);
    $("codeExpiry").textContent = p ? "Lien valable jusqu'au " + new Date(p.expiresAt).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + "." : "";
  } catch (e) { $("codeExpiry").textContent = ""; }
  if (message) status(message, "err"); else status("");
  $("codeInput").focus();
}
async function importFromLinkHash(h, typedCode) {
  const saved = (await chrome.storage.local.get(SAVED_CODE))[SAVED_CODE];
  const code = typedCode || saved;
  try {
    const snap = await UCA_TRANSFER.fromLinkHash(h, code);
    if (!snap) { status("Ce texte ne contient pas de lien de partage valide.", "err"); return; }
    if (typedCode) {
      if ($("codeRemember").checked) await chrome.storage.local.set({ [SAVED_CODE]: UCA_TRANSFER.normCode(typedCode) });
      else await chrome.storage.local.remove(SAVED_CODE);
    }
    $("codeCard").classList.add("hidden");
    pendingHash = null;
    finish(UCA_TRANSFER.validate(snap));
  } catch (e) {
    if (e.kind === "code") showCodeCard(h, typedCode ? e.message : (saved ? "Le code mémorisé ne correspond pas à ce lien : tape le code actuel." : ""));
    else { $("codeCard").classList.add("hidden"); $("chooseCard").classList.remove("hidden"); status(e instanceof SyntaxError ? "Lien illisible ou incomplet." : e.message, "err"); }
  }
}
$("codeGoBtn").addEventListener("click", () => {
  const c = UCA_TRANSFER.normCode($("codeInput").value);
  if (c.length < 4) { status("Le code fait au moins 4 caractères.", "err"); return; }
  if (pendingHash) importFromLinkHash(pendingHash, c);
});
$("codeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("codeGoBtn").click(); });
$("codeCancelBtn").addEventListener("click", () => {
  pendingHash = null;
  $("codeCard").classList.add("hidden");
  $("chooseCard").classList.remove("hidden");
  status("");
});
// Ouvert directement avec le fragment dans l'URL : efface-le aussitôt lu, pour ne pas laisser
// le lien dans l'historique du navigateur.
if (location.hash.startsWith("#e=") || location.hash.startsWith("#d=")) {
  const h = location.hash;
  history.replaceState(null, "", location.pathname + location.search);
  importFromLinkHash(h);
}

/* Lien collé à la main (bouton "Coller un lien de partage") : accepte le lien complet ou juste
   le fragment, extrait la partie #d=… où qu'elle soit dans le texte collé. */
function showLinkCard(text) {
  $("chooseCard").classList.add("hidden");
  $("linkCard").classList.remove("hidden");
  $("linkInput").value = text || "";
  $("linkInput").focus();
}
// Un seul geste : le bouton lit le presse-papiers (le navigateur demande l'autorisation ou affiche « Coller »)
// et importe tout de suite si un lien de partage s'y trouve ; sinon, ou si la lecture est refusée, le champ à coller à la main s'ouvre.
$("pasteLinkBtn").addEventListener("click", async () => {
  let text = "";
  try { text = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ""; } catch (e) { text = ""; }
  const m = /#[ed]=\S+/.exec(text || "");
  if (m) { status("Lien trouvé dans le presse-papiers…"); importFromLinkHash(m[0]); return; }
  showLinkCard("");
  if (text) status("Le presse-papiers ne contient pas de lien de partage : colle-le ci-dessous.", "err");
});
$("linkCancelBtn").addEventListener("click", () => {
  $("linkCard").classList.add("hidden");
  $("chooseCard").classList.remove("hidden");
});
$("linkGoBtn").addEventListener("click", () => {
  const raw = $("linkInput").value.trim();
  const m = /#[ed]=\S+/.exec(raw);
  if (!m) { status("Ce texte ne contient pas de lien de partage valide.", "err"); return; }
  $("linkCard").classList.add("hidden");
  importFromLinkHash(m[0]);
});

$("scanBtn").addEventListener("click", startScan);
$("stopBtn").addEventListener("click", stopScan);
$("openBtn").addEventListener("click", () => location.replace("index.html"));
$("skipBtn").addEventListener("click", () => { sessionStorage.setItem("uca_import_skip", "1"); location.replace("index.html"); });
window.UCA_IMPORT = { importText };
})();
