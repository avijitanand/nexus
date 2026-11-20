/* fx.js — cursor-follow hover effects (UI only, independent of app logic) */
(function () {
  "use strict";
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var SEL = ".card, .stat, .auth-container, .modal, .nav-item, .role-option, .chat-item";
  var TILT = ".project-card, .stat";
  var cur = null, raf = 0, ev = null;

  function paint() {
    raf = 0;
    if (!cur || !ev) return;
    var r = cur.getBoundingClientRect();
    var x = ev.clientX - r.left, y = ev.clientY - r.top;
    cur.style.setProperty("--mx", x + "px");
    cur.style.setProperty("--my", y + "px");
    if (cur.matches(TILT)) {
      var max = 6;
      cur.style.setProperty("--ry", ((x / r.width - 0.5) * 2 * max).toFixed(2) + "deg");
      cur.style.setProperty("--rx", ((0.5 - y / r.height) * 2 * max).toFixed(2) + "deg");
    }
  }
  function reset(n) {
    if (!n) return;
    n.classList.remove("fx-on");
    n.style.removeProperty("--rx");
    n.style.removeProperty("--ry");
  }

  document.addEventListener("pointermove", function (e) {
    var t = e.target.closest ? e.target.closest(SEL) : null;
    if (t !== cur) { reset(cur); cur = t; if (cur) cur.classList.add("fx-on"); }
    if (!cur) return;
    ev = e;
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });

  document.addEventListener("pointerleave", function () { reset(cur); cur = null; }, true);
  window.addEventListener("blur", function () { reset(cur); cur = null; });
})();
