/*
 * Ambient background for the e33 theme (theme 2): "Petals in the wind".
 *
 *   - Move the mouse and petals bloom around the cursor, tumble in the air and fade.
 *     The faster you move, the more there are. Click for a burst. Inside a box
 *     (a content panel, the tab bar, the status bar) nothing is spawned.
 *   - Behind the page: slow painted brush strokes cross the sky and a few loose
 *     petals wander on their own.
 *
 * The cursor petals float above the page (they never block clicks); the painted
 * sky sits behind it. Runs only while theme 2 is active, and not with reduced motion.
 * (The earlier "Gommage clock" with the countdown numeral is gone.)
 */
(function ambientE33() {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var root = document.documentElement;
  var TAU = Math.PI * 2;
  var FRAME_MS = 1000 / 30;
  var MAX_PETALS = 240;

  var sky = null, skyCtx = null, fx = null, fxCtx = null;
  var raf = 0, running = false, W = 0, H = 0;
  var strokes = [], loose = [], petals = [];
  var clock = 0, last = 0, lastDraw = 0, spawnAcc = 0;
  var mouse = { x: -1, y: -1, px: -1, py: -1, vx: 0, vy: 0, on: false };
  var pal = { gold: [232, 208, 138], crimson: [217, 69, 63], cream: [243, 230, 191] };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(a, b, v) { var x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function hexToRgb(hex, fallback) {
    hex = (hex || "").trim().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function pickColor() {
    var r = Math.random();
    return r < 0.55 ? pal.crimson : r < 0.85 ? pal.gold : pal.cream;
  }

  /* ---- painted brush strokes (behind the page) ---- */
  function makeStroke(col, w, h) {
    var s = document.createElement("canvas");
    s.width = w; s.height = h;
    var g = s.getContext("2d");
    for (var b = 0; b < 22; b++) {
      var y = rand(h * 0.12, h * 0.88), bend = rand(-h * 0.25, h * 0.25);
      g.beginPath();
      g.moveTo(0, y);
      g.quadraticCurveTo(w * 0.5, y + bend, w, y + rand(-8, 8));
      g.lineWidth = rand(1, 3.4);
      g.strokeStyle = rgba(col, rand(0.25, 0.95));
      g.stroke();
    }
    g.globalCompositeOperation = "destination-in";
    var m = g.createLinearGradient(0, 0, w, 0);
    m.addColorStop(0, "rgba(0,0,0,0)");
    m.addColorStop(0.15, "rgba(0,0,0,1)");
    m.addColorStop(0.7, "rgba(0,0,0,1)");
    m.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = m;
    g.fillRect(0, 0, w, h);
    return s;
  }
  function buildSky() {
    strokes = [];
    var cols = [pal.crimson, pal.gold, [90, 80, 150], pal.crimson, pal.gold];
    for (var i = 0; i < cols.length; i++) {
      strokes.push({
        img: makeStroke(cols[i], 760, 130),
        x: rand(-300, W), y: rand(H * 0.05, H * 0.95),
        vx: rand(4, 11) * (Math.random() < 0.25 ? -1 : 1), rot: rand(-0.14, 0.14),
        sc: rand(1.1, 2.2), a: rand(0.09, 0.16),
      });
    }
    loose = [];
    for (var f = 0; f < 30; f++) {
      loose.push({
        x: rand(0, W), y: rand(0, H), vx: rand(14, 40), vy: rand(6, 22), rot: rand(0, TAU), vr: rand(-1.2, 1.2),
        s: rand(7, 15), col: Math.random() < 0.6 ? pal.crimson : pal.gold, ph: rand(0, TAU), a: rand(0.14, 0.3),
      });
    }
  }

  /* ---- cursor petals ---- */
  function spawn(x, y, vx, vy, big) {
    if (petals.length >= MAX_PETALS) return;
    petals.push({
      x: x, y: y, vx: vx, vy: vy, rot: rand(0, TAU), vr: rand(-5, 5),
      s: big ? rand(9, 17) : rand(6, 13), col: pickColor(), age: 0, life: rand(2.4, 4.0),
      ph: rand(0, TAU), flip: rand(2.5, 6), drag: rand(0.7, 1.3),
    });
  }
  function burst(x, y) {
    for (var i = 0; i < 28; i++) {
      var a = rand(0, TAU), sp = rand(120, 360);
      spawn(x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * sp, Math.sin(a) * sp - 40, true);
    }
  }
  // The petals stay out of the content: nothing spawns while the cursor is inside a box.
  function insideBox(e) {
    return !!(e.target && e.target.closest && e.target.closest(".block, .tabbar, .statusbar"));
  }
  function onMove(e) {
    if (insideBox(e) || document.documentElement.classList.contains("no-cursor")) { mouse.on = false; mouse.px = -1; return; }
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (mouse.px < 0) { mouse.px = mouse.x; mouse.py = mouse.y; }
    mouse.on = true;
  }
  function onDown(e) { if (!insideBox(e)) burst(e.clientX, e.clientY); }
  function onLeave() { mouse.on = false; }

  /* ---- one frame ---- */
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (window.__txBlind) { last = ts; return; }   // idle only while the old page is hidden behind the cover; it keeps moving during the transition itself
    if (ts - lastDraw < FRAME_MS - 1) return;
    lastDraw = ts;
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    clock += dt;

    // --- painted sky ---
    skyCtx.setTransform(1, 0, 0, 1, 0, 0);
    skyCtx.clearRect(0, 0, W, H);
    var i;
    for (i = 0; i < strokes.length; i++) {
      var st = strokes[i];
      st.x += st.vx * dt;
      if (st.x > W + 200) st.x = -760 * st.sc;
      if (st.x < -760 * st.sc - 200) st.x = W + 100;
      skyCtx.save();
      skyCtx.translate(st.x, st.y);
      skyCtx.rotate(st.rot);
      skyCtx.globalAlpha = st.a;
      skyCtx.drawImage(st.img, 0, 0, st.img.width * st.sc, st.img.height * st.sc);
      skyCtx.restore();
    }
    skyCtx.globalAlpha = 1;
    for (i = 0; i < loose.length; i++) {
      var lp = loose[i];
      lp.x += (lp.vx + Math.sin(clock * 0.8 + lp.ph) * 12) * dt;
      lp.y += (lp.vy + Math.cos(clock * 0.6 + lp.ph) * 8) * dt;
      lp.rot += lp.vr * dt;
      if (lp.x > W + 30) { lp.x = -30; lp.y = rand(0, H); }
      if (lp.y > H + 30) lp.y = -30;
      skyCtx.save();
      skyCtx.translate(lp.x, lp.y);
      skyCtx.rotate(lp.rot);
      skyCtx.beginPath();
      skyCtx.ellipse(0, 0, lp.s, lp.s * (0.38 + 0.2 * Math.abs(Math.sin(clock * 1.5 + lp.ph))), 0, 0, TAU);
      skyCtx.fillStyle = rgba(lp.col, lp.a);
      skyCtx.fill();
      skyCtx.restore();
    }

    // --- cursor petals ---
    if (mouse.on && mouse.px >= 0) {
      var mdx = mouse.x - mouse.px, mdy = mouse.y - mouse.py;
      var speed = Math.hypot(mdx, mdy) / Math.max(dt, 0.001);          // px per second
      mouse.vx = mdx / Math.max(dt, 0.001);
      mouse.vy = mdy / Math.max(dt, 0.001);
      mouse.px = mouse.x; mouse.py = mouse.y;
      spawnAcc += (3 + clamp(speed * 0.05, 0, 70)) * dt;                // a gentle trickle, plenty when moving
      while (spawnAcc >= 1) {
        spawnAcc--;
        spawn(mouse.x + rand(-10, 10), mouse.y + rand(-10, 10),
          clamp(mouse.vx * 0.12, -260, 260) + rand(-40, 40), clamp(mouse.vy * 0.12, -260, 260) + rand(-60, 10), false);
      }
    }

    fxCtx.setTransform(1, 0, 0, 1, 0, 0);
    fxCtx.clearRect(0, 0, W, H);
    for (i = petals.length - 1; i >= 0; i--) {
      var p = petals[i];
      p.age += dt;
      if (p.age >= p.life) { petals.splice(i, 1); continue; }
      var f = p.age / p.life;
      p.vx += Math.sin(clock * 2.2 + p.ph) * 38 * dt;                   // sway
      p.vy += 70 * dt;                                                   // gravity
      var damp = Math.exp(-dt * 1.7 * p.drag);
      p.vx *= damp; p.vy *= Math.exp(-dt * 0.9 * p.drag);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      var a = smooth(0, 0.06, f) * (1 - smooth(0.55, 1, f)) * 0.9;
      var tumble = 0.3 + 0.7 * Math.abs(Math.sin(p.age * p.flip + p.ph));
      fxCtx.save();
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rot);
      fxCtx.shadowColor = rgba(p.col, 0.8 * a);
      fxCtx.shadowBlur = 6;
      fxCtx.beginPath();
      fxCtx.ellipse(0, 0, p.s, p.s * 0.42 * tumble, 0, 0, TAU);
      fxCtx.fillStyle = rgba(p.col, a);
      fxCtx.fill();
      fxCtx.restore();
    }
  }

  /* ---- start / stop with the theme ---- */
  function makeCanvas(id, z) {
    var c = document.createElement("canvas");
    c.id = id;
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:" + z + ";pointer-events:none;";
    return c;
  }
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    sky.width = fx.width = W;
    sky.height = fx.height = H;
    buildSky();
  }
  function start() {
    if (running) return;
    running = true;
    var css = getComputedStyle(root);
    pal.gold = hexToRgb(css.getPropertyValue("--label"), pal.gold);
    pal.crimson = hexToRgb(css.getPropertyValue("--red"), pal.crimson);
    pal.cream = hexToRgb(css.getPropertyValue("--head"), pal.cream);
    if (!sky) {
      sky = makeCanvas("ambient-e33", -1);
      fx = makeCanvas("ambient-e33-petals", 900);
      skyCtx = sky.getContext("2d");
      fxCtx = fx.getContext("2d");
    }
    document.body.insertBefore(sky, document.body.firstChild);
    document.body.appendChild(fx);
    resize();
    petals = [];
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mousedown", onDown);
    document.removeEventListener("mouseleave", onLeave);
    [sky, fx].forEach(function (c) { if (c && c.parentNode) c.parentNode.removeChild(c); });
  }
  function sync() {
    if (document.prerendering) return;   // hidden prerendered page: stay idle until it is shown
    // Building the background is the heaviest start-up work on the page: do it after the page transition, not during it.
    if (window.__txCover) { window.addEventListener("txdone", sync, { once: true }); return; }
    if (root.getAttribute("data-theme") === "e33" && !root.classList.contains("no-motion")) start(); else stop();
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
