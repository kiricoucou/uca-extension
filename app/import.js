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

$("scanBtn").addEventListener("click", startScan);
$("stopBtn").addEventListener("click", stopScan);
$("openBtn").addEventListener("click", () => location.replace("index.html"));
$("skipBtn").addEventListener("click", () => { sessionStorage.setItem("uca_import_skip", "1"); location.replace("index.html"); });
window.UCA_IMPORT = { importText };
})();
