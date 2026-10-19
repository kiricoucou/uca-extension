(function () {
"use strict";

const params = new URLSearchParams(location.search);
const tabMode = params.has("tab");
const changeMode = params.has("change");
document.body.classList.add(tabMode ? "page" : "popup");

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = false;
}

function targetPage(folder) {
  return chrome.runtime.getURL(`${folder}/${tabMode ? "agenda.html" : "popup.html"}`);
}

function choose(id) {
  chrome.runtime.sendMessage({ type: "UCA_SET_DESIGN", id }, (res) => {
    if (!res || !res.ok) { showError((res && res.error) || "Impossible d'appliquer ce design."); return; }
    location.replace(targetPage(res.folder));
  });
}

/* ============================= Agrandissement ============================= */
let lb = null; // { shots, index }
function lbImage() {
  let img = $("lbImg");
  if (!img) { img = el("img"); img.id = "lbImg"; $("lightbox").insertBefore(img, $("lbNext")); }
  return img;
}
function lbShow() {
  const shot = lb.shots[lb.index];
  lbImage();
  $("lbImg").src = chrome.runtime.getURL(shot.src);
  $("lbImg").alt = shot.label;
  $("lbCap").textContent = `${shot.label} — ${lb.index + 1} / ${lb.shots.length}`;
  $("lbPrev").disabled = lb.index === 0;
  $("lbNext").disabled = lb.index === lb.shots.length - 1;
}
function lbOpen(shots, index) { lb = { shots, index }; lbShow(); $("lightbox").classList.add("open"); }
function lbClose() { $("lightbox").classList.remove("open"); lb = null; }
function lbStep(dir) { if (!lb) return; lb.index = Math.max(0, Math.min(lb.shots.length - 1, lb.index + dir)); lbShow(); }
$("lightbox").addEventListener("click", (e) => { if (e.target === $("lightbox") || e.target === $("lbImg")) lbClose(); });
$("lbPrev").addEventListener("click", (e) => { e.stopPropagation(); lbStep(-1); });
$("lbNext").addEventListener("click", (e) => { e.stopPropagation(); lbStep(1); });
document.addEventListener("keydown", (e) => {
  if (!lb) return;
  if (e.key === "Escape") lbClose();
  else if (e.key === "ArrowLeft") lbStep(-1);
  else if (e.key === "ArrowRight") lbStep(1);
});

/* ============================= Galerie d'un design ============================= */
function buildGallery(shots, fallback) {
  const gallery = el("div", "gallery");
  const track = el("div", "track");
  if (!shots.length) {
    const fig = el("figure", "slide");
    fig.style.background = fallback.background;
    track.appendChild(fig);
    gallery.appendChild(track);
    return gallery;
  }
  shots.forEach((shot, i) => {
    const fig = el("figure", "slide");
    const img = el("img");
    img.src = chrome.runtime.getURL(shot.src);
    img.alt = shot.label;
    img.loading = i === 0 ? "eager" : "lazy";
    fig.appendChild(img);
    fig.addEventListener("click", () => lbOpen(shots, i));
    track.appendChild(fig);
  });
  const caption = el("div", "caption", shots[0].label);
  const dots = el("div", "dots");
  const prev = el("button", "nav prev", "‹"); prev.type = "button"; prev.setAttribute("aria-label", "Capture précédente");
  const next = el("button", "nav next", "›"); next.type = "button"; next.setAttribute("aria-label", "Capture suivante");
  // Animation pilotée en JS : le défilement doux natif est annulé par le magnétisme
  // (scroll-snap) quand il part d'un vrai clic souris.
  let anim = 0;
  const goTo = (i) => {
    i = Math.max(0, Math.min(shots.length - 1, i));
    const from = track.scrollLeft, to = i * track.clientWidth, t0 = performance.now(), dur = 280;
    cancelAnimationFrame(anim);
    track.style.scrollSnapType = "none";
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
      track.scrollLeft = from + (to - from) * ease;
      if (k < 1) anim = requestAnimationFrame(step);
      else { track.style.scrollSnapType = ""; sync(); }
    };
    anim = requestAnimationFrame(step);
  };
  const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  shots.forEach((shot, i) => {
    const dot = el("button", "dot"); dot.type = "button"; dot.setAttribute("aria-label", `Capture ${i + 1} : ${shot.label}`);
    dot.addEventListener("click", () => goTo(i));
    dots.appendChild(dot);
  });
  const sync = () => {
    const i = current();
    caption.textContent = shots[i].label;
    [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
    prev.disabled = i === 0;
    next.disabled = i === shots.length - 1;
  };
  prev.addEventListener("click", () => goTo(current() - 1));
  next.addEventListener("click", () => goTo(current() + 1));
  track.addEventListener("scroll", () => requestAnimationFrame(sync), { passive: true });
  gallery.append(track, prev, next, caption, dots);
  requestAnimationFrame(sync);
  return gallery;
}

function render(designs, currentId) {
  const wrap = $("cards");
  designs.forEach((d) => {
    const card = el("section", "card" + (d.id === currentId ? " current" : ""));
    card.appendChild(buildGallery(d.screenshots || [], d.preview || { background: "#888" }));
    const info = el("div", "info");
    const txt = el("div", "txt");
    const name = el("div", "name", d.name);
    if (d.id === currentId) name.appendChild(el("span", "tag", "Actuel"));
    txt.append(name, el("div", "desc", d.description || ""));
    const btn = el("button", "choose-btn", d.id === currentId ? "Garder" : "Choisir");
    btn.type = "button";
    btn.addEventListener("click", () => choose(d.id));
    info.append(txt, btn);
    card.appendChild(info);
    wrap.appendChild(card);
  });
}

Promise.all([
  fetch(chrome.runtime.getURL("designs/designs.json")).then((r) => r.json()),
  chrome.storage.local.get("uca_design"),
]).then(([designs, data]) => {
  const current = designs.find((d) => d.id === data.uca_design);
  // Design déjà choisi mais popup pas encore basculé (service worker endormi) : on redirige.
  if (current && !changeMode && !tabMode) { location.replace(targetPage(current.folder)); return; }
  render(designs, current && current.id);
}).catch(() => showError("Registre des designs illisible (designs/designs.json)."));
})();
