(function () {
"use strict";

const params = new URLSearchParams(location.search);
const tabMode = params.has("tab");
const changeMode = params.has("change");
document.body.classList.add(tabMode ? "page" : "popup");

function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.hidden = false;
}

function targetPage(folder) {
  return chrome.runtime.getURL(`${folder}/${tabMode ? "agenda.html" : "popup.html"}`);
}

function buildPreview(p) {
  const preview = document.createElement("div");
  preview.className = "preview";
  preview.style.background = p.background;
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.style.background = p.accent;
  preview.appendChild(bar);
  for (let i = 0; i < 2; i++) {
    const row = document.createElement("div");
    row.className = "row";
    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.background = p.accent;
    const line = document.createElement("div");
    line.className = "line";
    line.style.background = p.surface;
    row.append(dot, line);
    preview.appendChild(row);
  }
  return preview;
}

function choose(id) {
  chrome.runtime.sendMessage({ type: "UCA_SET_DESIGN", id }, (res) => {
    if (!res || !res.ok) { showError((res && res.error) || "Impossible d'appliquer ce design."); return; }
    location.replace(targetPage(res.folder));
  });
}

function render(designs, currentId) {
  const wrap = document.getElementById("cards");
  designs.forEach((d) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card" + (d.id === currentId ? " current" : "");
    card.appendChild(buildPreview(d.preview || { background: "#fff", surface: "#ddd", accent: "#888" }));
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = d.name;
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = d.description || "";
    card.append(name, desc);
    if (d.id === currentId) {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = "Design actuel";
      card.appendChild(tag);
    }
    card.addEventListener("click", () => choose(d.id));
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
