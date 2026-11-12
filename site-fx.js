/* Effets des pages publiques : apparition au défilement et ombre de la barre du haut. Aucun appel réseau. */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var bar = document.querySelector(".topbar");
  if (bar) {
    var onScroll = function () { bar.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
  }
  // Menu hamburger sur téléphone : la barre de liens devient un panneau ouvert par un bouton.
  if (bar) {
    var nav = bar.querySelector(".nav"), wrap = bar.querySelector(".wrap");
    if (nav && wrap && !bar.querySelector(".nav-toggle")) {
      if (!nav.id) nav.id = "siteNav";
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "nav-toggle"; btn.setAttribute("aria-controls", nav.id); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", "Menu");
      btn.innerHTML = '<svg class="bars" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
                      '<svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      wrap.insertBefore(btn, nav);
      var setOpen = function (o) { bar.classList.toggle("open", o); btn.setAttribute("aria-expanded", String(o)); btn.setAttribute("aria-label", o ? "Fermer le menu" : "Menu"); };
      btn.addEventListener("click", function () { setOpen(!bar.classList.contains("open")); });
      nav.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && bar.classList.contains("open")) { setOpen(false); btn.focus(); } });
      document.addEventListener("click", function (e) { if (bar.classList.contains("open") && !bar.contains(e.target)) setOpen(false); });
      window.addEventListener("resize", function () { if (window.innerWidth > 760) setOpen(false); });
    }
  }
  if (reduce || !("IntersectionObserver" in window)) return;
  var items = document.querySelectorAll("section.block, .card, .hero .wrap > *");
  document.documentElement.classList.add("fx");
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: .08 });
  items.forEach(function (el, k) { el.classList.add("reveal-up"); el.style.transitionDelay = Math.min(k % 4, 3) * 60 + "ms"; io.observe(el); });
})();
