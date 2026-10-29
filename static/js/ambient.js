/*
 * Ambient background for themes 1 and 2 (Cosy Farmhouse and Rapture Deco), version 2:
 * "Circuit Awakening".
 *
 * A field of ancient circuitry lies hidden behind the page. Your cursor is a
 * torch: the traces glow where it passes. Energy pulses race along the traces,
 * and when one reaches a node it flashes and reads out a couple of bytes.
 * With no cursor (touch screens, or an idle mouse) the light wanders on its own.
 *
 * The first version (drifting glyphs, hex columns, scanner) is kept in
 * ambient_v1_glyphs.js.
 */
(function ambient() {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var root = document.documentElement;
  var CYAN = [68, 211, 230];
  var ORANGE = [255, 154, 60];
  var TAU = Math.PI * 2;
  var GRID = 44;           // spacing of the circuit lattice, px
  var REACH = 250;         // radius of the cursor's light, px
  var FRAME_MS = 1000 / 30;
  var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

  var cv = null, ctx = null, raf = 0, running = false;
  var W = 0, H = 0;
  var circuit = null, tmp = null, tmpCtx = null, glow = null;
  var paths = [], pulses = [], flashes = [];
  var light = { x: 0, y: 0 }, mouse = { x: -1, y: -1, seen: -99 };
  var last = 0, lastDraw = 0, clock = 0, nextSpawn = 0.5, nearAcc = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function hexToRgb(hex, fallback) {
    hex = (hex || "").trim().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function hex2() { return ("0" + randInt(0, 255).toString(16)).slice(-2).toUpperCase(); }

  /* ---- build the circuit ---- */
  function buildPath(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]));
    }
    return { pts: pts, cum: cum, len: cum[cum.length - 1] };
  }

  function pointAt(p, d) {
    d = Math.max(0, Math.min(p.len, d));
    var i = 1;
    while (i < p.cum.length - 1 && p.cum[i] < d) i++;
    var a = p.pts[i - 1], b = p.pts[i], t = (d - p.cum[i - 1]) / ((p.cum[i] - p.cum[i - 1]) || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function generate() {
    paths = [];
    var cols = Math.floor(W / GRID), rows = Math.floor(H / GRID);
    var count = Math.round((W * H) / 15000);
    for (var n = 0; n < count; n++) {
      var cx = randInt(1, cols - 1), cy = randInt(1, rows - 1), dir = randInt(0, 3);
      var pts = [[cx * GRID, cy * GRID]];
      var segs = randInt(2, 5);
      for (var s = 0; s < segs; s++) {
        var len = randInt(2, 6), nx = cx + DX[dir] * len, ny = cy + DY[dir] * len;
        if (nx < 0 || ny < 0 || nx > cols || ny > rows) break;
        cx = nx; cy = ny;
        pts.push([cx * GRID, cy * GRID]);
        dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
      }
      if (pts.length >= 2) paths.push(buildPath(pts));
    }

    circuit = document.createElement("canvas");
    circuit.width = W;
    circuit.height = H;
    var g = circuit.getContext("2d");
    g.strokeStyle = rgba(CYAN, 1);
    g.fillStyle = rgba(CYAN, 1);
    g.lineJoin = "miter";
    g.lineWidth = 1.4;
    paths.forEach(function (p) {
      g.beginPath();
      p.pts.forEach(function (pt, i) { if (i) g.lineTo(pt[0], pt[1]); else g.moveTo(pt[0], pt[1]); });
      g.stroke();
      // pads at the ends, small vias at some bends
      var ends = [p.pts[0], p.pts[p.pts.length - 1]];
      ends.forEach(function (pt, i) {
        g.beginPath();
        if (i) g.rect(pt[0] - 4, pt[1] - 4, 8, 8); else g.arc(pt[0], pt[1], 4, 0, TAU);
        g.stroke();
      });
      for (var k = 1; k < p.pts.length - 1; k++) {
        if (Math.random() < 0.4) { g.beginPath(); g.arc(p.pts[k][0], p.pts[k][1], 2, 0, TAU); g.fill(); }
      }
    });
    // a few "chips"
    for (var c = 0; c < Math.round(count / 18); c++) {
      var x = randInt(2, cols - 4) * GRID, y = randInt(2, rows - 3) * GRID, w = GRID * 2, h = GRID;
      g.strokeRect(x, y, w, h);
      for (var pin = 0; pin < 5; pin++) {
        var px = x + 8 + pin * ((w - 16) / 4);
        g.beginPath();
        g.moveTo(px, y); g.lineTo(px, y - 8);
        g.moveTo(px, y + h); g.lineTo(px, y + h + 8);
        g.stroke();
      }
    }
  }

  function makeGlow() {
    glow = document.createElement("canvas");
    glow.width = glow.height = 48;
    var g = glow.getContext("2d"), gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, rgba(CYAN, 0.7));
    gr.addColorStop(1, rgba(CYAN, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 48, 48);
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = W;
    cv.height = H;
    generate();
    pulses.length = 0;
    flashes.length = 0;
    light.x = W / 2;
    light.y = H / 2;
  }

  /* ---- energy pulses ---- */
  function nearPaths() {
    var out = [];
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      for (var k = 0; k < p.pts.length; k++) {
        if (Math.abs(p.pts[k][0] - light.x) < REACH * 1.3 && Math.abs(p.pts[k][1] - light.y) < REACH * 1.3) { out.push(p); break; }
      }
    }
    return out;
  }

  function spawnPulse(path) {
    if (!path || pulses.length > 22) return;
    var reverse = Math.random() < 0.5;
    pulses.push({
      p: path, d: reverse ? path.len : 0, dir: reverse ? -1 : 1,
      v: rand(110, 200), tail: rand(70, 120),
      col: Math.random() < 0.12 ? ORANGE : CYAN,
    });
  }

  function endPulse(q) {
    var pt = pointAt(q.p, q.dir > 0 ? q.p.len : 0);
    flashes.push({ x: pt[0], y: pt[1], age: 0, col: q.col, label: hex2() + " " + hex2() });
  }

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

    // The light follows the cursor, or wanders when it is idle.
    var idle = mouse.x < 0 || clock - mouse.seen > 4;
    var tx = idle ? W / 2 + Math.sin(clock * 0.23) * W * 0.34 : mouse.x;
    var ty = idle ? H / 2 + Math.sin(clock * 0.31 + 1) * H * 0.3 : mouse.y;
    var k = 1 - Math.exp(-dt * 5);
    light.x += (tx - light.x) * k;
    light.y += (ty - light.y) * k;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Faint circuit everywhere
    ctx.globalAlpha = 0.06;
    ctx.drawImage(circuit, 0, 0);
    ctx.globalAlpha = 1;

    // Torch: reveal the circuit inside a soft circle around the light
    var R = REACH, size = R * 2;
    var sx = Math.round(light.x - R), sy = Math.round(light.y - R);
    tmpCtx.globalCompositeOperation = "source-over";
    tmpCtx.clearRect(0, 0, size, size);
    tmpCtx.drawImage(circuit, sx, sy, size, size, 0, 0, size, size);
    tmpCtx.globalCompositeOperation = "destination-in";
    var rg = tmpCtx.createRadialGradient(R, R, 0, R, R, R);
    rg.addColorStop(0, "rgba(0,0,0,1)");
    rg.addColorStop(0.55, "rgba(0,0,0,0.55)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    tmpCtx.fillStyle = rg;
    tmpCtx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(tmp, sx, sy);
    ctx.globalAlpha = 1;

    // A soft pool of light under the cursor
    ctx.globalCompositeOperation = "lighter";
    var hg = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, R * 0.9);
    hg.addColorStop(0, rgba(CYAN, 0.07));
    hg.addColorStop(1, rgba(CYAN, 0));
    ctx.fillStyle = hg;
    ctx.fillRect(light.x - R, light.y - R, size, size);

    // Spawn pulses: some anywhere, more where the light is, plenty when the mouse moves
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      nextSpawn = rand(0.25, 0.6);
      var near = Math.random() < 0.55 ? nearPaths() : null;
      var pool = near && near.length ? near : paths;
      spawnPulse(pool[Math.floor(Math.random() * pool.length)]);
    }
    if (!idle && clock - mouse.seen < 0.25) {
      nearAcc += dt;
      if (nearAcc > 0.12) {
        nearAcc = 0;
        var np = nearPaths();
        if (np.length) spawnPulse(np[Math.floor(Math.random() * np.length)]);
      }
    }

    // Draw pulses
    ctx.lineCap = "round";
    for (var i = pulses.length - 1; i >= 0; i--) {
      var q = pulses[i];
      q.d += q.v * dt * q.dir;
      if (q.d < 0 || q.d > q.p.len) { endPulse(q); pulses.splice(i, 1); continue; }
      var steps = 7, gap = q.tail / steps, prev = pointAt(q.p, q.d);
      ctx.lineWidth = 2;
      for (var s = 1; s <= steps; s++) {
        var cur = pointAt(q.p, q.d - q.dir * s * gap);
        ctx.strokeStyle = rgba(q.col, 0.75 * (1 - s / (steps + 1)));
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1]);
        ctx.lineTo(cur[0], cur[1]);
        ctx.stroke();
        prev = cur;
      }
      var head = pointAt(q.p, q.d);
      ctx.globalAlpha = q.col === ORANGE ? 0.55 : 0.85;
      ctx.drawImage(glow, head[0] - 14, head[1] - 14, 28, 28);
      ctx.globalAlpha = 1;
    }

    // Node flashes with a byte read-out
    ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = "bottom";
    for (var f = flashes.length - 1; f >= 0; f--) {
      var fl = flashes[f];
      fl.age += dt;
      if (fl.age > 1.1) { flashes.splice(f, 1); continue; }
      var t = fl.age / 1.1;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(fl.col, 0.55 * (1 - t));
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, 4 + t * 18, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba(fl.col, 0.45 * (1 - t));
      ctx.fillText(fl.label, fl.x + 9, fl.y - 6 - t * 8);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---- start / stop with the theme ---- */
  function onMove(e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = clock; }

  function start() {
    if (running) return;
    running = true;
    // follow the theme: lit traces in its address colour, the occasional warning pulse in its label colour
    var css = getComputedStyle(root);
    CYAN = hexToRgb(css.getPropertyValue("--addr"), CYAN);
    ORANGE = hexToRgb(css.getPropertyValue("--label"), ORANGE);
    if (!cv) {
      cv = document.createElement("canvas");
      cv.id = "ambient";
      cv.setAttribute("aria-hidden", "true");
      cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;";
      ctx = cv.getContext("2d");
      tmp = document.createElement("canvas");
      tmp.width = tmp.height = REACH * 2;
      tmpCtx = tmp.getContext("2d");
    }
    makeGlow();
    document.body.insertBefore(cv, document.body.firstChild);
    resize();
    window.addEventListener("mousemove", onMove, { passive: true });
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("mousemove", onMove);
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
  }
  var shownTheme = null;
  function sync() {
    if (document.prerendering) return;   // hidden prerendered page: stay idle until it is shown
    // Building the background is the heaviest start-up work on the page: do it after the page transition, not during it.
    if (window.__txCover) { window.addEventListener("txdone", sync, { once: true }); return; }
    var t = root.getAttribute("data-theme");
    var wanted = (!t || t === "deco") && !root.classList.contains("no-motion");
    if (wanted && running && shownTheme !== t) stop();   // colours come from the theme, so re-read them
    if (wanted) { shownTheme = t; start(); } else stop();
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
