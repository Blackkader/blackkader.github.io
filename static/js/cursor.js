/*
 * Custom cursor, one personality per theme.
 *
 *   theme 1  "Debugger reticle": an ember crosshair in a slowly turning dashed ring, with a tiny
 *            sparks falling as you move. Over anything clickable it locks on with targeting
 *            brackets and a label reads `jmp <name of the link>`, for example `jmp DynamicIntro`.
 *   theme 2  "Sunburst": a brass art-deco diamond in a turning ring of rays. Over anything
 *            clickable the diamond fills and spins a quarter turn and the rays flare out.
 *            Bubbles drift up behind it, like Rapture.
 *   theme 3  "Brush petal": a petal that leads like a brush tip, turning to face the way you
 *            move. Over anything clickable it blooms into a five-petal flower.
 *
 * The real cursor is hidden only while this is running; cursor.css holds static fallback cursors
 * for touch screens, reduced motion and no JavaScript, so the pointer can never vanish.
 */
(function cursorFx() {
  "use strict";

  var root = document.documentElement;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var TAU = Math.PI * 2;
  var CLICKABLE = 'a[href], button, summary, [role="button"], .copy-btn, [data-theme-toggle], [data-cursor-toggle], [data-xref-toggle]';

  var el = null, ring = null, dot = null, labelEl = null, petalEl = null;
  var trail = null, tctx = null, parts = [], mode = null, raf = 0, last = 0, built = false;
  var st = { x: -200, y: -200, px: -200, py: -200, rx: -200, ry: -200, seen: false, link: false,
             ang: Math.PI / 4, spawn: 0, idle: 0, labelAt: 0 };
  var col = {};
  var PETAL_HALF = 13;      // half the petal's length in px: the distance from its tip (the pointer) to its middle

  /* ---- the pointer must never vanish between pages ----
     A new page starts knowing nothing about where the mouse is, and browsers send no mouse event until it moves.
     So the position is remembered across a page change (sessionStorage), the ring is drawn there at once, and the
     real cursor is hidden only while the ring is actually on screen: there is no moment with no cursor at all. */
  var POS_KEY = "cursorPos", POS_MAX_AGE = 20000;
  function savePos() {
    if (!st.seen) return;
    try { sessionStorage.setItem(POS_KEY, [Math.round(st.x), Math.round(st.y), Date.now()].join(",")); } catch (err) {}
  }
  function restorePos() {
    if (st.seen) return;
    try {
      var v = (sessionStorage.getItem(POS_KEY) || "").split(",").map(Number);
      if (v.length === 3 && v.every(isFinite) && Date.now() - v[2] < POS_MAX_AGE &&
          v[0] >= 0 && v[1] >= 0 && v[0] <= window.innerWidth && v[1] <= window.innerHeight) {
        st.x = st.px = st.rx = v[0]; st.y = st.py = st.ry = v[1]; st.seen = true;
      }
    } catch (err) {}
  }
  function show() { if (el) { el.classList.add("on"); root.classList.add("cursor-fx"); } }
  function hide() { if (el) el.classList.remove("on"); root.classList.remove("cursor-fx"); }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function themeKey() {
    var t = root.getAttribute("data-theme");
    return t === "e33" ? "e33" : t === "deco" ? "deco" : (t === "ida" || t === "ghidra" || t === "binja") ? t : "ember";
  }
  function cssRgb(name, fallback) {
    var hex = getComputedStyle(root).getPropertyValue(name).trim().replace("#", "");
    if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  /* ---- markup per theme ---- */
  function rays() {
    var d = "";
    for (var i = 0; i < 16; i++) {
      var a = (i * Math.PI) / 8, r1 = 16, r2 = i % 2 ? 21 : 26;
      d += "M" + (30 + Math.cos(a) * r1).toFixed(1) + " " + (30 + Math.sin(a) * r1).toFixed(1) +
           "L" + (30 + Math.cos(a) * r2).toFixed(1) + " " + (30 + Math.sin(a) * r2).toFixed(1);
    }
    return d;
  }
  function flowerPetals() {
    var s = "";
    for (var k = 0; k < 5; k++) {
      s += '<ellipse cx="20" cy="10" rx="4.6" ry="8" transform="rotate(' + k * 72 + ' 20 20)" ' +
           'style="fill:var(--red);stroke:var(--label);stroke-width:1"/>';
    }
    return s;
  }
  var MARKUP = {
    /* IDA: the yellow arrow of the navigation band as the pointer, and the dashed outline IDA draws round a selected node */
    ida:
      '<div class="cur-ring"><svg viewBox="0 0 60 60">' +
        '<rect class="i-box" x="9" y="16" width="42" height="28" rx="2"/>' +
        '<g class="i-edges"><path class="i-g" d="M9 22v-6h6"/><path class="i-r" d="M45 16h6v6"/><path class="i-b" d="M51 38v6h-6"/><path class="i-b" d="M15 44H9v-6"/></g>' +
      '</svg></div>' +
      '<div class="cur-dot"><svg viewBox="0 0 40 40">' +
        '<path class="i-arrow" d="M20 20L20 36.5L24.1 32.6L27.3 39.8L30.9 38.3L27.7 31.2L33.4 30.8Z"/>' +
      '</svg><div class="cur-label"></div></div>',
    /* Ghidra: the text caret of the Listing, and the outline of a selected field */
    ghidra:
      '<div class="cur-ring"><svg viewBox="0 0 60 60">' +
        '<rect class="g-box" x="10" y="18" width="40" height="24"/>' +
        '<path class="g-ticks" d="M10 18h6M10 18v6M50 18h-6M50 18v6M10 42h6M10 42v-6M50 42h-6M50 42v-6"/>' +
      '</svg></div>' +
      '<div class="cur-dot"><svg viewBox="0 0 40 40">' +
        '<path class="g-serif" d="M15.5 8.5h9M15.5 31.5h9"/><rect class="g-caret" x="19" y="8.5" width="2.2" height="23"/>' +
      '</svg><div class="cur-label"></div></div>',
    /* Binary Ninja: a pastel target on the graph, with a tag that reads like a cross-reference */
    binja:
      '<div class="cur-ring"><svg viewBox="0 0 60 60">' +
        '<rect class="b-sq" x="13" y="13" width="34" height="34" rx="7"/>' +
        '<g class="b-dots"><circle class="b1" cx="13" cy="13" r="2.4"/><circle class="b2" cx="47" cy="13" r="2.4"/><circle class="b3" cx="47" cy="47" r="2.4"/><circle class="b4" cx="13" cy="47" r="2.4"/></g>' +
      '</svg></div>' +
      '<div class="cur-dot"><svg viewBox="0 0 40 40">' +
        '<circle class="b-halo" cx="20" cy="20" r="7.5"/><circle class="b-core" cx="20" cy="20" r="3.4"/>' +
      '</svg><div class="cur-label"></div></div>',
    ember:
      '<div class="cur-ring"><svg viewBox="0 0 60 60">' +
        '<g class="cur-spin e-dashed"><circle cx="30" cy="30" r="20" style="fill:none;stroke:var(--bg);stroke-width:4.4;stroke-dasharray:4 7;opacity:.75"/>' +
        '<circle cx="30" cy="30" r="20" style="fill:none;stroke:var(--label);stroke-width:2.2;stroke-dasharray:4 7"/></g>' +
        '<g class="e-ticks fb" style="fill:none;stroke-linecap:round">' +
          '<path d="M30 3v9M30 48v9M3 30h9M48 30h9" style="stroke:var(--bg);stroke-width:5;opacity:.75"/>' +
          '<path d="M30 3v9M30 48v9M3 30h9M48 30h9" style="stroke:var(--head);stroke-width:2.4"/></g>' +
        '<g class="e-brackets fb" style="fill:none;stroke-linecap:square">' +
          '<path d="M13 22v-9h9M38 13h9v9M47 38v9h-9M22 47h-9v-9" style="stroke:var(--bg);stroke-width:5.6;opacity:.8"/>' +
          '<path d="M13 22v-9h9M38 13h9v9M47 38v9h-9M22 47h-9v-9" style="stroke:var(--label);stroke-width:3"/></g>' +
      '</svg></div>' +
      '<div class="cur-dot"><svg viewBox="0 0 40 40">' +
        '<g style="fill:none;stroke-linecap:round"><path d="M20 9v6M20 25v6M9 20h6M25 20h6" style="stroke:var(--bg);stroke-width:4.4;opacity:.8"/>' +
        '<path d="M20 9v6M20 25v6M9 20h6M25 20h6" style="stroke:var(--head);stroke-width:2"/></g>' +
        '<circle class="e-core fb" cx="20" cy="20" r="4" style="fill:var(--label);stroke:var(--bg);stroke-width:1.6"/>' +
        '<circle cx="20" cy="20" r="1.4" style="fill:var(--head)"/>' +
      '</svg><div class="cur-label"></div></div>',
    deco:
      '<div class="cur-ring"><svg viewBox="0 0 60 60">' +
        '<g class="d-burst"><g class="cur-spin d-spin">' +
          '<path d="' + rays() + '" style="fill:none;stroke:var(--bg);stroke-width:4.6;stroke-linecap:round;opacity:.75"/>' +
          '<path d="' + rays() + '" style="fill:none;stroke:var(--label);stroke-width:2.4;stroke-linecap:round"/></g></g>' +
        '<circle cx="30" cy="30" r="13" style="fill:none;stroke:var(--bg);stroke-width:4;opacity:.7"/>' +
        '<circle cx="30" cy="30" r="13" style="fill:none;stroke:var(--head);stroke-width:1.6"/>' +
      '</svg></div>' +
      '<div class="cur-dot"><svg viewBox="0 0 40 40">' +
        '<path class="d-diamond" d="M20 8L32 20L20 32L8 20Z" style="stroke:var(--bg);stroke-width:5.6;opacity:.8"/>' +
        '<path class="d-diamond" d="M20 8L32 20L20 32L8 20Z" style="stroke:var(--label);stroke-width:2.8"/>' +
        '<circle cx="20" cy="20" r="3" style="fill:var(--head);stroke:var(--bg);stroke-width:1.4"/>' +
      '</svg></div>',
    e33:
      '<div class="cur-ring"><svg viewBox="0 0 60 60">' +
        '<circle class="p-ring" cx="30" cy="30" r="24" style="fill:none;stroke:var(--bg);stroke-width:3.6;opacity:.6"/>' +
        '<g class="cur-spin" style="animation-duration:18s"><circle class="p-ring" cx="30" cy="30" r="24" style="fill:none;stroke:var(--label);stroke-width:1.5;stroke-dasharray:3 6;opacity:.9"/></g>' +
      '</svg></div>' +
      '<div class="cur-dot"><svg viewBox="0 0 40 40">' +
        '<g class="p-petal" style="transform-origin:20px 20px">' +
          '<path d="M20 20C25 11 38 10 46 20C38 30 25 29 20 20Z" style="fill:none;stroke:var(--bg);stroke-width:4.6;stroke-linejoin:round;opacity:.8"/>' +
          '<path d="M20 20C25 11 38 10 46 20C38 30 25 29 20 20Z" style="fill:var(--red);stroke:var(--head);stroke-width:1.5;stroke-linejoin:round"/>' +
          '<path d="M24 20L42 20" style="stroke:var(--head);stroke-opacity:.7;stroke-width:1;fill:none"/>' +
        '</g>' +
        '<g class="p-flower fb">' + flowerPetals() + '<circle cx="20" cy="20" r="3.4" style="fill:var(--label);stroke:var(--bg);stroke-width:1.2"/></g>' +
      '</svg></div>',
  };

  /* ---- build / tear down ---- */
  function teardown() {
    cancelAnimationFrame(raf);
    root.classList.remove("cursor-fx");
    [el, trail].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    el = trail = tctx = ring = dot = labelEl = petalEl = null;
    parts = [];
    built = false;
  }
  function build() {
    if (document.prerendering) return;   // hidden prerendered page: stay idle until it is shown
    teardown();
    if (root.classList.contains("no-cursor")) return;   // the visitor switched the animated cursor off
    restorePos();
    try {
      mode = themeKey();
      col = {
        pal: null,
        addr: cssRgb("--addr", [194, 85, 58]), label: cssRgb("--label", [224, 164, 92]),
        blue: cssRgb("--blue", [111, 176, 176]), head: cssRgb("--head", [245, 234, 214]),
      };
      col.pal = mode === "ida" ? [cssRgb("--green", [20, 144, 63]), cssRgb("--red", [208, 52, 44]), cssRgb("--blue", [29, 89, 224])]
        : mode === "ghidra" ? [cssRgb("--label", [135, 206, 250]), cssRgb("--green", [112, 192, 112]), cssRgb("--yellow", [192, 192, 128]), cssRgb("--purple", [183, 154, 216])]
        : mode === "binja" ? ["--bn-tangerine", "--bn-banana", "--bn-cyan", "--bn-seafoam", "--bn-lime", "--bn-guava", "--bn-acai", "--bn-cherry", "--bn-grape"].map(function (n) { return cssRgb(n, [160, 206, 238]); })
        : null;
      el = document.createElement("div");
      el.id = "cursor-fx";
      el.setAttribute("data-cur", mode);
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = MARKUP[mode];
      document.body.appendChild(el);
      ring = el.querySelector(".cur-ring");
      dot = el.querySelector(".cur-dot");
      labelEl = el.querySelector(".cur-label");
      petalEl = el.querySelector(".p-petal");
      if (mode !== "e33") {                       // theme 3 has its own petals already
        trail = document.createElement("canvas");
        trail.id = "cursor-trail";
        trail.setAttribute("aria-hidden", "true");
        sizeTrail();
        document.body.appendChild(trail);
        tctx = trail.getContext("2d");
      }
      built = true;
      last = 0;
      if (st.seen) {                              // position known: draw our cursor now (no fade-in) and only then hide the real one
        el.classList.add("instant");
        show();
        requestAnimationFrame(function () { requestAnimationFrame(function () { if (el) el.classList.remove("instant"); }); });
      }
      raf = requestAnimationFrame(frame);
    } catch (err) {
      teardown();                                 // never leave the page without a cursor
    }
  }
  function sizeTrail() {
    if (!trail) return;
    trail.width = window.innerWidth;
    trail.height = window.innerHeight;
  }

  /* ---- particles ---- */
  function spawnSpark(x, y, burst) {
    if (parts.length > 160) return;
    var up = burst ? rand(-120, 120) : rand(-14, 14);
    parts.push({ k: 0, x: x + rand(-3, 3), y: y + rand(-3, 3), vx: up * (burst ? 1 : 0.6), vy: burst ? rand(-160, 40) : rand(-70, -20),
      life: rand(0.5, 1.1), age: 0, s: rand(1.4, 3), c: Math.random() < 0.6 ? col.addr : col.label });
  }
  var RE_MODE = { ida: 2, ghidra: 3, binja: 4 };
  var LABEL_PREFIX = { ida: "jmp ", ghidra: "XREF ", binja: "x-ref " };
  function spawnRE(x, y, burst) {
    if (parts.length > 120) return;
    var pal = col.pal, c = pal[(Math.random() * pal.length) | 0], k = RE_MODE[mode];
    var vx = burst ? rand(-110, 110) : rand(-18, 18), vy = burst ? rand(-150, 30) : rand(-60, -18);
    var hexs = "0123456789ABCDEF";
    parts.push({ k: k, x: x + rand(-4, 4), y: y + rand(-3, 3), vx: vx, vy: vy, c: c, age: 0, ph: rand(0, TAU),
      life: k === 3 ? rand(0.7, 1.3) : rand(0.6, 1.2), s: k === 4 ? rand(1.6, 3.4) : rand(3, 5),
      d: (Math.random() * 4) | 0, t: hexs[(Math.random() * 16) | 0] + hexs[(Math.random() * 16) | 0] });
  }
  function spawnFor(x, y, burst) {
    if (mode === "ember") spawnSpark(x, y, burst);
    else if (RE_MODE[mode]) spawnRE(x, y, burst);
    else spawnBubble(x, y, burst);
  }
  function spawnBubble(x, y, burst) {
    if (parts.length > 120) return;
    parts.push({ k: 1, x: x + rand(-4, 4), y: y + rand(-3, 3), vx: burst ? rand(-60, 60) : 0, vy: burst ? rand(-110, -30) : rand(-45, -22),
      life: rand(1.2, 2.3), age: 0, s: rand(2.6, 6.4), ph: rand(0, TAU) });
  }
  function drawParts(dt) {
    tctx.clearRect(0, 0, trail.width, trail.height);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      var f = p.age / p.life;
      if (p.k === 0) {                                             // ember spark
        p.vy += 40 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        var a = (1 - f) * 0.95, s = p.s * (1 - f * 0.5);
        tctx.globalCompositeOperation = "lighter";
        var g = tctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 3.2);
        g.addColorStop(0, rgba(p.c, a));
        g.addColorStop(1, rgba(p.c, 0));
        tctx.fillStyle = g;
        tctx.fillRect(p.x - s * 3.2, p.y - s * 3.2, s * 6.4, s * 6.4);
      } else if (p.k >= 2) {                                        // IDA edge arrows, Ghidra bytes, Binary Ninja dots
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 26 * dt; p.vx *= Math.exp(-dt * 2.5);
        var al2 = (1 - f) * Math.min(1, p.age * 6);
        tctx.globalCompositeOperation = "source-over";
        if (p.k === 2) {                                            // a short orthogonal edge with an arrowhead
          var L = p.s * 3.2, dx2 = (p.d & 1) ? 1 : -1, dy2 = (p.d & 2) ? 1 : -1;
          tctx.strokeStyle = rgba(p.c, al2); tctx.fillStyle = rgba(p.c, al2); tctx.lineWidth = 1.6;
          tctx.beginPath(); tctx.moveTo(p.x, p.y); tctx.lineTo(p.x + dx2 * L, p.y); tctx.lineTo(p.x + dx2 * L, p.y + dy2 * L); tctx.stroke();
          tctx.beginPath(); tctx.moveTo(p.x + dx2 * L, p.y + dy2 * (L + 3.4)); tctx.lineTo(p.x + dx2 * L - 2.8, p.y + dy2 * (L - 0.4)); tctx.lineTo(p.x + dx2 * L + 2.8, p.y + dy2 * (L - 0.4)); tctx.fill();
        } else if (p.k === 3) {                                     // a byte of the listing
          tctx.font = "600 10px 'IBM Plex Mono', ui-monospace, monospace"; tctx.textAlign = "center"; tctx.textBaseline = "middle";
          tctx.fillStyle = rgba(p.c, al2 * 0.95); tctx.fillText(p.t, p.x, p.y);
        } else {                                                    // a pastel tag
          tctx.fillStyle = rgba(p.c, al2 * 0.9);
          tctx.beginPath(); tctx.arc(p.x + Math.sin(p.age * 5 + p.ph) * 3, p.y, p.s * (1 - f * 0.4), 0, TAU); tctx.fill();
        }
      } else {                                                      // bubble
        p.vx *= Math.exp(-dt * 2);
        p.x += (p.vx + Math.sin(p.age * 3 + p.ph) * 14) * dt;
        p.y += p.vy * dt;
        tctx.globalCompositeOperation = "source-over";
        var pop = f > 0.86 ? (f - 0.86) / 0.14 : 0;                 // grows and fades as it pops
        var r = p.s * (1 + pop * 0.6), al = (1 - pop) * Math.min(1, p.age * 4) * 0.7;
        tctx.lineWidth = 1.1;
        tctx.strokeStyle = rgba(col.blue, al);
        tctx.beginPath();
        tctx.arc(p.x, p.y, r, 0, TAU);
        tctx.stroke();
        tctx.beginPath();
        tctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.28, Math.PI * 1.05, Math.PI * 1.6);
        tctx.strokeStyle = rgba(col.head, al * 0.9);
        tctx.stroke();
      }
    }
    tctx.globalCompositeOperation = "source-over";
  }

  /* ---- the frame loop ---- */
  function hex8(n) { return ("00000000" + n.toString(16).toUpperCase()).slice(-8); }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!built) return;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;

    var dx = st.x - st.px, dy = st.y - st.py;
    st.px = st.x; st.py = st.y;
    var speed = Math.hypot(dx, dy) / Math.max(dt, 0.001);

    dot.style.transform = "translate3d(" + st.x + "px," + st.y + "px,0)";
    if (mode === "e33" && speed > 70) {              // the petal leads, its body trailing behind
      var target = Math.atan2(dy, dx) + Math.PI;
      var d = ((target - st.ang + Math.PI * 3) % TAU) - Math.PI;
      st.ang += d * (1 - Math.exp(-dt * 9));
    }
    // The ring never lags: it is locked to the pointer, so it can't drift off the dot or flower. Theme 3's idle petal
    // trails behind the pointer, so there the ring is centred on the petal's middle; over a link the flower sits on the
    // pointer itself, and the ring follows it there.
    var onPetal = mode === "e33" && !st.link;
    var ringX = onPetal ? st.x + Math.cos(st.ang) * PETAL_HALF : st.x;
    var ringY = onPetal ? st.y + Math.sin(st.ang) * PETAL_HALF : st.y;
    var k = 1;
    st.rx += (ringX - st.rx) * k;
    st.ry += (ringY - st.ry) * k;
    ring.style.transform = "translate3d(" + st.rx + "px," + st.ry + "px,0)";

    if (mode === "e33") {
      petalEl.style.transform = "rotate(" + st.ang + "rad)";
    } else {
      if (root.classList.contains("no-motion")) {          // no sparks or bubbles when animations are off
        if (parts.length) { parts = []; tctx.clearRect(0, 0, trail.width, trail.height); }
      } else {
        st.spawn += (clamp(speed * 0.03, 0, 36) + (st.seen ? 1.2 : 0)) * dt;
        while (st.spawn >= 1) {
          st.spawn--;
          spawnFor(st.x, st.y, false);
        }
        drawParts(dt);
      }
    }
  }

  /* ---- what a link is called: a card shows its title, anything else its label or text ---- */
  function linkName(el) {
    var card = el.closest(".post-card");
    var heading = card && card.querySelector("h3, h4");
    var text = heading ? heading.textContent : (el.getAttribute("aria-label") || el.textContent);
    text = text.replace(/[\u2060\u25b8\u25c2]/g, "").replace(/\s+/g, " ").trim();
    if (!text) text = "link";
    return text.length > 28 ? text.slice(0, 27) + "\u2026" : text;
  }

  /* ---- input ---- */
  function onMove(e) {
    st.x = e.clientX; st.y = e.clientY;
    if (!st.seen) { st.seen = true; st.px = st.rx = st.x; st.py = st.ry = st.y; }
    if (el && !el.classList.contains("on")) show();
  }
  function onOver(e) {
    var target = e.target && e.target.closest ? e.target.closest(CLICKABLE) : null;
    var link = !!target;
    if (link && labelEl) labelEl.textContent = (LABEL_PREFIX[mode] || "jmp ") + linkName(target);   // the label names where the click would go
    if (link !== st.link) { st.link = link; if (el) el.classList.toggle("is-link", link); }
  }
  function onDown() {
    savePos();                                   // a click may start a page change
    if (!el) return;
    el.classList.add("is-down");
    if (root.classList.contains("no-motion")) return;
    if (mode === "ember") for (var i = 0; i < 14; i++) spawnSpark(st.x, st.y, true);
    else if (mode === "deco") for (var j = 0; j < 9; j++) spawnBubble(st.x, st.y, true);
    else if (RE_MODE[mode]) for (var q = 0; q < 12; q++) spawnRE(st.x, st.y, true);
  }
  function onUp() { if (el) el.classList.remove("is-down"); }

  window.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseover", onOver, { passive: true });
  window.addEventListener("mousedown", onDown, { passive: true });
  window.addEventListener("mouseup", onUp, { passive: true });
  document.documentElement.addEventListener("mouseleave", hide);
  document.documentElement.addEventListener("mouseenter", function () { if (st.seen) show(); });
  window.addEventListener("pagehide", savePos);
  window.addEventListener("resize", sizeTrail);
  document.addEventListener("visibilitychange", function () {
    last = 0;
    cancelAnimationFrame(raf);
    if (!document.hidden && built) raf = requestAnimationFrame(frame);
  });
  window.addEventListener("cursorfx", build);
  new MutationObserver(build).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-tone"] });
  if (document.prerendering) document.addEventListener("prerenderingchange", build, { once: true });
  else build();
})();
