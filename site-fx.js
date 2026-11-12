/* Effets des pages publiques : apparition au défilement et ombre de la barre du haut. Aucun appel réseau. */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var bar = document.querySelector(".topbar");
  if (bar) {
    var onScroll = function () { bar.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
  }
  if (reduce || !("IntersectionObserver" in window)) return;
  var items = document.querySelectorAll("section.block, .card, .hero .wrap > *");
  document.documentElement.classList.add("fx");
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: .08 });
  items.forEach(function (el, k) { el.classList.add("reveal-up"); el.style.transitionDelay = Math.min(k % 4, 3) * 60 + "ms"; io.observe(el); });
})();
