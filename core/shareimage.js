/* Partage d'un jour ou d'une semaine en image PNG, dessinée localement dans un <canvas> (aucune requête,
   rien ne quitte l'appareil avant que tu choisisses où l'envoyer). Les notes personnelles ne figurent jamais
   sur l'image. Partage natif (Web Share API) quand le navigateur sait partager un fichier, sinon téléchargement.
   Commun aux 4 designs ; chargé après tools.js. */
(function (root) {
"use strict";

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
const INK = "#1f2937", DIM = "#5b6472", LINE = "#e3e7ee", PAPER = "#ffffff", BAND = "#f4f6fa";

function pad(n) { return String(n).padStart(2, "0"); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function hhmm(h, m) { return `${pad(h)}:${pad(m)}`; }
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return 0.2;
  const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const n = parseInt(m[1], 16); return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
/* Les couleurs d'événement viennent du design (hex ou hsl(...)) : on les ramène en hex pour le canvas. */
function toHex(color, scratch) {
  scratch.fillStyle = "#888888"; scratch.fillStyle = color || "#888888";
  const v = scratch.fillStyle;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  return m ? "#" + [m[1], m[2], m[3]].map((x) => pad(Number(x).toString(16))).join("") : "#888888";
}
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean).map((w) => fit(ctx, w, maxW)), lines = []; let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return lines;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function evsOn(events, d) {
  const k = dateKey(d);
  return events.filter((e) => e.date === k && !e.cancelled).sort((a, b) => (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
}
function footer(ctx, W, y) {
  ctx.fillStyle = DIM; ctx.font = `500 26px ${FONT}`; ctx.textAlign = "center";
  ctx.fillText("Emploi du temps UCA (non officiel)", W / 2, y); ctx.textAlign = "left";
}

/* Image d'un jour : une carte par cours. */
function drawDay(canvas, { date, events, accent }) {
  const W = 1080, PAD = 48, CARD = 168, GAP = 18, HEAD = 190, FOOT = 96;
  const evs = evsOn(events, date), rows = Math.max(1, evs.length);
  canvas.width = W; canvas.height = HEAD + rows * (CARD + GAP) + FOOT;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BAND; ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, HEAD - 24);
  ctx.fillStyle = "#ffffff"; ctx.font = `700 58px ${FONT}`; ctx.textBaseline = "alphabetic";
  ctx.fillText(cap(date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })), PAD, 96);
  ctx.font = `500 32px ${FONT}`; ctx.globalAlpha = 0.92;
  ctx.fillText(evs.length ? `${evs.length} cours · ${hhmm(evs[0].startH, evs[0].startM)} – ${hhmm(evs[evs.length - 1].endH, evs[evs.length - 1].endM)}` : "Aucun cours", PAD, 144);
  ctx.globalAlpha = 1;
  const scratch = document.createElement("canvas").getContext("2d");
  if (!evs.length) { ctx.fillStyle = DIM; ctx.font = `500 40px ${FONT}`; ctx.fillText("Aucun cours ce jour-là", PAD, HEAD + 90); }
  evs.forEach((ev, i) => {
    const y = HEAD + i * (CARD + GAP);
    ctx.fillStyle = PAPER; roundRect(ctx, PAD, y, W - 2 * PAD, CARD, 22); ctx.fill();
    ctx.fillStyle = toHex(ev.color, scratch); roundRect(ctx, PAD, y, 18, CARD, 9); ctx.fill();
    ctx.fillStyle = DIM; ctx.font = `600 32px ${FONT}`; ctx.fillText(`${hhmm(ev.startH, ev.startM)} – ${hhmm(ev.endH, ev.endM)}`, PAD + 52, y + 56);
    ctx.fillStyle = INK; ctx.font = `700 40px ${FONT}`;
    const t = wrap(ctx, ev.title, W - 2 * PAD - 100, 1);
    ctx.fillText(t[0] || "", PAD + 52, y + 108);
    ctx.fillStyle = DIM; ctx.font = `500 30px ${FONT}`;
    const sub = [ev.room, ev.teacher].filter(Boolean).join(" · ");
    ctx.fillText(wrap(ctx, sub, W - 2 * PAD - 100, 1)[0] || "", PAD + 52, y + 150);
  });
  footer(ctx, W, canvas.height - 38);
}

/* Image d'une semaine : grille horaire, un bloc par cours. */
function drawWeek(canvas, { days, events, accent }) {
  const list = days.filter((d, i) => i < 5 || evsOn(events, d).length);
  const all = list.flatMap((d) => evsOn(events, d));
  const startH = Math.min(8, ...all.map((e) => e.startH)), endH = Math.max(18, ...all.map((e) => e.endH + (e.endM ? 1 : 0)));
  const W = 1800, PAD = 40, GUT = 96, HEAD = 150, DAYH = 96, HOUR = 96, FOOT = 90;
  const colW = (W - 2 * PAD - GUT) / list.length, gridTop = HEAD + DAYH, gridH = (endH - startH) * HOUR;
  canvas.width = W; canvas.height = gridTop + gridH + FOOT;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, HEAD - 20);
  const first = list[0], last = list[list.length - 1];
  ctx.fillStyle = "#ffffff"; ctx.font = `700 56px ${FONT}`; ctx.textBaseline = "alphabetic";
  ctx.fillText(`Semaine du ${first.getDate()} ${first.toLocaleDateString("fr-FR", { month: "long" })} au ${last.getDate()} ${last.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`, PAD, 88);
  const scratch = document.createElement("canvas").getContext("2d");
  const today = dateKey(new Date());
  list.forEach((d, i) => {
    const x = PAD + GUT + i * colW;
    ctx.fillStyle = dateKey(d) === today ? accent : INK; ctx.font = `700 34px ${FONT}`; ctx.textAlign = "center";
    ctx.fillText(cap(d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")), x + colW / 2, HEAD + 40);
    ctx.font = `500 30px ${FONT}`; ctx.fillStyle = DIM; ctx.fillText(String(d.getDate()), x + colW / 2, HEAD + 80);
    ctx.textAlign = "left";
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, gridTop); ctx.lineTo(x, gridTop + gridH); ctx.stroke();
  });
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD + GUT + list.length * colW, gridTop); ctx.lineTo(PAD + GUT + list.length * colW, gridTop + gridH); ctx.stroke();
  for (let h = startH; h <= endH; h++) {
    const y = gridTop + (h - startH) * HOUR;
    ctx.strokeStyle = LINE; ctx.beginPath(); ctx.moveTo(PAD + GUT, y); ctx.lineTo(W - PAD, y); ctx.stroke();
    ctx.fillStyle = DIM; ctx.font = `500 26px ${FONT}`; ctx.fillText(`${pad(h)}:00`, PAD, y + 9);
  }
  list.forEach((d, i) => {
    const evs = evsOn(events, d), x0 = PAD + GUT + i * colW;
    // Colonnes côte à côte pour les cours qui se chevauchent.
    const placed = []; let cluster = [], clusterEnd = -1;
    const flush = () => { cluster.forEach((e, k) => placed.push({ e, k, n: cluster.length })); cluster = []; };
    evs.forEach((e) => {
      const s = e.startH * 60 + e.startM;
      if (cluster.length && s >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(e); clusterEnd = Math.max(clusterEnd, e.endH * 60 + e.endM);
    });
    flush();
    placed.forEach(({ e, k, n }) => {
      const top = gridTop + ((e.startH * 60 + e.startM) / 60 - startH) * HOUR + 3;
      const h = Math.max(46, ((e.endH * 60 + e.endM) - (e.startH * 60 + e.startM)) / 60 * HOUR - 6);
      const w = (colW - 12) / n, x = x0 + 6 + k * w;
      const fill = toHex(e.color, scratch);
      ctx.fillStyle = fill; roundRect(ctx, x, top, w - 4, h, 14); ctx.fill();
      ctx.fillStyle = lum(fill) > 0.5 ? INK : "#ffffff";
      ctx.font = `600 24px ${FONT}`; ctx.fillText(hhmm(e.startH, e.startM), x + 14, top + 34);
      ctx.font = `700 26px ${FONT}`;
      const maxLines = Math.max(1, Math.floor((h - 50) / 31));
      wrap(ctx, e.title, w - 32, maxLines).forEach((ln, li) => ctx.fillText(ln, x + 14, top + 66 + li * 31));
      const used = Math.min(maxLines, wrap(ctx, e.title, w - 32, maxLines).length);
      if (e.room && h > 66 + used * 31 + 24) { ctx.font = `500 23px ${FONT}`; ctx.fillText(wrap(ctx, e.room, w - 32, 1)[0], x + 14, top + 66 + used * 31 + 4); }
    });
  });
  footer(ctx, W, canvas.height - 34);
}

function accentOf() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const c = document.createElement("canvas").getContext("2d");
  c.fillStyle = "#0b57d0"; c.fillStyle = v || "#0b57d0";
  const hex = /^#[0-9a-f]{6}$/i.test(c.fillStyle) ? c.fillStyle : "#0b57d0";
  // Texte blanc sur le bandeau : accent trop clair (design sombre) -> assombri.
  return lum(hex) > 0.35 ? "#0b57d0" : hex;
}

/* kind : "day" (opts.date) ou "week" (opts.days). Renvoie { blob, name }. */
function render(kind, opts) {
  const canvas = document.createElement("canvas"), accent = opts.accent || accentOf();
  if (kind === "day") drawDay(canvas, { date: opts.date, events: opts.events, accent });
  else drawWeek(canvas, { days: opts.days, events: opts.events, accent });
  const name = kind === "day" ? `edt-uca-${dateKey(opts.date)}.png` : `edt-uca-semaine-${dateKey(opts.days[0])}.png`;
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve({ blob, name, width: canvas.width, height: canvas.height }); else reject(new Error("image impossible"));
  }, "image/png"));
}

/* Partage natif si possible (feuille de partage du téléphone), sinon téléchargement. -> "shared" | "downloaded" | "cancelled" */
async function share({ blob, name }) {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Emploi du temps UCA" }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.dispatchEvent(new MouseEvent("click", { bubbles: false })); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}

root.UCA_SHARE_IMAGE = { render, share };
})(self);
