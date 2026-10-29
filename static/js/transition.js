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

  /* ================= themes 1 & 2: decode sweep =================
     A disassembler's scan line sweeps the cover away. Ahead of it, columns of
     hex march like a memory dump; at the bright wavefront the bytes flare and
     clear, revealing the page. The page name decodes from hex into letters.
     Rendered at device resolution, so the text and the line stay razor-sharp. */
  function decodeSweep() {
    var warm = C.label, cool = C.addr, bright = C.head;
    var COL = 26, ROW = 22, ROWS_MAX = 6;
    var HEX = "0123456789ABCDEF", BYTES = [];
    for (var b = 0; b < 256; b++) BYTES.push(HEX[b >> 4] + HEX[b & 15]);
    // One colour per row of hex, built once: changing fillStyle for every glyph was the biggest per-frame cost.
    var rowStyle = [];
    for (var k = 0; k < ROWS_MAX; k++) {
      var fadeK = 1 - k / (ROWS_MAX + 1), colK = k === 0 ? bright : k < 3 ? warm : cool;
      rowStyle.push(rgba(colK, 0.85 * fadeK * fadeK));
    }
    var coverStyle = rgba(C.node, 1), glowA = rgba(warm, 0.10), glowB = rgba(bright, 0.75), glowC = rgba(warm, 0.95);
    var NAME = (pageName() || "").toUpperCase();
    var nameFs = clamp(W * 0.06, 22, 44);
    var nameFont = "700 " + nameFs + "px " + FONT, hexFont = "700 " + (ROW - 7) + "px " + FONT;
    var slope = -0.16;
    var span = H + Math.abs(slope) * W + 300;
    var fy = new Float32Array(Math.ceil(W / COL) + 4);
    var scramble = "", frameNo = 0;

    function frontY(x, s) {
      return s * span - 150 + x * slope +
        Math.sin(x * 0.015 + s * 6.0) * 26 +
        Math.sin(x * 0.052 - s * 9.0) * 9;
    }

    return {
      T: 1.2,
      speed: 1.0,        // about 1.2 seconds in all
      draw: function (t) {
        frameNo++;
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, W, H);

        // 1) solid cover over everything the sweep has not yet passed (below the front)
        ctx.beginPath();
        ctx.moveTo(0, frontY(0, t));
        for (var x = COL; x <= W; x += COL) ctx.lineTo(x, frontY(x, t));
        ctx.lineTo(W, H + 60);
        ctx.lineTo(0, H + 60);
        ctx.closePath();
        ctx.fillStyle = coverStyle;
        ctx.fill();

        // 2) hex rows marching just inside the cover, brightest at the front.
        //    Row by row, so each row sets its colour once; fewer, wider columns on a struggling device.
        var step = Math.round(COL / Math.max(0.5, Q)), cols = Math.ceil(W / step) + 2, rows = Math.max(3, Math.round(ROWS_MAX * Q));
        for (var c = 0; c < cols; c++) fy[c] = frontY(c * step, t) + 12;
        ctx.font = hexFont;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        var tA = (t * 20) | 0, tB = (t * 15) | 0;
        for (var r = 0; r < rows; r++) {
          ctx.fillStyle = rowStyle[r];
          var off = r * ROW;
          for (var cc = 0; cc < cols; cc++) {
            var Y = fy[cc] + off;
            if (Y < -ROW || Y > H + ROW) continue;
            var hi = ((cc * 7 + r * 13) ^ tA) & 15, lo = ((cc * 5 + r * 29) ^ tB) & 15;
            ctx.fillText(BYTES[(hi << 4) | lo], (cc * step) | 0, Y | 0);   // whole pixels: no sub-pixel anti-aliasing
          }
        }

        // 3) the glowing wavefront line
        ctx.globalCompositeOperation = "lighter";
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (var gx = 0; gx <= W; gx += COL) { var gy = frontY(gx, t); if (gx === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy); }
        ctx.lineWidth = 12; ctx.strokeStyle = glowA; ctx.stroke();
        ctx.lineWidth = 3;  ctx.strokeStyle = glowB; ctx.stroke();
        ctx.lineWidth = 1.2; ctx.strokeStyle = glowC; ctx.stroke();
        ctx.globalCompositeOperation = "source-over";

        // 4) the page name, decoding from hex into letters, centred, never clipped.
        //    The glow is a wide faint outline: a blur (shadowBlur) on text costs far more.
        var alpha = smooth(0.08, 0.26, t) * (1 - smooth(0.88, 1.08, t));
        if (NAME && alpha > 0.01) {
          if (frameNo % 3 === 1 || !scramble) {     // the random letters change a few times a second, not every frame
            var rev = smooth(0.12, 0.8, t), out = "";
            for (var i = 0; i < NAME.length; i++) out += (NAME[i] === " " || i / NAME.length < rev) ? NAME[i] : HEX[(Math.random() * 16) | 0];
            scramble = out;
          }
          ctx.font = nameFont;
          ctx.textAlign = "center";
          if ("letterSpacing" in ctx) ctx.letterSpacing = "0.14em";
          ctx.lineWidth = 7;
          ctx.strokeStyle = rgba(warm, 0.2 * alpha);
          ctx.strokeText(scramble, W / 2, H * 0.5, W * 0.9);
          ctx.fillStyle = rgba(bright, alpha);
          ctx.fillText(scramble, W / 2, H * 0.5, W * 0.9);
          if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
        }
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
    var dark = root.getAttribute("data-tone") === "dark", blockFill = dark ? rgba(C.node, 1) : "#ffffff", blockHead = dark ? rgba(rgb(cssVar("--bar")), 1) : "rgba(205,216,238,1)";
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

  /* ================= Ghidra: Auto Analysis, then the listing is disassembled row by row =================
     A small dialog counts through Ghidra's own analyzer names with a progress bar. When it finishes, a highlight
     runs down the screen one listing row at a time, and each row it passes is disassembled into the page. */
  function ghidraAnalysis() {
    var NAME = pageName() || "start", panel = "#3c3f41", border = "#515455", blue = "#4b6eaf", sky = "#87cefa", green = "#70c070";
    var TASKS = ["ASCII Strings", "Apply Data Archives", "Decompiler Parameter ID", "Function Start Search", "Non-Returning Functions - Discovered",
                 "Reference", "Stack", "Subroutine References", "Create Address Tables", "Embedded Media", "Function ID", "Shared Return Calls"];
    var coverStyle = rgba(C.node, 1), ROW = 19, rows = Math.ceil(H / ROW) + 2;
    var fx = clamp((W - (Math.max(18, W * 0.04) + 34) - 40) / 440, 0.55, 1);   // the dim listing columns narrow with the screen
    var MN = ["MOV", "PUSH", "POP", "LEA", "XOR", "ADD", "SUB", "CMP", "CALL", "JMP", "JZ", "RET"];
    function rowText(r) {                                  // a stable made-up listing line for row r
      var seed = (r * 2654435761) >>> 0, a = (0x401000 + r * 3).toString(16).padStart(8, "0");
      return { a: a, m: MN[seed % MN.length], o: ["EAX", "EBX", "ECX", "EDX", "ESI", "EDI"][(seed >>> 5) % 6] + "," + ["0x" + ((seed >>> 9) & 255).toString(16), "EBP", "ESP"][(seed >>> 13) % 3], b: ((seed >>> 3) & 0xffffff).toString(16).padStart(6, "0").replace(/(..)/g, "$1 ").trim() };
    }
    return {
      T: 1.75,
      speed: 1.45,       // about 1.2 seconds in all
      draw: function (t) {
        ctx.setTransform(SC, 0, 0, SC, 0, 0);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.fillStyle = coverStyle; ctx.fillRect(0, 0, W, H);
        var s = smooth(0.62, 1.7, t), s2 = s * s * (0.35 + 0.65 * s), bRow = Math.floor(s2 * rows), bY = bRow * ROW;
        ctx.font = "12px " + FONT; ctx.textBaseline = "middle"; ctx.textAlign = "left";
        // the rows just ahead of the highlight: dim listing lines that the highlight is about to disassemble
        for (var r = bRow; r < Math.min(rows, bRow + 7); r++) {
          var y = r * ROW + ROW / 2, k = (r - bRow) / 7, tx = rowText(r), x0 = Math.max(18, W * 0.04) + 34, al = (1 - k) * 0.55 * smooth(0.5, 0.75, t);
          ctx.fillStyle = "rgba(154,164,174," + al + ")"; ctx.fillText(tx.a, x0 + 120 * fx, y);
          ctx.fillStyle = "rgba(135,206,250," + al * 0.8 + ")"; ctx.fillText(tx.b, x0 + 214 * fx, y);
          ctx.fillStyle = "rgba(173,216,230," + al + ")"; ctx.fillText(tx.m, x0 + 330 * fx, y);
          ctx.fillStyle = "rgba(192,192,128," + al * 0.9 + ")"; ctx.fillText(tx.o, x0 + 392 * fx, y);
        }
        // the dialog
        var a = smooth(0.0, 0.1, t) * (1 - smooth(0.5, 0.66, t));
        if (a > 0.01) {
          var dw = Math.min(520, W * 0.88), dh = 190, dx = (W - dw) / 2, dy = (H - dh) / 2 - 12, sc = (0.94 + 0.06 * a) * clamp(W / 1000, 1, 1.5);
          ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
          ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(dx + 5, dy + 6, dw, dh);
          ctx.fillStyle = panel; ctx.fillRect(dx, dy, dw, dh);
          ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
          ctx.fillStyle = "#313335"; ctx.fillRect(dx, dy, dw, 28);
          ctx.fillStyle = blue; ctx.fillRect(dx + 10, dy + 9, 10, 10);
          ctx.font = "600 12px " + FONT; ctx.fillStyle = "#e9e9e9"; ctx.fillText("Auto Analysis", dx + 28, dy + 15);
          ctx.fillStyle = "#9aa0a6"; ctx.fillText("✕", dx + dw - 20, dy + 15);
          var prog = smooth(0.08, 0.44, t), idx = Math.min(TASKS.length - 1, Math.floor(prog * TASKS.length * 0.999)), done = prog >= 0.999;
          ctx.font = "13px " + FONT; ctx.fillStyle = "#bbbbbb"; ctx.fillText("Analyzing: " + NAME, dx + 18, dy + 56, dw - 36);
          ctx.font = "12px " + FONT; ctx.fillStyle = done ? green : "#8b949e"; ctx.fillText(done ? "Analysis complete" : TASKS[idx], dx + 18, dy + 82, dw - 36);
          var bx = dx + 18, by = dy + 102, bwid = dw - 36;
          ctx.fillStyle = "#1e1f20"; ctx.fillRect(bx, by, bwid, 14); ctx.strokeStyle = "#515455"; ctx.strokeRect(bx + 0.5, by + 0.5, bwid - 1, 13);
          ctx.fillStyle = done ? green : blue; ctx.fillRect(bx + 1, by + 1, (bwid - 2) * prog, 12);
          ctx.fillStyle = "#e9e9e9"; ctx.textAlign = "right"; ctx.fillText(Math.round(prog * 100) + "%", dx + dw - 18, dy + 133); ctx.textAlign = "left";
          ctx.fillStyle = "#4c5052"; ctx.fillRect(dx + dw - 98, dy + dh - 42, 80, 26); ctx.strokeStyle = "#5e6060"; ctx.strokeRect(dx + dw - 97.5, dy + dh - 41.5, 79, 25);
          ctx.fillStyle = "#8b949e"; ctx.textAlign = "center"; ctx.fillText("Cancel", dx + dw - 58, dy + dh - 28); ctx.textAlign = "left";
          ctx.restore();
        }
        // everything above the highlight is revealed; the highlight itself glows
        if (bY > 0) {
          ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bY); ctx.globalCompositeOperation = "source-over";
        }
        if (s > 0.001 && s < 0.999) {
          ctx.fillStyle = "rgba(75,110,175,0.38)"; ctx.fillRect(0, bY, W, ROW);
          ctx.fillStyle = "rgba(135,206,250,0.9)"; ctx.fillRect(0, bY, W, 1.5);
          var gg = ctx.createLinearGradient(0, bY - 40, 0, bY); gg.addColorStop(0, "rgba(135,206,250,0)"); gg.addColorStop(1, "rgba(135,206,250,0.16)");
          ctx.fillStyle = gg; ctx.fillRect(0, bY - 40, W, 40);
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

  /* ---- run ---- */
  var motif = theme === "e33" ? gommage() : theme === "ida" ? idaGraph() : theme === "ghidra" ? ghidraAnalysis() : theme === "binja" ? binjaLift() : decodeSweep();
  // Every transition lasts longer than its base timing so it does not feel rushed: 0.2 s more for the two reverse-engineering
  // tools that already felt right (IDA, Binary Ninja), 0.65 s more for the others (Ember & Ash, Electro, Ghidra, Expedition 33).
  var slower = (theme === "ida" || theme === "binja") ? 0.2 : 0.65;
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
