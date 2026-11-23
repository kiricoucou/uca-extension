/* Démo interactive de la page d'accueil : le vrai agenda de chaque design dans un cadre, avec des données inventées
   (core/demo.js, stockage de session à part, aucune requête hors de ce site). Le cadre est chargé seulement quand
   la section devient visible. data-prefix : "" (accueil) ou "../" (pages dans /en/). */
(function () {
"use strict";
const root = document.getElementById("demo");
if (!root) return;
const prefix = root.dataset.prefix || "";
const frame = root.querySelector("iframe"), box = root.querySelector(".demo-frame"), stage = root.querySelector(".demo-stage");
const tabs = root.querySelector("[data-tabs]");
const PHONE = { w: 390, h: 760 }, DESKTOP = { w: 1280, h: 760 };
let design = "professionnel";
let device = window.matchMedia("(max-width:700px)").matches ? "phone" : "desktop";
let started = false;

function layout() {
  const size = device === "phone" ? PHONE : DESKTOP;
  const border = device === "phone" ? 16 : 2;
  let scale = Math.min(1, ((stage.clientWidth || size.w + border) - border) / size.w);
  // Téléphone : toujours entier à l'écran en hauteur (boutons des designs au-dessus, un peu d'air en dessous), sans passer sous 55 %.
  if (device === "phone") {
    const room = (window.innerHeight || 800) - 150;
    scale = Math.min(scale, Math.max(0.55, (room - border) / size.h));
  }
  frame.style.width = size.w + "px"; frame.style.height = size.h + "px";
  frame.style.transform = scale < 1 ? `scale(${scale})` : "";
  box.style.width = Math.round(size.w * scale) + "px"; box.style.height = Math.round(size.h * scale) + "px";
  box.classList.toggle("is-phone", device === "phone");
  root.querySelectorAll("[data-device]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === device)));
}
function load() {
  if (!started) return;
  frame.src = `${prefix}designs/${design}/agenda.html?demo=1`;
}
function select(id) {
  design = id;
  tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.design === id)));
  load();
}

// Changer d'appareil recharge la démo : un vrai téléphone démarre en vue Jour, pas dans la vue Semaine de l'ordinateur.
root.querySelectorAll("[data-device]").forEach((b) => b.addEventListener("click", () => { if (device === b.dataset.device) return; device = b.dataset.device; layout(); load(); }));
window.addEventListener("resize", layout);
layout();

fetch(`${prefix}designs/designs.json`).then((r) => r.json()).then((list) => {
  list.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "seg"; b.dataset.design = d.id; b.textContent = d.name.replace(/^Design\s+/i, "");
    b.setAttribute("aria-pressed", String(d.id === design));
    b.addEventListener("click", () => select(d.id));
    tabs.appendChild(b);
  });
}).catch(() => {});

/* Sur téléphone, l'app est dans un cadre qui occuperait tout l'écran : un doigt fait défiler la PAGE (on ne reste pas
   « coincé » dans la démo), deux doigts font défiler l'APP. Les glissements horizontaux (changer de semaine) et les appuis
   restent à l'app. Le cadre est de la même origine : on écoute ses touches. */
const coarse = window.matchMedia("(pointer: coarse)");
let hint = null, hintTimer = 0;
function showHint() {
  if (!hint) { hint = document.createElement("div"); hint.className = "demo-hint"; hint.setAttribute("aria-hidden", "true"); hint.textContent = "Deux doigts pour faire défiler l'app"; box.appendChild(hint); }
  hint.classList.add("on"); clearTimeout(hintTimer); hintTimer = setTimeout(() => hint.classList.remove("on"), 1800);
}
function guardTouches() {
  let d; try { d = frame.contentDocument; } catch (e) { return; }
  if (!d || d.__ucaTwoFingers) return;
  d.__ucaTwoFingers = true;
  let sx = 0, sy = 0, last = 0, mode = "", vy = 0, lastT = 0, raf = 0;
  const scale = () => { const w = frame.offsetWidth || 1; return frame.getBoundingClientRect().width / w || 1; };
  d.addEventListener("touchstart", (e) => {
    cancelAnimationFrame(raf);
    if (e.touches.length > 1) { mode = "app"; return; }
    sx = e.touches[0].clientX; sy = last = e.touches[0].clientY; mode = ""; vy = 0; lastT = e.timeStamp;
  }, { passive: true, capture: true });
  d.addEventListener("touchmove", (e) => {
    if (!coarse.matches) return;
    if (e.touches.length > 1) { mode = "app"; return; }       // deux doigts : l'app défile
    if (mode === "app") return;                               // le geste a commencé à deux doigts
    const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (!mode) { if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) mode = "page"; else if (Math.abs(dx) > 8) mode = "swipe"; else return; }
    if (mode !== "page") return;                              // glissement horizontal : à l'app
    e.preventDefault();
    const k = scale(), step = (last - t.clientY) * k;
    window.scrollBy(0, step); vy = step / Math.max(1, e.timeStamp - lastT); last = t.clientY; lastT = e.timeStamp; showHint();
  }, { passive: false, capture: true });
  d.addEventListener("touchend", () => {
    if (mode !== "page" || Math.abs(vy) < 0.15) return;
    let v = vy * 16;                                          // élan : la page continue un instant, comme un défilement normal
    const run = () => { window.scrollBy(0, v); v *= 0.95; if (Math.abs(v) > 0.4) raf = requestAnimationFrame(run); };
    raf = requestAnimationFrame(run);
  }, { passive: true, capture: true });
}
frame.addEventListener("load", guardTouches);

function start() { if (started) return; started = true; load(); }
if ("IntersectionObserver" in window) {
  new IntersectionObserver((entries, obs) => { if (entries.some((e) => e.isIntersecting)) { start(); obs.disconnect(); } }, { rootMargin: "200px" }).observe(root);
} else start();
})();
