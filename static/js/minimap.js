/*
 * The page as a program: a minimap of the whole page, in the style of each tool's own overview.
 *
 *   IDA            the navigation band: a strip under the toolbar, coloured by what each stretch of the page is
 *                  (library / function / instructions / data / imports / Lumina / unexplored) with a yellow arrow
 *                  at the position you are reading.
 *   Ghidra         the overview bar down the right edge of the listing, with a box for the visible part.
 *   Binary Ninja   the feature map down the right edge, drawn as small cells, with a navigation line.
 *
 * What each stretch is comes from the page itself: headings, paragraphs, code blocks, images, links, lists and the
 * empty space between them. Click or drag on it to scroll. It is rebuilt when the page changes or resizes
 * (nav.js fires "pagechange"). It only exists while one of the three themes is active.
 */
(function minimap() {
  "use strict";

  var root = document.documentElement;
  var el = null, cv = null, ctx = null, marker = null, view = null, tip = null;
  var conf = null, theme = null, kinds = [], docH = 1, rafScroll = 0, rafBuild = 0, ro = null;

  // What a stretch of the page is called in each tool, and the colour variable it is drawn with.
  var CONF = {
    ida: {
      axis: "x", size: 16,
      kinds: {
        gap:  { c: "--nb-unexp",  name: "unexplored" },
        data: { c: "--nb-data",   name: "data" },
        text: { c: "--nb-func",   name: "regular function" },
        card: { c: "--nb-lumina", name: "Lumina function" },
        head: { c: "--nb-lib",    name: "library function" },
        img:  { c: "--nb-ext",    name: "imported" },
        code: { c: "--nb-insn",   name: "instructions" },
      },
    },
    ghidra: {
      axis: "y", size: 14,
      kinds: {
        gap:  { c: "#3a3d3f", name: "undefined" },
        data: { c: "#c0c080", name: "data" },
        text: { c: "#4b6eaf", name: "code" },
        card: { c: "#87cefa", name: "reference" },
        head: { c: "#70c070", name: "function" },
        img:  { c: "#ff9944", name: "data type" },
        code: { c: "#c070c0", name: "instruction" },
      },
    },
    binja: {
      axis: "y", size: 22, cell: 5,
      kinds: {
        gap:  { c: "#0d0d0d", name: "empty" },
        data: { c: "#808080", name: "data" },
        text: { c: "#a0ceee", name: "function" },
        card: { c: "#e4b595", name: "import" },
        head: { c: "#c5daa4", name: "ASCII string" },
        img:  { c: "#808080", name: "data" },
        code: { c: "#e0a3b3", name: "Unicode string" },
      },
    },
  };
  var ORDER = ["gap", "data", "text", "card", "head", "img", "code"];   // later kinds are painted over earlier ones
  var SELECTORS = [
    ["data", "main table, main .chip-list, main .timeline-entry ul, main .catalogue-meta, main .badge-rank"],
    ["text", "main p, main li, main blockquote, main .hero-tagline"],
    ["card", "main a.post-card, main .catalogue-entry, main .btn-cv, main .link-more, main .block-end"],
    ["head", "main .block-head, main h1, main h2, main h3, main h4"],
    ["img",  "main .post-body img, main .portrait"],
    ["code", "main pre"],
  ];

  function themeId() { var t = root.getAttribute("data-theme"); return CONF[t] ? t : null; }
  function cssColor(c) { return c.charAt(0) === "-" ? getComputedStyle(root).getPropertyValue(c).trim() || "#888" : c; }

  function ensure() {
    if (el) return;
    el = document.createElement("div");
    el.className = "mm";
    el.setAttribute("aria-hidden", "true");
    cv = document.createElement("canvas");
    cv.className = "mm-cv";
    view = document.createElement("i"); view.className = "mm-view";
    marker = document.createElement("i"); marker.className = "mm-marker";
    tip = document.createElement("span"); tip.className = "mm-tip";
    el.appendChild(cv); el.appendChild(view); el.appendChild(marker); el.appendChild(tip);
    document.body.appendChild(el);
    ctx = cv.getContext("2d");
    wire();
  }
  function remove() {
    if (!el) return;
    el.remove(); el = cv = ctx = marker = view = tip = null;
    if (ro) { ro.disconnect(); ro = null; }
  }

  /* ---- reading the page ---- */
  function collect() {
    var top0 = window.scrollY, out = [];
    docH = Math.max(1, root.scrollHeight);
    SELECTORS.forEach(function (pair) {
      var kind = pair[0];
      document.querySelectorAll(pair[1]).forEach(function (n) {
        var r = n.getBoundingClientRect();
        if (r.height < 1 || r.width < 1) return;
        out.push({ kind: kind, a: (r.top + top0) / docH, b: (r.bottom + top0) / docH });
      });
    });
    return out;
  }

  /* ---- drawing ---- */
  function build() {
    rafBuild = 0;
    theme = themeId();
    if (!theme) { remove(); return; }
    ensure();
    conf = CONF[theme];
    el.setAttribute("data-mm", theme);
    var bar = document.querySelector(".tabbar"), sb = document.querySelector(".statusbar");
    root.style.setProperty("--mm-top", (bar ? bar.offsetHeight : 54) + "px");
    root.style.setProperty("--mm-bottom", (sb ? sb.offsetHeight : 33) + "px");

    var horizontal = conf.axis === "x";
    var len = Math.max(40, Math.round(horizontal ? window.innerWidth : window.innerHeight - (bar ? bar.offsetHeight : 54) - (sb ? sb.offsetHeight : 33)));
    var thick = conf.size, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round((horizontal ? len : thick) * dpr);
    cv.height = Math.round((horizontal ? thick : len) * dpr);
    cv.style.width = (horizontal ? len : thick) + "px";
    cv.style.height = (horizontal ? thick : len) + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    kinds = collect();
    paint(len, thick, horizontal);
    updateMarker();
    if (!ro && window.ResizeObserver) {
      ro = new ResizeObserver(schedule);
      var main = document.querySelector("main");
      if (main) ro.observe(main);
    }
  }

  function paint(len, thick, horizontal) {
    var K = conf.kinds, cell = conf.cell || 0;
    ctx.clearRect(0, 0, horizontal ? len : thick, horizontal ? thick : len);
    ctx.fillStyle = cssColor(K.gap.c);
    ctx.fillRect(0, 0, horizontal ? len : thick, horizontal ? thick : len);
    var colour = {};
    ORDER.forEach(function (k) { colour[k] = cssColor(K[k].c); });
    ORDER.forEach(function (k) {
      if (k === "gap") return;
      ctx.fillStyle = colour[k];
      kinds.forEach(function (s) {
        if (s.kind !== k) return;
        var a = s.a * len, b = Math.max(a + 1, s.b * len);
        if (cell) { a = Math.floor(a / cell) * cell; b = Math.max(a + cell, Math.ceil(b / cell) * cell); }
        if (horizontal) ctx.fillRect(a, 0, b - a, thick); else ctx.fillRect(0, a, thick, b - a);
      });
    });
    if (cell) {                                   // the feature map is drawn as cells: a faint grid over the colours
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      for (var p = cell; p < len; p += cell) { if (horizontal) ctx.fillRect(p - 1, 0, 1, thick); else ctx.fillRect(0, p - 1, thick, 1); }
      ctx.fillRect(Math.round(thick / 2) - 1, 0, 1, horizontal ? thick : len);
    }
  }

  function updateMarker() {
    rafScroll = 0;
    if (!el || !conf) return;
    var horizontal = conf.axis === "x";
    var vh = window.innerHeight, y = window.scrollY;
    var a = y / docH, b = Math.min(1, (y + vh) / docH), mid = Math.min(1, (y + vh * 0.45) / docH);
    var len = horizontal ? el.clientWidth : el.clientHeight;
    var pos = Math.round(mid * len);
    if (horizontal) {
      marker.style.transform = "translateX(" + pos + "px)";
      view.style.left = Math.round(a * len) + "px"; view.style.width = Math.max(4, Math.round((b - a) * len)) + "px";
      view.style.top = ""; view.style.height = "";
    } else {
      marker.style.transform = "translateY(" + pos + "px)";
      view.style.top = Math.round(a * len) + "px"; view.style.height = Math.max(4, Math.round((b - a) * len)) + "px";
      view.style.left = ""; view.style.width = "";
    }
  }

  /* ---- what is under the pointer: the page's own address and name ---- */
  /* The page's own labelled blocks (the same ones the status bar reads: data-sym + data-addr), plus the footer's. */
  function sections() {
    var top0 = window.scrollY, out = [];
    document.querySelectorAll("[data-sym][data-addr]").forEach(function (b) {
      var r = b.getBoundingClientRect();
      out.push({ top: r.top + top0, h: Math.max(1, r.height), base: parseInt(b.dataset.addr, 16), sym: b.dataset.sym });
    });
    var fh = document.querySelector("footer .block-head"), fa = fh && fh.querySelector(".addr"), fs = fh && fh.querySelector(".sym");
    if (fa && fs) {
      var m = /[0-9A-Fa-f]{8}/.exec(fa.textContent), fr = fh.parentNode.getBoundingClientRect();
      if (m) out.push({ top: fr.top + top0, h: Math.max(1, fr.height), base: parseInt(m[0], 16), sym: fs.textContent.trim() });
    }
    return out.sort(function (a, b) { return a.top - b.top; });
  }
  /* What the status bar would show if this point of the page were at the reading line: same rule, same formula. */
  function where(f) {
    var list = sections(), y = f * docH;
    if (!list.length) return null;
    var cur = list[0];
    list.forEach(function (s) { if (s.top <= y) cur = s; });
    var side = list.filter(function (s) { return Math.abs(s.top - cur.top) < 3; });   // columns side by side share one stretch
    return side.map(function (s) {
      var frac = Math.min(1, Math.max(0, (y - s.top) / s.h));
      var hex = (s.base + Math.floor(frac * 0x170)).toString(16).padStart(8, "0");
      return (theme === "ida" ? ".text:" + hex.toUpperCase() : theme === "ghidra" ? hex : "0x" + hex) + "  " + s.sym;
    }).join("   |   ");
  }

  function wire() {
    var dragging = false;
    function frac(e) {
      var r = el.getBoundingClientRect(), horizontal = conf.axis === "x";
      var f = horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
      return Math.max(0, Math.min(1, f));
    }
    function go(e) {
      var f = frac(e);
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, Math.max(0, f * docH - window.innerHeight * 0.45));
      root.style.scrollBehavior = "";
    }
    el.addEventListener("pointerdown", function (e) { dragging = true; el.setPointerCapture(e.pointerId); go(e); e.preventDefault(); });
    el.addEventListener("pointermove", function (e) {
      if (dragging) go(e);
      var f = frac(e);
      tip.textContent = where(f) || "";
      var horizontal = conf.axis === "x", r = el.getBoundingClientRect();
      if (horizontal) { tip.style.left = Math.min(window.innerWidth - 190, Math.max(4, e.clientX - 20)) + "px"; tip.style.top = ""; }
      else { tip.style.top = Math.min(r.height - 28, Math.max(2, e.clientY - r.top - 12)) + "px"; tip.style.left = ""; }
      el.classList.add("hot");
    });
    el.addEventListener("pointerleave", function () { el.classList.remove("hot"); });
    el.addEventListener("pointerup", function () { dragging = false; });
    el.addEventListener("pointercancel", function () { dragging = false; });
  }

  /* ---- keeping it current ---- */
  function schedule() { if (!rafBuild) rafBuild = (window.requestIdleCallback ? requestIdleCallback(build, { timeout: 400 }) : setTimeout(build, 80)); }
  window.addEventListener("scroll", function () { if (el && !rafScroll) rafScroll = requestAnimationFrame(updateMarker); }, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("pagechange", function () { setTimeout(schedule, 60); });
  document.addEventListener("load", function (e) { if (e.target && e.target.tagName === "IMG") schedule(); }, true);   // images change the page's height
  new MutationObserver(function () { schedule(); }).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-tone"] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  schedule();
})();
