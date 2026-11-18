/*
 * Ambient background for the Dark Souls theme: fog and ash, and a torch.
 *
 *   - Behind the page: a few slow banks of fog drift across, and sparse ash flakes fall and sway.
 *   - Above the page: a light vignette darkens the corners of the screen a little, and the cursor's torch pushes it
 *     back around the pointer with a faint warm glow. The darkening is capped low, so text is always fully readable.
 * Runs only while this theme is active, with animations on and no reduced-motion setting; it idles while a page
 * transition covers the screen. The vignette canvas is drawn at half size: it is all soft gradient anyway.
 */
(function ambientSouls() {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var root = document.documentElement;
  var TAU = Math.PI * 2;
  var FRAME_MS = 1000 / 30;
  var back = null, bctx = null, lit = null, lctx = null;
  var raf = 0, running = false, W = 0, H = 0, last = 0, lastDraw = 0, clock = 0;
  var banks = [], ash = [];
  var mouse = { x: -999, y: -999, sx: -999, sy: -999, on: false };
  var HALF = 0.5, DARK = 0.3, RADIUS = 280;
  var pal = { fog: [150, 160, 170], ash: [214, 208, 190], flame: [232, 116, 44] };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function hexToRgb(hex, fallback) {
    hex = (hex || "").trim().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  function makeBank() {
    var w = rand(W * 0.7, W * 1.2), h = rand(H * 0.28, H * 0.5), c = document.createElement("canvas");
    c.width = Math.ceil(w); c.height = Math.ceil(h);
    var g = c.getContext("2d");
    for (var i = 0; i < 9; i++) {
      var x = rand(w * 0.15, w * 0.85), y = rand(h * 0.3, h * 0.7), r = rand(h * 0.35, h * 0.7);
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(pal.fog, 0.55)); gr.addColorStop(1, rgba(pal.fog, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return { img: c, x: rand(-w, W), y: rand(-h * 0.1, H - h * 0.9), vx: rand(5, 12) * (Math.random() < 0.3 ? -1 : 1), a: rand(0.05, 0.1) };
  }
  function build() {
    var n = W < 700 ? 3 : 5, i;
    banks = []; ash = [];
    for (i = 0; i < n; i++) banks.push(makeBank());
    var flakes = W < 700 ? 22 : 44;
    for (i = 0; i < flakes; i++) {
      ash.push({ x: rand(0, W), y: rand(0, H), vy: rand(10, 26), vx: rand(-4, 10), s: rand(0.7, 2), ph: rand(0, TAU), a: rand(0.18, 0.5), warm: Math.random() < 0.12 });
    }
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (window.__txBlind || window.__txCover) { last = ts; return; }
    if (ts - lastDraw < FRAME_MS - 1) return;
    lastDraw = ts;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.033;
    last = ts;
    clock += dt;
    var i;

    bctx.clearRect(0, 0, W, H);
    for (i = 0; i < banks.length; i++) {
      var b = banks[i];
      b.x += b.vx * dt;
      if (b.x > W + 40) b.x = -b.img.width - 40;
      if (b.x < -b.img.width - 40) b.x = W + 40;
      bctx.globalAlpha = b.a * (0.8 + 0.2 * Math.sin(clock * 0.2 + i));
      bctx.drawImage(b.img, b.x, b.y);
    }
    bctx.globalAlpha = 1;
    for (i = 0; i < ash.length; i++) {
      var f = ash[i];
      f.y += f.vy * dt;
      f.x += (f.vx + Math.sin(clock * 0.7 + f.ph) * 9) * dt;
      if (f.y > H + 6) { f.y = -6; f.x = rand(0, W); }
      if (f.x > W + 6) f.x = -6;
      bctx.fillStyle = rgba(f.warm ? pal.flame : pal.ash, f.a);
      bctx.beginPath(); bctx.arc(f.x, f.y, f.s, 0, TAU); bctx.fill();
    }

    // the torch: the vignette, with the lit circle cut out of it (the light follows the pointer a little late, like a held flame)
    if (mouse.on) { mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 10); mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 10); }
    var lw = lit.width, lh = lit.height, flick = 1 + Math.sin(clock * 9) * 0.015 + Math.sin(clock * 5.3) * 0.02;
    lctx.globalCompositeOperation = "source-over";
    lctx.clearRect(0, 0, lw, lh);
    var vg = lctx.createRadialGradient(lw / 2, lh / 2, Math.min(lw, lh) * 0.3, lw / 2, lh / 2, Math.max(lw, lh) * 0.75);
    vg.addColorStop(0, "rgba(3,4,5,0)"); vg.addColorStop(1, "rgba(3,4,5," + DARK + ")");
    lctx.fillStyle = vg; lctx.fillRect(0, 0, lw, lh);
    if (mouse.on) {
      var mx = mouse.sx * HALF, my = mouse.sy * HALF, r = RADIUS * HALF * flick;
      lctx.globalCompositeOperation = "destination-out";
      var tg = lctx.createRadialGradient(mx, my, 0, mx, my, r);
      tg.addColorStop(0, "rgba(0,0,0,1)"); tg.addColorStop(1, "rgba(0,0,0,0)");
      lctx.fillStyle = tg; lctx.fillRect(mx - r, my - r, r * 2, r * 2);
      lctx.globalCompositeOperation = "lighter";
      var wg = lctx.createRadialGradient(mx, my, 0, mx, my, r * 0.55);
      wg.addColorStop(0, rgba(pal.flame, 0.07)); wg.addColorStop(1, rgba(pal.flame, 0));
      lctx.fillStyle = wg; lctx.fillRect(mx - r, my - r, r * 2, r * 2);
    }
  }

  function canvas(id, z) {
    var c = document.createElement("canvas");
    c.id = id;
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:" + z + ";pointer-events:none;";
    return c;
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    back.width = W; back.height = H;
    lit.width = Math.ceil(W * HALF); lit.height = Math.ceil(H * HALF);
    build();
  }
  function onMove(e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!mouse.on) { mouse.sx = mouse.x; mouse.sy = mouse.y; mouse.on = true; }
  }
  function onLeave() { mouse.on = false; }

  function start() {
    if (running) return;
    running = true;
    var css = getComputedStyle(root);
    pal.fog = hexToRgb(css.getPropertyValue("--addr"), pal.fog);
    pal.ash = hexToRgb(css.getPropertyValue("--label"), pal.ash);
    pal.flame = hexToRgb(css.getPropertyValue("--flame"), pal.flame);
    if (!back) {
      back = canvas("ambient-souls", -1); lit = canvas("ambient-souls-light", 800);
      bctx = back.getContext("2d"); lctx = lit.getContext("2d");
    }
    document.body.insertBefore(back, document.body.firstChild);
    document.body.appendChild(lit);
    resize();
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseleave", onLeave);
    [back, lit].forEach(function (c) { if (c && c.parentNode) c.parentNode.removeChild(c); });
  }
  function sync() {
    if (document.prerendering) return;
    if (window.__txCover) { window.addEventListener("txdone", sync, { once: true }); return; }
    if (root.getAttribute("data-theme") === "souls" && !root.classList.contains("no-motion")) start(); else stop();
  }

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    if (!running) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  document.addEventListener("visibilitychange", function () {
    if (!running) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else { last = 0; raf = requestAnimationFrame(frame); }
  });
  window.addEventListener("motionfx", sync);
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  if (document.prerendering) document.addEventListener("prerenderingchange", sync, { once: true });
  else sync();
})();
