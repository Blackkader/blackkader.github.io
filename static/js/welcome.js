/*
 * Welcome: what a visitor sees the first time they land on the site in a browser session.
 *
 * The page itself is the packed payload, and a leaning scan line is the border between the two states. Above the
 * line is your real page, already final: the overlay is simply not there. Below the line is the page still packed:
 * its text is cipher glyphs, its boxes are bare outlines, its photo is a coarse mosaic, and the characters closest to
 * the line flicker as they are about to be unpacked. The line falls from the top of the screen to the bottom and
 * takes the packed state with it, so nothing is drawn after it has gone: there is no hold, no fade and no second
 * arrival at the finished page.
 *
 * Runs from <head>, so the cover is on the very first painted frame; the page is read as soon as it and its fonts are
 * ready. It plays once per session, never for a reload, the back button, or a visitor who came from another page of
 * this site (transition.js handles those), and never when animations are off. Clicks and taps do nothing while it plays
 * (the overlay simply absorbs them); the Esc key is the only way to skip it.
 * Colours come from the theme's variables and the packed text keeps the page's own fonts and positions, so every
 * theme unpacks in its own look.
 */
(function welcome() {
  "use strict";

  var root = document.documentElement;
  var T_PACK = 0.7;        // the packed beat before the page is read (seconds)
  var DIAG = 0.08;         // slope of the scan line: it leans, rising to the right
  var BAND = 70;           // how far below the line (px) characters flicker, about to be unpacked
  var MAX_CHARS = 1800;
  var BOX_SEL = ".tabbar, .block, .portrait, .post-card, .statusbar";
  var SKIP_TEXT = "script, style, noscript, canvas, svg, template, #welcome, #transition, .lb, .theme-menu, #site-index, [hidden]";

  function eligible() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("no-motion")) return false;
    if (document.prerendering) return false;
    var nav = performance.getEntriesByType("navigation")[0];
    if (nav && (nav.type === "reload" || nav.type === "back_forward")) return false;
    if (document.referrer.indexOf(location.origin) === 0) return false;
    try { if (sessionStorage.getItem("welcomed")) return false; } catch (err) {}
    return true;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(a, b, v) { var x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function ease(x) { return smooth(0, 1, x) * 0.35 + x * 0.65; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a + ")"; }
  function rgb(hex, fb) {
    hex = (hex || "").trim().replace("#", "");
    if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fb;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function visibleColor(str) { return str && !/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/.test(str) && str !== "transparent"; }

  function play() {
    var cs = getComputedStyle(root);
    function v(name, fb) { return rgb(cs.getPropertyValue(name), fb); }
    var C = {
      bg: v("--bg", [20, 20, 20]), node: v("--node", [30, 30, 30]), border: v("--node-border", [80, 80, 80]),
      label: v("--label", [120, 170, 255]), addr: v("--addr", [120, 130, 150]), head: v("--head", [240, 240, 240]),
      muted: v("--muted", [130, 130, 130]), green: v("--green", [90, 200, 120]),
    };
    var FONT = cs.getPropertyValue("--font-mono").trim() || "monospace";

    var W = window.innerWidth, H = window.innerHeight, small = W < 700;
    var SC = Math.min(window.devicePixelRatio || 1, Math.sqrt((small ? 1.0e6 : 1.7e6) / (W * H)));
    var cv = document.createElement("canvas");
    cv.id = "welcome";
    cv.width = Math.ceil(W * SC);
    cv.height = Math.ceil(H * SC);
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;contain:strict;will-change:transform;touch-action:none;background:" + rgba(C.bg, 1);
    root.appendChild(cv);
    root.classList.add("welcome-on");               // the page's own entrance animation is paused under the cover (style.css)
    window.__txCover = true;                        // the cursor and the background animations idle while the cover is up
    window.__txBlind = true;
    try { sessionStorage.setItem("welcomed", "1"); } catch (err) {}
    var ctx = cv.getContext("2d");
    var startedAt = performance.now();

    var HEXC = "0123456789ABCDEF";
    var U = small ? 1 : 1.15;
    var SH = small ? 30 : 38;                       // height of the status strip
    var noiseFill = rgba(mix(C.muted, C.label, 0.45), 0.55);

    /* ---- what the loader read from the page ---- */
    var runs = [], boxes = [], imgs = [], nChars = 0;
    var captured = false, fontsReady = false;
    var tStart = 0, tDec0 = 0, DUR = 2, TOTAL = 0;
    var elapsed = 0, last = 0, skipAt = -1, ended = false, released = false, pausedMs = 0, hiddenAt = 0;

    function readPage() {
      var vw = window.innerWidth, vh = window.innerHeight;
      runs = []; boxes = []; imgs = []; nChars = 0;
      var meas = ctx;
      meas.textBaseline = "alphabetic";            // measureText reports the ascent from the current baseline: it must be the alphabetic one

      document.querySelectorAll(BOX_SEL).forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh) return;
        var s = getComputedStyle(el);
        boxes.push({
          x: r.left, y: r.top, w: r.width, h: r.height,
          bg: visibleColor(s.backgroundColor) ? s.backgroundColor : null,
          line: parseFloat(s.borderTopWidth) > 0 && visibleColor(s.borderTopColor) ? s.borderTopColor : null,
        });
      });

      document.querySelectorAll("main img, .portrait img").forEach(function (img) {
        if (imgs.length >= 3 || !img.complete || !img.naturalWidth) return;
        var r = img.getBoundingClientRect();
        if (r.width < 90 || r.height < 90 || r.bottom < 0 || r.top > vh) return;
        var s = getComputedStyle(img), pos = (s.objectPosition || "50% 50%").split(" ");
        var px = parseFloat(pos[0]) / 100, py = parseFloat(pos[1] === undefined ? pos[0] : pos[1]) / 100;
        var nw = img.naturalWidth, nh = img.naturalHeight, scale = Math.max(r.width / nw, r.height / nh);
        var sw = r.width / scale, sh = r.height / scale;
        var crop = { sx: (nw - sw) * (isNaN(px) ? 0.5 : px), sy: (nh - sh) * (isNaN(py) ? 0.5 : py), sw: sw, sh: sh };
        var cell = clamp(r.width / 16, 10, 26), tw = Math.max(2, Math.ceil(r.width / cell)), th = Math.max(2, Math.ceil(r.height / cell));
        var mo = document.createElement("canvas");  // the coarse mosaic the photo starts as
        mo.width = tw; mo.height = th;
        mo.getContext("2d").drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, tw, th);
        imgs.push({ x: r.left, y: r.top, w: r.width, h: r.height, mosaic: mo });
      });

      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (nd) {
          if (!nd.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var p = nd.parentElement;
          return !p || p.closest(SKIP_TEXT) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      var rg = document.createRange(), nd;
      while ((nd = walker.nextNode()) && nChars < MAX_CHARS) {
        var p = nd.parentElement, s = getComputedStyle(p);
        if (s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) === 0) continue;
        var font = s.fontStyle + " " + s.fontWeight + " " + s.fontSize + " " + s.fontFamily;
        meas.font = font;
        var asc = meas.measureText("M").fontBoundingBoxAscent || parseFloat(s.fontSize) * 0.8;
        var run = { font: font, color: s.color, size: parseFloat(s.fontSize) || 14, chars: [] }, str = nd.nodeValue;
        for (var i = 0; i < str.length && nChars < MAX_CHARS; i++) {
          var ch = str.charAt(i);
          if (/\s/.test(ch)) continue;
          rg.setStart(nd, i); rg.setEnd(nd, i + 1);
          var r = rg.getBoundingClientRect();
          if (!r.width || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
          if (s.textTransform === "uppercase") ch = ch.toUpperCase(); else if (s.textTransform === "lowercase") ch = ch.toLowerCase();
          run.chars.push({ c: ch, x: r.left, w: r.width, b: r.top + asc, key: r.top + r.height / 2 + r.left * DIAG, s: (Math.random() * 16) | 0 });
          nChars++;
        }
        if (run.chars.length) runs.push(run);
      }

    }

    function capture() {
      try { readPage(); } catch (err) { runs = []; boxes = []; imgs = []; nChars = 0; }   // if the page cannot be read, the line still falls over the packed screen
      captured = true;
      window.__welcomeStats = { chars: nChars, boxes: boxes.length, images: imgs.length };

      tStart = Math.max(T_PACK, elapsed);           // the packed beat is always seen, even on a fast page
      tDec0 = tStart + 0.25;                        // the line starts to fall
      DUR = clamp(0.9 + nChars * 0.0016, 1.6, 2.4); // and is gone when it has crossed the screen
      TOTAL = tDec0 + DUR;
    }

    /* ---- drawing ---- */
    function text(s, x, y, size, color, weight, align) {
      ctx.font = (weight || 400) + " " + size + "px " + FONT;
      ctx.fillStyle = color;
      ctx.textAlign = align || "left";
      ctx.fillText(s, x, y);
    }

    var field = null, fieldTick = -1, fieldAlpha = -1, fieldOff = false, slowRun = 0;
    function packedField(t, a) {                     // faint cipher noise over the whole screen; redrawn a few times a second, not every frame
      if (fieldOff) return;
      var tick = (t * 6) | 0;
      if (!field) { field = document.createElement("canvas"); field.width = W; field.height = H; }
      if (tick !== fieldTick || a !== fieldAlpha) {
        fieldTick = tick; fieldAlpha = a;
        var g = field.getContext("2d"), cw = 46, ch = 30, cols = Math.ceil(W / cw), rows = Math.ceil(H / ch);
        g.clearRect(0, 0, W, H);
        g.font = "400 " + (small ? 11 : 12) + "px " + FONT; g.textBaseline = "middle"; g.textAlign = "center";
        var fills = [0.35, 0.55, 0.8, 1].map(function (k) { return rgba(C.addr, a * k); });
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
          var h = (r * 131 + c * 31 + ((tick + r * 7 + c * 3) % 5 === 0 ? tick : 0)) & 255;
          g.fillStyle = fills[h & 3];
          g.fillText(HEXC[h >> 4] + HEXC[(h >> 2) & 15], c * cw + cw / 2, r * ch + ch / 2);
        }
      }
      ctx.drawImage(field, 0, 0, W, H);
    }

    function drawBoxes(t) {
      boxes.forEach(function (b) {
        var a = smooth(tStart + clamp(b.y / H, 0, 1) * 0.3, tStart + 0.5 + clamp(b.y / H, 0, 1) * 0.3, t);
        if (a <= 0) return;
        ctx.globalAlpha *= a;
        if (b.bg) { ctx.fillStyle = b.bg; ctx.fillRect(b.x, b.y, b.w, b.h); }
        if (b.line) { ctx.strokeStyle = b.line; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); }
        ctx.globalAlpha /= a;
      });
    }

    function drawImages() {                          // the photo is a coarse mosaic while it is packed
      ctx.imageSmoothingEnabled = false;
      imgs.forEach(function (im) {
        ctx.globalAlpha *= 0.85;
        ctx.drawImage(im.mosaic, im.x, im.y, im.w, im.h);
        ctx.fillStyle = rgba(C.label, 0.16); ctx.fillRect(im.x, im.y, im.w, im.h);
        ctx.globalAlpha /= 0.85;
      });
      ctx.imageSmoothingEnabled = true;
    }

    // Ly is where the scan line crosses x = 0; at x it is at Ly - x * DIAG. A character is above the line (unpacked:
    // the real page shows there) when its key, y + x * DIAG, is below Ly. Only what is below the line is drawn.
    function drawText(t, Ly) {
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
      var tick = (t * 3.2) | 0, flick = (t * 22) | 0;
      for (var n = 0; n < runs.length; n++) {
        var run = runs[n];
        ctx.font = run.font;
        for (var i = 0; i < run.chars.length; i++) {
          var c = run.chars[i], d = c.key - Ly;
          if (d <= 0) continue;                                           // above the line: the real page
          var narrow = c.w < run.size * 0.36, cx = c.x + c.w / 2;
          if (d > BAND) {                                                 // still packed: a cipher glyph, centred in the cell of the letter it hides
            ctx.fillStyle = noiseFill;
            ctx.fillText(narrow ? "\u00b7" : HEXC[(c.s + tick * (1 + (c.s & 3))) & 15], cx, c.b);
          } else {                                                        // about to be unpacked: flickers between cipher and the real letter
            ctx.fillStyle = rgba(C.head, 0.5 + 0.5 * (1 - d / BAND));
            ctx.fillText((flick + i) % 3 === 0 ? c.c : narrow ? "\u00b7" : HEXC[(c.s + flick * 5 + i) & 15], cx, c.b);
          }
        }
      }
    }

    function scanLine(Ly) {                          // the border: a bright leaning line with a soft glow on the unpacked side
      var y0 = Ly, y1 = Ly - W * DIAG;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(0, y0 - 40); ctx.lineTo(W, y1 - 40); ctx.lineTo(W, y1); ctx.lineTo(0, y0); ctx.closePath();
      var bg = ctx.createLinearGradient(0, y0 - 40, 0, y0);
      bg.addColorStop(0, rgba(C.label, 0)); bg.addColorStop(1, rgba(C.label, 0.2));
      ctx.fillStyle = bg; ctx.fill();
      ctx.restore();
      ctx.strokeStyle = rgba(C.head, 0.9); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y1); ctx.stroke();
    }

    function hud(t, prog) {                          // the packed version of the status bar: it too goes when the line passes
      var top = H - SH, done = prog >= 0.9;
      ctx.fillStyle = rgba(C.node, 0.97); ctx.fillRect(0, top, W, SH);
      ctx.fillStyle = rgba(C.border, 1); ctx.fillRect(0, top, W, 1);
      ctx.fillStyle = rgba(done ? C.green : C.label, 1); ctx.fillRect(0, top, W * prog, 2);
      var pct = Math.round(prog * 100), fs = (small ? 11 : 12.5) * (small ? 1 : 1.05);
      var status = !captured || t < tDec0 ? (small ? "packed: 2 sections" : "packed  .text  .data  .rodata")
        : done ? (small ? "unpacked" : "unpacked blackkader.exe successfully") : "unpacking .text  " + pct + "%";
      var addr = "0x" + ("00000000" + (0x401000 + Math.floor(prog * 0x1F40)).toString(16).toUpperCase()).slice(-8);
      var ent = (7.99 - 3.79 * ease(prog)).toFixed(2);
      var right = small ? "ent " + ent : "entropy " + ent + " / 8.00   " + addr;
      ctx.textBaseline = "middle";
      text(status, 14, top + SH / 2 + 1, fs, rgba(done ? C.green : C.head, 0.95), 600);
      text(right, W - 14, top + SH / 2 + 1, fs, rgba(done ? C.green : prog > 0.02 ? C.label : C.addr, 0.95), 600, "right");
    }

    function draw(t) {
      ctx.setTransform(SC, 0, 0, SC, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var fo = skipAt >= 0 ? 1 - clamp((elapsed - skipAt) / 0.22, 0, 1) : 1;
      if (fo <= 0) return;
      var prog = captured ? clamp((t - tDec0) / DUR, 0, 1) : 0;
      var Ly0 = -W * DIAG - 40, Ly1 = H + 8 + W * DIAG;                    // the line starts fully above the screen and ends fully below it
      var Ly = Ly0 + (Ly1 - Ly0) * ease(prog);
      ctx.globalAlpha = fo;
      ctx.save();
      ctx.beginPath();                                                      // the packed side: everything below the line
      ctx.moveTo(0, Ly); ctx.lineTo(W, Ly - W * DIAG); ctx.lineTo(W, H + 20); ctx.lineTo(0, H + 20); ctx.closePath();
      ctx.clip();
      ctx.fillStyle = rgba(C.bg, 1); ctx.fillRect(0, 0, W, H);
      packedField(t, captured ? 0.1 : 0.22);
      if (captured) { drawBoxes(t); drawImages(); drawText(t, Ly); }
      hud(t, prog);
      ctx.restore();
      if (captured && prog > 0 && prog < 1) scanLine(Ly);
      ctx.globalAlpha = 1;
    }

    /* ---- control ---- */
    function release() {                            // hand the page back to the cursor and the background animations
      if (released) return;
      released = true;
      window.__txCover = false;
      window.__txBlind = false;
      window.dispatchEvent(new Event("txdone"));
    }
    function stopListening() {
      removeEventListener("keydown", onKey, true);
      removeEventListener("wheel", hold, true);
      removeEventListener("touchmove", hold, true);
      removeEventListener("resize", onResize, true);
      document.removeEventListener("visibilitychange", visibility);
    }
    function done() {
      if (ended) return;
      ended = true;
      window.__welcomeMs = Math.round(performance.now() - startedAt);
      stopListening();
      cv.remove();
      root.classList.remove("welcome-on");
      release();
    }
    function skip() {
      if (skipAt < 0) skipAt = elapsed;
    }
    function hold(e) { e.preventDefault(); }       // the page does not scroll under the overlay: it was read at this position
    function onKey(e) { if (e.key === "Escape") skip(); }    // a click or a tap never cancels it: only Esc does
    addEventListener("keydown", onKey, true);
    addEventListener("wheel", hold, { capture: true, passive: false });
    addEventListener("touchmove", hold, { capture: true, passive: false });
    function onResize() {                           // the address bar of a phone sliding in or out resizes the window by a few percent: that is not a reason to stop
      if (Math.abs(window.innerWidth - W) > 40 || Math.abs(window.innerHeight - H) > H * 0.35) skip();   // rotating the phone or resizing a desktop window is
    }
    addEventListener("resize", onResize, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontsReady = true; });
    function visibility() {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt) { pausedMs += performance.now() - hiddenAt; hiddenAt = 0; }
    }
    document.addEventListener("visibilitychange", visibility);

    function frame(ts) {
      if (ended) return;
      if (!last) last = ts - 16;
      var gap = ts - last;
      if (gap < 14) { requestAnimationFrame(frame); return; }
      last = ts;
      elapsed = (ts - startedAt - pausedMs) / 1000;   // the real clock, minus the time the tab was hidden: a slow or throttled device gets fewer frames, not a longer wait
      if (!captured && document.body && document.readyState !== "loading" && elapsed >= 0.25 && (fontsReady || elapsed > 1.4)) {
        try { capture(); } catch (err) { captured = false; skipAt = elapsed; }
      }
      if (!captured && elapsed > 3) skipAt = skipAt < 0 ? elapsed : skipAt;   // the page never became readable: do not hold the visitor
      slowRun = gap > 60 ? slowRun + 1 : Math.max(0, slowRun - 1);
      if (slowRun >= 5) fieldOff = true;             // a struggling device keeps the unpacking itself and loses the backdrop
      var d0 = performance.now();
      draw(elapsed);
      window.__welcomeDrawMs = Math.round((performance.now() - d0) * 10) / 10;
      if (captured && elapsed >= tDec0 + DUR * 0.12) release();   // the cursor and the background animations start once the page begins to show
      var over = skipAt >= 0 ? elapsed - skipAt >= 0.22 : captured && elapsed >= TOTAL;
      if (over) done(); else requestAnimationFrame(frame);
    }
    draw(0);
    cv.style.background = "transparent";
    requestAnimationFrame(frame);
    (function guard() { if (document.hidden) setTimeout(guard, 1000); else setTimeout(done, 9000); })();   // never leave the page covered

    return {
      stop: done,
      still: function (frac) {                     // for checking the design: one moment of it, drawn from the page as it is now
        stopListening();
        if (!captured) { elapsed = T_PACK; capture(); }
        elapsed = frac * TOTAL; draw(elapsed);
        ended = true; window.__txCover = false; window.__txBlind = false; root.classList.remove("welcome-on");
        return TOTAL;
      },
    };
  }

  // For checking the design: window.__welcomePlay() plays it now; window.__welcomeStill(0..1) paints one moment of it.
  function clearOld() { var o = document.getElementById("welcome"); if (o) o.remove(); }
  window.__welcomePlay = function () { clearOld(); try { return !!play(); } catch (err) { window.__txCover = false; window.__txBlind = false; root.classList.remove("welcome-on"); return false; } };
  window.__welcomeStill = function (frac) {
    clearOld();
    if (frac < 0) return 0;
    var r = play(); var total = r.still(frac); document.getElementById("welcome").style.pointerEvents = "none"; return total;
  };

  if (eligible()) {
    try { play(); } catch (err) {
      window.__txCover = false; window.__txBlind = false; root.classList.remove("welcome-on");
      var c = document.getElementById("welcome"); if (c) c.remove();
    }
  }
})();
