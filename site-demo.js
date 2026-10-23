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
  const scale = Math.min(1, ((stage.clientWidth || size.w + border) - border) / size.w);
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

function start() { if (started) return; started = true; load(); }
if ("IntersectionObserver" in window) {
  new IntersectionObserver((entries, obs) => { if (entries.some((e) => e.isIntersecting)) { start(); obs.disconnect(); } }, { rootMargin: "200px" }).observe(root);
} else start();
})();
