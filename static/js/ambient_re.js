/*
 * Ambient backgrounds for the IDA, Ghidra and Binary Ninja themes. Each is its tool's own view of a binary, drifting
 * quietly behind the page. They sit behind the content panels, are cheap (about 30 frames a second, a few hundred
 * shapes), stop with reduced motion or the motion switch, and idle while the old page is hidden by a transition.
 *
 *   IDA            a graph view: blocks of disassembly joined by green, red and blue edges. The graph pans slowly
 *                  (and with your scrolling); an executed path fills along the edges, lighting each block it reaches.
 *   Ghidra         a listing scrolling past: addresses, bytes, mnemonics and operands in Ghidra's own field colours,
 *                  flow arrows in the margin, and a highlight on the line under the pointer.
 *   Binary Ninja   an entropy plot of an imaginary binary: stepped columns per section, an axis, and a cursor that
 *                  follows where you are in the page.
 */
(function ambientRE() {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var root = document.documentElement;
  var TAU = Math.PI * 2;
  var FRAME_MS = 1000 / 30;
  var NAMES = { ida: 1, ghidra: 1, binja: 1 };

  var cv = null, ctx = null, W = 0, H = 0, DPR = 1, raf = 0, running = false;
  var scene = null, sceneName = null, clock = 0, last = 0, lastDraw = 0;
  var mouse = { x: -999, y: -999, on: false };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hex(h, fb) {
    h = (h || "").trim().replace("#", "");
    if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
    if (!/^[0-9a-f]{6}$/i.test(h)) return fb;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function cssv(name, fb) { return hex(getComputedStyle(root).getPropertyValue(name), fb); }
  function hex8() { return ("0000000" + ((Math.random() * 0xffffffff) >>> 0).toString(16)).slice(-8); }

  /* =====================================================================================================
     IDA: the graph view
     ===================================================================================================== */
  function idaScene() {
    var nodes = [], edges = [], Ht = 1600, pulses = [], C = {};

    function makeLines() {
      var out = [], n = 3 + ((Math.random() * 4) | 0);
      for (var i = 0; i < n; i++) out.push({ m: rand(0.22, 0.34), o: rand(0.2, 0.46), c: Math.random() < 0.18 ? 1 : 0 });
      return out;
    }
    function init() {
      C.border = cssv("--node-border", [143, 157, 183]); C.label = cssv("--label", [23, 71, 201]); C.muted = cssv("--muted", [93, 106, 129]);
      C.green = cssv("--green", [20, 144, 63]); C.red = cssv("--red", [208, 52, 44]); C.blue = cssv("--blue", [29, 89, 224]);
      C.sel = [243, 200, 0];
      C.dark = root.getAttribute("data-tone") === "dark"; C.node = cssv("--node", [32, 36, 43]); C.bar = cssv("--bar", [38, 42, 51]);
      nodes = []; edges = []; pulses = [];
      // The page's panels cover the middle of the screen, so on a wide screen the graph lives in the two side margins.
      var gutter = (W - 1060) / 2, regions = gutter > 150 ? [[8, gutter - 6], [W - gutter + 6, W - 8]] : [[8, W - 8]];
      var ys = [], y = 36;
      while (y < Math.max(H * 1.9, 1500)) { ys.push(y); y += rand(118, 168); }
      Ht = y + 40;
      regions.forEach(function (rg) {
        var width = rg[1] - rg[0], prev = [], first = [];
        ys.forEach(function (ly, l) {
          var cnt = width < 260 ? (Math.random() < 0.3 ? 2 : 1) : (l === 0 ? 1 : (Math.random() < 0.42 ? 2 : (Math.random() < 0.16 ? 3 : 1)));
          if (l === 0) cnt = 1;
          var row = [], slot = width / (cnt + 1);
          for (var i = 0; i < cnt; i++) {
            var w = clamp(rand(86, 150), 54, width / cnt - 12), h = rand(46, 78);
            var x = clamp(rg[0] + slot * (i + 1) + rand(-slot * 0.2, slot * 0.2) - w / 2, rg[0], rg[1] - w);
            row.push({ x: x, y: ly, w: w, h: h, lines: makeLines(), flash: 0 });
          }
          row.forEach(function (n) { nodes.push(n); });
          if (l === 0) first = row;
          prev.forEach(function (p, pi) {
            if (row.length === 1) edges.push({ a: p, b: row[0], c: C.blue, wrap: 0 });
            else if (prev.length === 1) {
              edges.push({ a: p, b: row[0], c: C.green, wrap: 0 });
              edges.push({ a: p, b: row[1], c: C.red, wrap: 0 });
            } else edges.push({ a: p, b: row[Math.min(row.length - 1, pi)], c: C.blue, wrap: 0 });
          });
          row.forEach(function (n) {
            if (!prev.length) return;
            if (!edges.some(function (e) { return e.b === n; })) {
              var near = prev.reduce(function (best, p) { return Math.abs(p.x - n.x) < Math.abs(best.x - n.x) ? p : best; }, prev[0]);
              edges.push({ a: near, b: n, c: C.blue, wrap: 0 });
            }
          });
          prev = row;
        });
        // the last layer feeds the first block of the next copy, so the graph pans without a seam
        prev.forEach(function (p) { edges.push({ a: p, b: first[0], c: C.blue, wrap: Ht }); });
      });
    }
    function path(e, dy) {
      var x0 = e.a.x + e.a.w / 2, y0 = e.a.y + e.a.h + dy, x1 = e.b.x + e.b.w / 2, y1 = e.b.y + e.wrap + dy;
      var ym = y0 + Math.max(14, (y1 - y0) * 0.5);
      return [[x0, y0], [x0, ym], [x1, ym], [x1, y1]];
    }
    function drawArrow(x, y, col, a) {
      ctx.fillStyle = rgba(col, a);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 8); ctx.lineTo(x + 4, y - 8); ctx.closePath(); ctx.fill();
    }
    function frame(dt) {
      var off = (clock * 7 + window.scrollY * 0.07) % Ht;
      ctx.clearRect(0, 0, W, H);
      var copy, i;
      // edges
      ctx.lineWidth = 1.5; ctx.lineJoin = "round";
      ctx.setLineDash([7, 5]); ctx.lineDashOffset = -clock * 12;
      for (copy = 0; copy < 2; copy++) {
        var dy = copy * Ht - off;
        for (i = 0; i < edges.length; i++) {
          var e = edges[i];
          var p = path(e, dy);
          if (p[0][1] > H + 40 || p[3][1] < -40) continue;
          ctx.strokeStyle = rgba(e.c, 0.42);
          ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.lineTo(p[3][0], p[3][1]); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      for (copy = 0; copy < 2; copy++) {
        var dy2 = copy * Ht - off;
        for (i = 0; i < edges.length; i++) {
          var e2 = edges[i];
          var q = path(e2, dy2);
          if (q[0][1] > H + 40 || q[3][1] < -40) continue;
          drawArrow(q[3][0], q[3][1], e2.c, 0.62);
        }
      }
      // blocks
      for (copy = 0; copy < 2; copy++) {
        var dy3 = copy * Ht - off;
        for (i = 0; i < nodes.length; i++) {
          var n = nodes[i], ny = n.y + dy3;
          if (ny > H + 10 || ny + n.h < -10) continue;
          var over = mouse.on && mouse.x >= n.x && mouse.x <= n.x + n.w && mouse.y >= ny && mouse.y <= ny + n.h;
          ctx.fillStyle = C.dark ? "rgba(0,0,0,0.35)" : "rgba(120,135,170,0.22)"; ctx.fillRect(n.x + 3, ny + 3, n.w, n.h);
          ctx.fillStyle = C.dark ? rgba(C.node, 0.82) : "rgba(232,236,243,0.72)"; ctx.fillRect(n.x, ny, n.w, n.h);
          ctx.fillStyle = C.dark ? rgba(C.bar, 0.95) : "rgba(205,216,238,0.8)"; ctx.fillRect(n.x, ny, n.w, 9);
          ctx.strokeStyle = n.flash > 0.02 ? rgba(C.sel, 0.35 + 0.65 * n.flash) : over ? rgba(C.sel, 0.9) : rgba(C.border, 0.55);
          ctx.lineWidth = n.flash > 0.02 || over ? 2 : 1; ctx.strokeRect(n.x + 0.5, ny + 0.5, n.w - 1, n.h - 1);
          for (var k = 0; k < n.lines.length; k++) {
            var ly = ny + 15 + k * 8.5, ln = n.lines[k];
            ctx.fillStyle = rgba(C.label, 0.5); ctx.fillRect(n.x + 7, ly, n.w * ln.m * 0.6, 3.4);
            ctx.fillStyle = rgba(ln.c ? C.green : C.muted, ln.c ? 0.55 : 0.42); ctx.fillRect(n.x + 7 + n.w * ln.m * 0.6 + 6, ly, n.w * ln.o, 3.4);
          }
          if (n.flash > 0) n.flash = Math.max(0, n.flash - dt * 0.9);
        }
      }
      // the pulse: an execution trace running down the edges
      if (pulses.length < 2 && Math.random() < dt * 0.9) {
        var cand = edges.filter(function (ed) { var yy = ed.a.y - off; return (yy > 0 && yy < H * 0.7) || (yy + Ht > 0 && yy + Ht < H * 0.7); });
        if (cand.length) { var ch = pick(cand); pulses.push({ e: ch, t: 0, copy: (ch.a.y - off) > 0 ? 0 : 1 }); }
      }
      for (i = pulses.length - 1; i >= 0; i--) {
        var pu = pulses[i]; pu.t += dt * 0.55;
        var pe = pu.e;
        var pp = path(pe, pu.copy * Ht - off);
        var seg = [pp[1][1] - pp[0][1], Math.abs(pp[2][0] - pp[1][0]), pp[3][1] - pp[2][1]], tot = seg[0] + seg[1] + seg[2] || 1;
        var d = Math.min(1, pu.t) * tot, px, py;
        if (d < seg[0]) { px = pp[0][0]; py = pp[0][1] + d; }
        else if (d < seg[0] + seg[1]) { px = pp[1][0] + Math.sign(pp[2][0] - pp[1][0]) * (d - seg[0]); py = pp[1][1]; }
        else { px = pp[3][0]; py = pp[2][1] + (d - seg[0] - seg[1]); }
        // the part of the edge already executed: a solid, brighter stroke from the start to the marker (no glow)
        ctx.beginPath(); ctx.moveTo(pp[0][0], pp[0][1]);
        if (d >= seg[0]) ctx.lineTo(pp[1][0], pp[1][1]);
        if (d >= seg[0] + seg[1]) ctx.lineTo(pp[2][0], pp[2][1]);
        ctx.lineTo(px, py);
        ctx.lineWidth = 2.5; ctx.lineJoin = "miter"; ctx.strokeStyle = rgba(pe.c, 0.9); ctx.stroke();
        ctx.fillStyle = rgba(pe.c, 1); ctx.fillRect(px - 3, py - 3, 6, 6);
        if (pu.t >= 1) {
          pe.b.flash = 1;
          var nxt = edges.filter(function (ed) { return ed.a === pe.b; });
          if (nxt.length && Math.random() < 0.9) { pu.e = pick(nxt); pu.t = 0; } else pulses.splice(i, 1);
        }
      }
    }
    return { init: init, frame: frame };
  }

  /* =====================================================================================================
     Ghidra: the listing
     ===================================================================================================== */
  function ghidraScene() {
    var rows = [], ROW = 19, speed = 15, scroll = 0, arrows = [], C = {}, FONT = "12px 'IBM Plex Mono', ui-monospace, monospace";
    var MN = [["MOV", "r"], ["PUSH", "r"], ["POP", "r"], ["LEA", "m"], ["XOR", "r"], ["ADD", "r"], ["SUB", "r"], ["CMP", "r"], ["TEST", "r"], ["CALL", "f"], ["JMP", "l"], ["JZ", "l"], ["JNZ", "l"], ["RET", ""], ["NOP", ""], ["SHL", "c"], ["AND", "c"]];
    var REG = ["EAX", "EBX", "ECX", "EDX", "ESI", "EDI", "ESP", "EBP"];
    function row(i) {
      var m = pick(MN), kind = m[1], ops = "", opc = "plain";
      var addr = (0x401000 + i * 3 + ((Math.random() * 3) | 0)).toString(16).padStart(8, "0");
      var bytes = ""; for (var b = 0, n = 1 + ((Math.random() * 5) | 0); b < n; b++) bytes += ((Math.random() * 256) | 0).toString(16).padStart(2, "0") + " ";
      if (kind === "r") { ops = pick(REG) + "," + (Math.random() < 0.5 ? pick(REG) : "0x" + ((Math.random() * 255) | 0).toString(16)); opc = "reg"; }
      else if (kind === "m") { ops = pick(REG) + ",[" + pick(REG) + " + 0x" + ((Math.random() * 64) | 0).toString(16) + "]"; opc = "reg"; }
      else if (kind === "f") { ops = "FUN_" + (0x401000 + ((Math.random() * 0x900) | 0)).toString(16).padStart(8, "0"); opc = "fn"; }
      else if (kind === "l") { ops = "LAB_" + (0x401000 + ((Math.random() * 0x900) | 0)).toString(16).padStart(8, "0"); opc = "lab"; }
      else if (kind === "c") { ops = pick(REG) + ",0x" + ((Math.random() * 31) | 0).toString(16); opc = "const"; }
      var cm = Math.random() < 0.16 ? "; XREF[" + (1 + ((Math.random() * 3) | 0)) + "]: FUN_" + hex8().slice(0, 8) : "";
      return { addr: addr, bytes: bytes.trim(), mn: m[0], ops: ops, opc: opc, cm: cm, label: Math.random() < 0.07 ? "LAB_" + addr : "" };
    }
    function init() {
      C.addr = cssv("--addr", [154, 164, 174]); C.bytes = cssv("--label", [135, 206, 250]); C.mn = [173, 216, 230];
      C.reg = [192, 192, 128]; C.fn = [255, 153, 255]; C.lab = [112, 192, 112]; C.const_ = [112, 192, 112]; C.cm = [192, 112, 192]; C.plain = cssv("--text", [187, 187, 187]);
      rows = []; var n = Math.ceil(H / ROW) + 4; for (var i = 0; i < n; i++) rows.push(row(i));
      arrows = [];
      scroll = 0;
    }
    function frame(dt) {
      scroll += (speed + window.scrollY * 0.0) * dt;
      while (scroll >= ROW) { scroll -= ROW; rows.shift(); rows.push(row(rows.length + ((Math.random() * 40) | 0))); arrows.forEach(function (a) { a.r1--; a.r2--; }); }
      arrows = arrows.filter(function (a) { return a.r1 > -2 && a.r2 > -2; });
      if (arrows.length < 4 && Math.random() < dt * 0.6) { var r1 = 4 + ((Math.random() * (rows.length - 14)) | 0); arrows.push({ r1: r1, r2: r1 + 3 + ((Math.random() * 7) | 0), lane: (Math.random() * 3) | 0, c: Math.random() < 0.5 ? [112, 192, 112] : [135, 206, 250] }); }
      ctx.clearRect(0, 0, W, H);
      ctx.font = FONT; ctx.textBaseline = "middle";
      var x0 = Math.max(16, W * 0.04);
      var mrow = mouse.on ? Math.floor((mouse.y + scroll) / ROW) : -1;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], y = i * ROW - scroll + ROW / 2;
        if (y < -ROW || y > H + ROW) continue;
        if (i === mrow) { ctx.fillStyle = "rgba(75,110,175,0.22)"; ctx.fillRect(0, y - ROW / 2, W, ROW); }
        var x = x0 + 34;
        if (r.label) { ctx.fillStyle = rgba(C.lab, 0.5); ctx.fillText(r.label, x, y); }
        else {
          ctx.fillStyle = rgba(C.addr, 0.5); ctx.fillText(r.addr, x + 120, y);
          ctx.fillStyle = rgba(C.bytes, 0.42); ctx.fillText(r.bytes, x + 214, y);
          ctx.fillStyle = rgba(C.mn, 0.58); ctx.fillText(r.mn, x + 330, y);
          ctx.fillStyle = rgba(C[r.opc === "const" ? "const_" : r.opc] || C.plain, 0.5); ctx.fillText(r.ops, x + 392, y);
          if (r.cm) { ctx.fillStyle = rgba(C.cm, 0.45); ctx.fillText(r.cm, x + 560, y); }
        }
      }
      // flow arrows in the margin
      ctx.lineWidth = 1.3;
      arrows.forEach(function (a) {
        var ya = a.r1 * ROW - scroll + ROW / 2, yb = a.r2 * ROW - scroll + ROW / 2, ax = x0 + 6 + a.lane * 7;
        ctx.strokeStyle = rgba(a.c, 0.5); ctx.fillStyle = rgba(a.c, 0.6);
        ctx.beginPath(); ctx.moveTo(x0 + 32, ya); ctx.lineTo(ax, ya); ctx.lineTo(ax, yb); ctx.lineTo(x0 + 28, yb); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0 + 33, yb); ctx.lineTo(x0 + 27, yb - 3.5); ctx.lineTo(x0 + 27, yb + 3.5); ctx.closePath(); ctx.fill();
      });
    }
    return { init: init, frame: frame };
  }

  /* =====================================================================================================
     Binary Ninja: the triage entropy plot
     ===================================================================================================== */
  function binjaScene() {
    var C = {}, cols = [], plotH = 0, y0 = 0, colW = 7, secs = [], lastP = -1, dirty = true;
    // sections of an imaginary binary: where each starts (fraction of the width), its mean entropy, its spread, its label
    var LAYOUT = [
      { at: 0.00, mean: 2.2, spread: 0.5, name: ".hdr",    key: "cherry" },
      { at: 0.07, mean: 6.4, spread: 0.7, name: ".text",   key: "acai" },
      { at: 0.50, mean: 4.5, spread: 1.4, name: ".rodata", key: "lime" },
      { at: 0.72, mean: 2.8, spread: 1.2, name: ".data",   key: "tang" },
      { at: 0.90, mean: 0.15, spread: 0.1, name: ".bss",   key: "cherry" },
    ];
    function init() {
      C.acai = cssv("--bn-acai", [160, 206, 238]); C.lime = cssv("--bn-lime", [197, 218, 164]); C.tang = cssv("--bn-tangerine", [228, 181, 149]);
      C.cherry = cssv("--bn-cherry", [224, 163, 179]); C.text = cssv("--text", [224, 224, 224]);
      plotH = clamp(H * 0.24, 96, 220); y0 = H - 44;
      var n = Math.ceil(W / colW) + 1;
      cols = []; secs = LAYOUT.map(function (L, i) { return { x: L.at * W, end: (LAYOUT[i + 1] ? LAYOUT[i + 1].at : 1) * W, L: L }; });
      var run = 0, val = 0;
      for (var i = 0; i < n; i++) {
        var x = i * colW, sec = secs[secs.length - 1];
        for (var k = 0; k < secs.length; k++) if (x >= secs[k].x && x < secs[k].end) sec = secs[k];
        if (run-- <= 0) { run = 1 + Math.floor(Math.random() * 4); val = clamp(sec.L.mean + (Math.random() - 0.5) * 2 * sec.L.spread, 0, 8); }   // levels hold for a few columns, like real entropy blocks
        cols.push({ v: val, col: C[sec.L.key] });
      }
      dirty = true;
    }
    function frame() {
      var max = Math.max(1, document.documentElement.scrollHeight - H), p = clamp((window.scrollY || 0) / max, 0, 1);
      if (!dirty && Math.abs(p - lastP) < 0.002) return;       // a still picture: it only redraws when the page scrolls
      lastP = p; dirty = false;
      ctx.clearRect(0, 0, W, H);
      ctx.font = "10px 'Roboto Mono', ui-monospace, monospace"; ctx.textBaseline = "middle";
      for (var g = 0; g <= 8; g += 2) {                         // the entropy axis: 0, 2, 4, 6, 8 bits
        var gy = y0 - (g / 8) * plotH;
        ctx.fillStyle = rgba(C.text, 0.07); ctx.fillRect(0, gy, W, 1);
        ctx.fillStyle = rgba(C.text, 0.3); ctx.textAlign = "left"; ctx.fillText(g.toFixed(1), 8, gy - 8);
      }
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i], h = (c.v / 8) * plotH, x = i * colW;
        ctx.fillStyle = rgba(c.col, 0.16); ctx.fillRect(x, y0 - h, colW - 1, h);
        ctx.fillStyle = rgba(c.col, 0.5); ctx.fillRect(x, y0 - h, colW - 1, 1.5);
      }
      ctx.textAlign = "left";
      secs.forEach(function (s) { ctx.fillStyle = rgba(s.L.key && C[s.L.key], 0.55); ctx.fillText(s.L.name, s.x + 6, y0 + 12); ctx.fillStyle = rgba(C.text, 0.12); ctx.fillRect(s.x, y0 - plotH, 1, plotH + 4); });
      var nx = Math.round(p * (W - 2));                          // where you are in the page, like Binary Ninja's navigation cursor
      ctx.fillStyle = rgba(C.text, 0.4); ctx.fillRect(nx, y0 - plotH - 6, 1.5, plotH + 6);
      ctx.fillStyle = rgba(C.acai, 0.95); ctx.fillRect(nx - 3, y0 - plotH - 9, 8, 6);
    }
    return { init: init, frame: frame };
  }

  var BUILD = { ida: idaScene, ghidra: ghidraScene, binja: binjaScene };

  /* ---- canvas, loop and theme switching ---- */
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.2e6 / Math.max(1, W * H)));
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (scene) scene.init();
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (window.__txBlind) { last = ts; return; }
    if (ts - lastDraw < FRAME_MS - 1) return;
    lastDraw = ts;
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts; clock += dt;
    scene.frame(dt);
  }
  function onMove(e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true; }
  function onLeave() { mouse.on = false; }
  function start(name) {
    if (running && sceneName === name) return;
    stop();
    running = true; sceneName = name;
    if (!cv) {
      cv = document.createElement("canvas");
      cv.id = "ambient-re";
      cv.setAttribute("aria-hidden", "true");
      cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;";
      ctx = cv.getContext("2d");
    }
    document.body.insertBefore(cv, document.body.firstChild);
    cv.style.opacity = name === "ida" ? "0.9" : "1";
    scene = BUILD[name]();
    resize();
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!running) return;
    running = false; sceneName = null; scene = null;
    cancelAnimationFrame(raf);
    window.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseleave", onLeave);
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
  }
  function sync() {
    if (document.prerendering) return;
    if (window.__txCover) { window.addEventListener("txdone", sync, { once: true }); return; }
    var t = root.getAttribute("data-theme");
    if (NAMES[t] && !root.classList.contains("no-motion")) start(t); else stop();
  }

  var resizeTimer = 0;
  window.addEventListener("resize", function () { if (!running) return; clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
  document.addEventListener("visibilitychange", function () {
    if (!running) return;
    if (document.hidden) cancelAnimationFrame(raf); else { last = 0; raf = requestAnimationFrame(frame); }
  });
  window.addEventListener("motionfx", sync);
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  // IDA's light and dark tones share one scene: only its colours change, so read them again.
  new MutationObserver(function () { if (running && scene) scene.init(); }).observe(root, { attributes: true, attributeFilter: ["data-tone"] });
  if (document.prerendering) document.addEventListener("prerenderingchange", sync, { once: true });
  else sync();
})();
