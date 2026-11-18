/*
 * Page-arrival transition, version 2: one motif per theme, in that theme's colours.
 *
 *   theme 1  (ida_dark / Slate of Glyphs)  "Glyph awakening"
 *            A sigil draws itself in the dark, flares from cyan to orange, and a
 *            hexagonal iris of light opens to reveal the page.
 *   theme 2  (e33)                         "Gommage"
 *            Petals blow across the dark; a wavering front dissolves the cover
 *            into more petals, carrying it off to the right.
 *
 * Runs from <head> so the cover is on the very first painted frame.
 * The first version (the fire) is kept in kindle_v1_fire.js.
 */
(function transition() {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var active = null;   // the transition that is playing now, if any: a new one replaces it instead of piling up
  var lastPt = null;   // where the visitor last pressed (the Ember & Ash burn starts there)
  addEventListener("pointerdown", function (e) { lastPt = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);

  // play() builds the cover and runs the animation. nav.js calls it (window.__txPlay) right after it has swapped the
  // next page's content in, so the animation starts the instant the content is ready, with no page reload before it.
  // It also runs by itself on a full page load that came from another page of this site (the fallback path).
  function play(preview) {
  var TAU = Math.PI * 2;
  var cs = getComputedStyle(root);
  var theme = root.getAttribute("data-theme") || "ida_dark";

  /* ---- helpers ---- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(a, b, v) { var x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a + ")"; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function cssVar(n) { return cs.getPropertyValue(n).trim(); }
  function rgb(hex) {
    hex = (hex || "").replace("#", "");
    if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return [20, 20, 20];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  var C = {
    node: rgb(cssVar("--node")), bg: rgb(cssVar("--bg")), border: rgb(cssVar("--node-border")),
    label: rgb(cssVar("--label")), addr: rgb(cssVar("--addr")), blue: rgb(cssVar("--blue")),
    head: rgb(cssVar("--head")), text: rgb(cssVar("--text")), muted: rgb(cssVar("--muted")),
    red: rgb(cssVar("--red")),
  };
  var FONT = cssVar("--font-mono") || "monospace";

  var W = window.innerWidth, H = window.innerHeight;
  // Sharp, but with a ceiling: a phone at 3x density would otherwise get a canvas of about 3 million pixels
  // that the GPU has to fill and blend every frame. The budget keeps desktops at full density and gives phones
  // a smaller canvas that CSS scales up; line-art and text stay crisp at that size.
  var PIXEL_BUDGET = W < 700 ? 1.0e6 : 1.7e6;   // phones get about 1M pixels, laptops and desktops 1.7M
  var SC = Math.min(window.devicePixelRatio || 1, Math.sqrt(PIXEL_BUDGET / (W * H)));
  if (theme === "e33") SC = Math.min(SC, 1.4);   // the petals are soft, so they can stay lighter
  var Q = 1;                                      // detail level (0.5-1): fewer glyphs and petals when a device struggles
  var cv = document.createElement("canvas");
  cv.id = "transition";
  cv.width = Math.ceil(W * SC);
  cv.height = Math.ceil(H * SC);
  cv.setAttribute("aria-hidden", "true");
  // contain + will-change give the cover its own compositor layer, so it never forces the page below to repaint.
  cv.style.cssText = "position:fixed;left:0;top:0;width:" + W + "px;height:" + H + "px;z-index:2147483000;pointer-events:none;contain:strict;will-change:transform;background:" + rgba(C.node, 1);
  root.appendChild(cv);
  // The cover hides everything beneath it, so the ambient and cursor canvases are
  // wasted work that would starve this animation. They watch this flag and idle.
  window.__txCover = true;
  var ctx = cv.getContext("2d");

  function pageName() {
    var segs = location.pathname.split("/").filter(Boolean), s = "";
    if (segs[0] === "posts") s = segs.length > 1 ? segs[segs.length - 1] : "writeups";
    else if (location.hash.length > 1) s = location.hash.slice(1);
    else if (!segs.length) s = "about";
    try { s = decodeURIComponent(s); } catch (err) {}
    return s.replace(/[-_]+/g, " ");
  }

  var tag = null;
  function makeTag(color, glow, ypos, size) {
    var name = pageName();
    if (!name) return;
    tag = document.createElement("div");
    tag.setAttribute("aria-hidden", "true");
    tag.textContent = name;
    tag.style.cssText =
      "position:fixed;z-index:2147483001;pointer-events:none;opacity:0;left:0;right:0;top:" + ypos + "px;" +
      "text-align:center;padding:0 5vw;box-sizing:border-box;word-break:break-word;" +
      "font:700 " + (size || "clamp(26px,5vw,56px)") + "/1.12 " + FONT + ";letter-spacing:.2em;text-indent:.2em;text-transform:uppercase;" +
      "color:" + color + ";text-shadow:0 0 18px " + glow + ";";
    root.appendChild(tag);
  }
  function setTag(a, lift) {
    if (!tag) return;
    tag.style.opacity = a;
    tag.style.transform = "translateY(" + (lift || 0) + "px)";
  }

  /* ================= Ember & Ash and Electro: burn-through =================
     A scorch mark starts where the visitor clicked and eats outward through the cover like paper catching fire:
     a ragged hole with a glowing rim, a charred edge and a band of heat ahead of it, and sparks lifting off the rim.
     The page shows through the hole; the page name smoulders on the cover until the fire reaches it.
     The whole picture is redrawn every frame, so a resize or a lowered detail level cannot leave anything behind. */
  function burn() {
    var warm = C.label, hot = mix(C.label, C.head, 0.55), red = C.red, bright = C.head;
    var fresh = lastPt && performance.now() - lastPt.t < 4000;
    var ox = fresh ? clamp(lastPt.x, 0, W) : W * 0.5, oy = fresh ? clamp(lastPt.y, 0, H) : H * 0.46;
    var rmax = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
    var N = 132, jit = new Float32Array(N), raw = new Float32Array(N), i;
    for (i = 0; i < N; i++) raw[i] = rand(-1, 1);
    for (var pass = 0; pass < 3; pass++) for (i = 0; i < N; i++) jit[i] = (raw[(i + N - 1) % N] + raw[i] * 2 + raw[(i + 1) % N]) / 4, raw[i] = jit[i];
    for (i = 0; i < N; i++) jit[i] *= 0.2;                 // smooth, ragged burn lines of up to about 10 percent
    var ph1 = rand(0, TAU), ph2 = rand(0, TAU), ph3 = rand(0, TAU);
    var coverStyle = rgba(C.node, 1), NAME = (pageName() || "").toUpperCase();
    var nameFs = clamp(W * 0.06, 22, 44), nameFont = "700 " + nameFs + "px " + FONT;
    var sparks = [], SMAX = Math.round(230 * Math.min(1, Q + 0.2)), spawnAcc = 0;

    function radius(t) { return rmax * 1.62 * Math.pow(clamp((t - 0.03) / 1.14, 0, 1), 1.15); }   // the fire spreads across the whole time
    function edge(k, r, t) {      // the burn line, at angle number k
      var a = k / N * TAU;
      return r * (1 + 0.10 * Math.sin(3 * a + ph1 + t * 1.5) + 0.07 * Math.sin(5 * a + ph2 - t * 2.2) + 0.05 * Math.sin(9 * a + ph3 + t * 3) + jit[k % N]);
    }
    function trace(r, t) {
      ctx.beginPath();
      for (var k = 0; k < N; k++) {
        var a = k / N * TAU, rr = edge(k, r, t), x = ox + Math.cos(a) * rr, y = oy + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    return {
      T: 1.25,
      speed: 1.0,        // about 1.9 seconds in all, after the common slow-down
      draw: function (t, dt) {
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = coverStyle;
        ctx.fillRect(0, 0, W, H);

        // the page name, smouldering on the cover (the burn erases it when it arrives)
        var na = smooth(0, 0.14, t) * (0.86 + 0.14 * Math.sin(t * 38));
        if (NAME && na > 0.01) {
          ctx.font = nameFont; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          if ("letterSpacing" in ctx) ctx.letterSpacing = "0.14em";
          ctx.lineWidth = 8; ctx.strokeStyle = rgba(red, 0.22 * na); ctx.strokeText(NAME, W / 2, H * 0.5, W * 0.9);
          ctx.fillStyle = rgba(mix(warm, bright, 0.4), na); ctx.fillText(NAME, W / 2, H * 0.5, W * 0.9);
          if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
        }

        var r = radius(t), rimA = 1 - smooth(1.05, 1.22, t);
        if (r > 2) {
          // heat and char, on the cover side of the burn line only
          ctx.save();
          ctx.beginPath(); ctx.rect(0, 0, W, H);
          for (var k = 0; k < N; k++) {
            var a = k / N * TAU, rr = edge(k, r, t), x = ox + Math.cos(a) * rr, y = oy + Math.sin(a) * rr;
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.clip("evenodd");
          trace(r, t);
          ctx.lineJoin = "round";
          ctx.lineWidth = 120; ctx.strokeStyle = rgba(red, 0.07 * rimA); ctx.stroke();
          ctx.lineWidth = 74;  ctx.strokeStyle = rgba(red, 0.12 * rimA); ctx.stroke();
          ctx.lineWidth = 44;  ctx.strokeStyle = rgba(mix(red, warm, 0.4), 0.20 * rimA); ctx.stroke();
          ctx.lineWidth = 30;  ctx.strokeStyle = "rgba(10,5,3," + (0.9 * rimA) + ")"; ctx.stroke();
          ctx.restore();

          // the hole itself
          ctx.globalCompositeOperation = "destination-out";
          trace(r, t); ctx.fillStyle = "#000"; ctx.fill();

          // the glowing rim
          ctx.globalCompositeOperation = "lighter";
          trace(r, t);
          ctx.lineJoin = "round";
          ctx.lineWidth = 22;  ctx.strokeStyle = rgba(red, 0.12 * rimA); ctx.stroke();
          ctx.lineWidth = 10;  ctx.strokeStyle = rgba(warm, 0.38 * rimA); ctx.stroke();
          ctx.lineWidth = 4;   ctx.strokeStyle = rgba(hot, 0.85 * rimA); ctx.stroke();
          ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(bright, 0.95 * rimA); ctx.stroke();

          // sparks lifting off the rim
          spawnAcc += dt * 300 * Q;
          while (spawnAcc >= 1 && sparks.length < SMAX && rimA > 0.05) {
            spawnAcc -= 1;
            var kk = (Math.random() * N) | 0, aa = kk / N * TAU, er = edge(kk, r, t);
            var sx = ox + Math.cos(aa) * er, sy = oy + Math.sin(aa) * er;
            if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 40) continue;
            sparks.push({ x: sx, y: sy, vx: rand(-26, 34), vy: -rand(50, 170), life: rand(0.45, 1.05), age: 0, s: rand(1.3, 3.0) });
          }
        }
        spawnAcc = Math.min(spawnAcc, 6);
        ctx.globalCompositeOperation = "lighter";
        for (var p = sparks.length - 1; p >= 0; p--) {
          var sp = sparks[p];
          sp.age += dt; sp.x += (sp.vx + Math.sin(sp.age * 9 + p) * 14) * dt; sp.y += sp.vy * dt; sp.vy *= 1 - 0.5 * dt;
          if (sp.age >= sp.life) { sparks.splice(p, 1); continue; }
          var u = sp.age / sp.life, col = u < 0.35 ? mix(bright, warm, u / 0.35) : mix(warm, red, (u - 0.35) / 0.65);
          ctx.fillStyle = rgba(col, (1 - u) * 0.95);
          ctx.fillRect(sp.x - sp.s / 2, sp.y - sp.s / 2, sp.s, sp.s);
        }
        ctx.globalCompositeOperation = "source-over";
      },
    };
  }

  /* ================= theme 2: gommage ================= */
  function gommage() {
    var gold = C.label, crimson = C.red, cream = C.head;
    var petals = [], acc = 0, accFront = 0;
    var petalStyle = [rgba(crimson, 1), rgba(gold, 1), rgba(cream, 1)];
    var coverStyle = rgba(C.node, 1);
    var horizon = ctx.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, H * 0.9);   // built once, not every frame
    horizon.addColorStop(0, rgba(crimson, 0.22));
    horizon.addColorStop(1, rgba(crimson, 0));
    makeTag(rgba(cream, 1), rgba(gold, 0.55), H / 2 - 30, "clamp(26px,6vw,76px)");

    function front(t) {
      return -120 + (W + 240) * smooth(0.38, 1.5, t);
    }
    function boundary(y, f, t) {
      return f + Math.sin(y * 0.011 + t * 3) * 46 + Math.sin(y * 0.029 - t * 5.2) * 20;
    }
    function spawn(x, y, vx, vy) {
      if (petals.length > Math.round(330 * Q)) return;
      var pick = Math.random();
      petals.push({
        x: x, y: y, vx: vx, vy: vy, rot: rand(0, TAU), vr: rand(-4, 4), s: rand(5, 13),
        ci: pick < 0.62 ? 0 : pick < 0.9 ? 1 : 2, age: 0, life: rand(1.4, 2.4), ph: rand(0, TAU), fa: 0,
      });
    }

    return {
      T: 2.6,
      speed: 1.4,        // the dissolve starts after about a quarter of a second; about 1.9 seconds in all
      draw: function (t, dt) {
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;

        // the dark, with a crimson glow low on the horizon (the opaque fill replaces a separate clear)
        ctx.fillStyle = coverStyle;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = horizon;
        ctx.fillRect(0, 0, W, H);

        // the wavering front dissolves the cover
        var f = front(t);
        if (f > -100) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.moveTo(-60, -20);
          for (var y = -20; y <= H + 20; y += 14) ctx.lineTo(boundary(y, f, t), y);
          ctx.lineTo(-60, H + 20);
          ctx.closePath();
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";

          // a thin gold edge on the front
          var ea = 1 - smooth(1.2, 1.6, t);
          if (ea > 0.01 && f < W + 100) {
            ctx.beginPath();
            for (var y2 = -20; y2 <= H + 20; y2 += 14) {
              var bx = boundary(y2, f, t);
              if (y2 === -20) ctx.moveTo(bx, y2); else ctx.lineTo(bx, y2);
            }
            ctx.lineWidth = 10; ctx.strokeStyle = rgba(gold, 0.1 * ea); ctx.stroke();
            ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(gold, 0.55 * ea); ctx.stroke();
          }
        }

        // petals: a gust before the front, a torrent off its edge (fewer when the device is struggling)
        if (dt > 0) {
          acc += dt * (60 + 140 * smooth(0, 0.4, t)) * (1 - smooth(1.2, 1.6, t)) * Q;
          while (acc >= 1) { acc--; spawn(-20, rand(-20, H), rand(260, 620), rand(-40, 80)); }
          if (f > -50 && f < W + 40) {
            accFront += dt * 340 * Q;
            while (accFront >= 1) {
              accFront--;
              var py = rand(0, H);
              spawn(boundary(py, f, t) + rand(-20, 10), py, rand(240, 560), rand(-90, 140));
            }
          }
        }
        var fadeOut = 1 - smooth(1.6, 2.5, t);
        for (var i = petals.length - 1; i >= 0; i--) {
          var p = petals[i];
          p.age += dt;
          if (p.age > p.life * 1.25 || p.x > W + 40 || p.y > H + 40) { petals.splice(i, 1); continue; }
          p.x += p.vx * dt;
          p.y += (p.vy + Math.sin(p.age * 6 + p.ph) * 60) * dt;
          p.rot += p.vr * dt;
          p.fa = Math.min(1, p.age * 5) * (1 - smooth(0.45, 1, p.age / p.life)) * fadeOut;
        }
        // One pass per colour: the fill colour is set three times a frame instead of once per petal,
        // and each petal is placed with a single transform rather than save, translate, rotate, restore.
        for (var ci = 0; ci < 3; ci++) {
          ctx.fillStyle = petalStyle[ci];
          for (var j = 0; j < petals.length; j++) {
            var q = petals[j];
            if (q.ci !== ci || q.fa <= 0.01) continue;
            var cr = Math.cos(q.rot) * SC, sr = Math.sin(q.rot) * SC;
            ctx.setTransform(cr, sr, -sr, cr, q.x * SC, q.y * SC);
            ctx.globalAlpha = 0.9 * q.fa;
            ctx.beginPath();
            ctx.ellipse(0, 0, q.s, q.s * (0.4 + 0.25 * Math.abs(Math.sin(q.age * 5 + q.ph))), 0, 0, TAU);
            ctx.fill();
          }
        }
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalAlpha = 1;

        setTag(smooth(0.1, 0.4, t) * (1 - smooth(0.45, 0.8, t)), (1 - smooth(0.1, 0.4, t)) * 8);
      },
    };
  }


  /* ================= IDA: a graph lays itself out, then you enter the function =================
     White cover. Blocks of disassembly appear layer by layer, joined by green (taken), red (not taken) and blue (plain)
     edges that draw themselves. Then the view zooms into the root block, as a double-click does, and a circle of the
     page opens out of it. */
  function idaGraph() {
    var green = rgb(cssVar("--green")), red = rgb(cssVar("--red")), blue = rgb(cssVar("--blue")), label = C.label, border = C.border;
    var NAME = "sub_" + ((pageName() || "start").replace(/[^a-z0-9]+/gi, "_"));
    var dark = root.getAttribute("data-tone") === "dark", blockFill = dark ? rgba(C.node, 1) : "#e8ecf3", blockHead = dark ? rgba(rgb(cssVar("--bar")), 1) : "rgba(190,201,224,1)";
    var coverStyle = rgba(C.node, 1);
    var k = clamp(Math.min(W / 1100, H / 640), 1, 1.6);             // a bigger graph on a bigger screen
    var cx = W / 2, bw = clamp(W * 0.1, W < 500 ? 76 : 92, 150) * k, bh = clamp(H * 0.08, 44, 62) * k, top = Math.max(64, H * 0.2), gy = Math.min(112 * k, H * 0.17 * k);
    var spread = clamp(W * 0.16, 110, 280) * Math.min(k, 1.3);
    spread = Math.min(spread, (cx - 12 - bw * 0.45) / 1.7);          // the widest row must stay on a narrow screen
    var N = [
      { x: cx, y: top, w: bw * 1.7, h: bh * 1.2, d: 0.00, p: -1, c: blue, root: true },
      { x: cx - spread, y: top + gy, w: bw, h: bh, d: 0.10, p: 0, c: green },
      { x: cx + spread, y: top + gy, w: bw, h: bh, d: 0.12, p: 0, c: red },
      { x: cx - spread * 1.7, y: top + gy * 2, w: bw * 0.9, h: bh * 0.9, d: 0.22, p: 1, c: blue },
      { x: cx - spread * 0.35, y: top + gy * 2, w: bw * 0.9, h: bh * 0.9, d: 0.24, p: 1, c: blue },
      { x: cx + spread, y: top + gy * 2, w: bw * 0.9, h: bh * 0.9, d: 0.26, p: 2, c: blue },
      { x: cx, y: top + gy * 3, w: bw * 1.1, h: bh, d: 0.36, p: 4, c: blue },
    ];
    var extra = [[3, 6, blue, 0.34], [5, 6, blue, 0.36]];       // more edges into the merge block
    var lines = N.map(function () { var a = []; for (var i = 0; i < 3 + ((Math.random() * 2) | 0); i++) a.push([rand(0.25, 0.4), rand(0.2, 0.5), Math.random() < 0.2]); return a; });
    var zx = cx, zy = top + bh * 0.6;

    function ortho(ax, ay, bx, by, prog, col, a) {
      var ym = ay + Math.max(10, (by - ay) * 0.5), L1 = ym - ay, L2 = Math.abs(bx - ax), L3 = by - ym, tot = L1 + L2 + L3, d = prog * tot;
      ctx.strokeStyle = rgba(col, a); ctx.fillStyle = rgba(col, a); ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(ax, ay);
      var x = ax, y = ay, seg;
      seg = Math.min(d, L1); y += seg; ctx.lineTo(x, y); d -= seg;
      if (d > 0) { seg = Math.min(d, L2); x += Math.sign(bx - ax) * seg; ctx.lineTo(x, y); d -= seg; }
      if (d > 0) { seg = Math.min(d, L3); y += seg; ctx.lineTo(x, y); }
      ctx.stroke();
      if (prog > 0.97) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 4.5, by - 9); ctx.lineTo(bx + 4.5, by - 9); ctx.closePath(); ctx.fill(); }
    }
    function block(n, i, t) {
      var a = smooth(n.d, n.d + 0.1, t); if (a <= 0.01) return;
      var sc = 0.86 + 0.14 * a, x = n.x - n.w / 2, y = n.y;
      ctx.save(); ctx.translate(n.x, y + n.h / 2); ctx.scale(sc, sc); ctx.translate(-n.x, -(y + n.h / 2)); ctx.globalAlpha = a;
      ctx.fillStyle = dark ? "rgba(0,0,0,0.4)" : "rgba(120,135,170,0.28)"; ctx.fillRect(x + 4, y + 4, n.w, n.h);
      ctx.fillStyle = blockFill; ctx.fillRect(x, y, n.w, n.h);
      ctx.fillStyle = blockHead; ctx.fillRect(x, y, n.w, n.root ? 20 : 10);
      ctx.strokeStyle = rgba(border, 1); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, n.w - 1, n.h - 1);
      if (n.root) {
        ctx.font = "700 " + clamp(W * 0.012, 12, 15) + "px " + FONT; ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.fillStyle = rgba(C.muted, 1); ctx.fillText(".text:00401000", x + 8, y + 10.5);
        ctx.fillStyle = rgba(label, 1); ctx.fillText(NAME, x + 8, y + 34, n.w - 16);
        ctx.fillStyle = rgba(C.muted, 0.7); ctx.fillRect(x + 8, y + n.h - 14, n.w * 0.5, 3.4);
      } else {
        lines[i].forEach(function (L, k) {
          var ly = y + 17 + k * 8.5; if (ly > y + n.h - 6) return;
          ctx.fillStyle = rgba(label, 0.85); ctx.fillRect(x + 7, ly, n.w * L[0] * 0.6, 3.6);
          ctx.fillStyle = L[2] ? rgba(green, 0.85) : rgba(C.muted, 0.65); ctx.fillRect(x + 7 + n.w * L[0] * 0.6 + 6, ly, n.w * L[1], 3.6);
        });
      }
      ctx.restore();
    }
    return {
      T: 1.25,
      speed: 1.0,        // about 1.25 seconds in all
      draw: function (t) {
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.fillStyle = coverStyle; ctx.fillRect(0, 0, W, H);
        var enter = smooth(0.62, 1.2, t), z = 1 + 2.6 * enter * enter, fade = 1 - smooth(0.78, 1.15, t);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(zx, zy); ctx.scale(z, z); ctx.translate(-zx, -zy);
        var i, e;
        for (i = 1; i < N.length; i++) { var n = N[i], p = N[n.p]; ortho(p.x, p.y + p.h, n.x, n.y, smooth(n.d - 0.04, n.d + 0.1, t), n.c, 0.95); }
        for (i = 0; i < extra.length; i++) { e = extra[i]; var f = N[e[0]], g = N[e[1]]; ortho(f.x, f.y + f.h, g.x, g.y, smooth(e[3] - 0.04, e[3] + 0.1, t), e[2], 0.95); }
        for (i = 0; i < N.length; i++) block(N[i], i, t);
        ctx.restore();
        ctx.globalAlpha = 1;
        if (enter > 0) {                                  // a circle of the page opens out of the block that was entered
          var R = enter * Math.hypot(W, H) * 1.15 + 1;
          ctx.globalCompositeOperation = "destination-out";
          var g2 = ctx.createRadialGradient(zx, zy, R * 0.6, zx, zy, R);
          g2.addColorStop(0, "rgba(0,0,0,1)"); g2.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = "source-over";
        }
      },
    };
  }

  /* ================= Ghidra: the listing, from undefined bytes to disassembly =================
     The cover is a CodeBrowser listing nobody has analysed yet: addresses, and "??" where there is no code. A
     selected-line highlight runs down it one row at a time, the way Ghidra's cursor moves. The rows just ahead of it
     are being disassembled (bytes become a mnemonic and operands), and every row it has passed is gone, showing the
     new page. Ghidra's own progress indicator sits small in the bottom-right corner, not as a dialog in the middle. */
  function ghidraAnalysis() {
    var NAME = pageName() || "start", ROW = 19, rows = Math.ceil(H / ROW) + 2, BAND = 9;
    var LIST = "#2b2b2b", panel = "#313335", border = "#515455", blue = "#4b6eaf", sky = "#87cefa";
    var x0 = Math.max(14, W * 0.03) + 26, fx = clamp((W - x0 - 24) / 470, 0.55, 1);   // the columns narrow with the screen
    var MN = ["MOV", "PUSH", "POP", "LEA", "XOR", "ADD", "SUB", "CMP", "CALL", "JMP", "JZ", "RET"];
    var REG = ["EAX", "EBX", "ECX", "EDX", "ESI", "EDI"], base = 0x401000 + (hash32(NAME) % 0x40) * 0x100;
    function hash32(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rowText(r) {                                  // a stable made-up listing line for row r (each page has its own addresses)
      var seed = (Math.imul(r + 1, 2654435761) ^ hash32(NAME)) >>> 0;
      var hx = function (n) { return ("0" + (n & 255).toString(16)).slice(-2); };
      return {
        a: (base + r * 3).toString(16).padStart(8, "0"),
        b: hx(seed >>> 3) + " " + hx(seed >>> 11) + " " + hx(seed >>> 19),
        m: MN[seed % MN.length],
        o: REG[(seed >>> 5) % 6] + "," + ["0x" + ((seed >>> 9) & 255).toString(16), "EBP", "ESP"][(seed >>> 13) % 3],
        c: (seed >>> 7) % 4 === 0 ? "; XREF[" + (1 + (seed >>> 15) % 3) + "]: FUN_" + (base + ((seed >>> 17) & 0xfff)).toString(16).padStart(8, "0") : "",   // a comment on some rows
      };
    }
    return {
      T: 0.9,
      speed: 1.0,        // about 1.55 seconds in all, after the common slow-down
      draw: function (t) {
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.fillStyle = LIST; ctx.fillRect(0, 0, W, H);
        var s = smooth(0.1, 0.86, t), e = s * (0.55 + 0.45 * s), bRow = Math.floor(e * rows), bY = bRow * ROW;   // the highlight speeds up as it goes
        ctx.font = "12px " + FONT; ctx.textBaseline = "middle"; ctx.textAlign = "left";
        for (var r = bRow; r < rows; r++) {
          var y = r * ROW + ROW / 2, k = r - bRow, tx = rowText(r);
          ctx.fillStyle = "rgba(154,164,174,0.55)"; ctx.fillText(tx.a, x0, y);
          if (tx.c && W > 700) { ctx.fillStyle = "rgba(112,192,112," + (k < BAND ? 0.55 : 0.28) + ")"; ctx.fillText(tx.c, x0 + 420 * fx, y); }
          if (k < BAND) {                                   // being disassembled: real bytes, then a mnemonic and its operands, brighter near the highlight
            var al = 1 - k / BAND;
            ctx.fillStyle = "rgba(135,206,250," + (0.25 + 0.55 * al) + ")"; ctx.fillText(tx.b, x0 + 100 * fx, y);
            if (k < BAND - 3) {
              ctx.fillStyle = "rgba(173,216,230," + (0.3 + 0.7 * al) + ")"; ctx.fillText(tx.m, x0 + 210 * fx, y);
              ctx.fillStyle = "rgba(192,192,128," + (0.3 + 0.6 * al) + ")"; ctx.fillText(tx.o, x0 + 268 * fx, y);
            }
          } else {                                          // not analysed yet: undefined bytes
            ctx.fillStyle = "rgba(139,148,158,0.32)"; ctx.fillText("?? ?? ??", x0 + 100 * fx, y);
          }
        }
        // every row above the highlight is gone: the new page shows there
        if (bY > 0) { ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bY); ctx.globalCompositeOperation = "source-over"; }
        if (s > 0.001 && s < 0.999) {
          ctx.fillStyle = "rgba(75,110,175,0.42)"; ctx.fillRect(0, bY, W, ROW);                     // the selected line
          ctx.fillStyle = "rgba(135,206,250,0.9)"; ctx.fillRect(0, bY, W, 1.5);
          ctx.fillStyle = sky; ctx.beginPath(); ctx.moveTo(x0 - 20, bY + 4); ctx.lineTo(x0 - 11, bY + ROW / 2); ctx.lineTo(x0 - 20, bY + ROW - 4); ctx.closePath(); ctx.fill();   // its cursor
          ctx.font = "600 12px " + FONT; ctx.fillStyle = "#e9e9e9"; ctx.textAlign = "left"; ctx.fillText(rowText(bRow).a, x0, bY + ROW / 2);
        }
        // Ghidra's own progress indicator, small, bottom right
        var pa = smooth(0, 0.06, t) * (1 - smooth(0.84, 0.9, t));
        if (pa > 0.01) {
          var pw = Math.min(330, W - 24), ph = 24, px = W - pw - 12, py = H - 36 - ph - 8, prog = smooth(0.1, 0.86, t);
          ctx.globalAlpha = pa;
          ctx.fillStyle = panel; ctx.fillRect(px, py, pw, ph); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
          ctx.font = "11px " + FONT; ctx.fillStyle = "#bbbbbb"; ctx.textAlign = "left"; ctx.fillText("Auto Analysis: " + NAME, px + 8, py + ph / 2 + 1, pw * 0.5);
          var bx = px + pw * 0.56, bw = pw * 0.30;
          ctx.fillStyle = "#1e1f20"; ctx.fillRect(bx, py + 7, bw, 10); ctx.fillStyle = blue; ctx.fillRect(bx + 1, py + 8, (bw - 2) * prog, 8);
          ctx.fillStyle = "#e9e9e9"; ctx.textAlign = "right"; ctx.fillText(Math.round(prog * 100) + "%", px + pw - 8, py + ph / 2 + 1);
          ctx.globalAlpha = 1; ctx.textAlign = "left";
        }
      },
    };
  }

  /* ================= Binary Ninja: lifting the code through its intermediate languages =================
     A view opens on a few lines of assembly. The tabs advance: Disassembly, LLIL, MLIL, HLIL, and the same code is
     rewritten each time, shorter and closer to C. Then the cover breaks into cells that pop in pastel and clear. */
  function binjaLift() {
    var NAME = (pageName() || "start").replace(/[^a-z0-9]+/gi, "_");
    var P = { tang: "#e4b595", ban: "#e6d5a3", cyan: "#a7d7ce", sea: "#a9ceda", lime: "#c5daa4", guava: "#e3b5db", acai: "#a0ceee", cherry: "#e0a3b3", grape: "#c8bcf5", fg: "#e0e0e0", dim: "#808080" };
    var STAGES = ["Disassembly", "LLIL", "MLIL", "HLIL"];
    var CODE = [
      [[["mov", "tang"], [" eax, ", "fg"], ["dword", "dim"], [" [rbp-0x14]", "sea"]], [["add", "tang"], [" eax, ", "fg"], ["0x1", "lime"]], [["mov", "tang"], [" dword", "dim"], [" [rbp-0x14], eax", "sea"]],
       [["cmp", "tang"], [" dword", "dim"], [" [rbp-0x14], ", "sea"], ["0x9", "lime"]], [["jle", "tang"], ["  0x401136", "ban"]], [["call", "tang"], ["  sub_" + NAME, "ban"]]],
      [[["eax", "fg"], [" = ", "dim"], ["[rbp - 0x14]", "sea"], [".d", "dim"]], [["eax", "fg"], [" = ", "dim"], ["eax", "fg"], [" + ", "dim"], ["1", "lime"]], [["[rbp - 0x14]", "sea"], [".d = ", "dim"], ["eax", "fg"]],
       [["if", "tang"], [" (eax s<= ", "fg"], ["9", "lime"], [") ", "fg"], ["goto", "tang"], [" 0x401136", "ban"]], [["call", "tang"], ["(", "fg"], ["sub_" + NAME, "ban"], [")", "fg"]]],
      [[["var_1c", "sea"], [" = ", "dim"], ["var_1c", "sea"], [" + ", "dim"], ["1", "lime"]], [["if", "tang"], [" (var_1c s<= ", "fg"], ["9", "lime"], [") ", "fg"], ["goto", "tang"], [" 1", "lime"]], [["sub_" + NAME, "ban"], ["()", "fg"]]],
      [[["for", "tang"], [" (", "fg"], ["int32_t", "lime"], [" i = ", "fg"], ["0", "lime"], ["; i <= ", "fg"], ["9", "lime"], ["; i++)", "fg"]], [["{", "fg"]], [["    ", "fg"], [NAME, "ban"], ["();", "fg"]], [["}", "fg"]]],
    ];
    var CELL = W < 700 ? 30 : 44, cols = Math.ceil(W / CELL), rowsN = Math.ceil(H / CELL), delay = [], flash = [];
    var pastel = [P.acai, P.lime, P.cherry, P.tang, P.grape, P.cyan, P.guava, P.ban];
    for (var q = 0; q < cols * rowsN; q++) { var cx = q % cols, cy = (q / cols) | 0; delay.push((cx / cols) * 0.5 + (cy / rowsN) * 0.12 + Math.random() * 0.22); flash.push(pastel[(Math.random() * pastel.length) | 0]); }
    var coverStyle = rgba(C.node, 1);
    return {
      T: 1.95,
      speed: 1.5,        // about 1.3 seconds in all
      draw: function (t) {
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.fillStyle = coverStyle; ctx.fillRect(0, 0, W, H);
        var a = smooth(0.0, 0.08, t) * (1 - smooth(1.28, 1.5, t));
        if (a > 0.01) {
          var pw = Math.min(700, W * 0.9), ph = Math.min(300, Math.max(210, H * 0.5)), px = (W - pw) / 2, py = (H - ph) / 2, sc = (0.97 + 0.03 * a + 0.1 * smooth(1.2, 1.5, t)) * clamp(W / 1100, 1, 1.4);
          ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
          ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(px + 6, py + 8, pw, ph);
          ctx.fillStyle = "#1b1b1b"; ctx.fillRect(px, py, pw, ph); ctx.strokeStyle = "#3d3d3d"; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
          var stage = Math.min(3, Math.floor(t / 0.3)), st0 = stage * 0.3;
          ctx.font = "500 12px 'Inter', " + FONT; ctx.textBaseline = "middle"; ctx.textAlign = "left";
          var tx = px + 16;
          STAGES.forEach(function (name, i) {
            var wd = ctx.measureText(name).width;
            ctx.fillStyle = i === stage ? P.acai : "#808080"; ctx.fillText(name, tx, py + 20);
            if (i === stage) { ctx.fillRect(tx, py + 33, wd, 2); }
            tx += wd + 26;
          });
          ctx.fillStyle = "#3d3d3d"; ctx.fillRect(px, py + 36, pw, 1);
          ctx.font = "13px " + FONT; ctx.textAlign = "left";
          var code = CODE[stage], gutter = px + 20;
          code.forEach(function (ln, k) {
            var la = smooth(st0 + k * 0.025, st0 + k * 0.025 + 0.08, t), yy = py + 66 + k * 26, xx = gutter + 64 + (1 - la) * 14;
            ctx.globalAlpha = a * la;
            ctx.fillStyle = "#808080"; ctx.fillText((0x401120 + k * 4 + stage).toString(16), gutter - 6 - (1 - la) * 0, yy);
            ln.forEach(function (tk) { ctx.fillStyle = P[tk[1]]; ctx.fillText(tk[0], xx, yy); xx += ctx.measureText(tk[0]).width; });
          });
          ctx.globalAlpha = a;
          ctx.font = "11px 'Inter', " + FONT; ctx.fillStyle = "#808080"; ctx.textAlign = "right"; ctx.fillText("press i to cycle the view", px + pw - 16, py + ph - 16);
          ctx.restore();
        }
        // the cover breaks into cells that pop in pastel and clear
        var tc = (t - 1.2) / 0.7;
        if (tc > 0) {
          ctx.globalAlpha = 1;
          for (var i = 0; i < delay.length; i++) {
            var u = (tc - delay[i] * 0.8) / 0.22;
            if (u <= 0) continue;
            var cx = (i % cols) * CELL, cy = ((i / cols) | 0) * CELL;
            if (u >= 1) { ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000"; ctx.fillRect(cx, cy, CELL, CELL); ctx.globalCompositeOperation = "source-over"; continue; }
            ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0," + (u * 0.9) + ")"; ctx.fillRect(cx, cy, CELL, CELL);
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = flash[i]; ctx.globalAlpha = Math.sin(u * Math.PI) * 0.4; ctx.fillRect(cx + 2, cy + 2, CELL - 4, CELL - 4); ctx.globalAlpha = 1;
          }
        }
      },
    };
  }

  /* ================= Dark Souls: the page rebuilt from ash =================
     The cover is black stone with ash blowing across it. The flakes are not random: each one is bound for a point on
     the outline or inside of one of the new page's own boxes (their real positions, read from the page). On the wind
     they stream in and gather into the shapes of the boxes; each box then catches a bonfire-orange rim and its patch of
     dark falls away, top to bottom, until the rest of the stone lifts. No text, no flame picture; redrawn every frame. */
  function ashRebuild() {
    var flame = C.blue, flame2 = [243, 176, 76], bone = C.label, rects = [], parts = [], i, r;
    var els = document.querySelectorAll(".block, .tabbar, .statusbar");
    for (i = 0; i < els.length; i++) {
      var b = els[i].getBoundingClientRect(), y0 = Math.max(0, b.top), y1 = Math.min(H, b.bottom);
      if (b.width < 40 || y1 - y0 < 16 || b.right < 0 || b.left > W) continue;
      rects.push({ x: Math.max(0, b.left), y: y0, w: Math.min(W, b.right) - Math.max(0, b.left), h: y1 - y0, d: (y0 / H) * 0.4 + rand(0, 0.08) });
    }
    if (!rects.length) rects.push({ x: W * 0.15, y: H * 0.2, w: W * 0.7, h: H * 0.5, d: 0 });
    var weights = [], total = 0;
    for (i = 0; i < rects.length; i++) { r = rects[i]; total += (r.w + r.h) * 2 + Math.sqrt(r.w * r.h) * 2; weights.push(total); }
    var n = Math.round(Math.min(1100, 520 + W * 0.45) * Q);
    for (i = 0; i < n; i++) {
      var pick = Math.random() * total, k = 0;
      while (weights[k] < pick) k++;
      r = rects[k];
      var tx, ty;
      if (Math.random() < 0.6) {                                    // on the outline of the box
        var per = Math.random() * (r.w + r.h) * 2;
        if (per < r.w) { tx = r.x + per; ty = r.y; } else if (per < r.w + r.h) { tx = r.x + r.w; ty = r.y + per - r.w; }
        else if (per < r.w * 2 + r.h) { tx = r.x + r.w - (per - r.w - r.h); ty = r.y + r.h; } else { tx = r.x; ty = r.y + per - r.w * 2 - r.h; }
      } else { tx = r.x + Math.random() * r.w; ty = r.y + Math.random() * r.h; }
      parts.push({ tx: tx, ty: ty, sx: tx + rand(260, 1200), sy: ty + rand(-300, 300), t0: rand(0.0, 0.55), dur: rand(0.6, 0.95),
        amp: rand(-90, 90), ph: rand(0, TAU), s: rand(0.9, 2.1), hot: Math.random() < 0.14 });
    }
    var stone = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.1, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    stone.addColorStop(0, rgba(C.node, 1)); stone.addColorStop(1, "rgba(4,5,6,1)");
    return {
      T: 2.0,
      speed: 1.6,
      draw: function (t) {
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1 - smooth(1.5, 1.92, t);                 // the stone itself lifts at the very end
        ctx.fillStyle = stone; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        var rims = [];
        for (var q = 0; q < rects.length; q++) {                    // each box's patch of dark falls away, top to bottom
          var rc = rects[q], lit = smooth(1.0 + rc.d, 1.35 + rc.d, t);
          if (lit <= 0) continue;
          ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0," + lit + ")"; ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
          rims.push(rc, Math.sin(lit * Math.PI));
        }
        ctx.globalCompositeOperation = "source-over";
        for (q = 0; q < rims.length; q += 2) {                      // a bonfire-orange rim, briefly, as each box lights
          ctx.strokeStyle = rgba(flame, 0.85 * rims[q + 1]); ctx.lineWidth = 1.6; ctx.strokeRect(rims[q].x + 0.5, rims[q].y + 0.5, rims[q].w - 1, rims[q].h - 1);
          ctx.strokeStyle = rgba(flame, 0.18 * rims[q + 1]); ctx.lineWidth = 7; ctx.strokeRect(rims[q].x, rims[q].y, rims[q].w, rims[q].h);
        }
        var fadeAll = 1 - smooth(1.2, 1.65, t);
        for (var m = 0; m < parts.length; m++) {                    // the ash, on the wind, bound for the boxes
          var p = parts[m], u = Math.max(0, Math.min(1, (t - p.t0) / p.dur));
          var e = u * u * (3 - 2 * u), drift = -34 * Math.min(t, p.t0);
          var x = p.sx + (p.tx - p.sx) * e + drift * (1 - e) + Math.sin(t * 9 + p.ph) * 2.2 * (1 - u);
          var y = p.sy + (p.ty - p.sy) * e + Math.sin(u * Math.PI) * p.amp + Math.cos(t * 7 + p.ph) * 2 * (1 - u);
          var a = (u < 1 ? 0.3 + 0.65 * u : 1) * fadeAll;
          if (a < 0.02) continue;
          ctx.fillStyle = rgba(p.hot ? flame2 : bone, a * (p.hot ? 0.95 : 0.8));
          ctx.fillRect(x, y, p.s, p.s);
        }
      },
    };
  }

  /* ================= Electro: the brass hatch =================
     The cover is the door of a bathysphere: eight brass leaves engraved with a deco sunburst, stepped arcs and circuit
     traces, joined at a round hub that carries a pressure gauge. Rivets along every seam light teal outward from the hub
     while the gauge needle sweeps to full; the hub then spins and shrinks away and the leaves retract one after another,
     so the page appears through a widening eight-pointed opening that glows teal at its rim, with bubbles rising through it.
     One leaf is drawn once into a sprite; the frame only moves it. Redrawn in full every frame, no text. */
  function brassHatch() {
    var N = 8, a = Math.PI / N, cx = W / 2, cy = H / 2, half = Math.hypot(W, H) / 2, R = Math.ceil(half / Math.cos(a) * 1.03);
    var Rh = Math.min(W, H) * 0.16, brass = C.border, lite = C.label, teal = C.blue, ivory = C.head, node = C.node;
    var step = Rh * 0.42, i, k;

    // ---- one leaf, drawn once: apex at the origin, bisector along +x ----
    var sw = Math.ceil(R * Math.cos(a)) + 2, sh = Math.ceil(2 * R * Math.sin(a)) + 4, hh = sh / 2;
    var spr = document.createElement("canvas"); spr.width = sw; spr.height = sh;
    var g = spr.getContext("2d");
    g.translate(0, hh);
    function wedge() { g.beginPath(); g.moveTo(0, 0); g.lineTo(R * Math.cos(a), -R * Math.sin(a)); g.lineTo(R * Math.cos(a), R * Math.sin(a)); g.closePath(); }
    wedge(); g.fillStyle = rgba(node, 1); g.fill();
    var lg = g.createLinearGradient(0, 0, R, 0);
    lg.addColorStop(0, rgba(brass, 0.12)); lg.addColorStop(0.5, rgba(teal, 0.07)); lg.addColorStop(1, rgba(brass, 0.02));
    wedge(); g.fillStyle = lg; g.fill();
    g.save(); wedge(); g.clip();
    g.lineWidth = 1; g.strokeStyle = rgba(brass, 0.2);                      // the sunburst
    for (k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(Math.cos(k * a / 5) * Rh * 1.15, Math.sin(k * a / 5) * Rh * 1.15); g.lineTo(Math.cos(k * a / 5) * R, Math.sin(k * a / 5) * R); g.stroke(); }
    var arcs = [];
    for (var r = Rh * 1.3, ai = 0; r < R; r += step, ai++) {                // stepped arcs: every third one heavier
      arcs.push(r);
      g.lineWidth = ai % 3 === 0 ? 1.7 : 1; g.strokeStyle = rgba(brass, ai % 3 === 0 ? 0.42 : 0.2);
      g.beginPath(); g.arc(0, 0, r, -a, a); g.stroke();
    }
    g.strokeStyle = rgba(lite, 0.5); g.lineWidth = 2;                       // an inlaid rail down the middle, with diamonds
    g.beginPath(); g.moveTo(Rh * 1.2, 0); g.lineTo(R * 0.92, 0); g.stroke();
    g.fillStyle = rgba(lite, 0.8);
    for (var dx = Rh * 1.6; dx < R * 0.9; dx += Rh * 1.6) { g.beginPath(); g.moveTo(dx - 8, 0); g.lineTo(dx, -5); g.lineTo(dx + 8, 0); g.lineTo(dx, 5); g.closePath(); g.fill(); }
    g.lineWidth = 1; g.strokeStyle = rgba(teal, 0.5); g.fillStyle = rgba(teal, 0.5);   // circuit traces: out, one right-angle turn, a node
    for (k = 0; k < 7 && arcs.length > 2; k++) {
      var ar = arcs[1 + ((Math.random() * (arcs.length - 1)) | 0)], th = rand(-0.7, 0.7) * a, L1 = rand(30, 80), L2 = rand(20, 50) * (Math.random() < 0.5 ? -1 : 1);
      var x0 = Math.cos(th) * ar, y0 = Math.sin(th) * ar, x1 = x0 + Math.cos(th) * L1, y1 = y0 + Math.sin(th) * L1, x2 = x1 - Math.sin(th) * L2, y2 = y1 + Math.cos(th) * L2;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.beginPath(); g.arc(x2, y2, 2.6, 0, TAU); g.fill();
    }
    wedge(); g.lineJoin = "miter"; g.lineWidth = 16; g.strokeStyle = rgba(brass, 0.13); g.stroke();    // the bevel and the brass seam
    g.lineWidth = 5; g.strokeStyle = rgba(brass, 0.95); g.stroke();
    g.restore();

    // rivets along both seams, just inside the edge
    var rivets = [];
    for (var s = Rh * 1.5; s < R * 0.95; s += Rh * 0.62) {
      for (var e = -1; e <= 1; e += 2) rivets.push({ x: s * Math.cos(a) + 11 * Math.sin(a), y: e * (s * Math.sin(a) - 11 * Math.cos(a)), k: s / R });   // 11 px inside each edge
    }

    var bubbles = [], nb = Math.round(48 * Q);
    for (i = 0; i < nb; i++) bubbles.push({ x: rand(W * 0.1, W * 0.9), y0: rand(H * 0.55, H * 1.1), t0: rand(0.95, 1.55), r: rand(3, 11), ph: rand(0, TAU) });

    function hub(t, gp) {
      var hs = 1 - smooth(0.7, 1.1, t);
      if (hs < 0.01) return;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(hs, hs); ctx.rotate(smooth(0.65, 1.1, t) * Math.PI / 2);
      var dg = ctx.createRadialGradient(0, 0, Rh * 0.1, 0, 0, Rh);
      dg.addColorStop(0, rgba(node, 1)); dg.addColorStop(0.8, rgba(C.bg, 1)); dg.addColorStop(1, rgba(brass, 0.55));
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, Rh, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(brass, 1); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, Rh, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(lite, 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, Rh * 0.9, 0, TAU); ctx.stroke();
      for (var q = 0; q < 72; q++) {                                         // the gauge scale
        var an = q / 72 * TAU, long = q % 6 === 0, r0 = Rh * (long ? 0.78 : 0.84), r1 = Rh * 0.89;
        ctx.strokeStyle = rgba(lite, long ? 0.85 : 0.45); ctx.lineWidth = long ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); ctx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); ctx.stroke();
      }
      var A0 = -Math.PI / 2, A1 = A0 + TAU * gp;                        // the pressure fills teal: one full lap, closing at the top
      ctx.lineCap = "round";
      ctx.strokeStyle = rgba(teal, 0.22); ctx.lineWidth = 11; ctx.beginPath(); ctx.arc(0, 0, Rh * 0.66, A0, A1); ctx.stroke();
      ctx.strokeStyle = rgba(teal, 0.95); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, Rh * 0.66, A0, A1); ctx.stroke();
      ctx.lineCap = "butt";
      ctx.strokeStyle = rgba(brass, 0.8); ctx.lineWidth = 1.4;                // a small sunburst at the centre, the cursor's own motif
      for (q = 0; q < 16; q++) { var b2 = q / 16 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(b2) * Rh * 0.12, Math.sin(b2) * Rh * 0.12); ctx.lineTo(Math.cos(b2) * Rh * (q % 2 ? 0.28 : 0.38), Math.sin(b2) * Rh * (q % 2 ? 0.28 : 0.38)); ctx.stroke(); }
      ctx.strokeStyle = rgba(ivory, 1); ctx.lineWidth = 2.6; ctx.lineCap = "round";   // the needle
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(A1) * Rh * 0.74, Math.sin(A1) * Rh * 0.74); ctx.stroke();
      ctx.fillStyle = rgba(brass, 1); ctx.beginPath(); ctx.arc(0, 0, Rh * 0.09, 0, TAU); ctx.fill();
      ctx.restore();
    }

    return {
      T: 2.0,
      speed: 1.5,
      draw: function (t) {
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, W, H);
        var gp = smooth(0.05, 0.6, t), dsum = 0;
        for (var li = 0; li < N; li++) {
          var u = Math.max(0, Math.min(1, (t - 0.95 - li * 0.04) / 0.72)), e = u * u * (3 - 2 * u), d = e * R * 1.06;
          dsum += d;
          if (d > half * 1.03) continue;
          ctx.save();
          ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2 + li * 2 * a + e * 0.14); ctx.translate(d, 0);
          ctx.drawImage(spr, 0, -hh);
          for (var ri = 0; ri < rivets.length; ri++) {                       // rivets light outward from the hub, like current along the seam
            var rvt = rivets[ri], lit = smooth(0.08 + rvt.k * 0.5 + li * 0.012, 0.2 + rvt.k * 0.5 + li * 0.012, t);
            ctx.fillStyle = rgba(brass, 0.95); ctx.beginPath(); ctx.arc(rvt.x, rvt.y, 3.4, 0, TAU); ctx.fill();
            if (lit > 0.02) {
              ctx.fillStyle = rgba(teal, 0.2 * lit); ctx.beginPath(); ctx.arc(rvt.x, rvt.y, 8, 0, TAU); ctx.fill();
              ctx.fillStyle = rgba(teal, 0.95 * lit); ctx.beginPath(); ctx.arc(rvt.x, rvt.y, 2.6, 0, TAU); ctx.fill();
            }
          }
          ctx.restore();
        }
        hub(t, gp);
        var bump = Math.max(0, 1 - Math.abs(t - 0.62) / 0.16);               // the gauge reaches full: a flare
        var ro = dsum / N, rim = 1 - smooth(1.5, 1.92, t);
        ctx.globalCompositeOperation = "lighter";
        if (bump > 0.01) {
          var fg = ctx.createRadialGradient(cx, cy, Rh * 0.6, cx, cy, Rh * 2.4);
          fg.addColorStop(0, rgba(teal, 0.38 * bump)); fg.addColorStop(1, rgba(teal, 0));
          ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
        }
        if (ro > 6 && rim > 0.01) {                                          // teal light spilling round the opening
          var og = ctx.createRadialGradient(cx, cy, ro * 0.7, cx, cy, ro * 1.3);
          og.addColorStop(0, rgba(teal, 0)); og.addColorStop(0.5, rgba(teal, 0.3 * rim)); og.addColorStop(1, rgba(teal, 0));
          ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);
        }
        ctx.globalCompositeOperation = "source-over";
        for (var bi = 0; bi < bubbles.length; bi++) {                        // bubbles rise through the opening
          var bb = bubbles[bi], bu = t - bb.t0;
          if (bu < 0 || bu > 1.2) continue;
          var bx = bb.x + Math.sin(bu * 6 + bb.ph) * 10, by = bb.y0 - bu * H * 0.45, ba = Math.min(1, bu * 5) * (1 - smooth(0.8, 1.2, bu));
          ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(teal, 0.7 * ba); ctx.beginPath(); ctx.arc(bx, by, bb.r, 0, TAU); ctx.stroke();
          ctx.strokeStyle = rgba(ivory, 0.8 * ba); ctx.beginPath(); ctx.arc(bx - bb.r * 0.3, by - bb.r * 0.3, bb.r * 0.5, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
        }
      },
    };
  }

  /* ---- run ---- */
  var motif = theme === "deco" ? brassHatch() : theme === "souls" ? ashRebuild() : theme === "e33" ? gommage() : theme === "ida" ? idaGraph() : theme === "ghidra" ? ghidraAnalysis() : theme === "binja" ? binjaLift() : burn();
  // Every transition lasts longer than its base timing so it does not feel rushed: 0.2 s more for the two reverse-engineering
  // tools that already felt right (IDA, Binary Ninja), 0.65 s more for the others (Ember & Ash, Electro, Ghidra, Expedition 33).
  var slower = (theme === "ida" || theme === "binja") ? 0.2 : (theme === "souls" || theme === "deco") ? 0.45 : 0.65;
  motif.speed = motif.T / (motif.T / motif.speed + slower);
  var T0 = null, lastDraw = 0, ended = false, elapsed = 0;
  var slow = 0, adapted = 0;

  var me = null;
  function done() {
    if (ended) return;
    ended = true;
    if (active === me) active = null;
    window.__txCover = false;   // let the ambient and cursor loops resume
    cv.remove();
    if (tag) tag.remove();
    window.dispatchEvent(new Event("txdone"));   // the backgrounds were waiting for this before starting up
  }
  // If frames keep arriving late the device is struggling: shrink the canvas and the detail, up to three times.
  function adapt(gap) {
    if (gap > 100) return;                       // a stall (tab switch, one long task) is not a slow device
    slow = gap > 26 ? slow + 1 : Math.max(0, slow - 1);
    if (slow >= 6 && adapted < 3 && SC > 0.7) {
      slow = 0; adapted++;
      SC = Math.max(0.7, SC * 0.8);
      Q = Math.max(0.5, Q * 0.8);
      cv.width = Math.ceil(W * SC);
      cv.height = Math.ceil(H * SC);
    }
  }
  function frame(ts) {
    if (ended) return;
    if (T0 === null) { T0 = ts; lastDraw = ts - 16; }
    var gap = ts - lastDraw;
    if (gap < 12) { requestAnimationFrame(frame); return; }   // on a 120 or 144 Hz screen draw every other frame
    // Elapsed time only grows while frames run, so switching tabs freezes the animation instead of skipping ahead.
    var step = Math.min(0.05, gap / 1000);
    adapt(gap);
    lastDraw = ts;
    elapsed += step;
    var t = elapsed * motif.speed, dt = step * motif.speed;
    motif.draw(t, dt);
    if (t < motif.T) requestAnimationFrame(frame); else done();
  }
  function start() {
    T0 = null;
    requestAnimationFrame(frame);
    (function guard() { if (document.hidden) setTimeout(guard, 1000); else setTimeout(done, 7000); })(); // never leave the page covered, but a hidden tab doesn't count
  }

  if (active) active.stop();   // a click during a running transition: the old one ends, the new one takes over the screen
  me = active = { stop: function () { ended = true; cv.remove(); if (tag) tag.remove(); } };
  if (typeof preview === "number") {             // a still of the transition at one moment (for checking the design)
    cv.style.background = "transparent"; cv.dataset.preview = "1"; motif.draw(preview * motif.T, 0.016);
    window.__txCover = false; ended = true; if (active === me) active = null; return motif.T;
  }
  motif.draw(0, 0);            // the first paint is already covered
  cv.style.background = "transparent"; // from here the canvas carries the cover itself
  if (document.prerendering) document.addEventListener("prerenderingchange", start, { once: true });
  else start();
  return true;
  }

  window.__txPreview = function (frac) {
    var old = document.getElementById("transition"); if (old) old.remove();
    if (frac < 0) return 0;
    return play(frac);
  };
  window.__txPlay = function () {
    if (reduce || root.classList.contains("no-motion")) return false;
    try { return play(); } catch (err) { window.__txCover = false; return false; }
  };

  // Automatic arrival animation, only for a full page load that came from another page of this site.
  var nav = performance.getEntriesByType("navigation")[0];
  var fromSite = document.referrer.indexOf(location.origin) === 0;
  if (reduce || root.classList.contains("no-motion") || !(fromSite || document.prerendering)) return;
  if (nav && (nav.type === "reload" || nav.type === "back_forward")) return;
  // Clicking a link to the page you are already on is not a journey: no animation.
  try {
    var prev = new URL(document.referrer);
    var trim = function (pth) { return pth.replace(/\/+$/, ""); };
    if (prev.origin === location.origin && trim(prev.pathname) === trim(location.pathname) && prev.search === location.search) return;
  } catch (err) {}
  play();
})();
