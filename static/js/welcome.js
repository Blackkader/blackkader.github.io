/*
 * Welcome: what a visitor sees the first time they land on the site in a browser session.
 *
 * The site arrives as a two-layer packed binary, like the ones in the writeups. A wall of high-entropy bytes sits under an
 * entropy meter at the top of its scale. Layer 1, an XOR stub, runs and
 * unlocks layer 2: a real ChaCha20 block (the 4x4 state mixes through its 20 rounds), and its keystream is XORed
 * over the ciphertext, byte by byte, into the plain text of a short message. Then a scan line sweeps the screen: behind it
 * the cover dissolves and the real page shows through, the line's bright front turns hex into that text, and the
 * entropy graph falls from "packed" to "readable". A breakpoint lands on the entry point and the page is live.
 *
 * Runs from <head>, so the cover is on the very first painted frame. It plays once per session, never for a reload,
 * the back button, or a visitor who came from another page of this site (transition.js handles those), and never when
 * animations are off. A click, a tap or any key skips it. Colours and font come from the theme's own variables.
 */
(function welcome() {
  "use strict";

  var root = document.documentElement;
  var T = 6.0;   // seconds

  function eligible() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("no-motion")) return false;
    if (document.prerendering) return false;
    var nav = performance.getEntriesByType("navigation")[0];
    if (nav && (nav.type === "reload" || nav.type === "back_forward")) return false;
    if (document.referrer.indexOf(location.origin) === 0) return false;
    try { if (sessionStorage.getItem("welcomed")) return false; } catch (err) {}
    return true;
  }

  // One ChaCha20 block (RFC 8439). It keeps the state after every round so the screen can show the real mixing.
  function chacha(key, counter, nonce) {
    var init = new Uint32Array(16), x, snaps = [];
    init.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]); init.set(key, 4); init[12] = counter; init.set(nonce, 13);
    x = new Uint32Array(init); snaps.push(new Uint32Array(x));
    function rl(v, n) { return ((v << n) | (v >>> (32 - n))) >>> 0; }
    function qr(a, b, c, d) {
      x[a] = (x[a] + x[b]) >>> 0; x[d] = rl(x[d] ^ x[a], 16);
      x[c] = (x[c] + x[d]) >>> 0; x[b] = rl(x[b] ^ x[c], 12);
      x[a] = (x[a] + x[b]) >>> 0; x[d] = rl(x[d] ^ x[a], 8);
      x[c] = (x[c] + x[d]) >>> 0; x[b] = rl(x[b] ^ x[c], 7);
    }
    for (var r = 0; r < 20; r++) {
      if (r % 2 === 0) { qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15); }
      else { qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14); }
      snaps.push(new Uint32Array(x));
    }
    var ks = new Uint8Array(64);
    for (var i = 0; i < 16; i++) {
      var w = (x[i] + init[i]) >>> 0;
      ks[i * 4] = w & 255; ks[i * 4 + 1] = (w >>> 8) & 255; ks[i * 4 + 2] = (w >>> 16) & 255; ks[i * 4 + 3] = w >>> 24;
    }
    return { snaps: snaps, ks: ks };
  }

  function play() {
    var cs = getComputedStyle(root);
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function smooth(a, b, v) { var x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
    function rgb(hex, fb) {
      hex = (hex || "").trim().replace("#", "");
      if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1");
      if (!/^[0-9a-f]{6}$/i.test(hex)) return fb;
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
    function rgba(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a + ")"; }
    function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function v(name, fb) { return rgb(cs.getPropertyValue(name), fb); }

    var C = {
      bg: v("--bg", [20, 20, 20]), node: v("--node", [30, 30, 30]), border: v("--node-border", [80, 80, 80]),
      label: v("--label", [120, 170, 255]), addr: v("--addr", [120, 130, 150]), head: v("--head", [240, 240, 240]),
      text: v("--text", [210, 210, 210]), muted: v("--muted", [130, 130, 130]),
      green: v("--green", [90, 200, 120]), red: v("--red", [230, 100, 90]), hover: v("--hover", [240, 180, 0]),
    };
    var FONT = cs.getPropertyValue("--font-mono").trim() || "monospace";

    var W = window.innerWidth, H = window.innerHeight, small = W < 700;
    var PIXEL_BUDGET = small ? 1.0e6 : 1.7e6;
    var SC = Math.min(window.devicePixelRatio || 1, Math.sqrt(PIXEL_BUDGET / (W * H)));
    var cv = document.createElement("canvas");
    cv.id = "welcome";
    cv.width = Math.ceil(W * SC);
    cv.height = Math.ceil(H * SC);
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;left:0;top:0;width:" + W + "px;height:" + H + "px;z-index:2147483000;contain:strict;will-change:transform;touch-action:none;background:" + rgba(C.bg, 1);
    root.appendChild(cv);
    window.__txCover = true;    // the cursor and the background animations idle while the cover is up
    window.__txBlind = true;
    try { sessionStorage.setItem("welcomed", "1"); } catch (err) {}
    var ctx = cv.getContext("2d");
    var startedAt = performance.now();

    /* ---- the secret: 64 bytes of plain text, locked with a real ChaCha20 keystream ---- */
    var PT_TEXT = "unpacked blackkader.exe successfully";
    while (PT_TEXT.length < 64) PT_TEXT += " ";
    PT_TEXT = PT_TEXT.slice(0, 64);
    var KEY = new Uint32Array([0x6c626b61, 0x6b616465, 0x722e6d65, 0x20657870, 0x65646974, 0x696f6e21, 0x00c0ffee, 0xdeadbeef]);
    var cc = chacha(KEY, 1, new Uint32Array([0x4b616465, 0x72000000, 0x00000001]));
    var PT = new Uint8Array(64), CT = new Uint8Array(64);
    for (var q = 0; q < 64; q++) { PT[q] = PT_TEXT.charCodeAt(q); CT[q] = PT[q] ^ cc.ks[q]; }

    /* ---- the wall of bytes ---- */
    var FS = small ? 12 : 14, CW = Math.round(FS * 2.25), CH = Math.round(FS * 1.75);
    var cols = Math.ceil(W / CW) + 1, rows = Math.ceil(H / CH) + 1, N = cols * rows;
    var HEX = "0123456789ABCDEF", BYTES = [];
    for (var b = 0; b < 256; b++) BYTES.push(HEX[b >> 4] + HEX[b & 15]);
    var data = new Uint8Array(N), tone = new Float32Array(N);
    for (var i = 0; i < N; i++) { data[i] = Math.random() * 256; tone[i] = Math.random(); }

    /* ---- the entropy graph: fixed noise per column, so the line does not jitter ---- */
    var PH = small ? 70 : 96;                       // height of the bottom panel
    var GX = Math.ceil(W / 3) + 1, ent = new Float32Array(GX), lowEnt = new Float32Array(GX);
    for (var g = 0; g < GX; g++) {
      ent[g] = 7.88 + Math.random() * 0.12;
      lowEnt[g] = 3.4 + 1.3 * Math.sin(g * 0.11) + 0.9 * Math.sin(g * 0.037 + 1.3) + (Math.random() - 0.5) * 0.9;
    }

    /* ---- layer 1, the XOR stub the visitor watches run ---- */
    var STUB = [
      "mov  esi, packed_blob",
      "mov  edi, 0x00401000",
      "mov  ecx, 0x1F40",
      "loop_:",
      "  lodsb",
      "  xor  al, key",
      "  rol  al, 3",
      "  stosb",
      "  loop loop_",
      "jmp  layer2",
    ];
    var LOOP_FIRST = 4, LOOP_LAST = 8;

    // the timeline (seconds)
    var U = small ? 1 : 1.2;                         // desktop text is a fifth larger; phones keep their sizes
    var T_STUB = 0.62, T_CHA = 1.32, T_RELEASE = 2.2, T_SWEEP = 3.2, T_SWEEP_END = 4.2;   // the decrypted message is whole from about 2.3 s and stays up until the sweep

    var sx = -400;           // the scan line
    var elapsed = 0, skipAt = -1, ended = false, last = 0, released = false;

    // Hand the page back to the background animations and the cursor while the cover is still opaque, so they are already
    // running by the time the sweep shows the page (they wait for this; without it they would only start when the welcome ended).
    function release() {
      if (released) return;
      released = true;
      window.__txCover = false;
      window.__txBlind = false;
      window.dispatchEvent(new Event("txdone"));
    }

    function text(s, x, y, size, color, weight, align) {
      ctx.font = (weight || 400) + " " + size + "px " + FONT;
      ctx.fillStyle = color;
      ctx.textAlign = align || "left";
      ctx.fillText(s, x, y);
    }
    function hx8(n) { return ("00000000" + n.toString(16)).slice(-8); }
    function hx2(n) { return BYTES[n & 255]; }

    function wall(t, a) {
      // a few bytes change every frame, like a dump being rewritten
      var flips = Math.floor(N * 0.03);
      for (var k = 0; k < flips; k++) { var j = (Math.random() * N) | 0; data[j] = Math.random() * 256; }
      ctx.textBaseline = "middle";
      ctx.font = "400 " + FS + "px " + FONT;
      ctx.textAlign = "center";
      var hot = mix(C.addr, C.label, 0.5);
      for (var r = 0; r < rows; r++) {
        var y = r * CH + CH / 2;
        for (var c = 0; c < cols; c++) {
          var idx = r * cols + c, x = c * CW + CW / 2;
          var dd = sx - x;                          // distance behind the scan line
          if (dd > 300) continue;                   // fully revealed: nothing left to draw
          var fade = dd > 0 ? 1 - smooth(0, 300, dd) : 1;
          var near = dd > -60 && dd < 80 ? 1 - Math.abs(dd - 10) / 70 : 0;   // the bright front of the line
          var s;
          if (near > 0.35) s = String.fromCharCode(PT[(idx * 5 + r) % 64] || 32);   // at the front, hex turns into the decrypted text
          else if (dd > 0) s = BYTES[(idx * 7 + 3) % 5 === 0 ? 0x20 : 0x00];        // behind it the bytes settle into zeros and spaces
          else s = BYTES[data[idx]];
          var col = near > 0 ? mix(hot, C.head, near) : mix(C.muted, hot, tone[idx]);
          var alpha = dd > 0 ? 0.5 : 0.2 + tone[idx] * 0.45 + near * 0.5;
          ctx.fillStyle = rgba(col, a * fade * alpha);
          ctx.fillText(s, x, y);
        }
      }
    }

    // the window both layers run in: drawn in its own coordinates (540 x 332) and scaled up on laptops and desktops
    // so it fills more of the screen; on a phone nothing is scaled
    function frameWindow(a, title) {
      var w = small ? Math.min(W - 24, 540) : 540, h = small ? 318 : 332;
      var k = small ? 1 : clamp(Math.min((W - 40) / w, (H - PH - 90) / h), 1, 1.65);
      var X = (W - w * k) / 2, Y = Math.max(54, (H - PH - h * k) / 2);
      ctx.save();
      ctx.translate(X, Y); ctx.scale(k, k);
      ctx.fillStyle = rgba(C.node, 0.96 * a); ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba(C.border, a); ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
      ctx.fillStyle = rgba(C.border, 0.3 * a); ctx.fillRect(0, 0, w, 26);
      ctx.textBaseline = "middle";
      text(title, 12, 14, 11.5, rgba(C.label, a), 600);
      return { x: 0, y: 0, w: w, h: h };
    }

    function stubLayer(t, a) {
      var f = frameWindow(a, ".text:00401000   layer 1: xor stub"), x = f.x, y = f.y, w = f.w, h = f.h;
      // which instruction is current: the setup lines once, then the loop spins, then the jump
      var u = t - T_STUB, cur;
      if (u < 0.2) cur = Math.floor(u / 0.067);
      else if (u < 0.55) cur = LOOP_FIRST + Math.floor((u - 0.2) / 0.07) % (LOOP_LAST - LOOP_FIRST + 1);
      else cur = STUB.length - 1;
      cur = clamp(cur, 0, STUB.length - 1);
      var lh = 21, ly = y + 44, lx = x + 16, fs = small ? 11.5 : 12.5;
      for (var n = 0; n < STUB.length; n++) {
        var yy = ly + n * lh;
        if (n === cur) { ctx.fillStyle = rgba(C.hover, 0.22 * a); ctx.fillRect(x + 4, yy - lh / 2 + 1, w - 8, lh - 2); }
        var isLbl = STUB[n].charAt(0) !== " " && STUB[n].indexOf(":") > 0;
        text(STUB[n], lx, yy, fs, rgba(isLbl ? C.green : n === cur ? C.head : C.text, a), n === cur ? 700 : 400);
      }
      var run = clamp((u - 0.2) / 0.35, 0, 1);
      var ecx = Math.max(0, Math.round(0x1F40 * (1 - run))), esi = 0x00602000 + Math.round(run * 0x1F40), edi = 0x00401000 + Math.round(run * 0x1F40);
      var ry = y + h - 66;
      ctx.fillStyle = rgba(C.border, 0.5 * a); ctx.fillRect(x + 12, ry - 14, w - 24, 1);
      text("ECX 0x" + hx8(ecx).toUpperCase() + "   AL " + hx2(Math.random() * 256), x + 16, ry, fs, rgba(C.label, a), 600);
      text("ESI 0x" + hx8(esi).toUpperCase() + "   EDI 0x" + hx8(edi).toUpperCase(), x + 16, ry + 22, fs, rgba(C.addr, a), 400);
      ctx.restore();
    }

    function chachaLayer(t, a) {
      var f = frameWindow(a, ".text:00401000   layer 2: chacha20"), x = f.x, y = f.y, w = f.w;
      var u = t - T_CHA;                            // 0 .. about 1.15
      var fs = small ? 10.5 : 12, cw = fs * 0.6, pad = 14;
      // 1. the state matrix mixing through its rounds (the real intermediate states)
      var rounds = clamp(u / 0.4, 0, 1) * 20, rd = Math.floor(rounds), snap = cc.snaps[Math.min(20, rd)];
      var mx = x + pad, my = y + 44, gapx = cw * 8 + (small ? 8 : 14);
      var even = rd % 2 === 0;
      for (var rr = 0; rr < 4; rr++) for (var cc2 = 0; cc2 < 4; cc2++) {
        var wi = rr * 4 + cc2;
        text(hx8(snap[wi]), mx + cc2 * gapx, my + rr * 19, fs, rgba(rd < 20 && (rd + wi) % 3 === 0 ? C.hover : C.addr, a * (rd < 20 ? 0.95 : 0.6)), rd < 20 ? 600 : 400);
      }
      var rx = x + w - pad, rtxt = "round " + ("0" + Math.min(rd, 20)).slice(-2) + " / 20", rcol = rgba(rd >= 20 ? C.green : C.label, a);
      if (small) {   // under the matrix: beside it there is no room on a narrow screen
        var yl = my + 4 * 19 + 2;
        text(rtxt, x + pad, yl, fs + 1, rcol, 700);
        text(rd >= 20 ? "keystream ready" : even ? "column rounds" : "diagonal rounds", rx, yl, fs, rgba(rd >= 20 ? C.green : C.muted, a), rd >= 20 ? 600 : 400, "right");
      } else {
        text(rtxt, rx, my, fs + 1, rcol, 700, "right");
        text(even ? "column rounds" : "diagonal rounds", rx, my + 19, fs, rgba(C.muted, a), 400, "right");
        if (rd >= 20) text("keystream ready", rx, my + 38, fs, rgba(C.green, a), 600, "right");
      }
      // 2. ciphertext XOR keystream = plaintext, one 16-byte row at a time
      var ky = y + 140, lblx = x + pad, bx = x + pad + cw * 3.4, step = cw * 3;
      var blocks = clamp((u - 0.42) / 0.55, 0, 1) * 4, bk = Math.min(3, Math.floor(blocks)), prog = blocks >= 4 ? 1 : blocks - bk;
      var shown = blocks >= 4 ? 16 : Math.floor(prog * 16);
      text("ct", lblx, ky, fs, rgba(C.red, a), 700);
      text("ks", lblx, ky + 22, fs, rgba(C.label, a), 700);
      text("pt", lblx, ky + 44, fs, rgba(C.green, a), 700);
      for (var k = 0; k < 16; k++) {
        var bi = bk * 16 + k, done = k < shown;
        text(hx2(CT[bi]), bx + k * step, ky, fs, rgba(C.red, a * (done ? 0.45 : 0.9)), 400);
        text(hx2(cc.ks[bi]), bx + k * step, ky + 22, fs, rgba(C.label, a * (done ? 0.45 : 0.9)), 400);
        if (done) text(hx2(PT[bi]), bx + k * step, ky + 44, fs, rgba(C.green, a), 700);
        else if (u > 0.42) text("..", bx + k * step, ky + 44, fs, rgba(C.muted, a * 0.5), 400);
      }
      ctx.fillStyle = rgba(C.border, 0.5 * a); ctx.fillRect(x + 12, ky + 62, w - 24, 1);
      // 3. the plain text as it comes out: centred, larger, and growing in place (unrevealed letters are dots)
      var got = blocks >= 4 ? 64 : bk * 16 + shown, big = small ? 14 : 18, ly = ky + 98;
      var msg = PT_TEXT.replace(/\s+$/, ""), maxCh = Math.max(12, Math.floor((w - pad * 2) / (big * 0.6))), lines = [], pos = 0;
      while (pos < msg.length) {                  // wrap on spaces, remembering where each line starts in the original text
        var end = Math.min(msg.length, pos + maxCh);
        if (end < msg.length) { var sp = msg.lastIndexOf(" ", end); if (sp > pos) end = sp; }
        lines.push({ s: msg.slice(pos, end), at: pos });
        pos = end; while (msg.charAt(pos) === " ") pos++;
      }
      for (var ln = 0; ln < lines.length; ln++) {
        var L = lines[ln], seg = "";
        for (var ch = 0; ch < L.s.length; ch++) seg += L.at + ch < got ? L.s.charAt(ch) : "\u00b7";
        ctx.font = "700 " + big + "px " + FONT;
        var lw = ctx.measureText(L.s).width;
        text(seg, x + (w - lw) / 2, ly + ln * (big + 8), big, rgba(C.head, a), 700);
      }
      var sig = "sig: " + (blocks >= 4 ? "OK  entry point 0x00401000" : "decrypting .text ...");
      text(sig, x + w / 2, y + f.h - 20, fs, rgba(blocks >= 4 ? C.green : C.muted, a), 600, "center");
      ctx.restore();
    }

    function panel(t, a) {
      var top = H - PH;
      ctx.fillStyle = rgba(C.node, 0.94 * a); ctx.fillRect(0, top, W, PH);
      ctx.fillStyle = rgba(C.border, a); ctx.fillRect(0, top, W, 1);
      // the line at the left of the scan line is readable (green), at its right it is still packed (red)
      var gh = PH - 30, gy = top + 24, cur = null;
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath(); var started = false;
        for (var gi = 0; gi < GX; gi++) {
          var px = gi * 3, readable = px < sx - 10;
          if ((pass === 0) !== readable) { started = false; continue; }
          var e = readable ? lowEnt[gi] : ent[gi] - (Math.sin(t * 6 + gi * 0.4) * 0.03);
          e = clamp(e, 0.3, 8);
          var py = gy + gh - (e / 8) * gh;
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
          if (Math.abs(px - sx) < 3) cur = e;
        }
        ctx.strokeStyle = rgba(pass === 0 ? C.green : C.red, a * 0.95); ctx.lineWidth = 1.5; ctx.stroke();
      }
      var e0 = sx < 0 ? 7.99 : sx > W ? 4.2 : (cur === null ? 7.99 : cur);
      var pct = clamp(Math.round(sx / W * 100), 0, 100);
      var msg;
      if (t < T_STUB) msg = "scanning...  packer detected: 2 layers";
      else if (t < T_CHA) msg = "layer 1: xor stub executing";
      else if (t < T_SWEEP) msg = "layer 2: chacha20 keystream over .text";
      else if (t < T_SWEEP_END) msg = "unpacking...  " + pct + "%";
      else msg = "unpacked   Packer: custom  ->  none";
      var eT = small ? "ent " + e0.toFixed(2) + "/8" : "entropy " + e0.toFixed(2) + " / 8.00";
      if (small) msg = t < T_STUB ? "packer: 2 layers" : t < T_CHA ? "layer 1: xor stub" : t < T_SWEEP ? "layer 2: chacha20" : t < T_SWEEP_END ? msg : "unpacked: packer none";
      var pf = (small ? 11 : 12.5) * U;
      ctx.textBaseline = "middle";
      for (; pf > 8; pf -= 0.5) {   // shrink until the status and the entropy figure cannot touch
        ctx.font = "600 " + pf + "px " + FONT;
        if (ctx.measureText(msg).width + ctx.measureText(eT).width + 44 <= W) break;
      }
      text(msg, 14, top + 12 * U, pf, rgba(t >= T_SWEEP_END ? C.green : C.text, a), 600);
      text(eT, W - 14, top + 12 * U, pf, rgba(e0 > 6 ? C.red : C.green, a), 600, "right");
    }

    function header(t, a) {
      var h = a * (1 - smooth(T_SWEEP - 0.3, T_SWEEP + 0.3, t));
      if (h <= 0.01) return;
      ctx.fillStyle = rgba(C.node, 0.9 * h); ctx.fillRect(0, 0, W, 40);
      ctx.textBaseline = "middle";
      text("blackkader.exe", 14, 20, (small ? 12.5 : 14) * U, rgba(C.head, h), 700);
      if (!small) text("[ packed ]  2 layers: xor + chacha20", 170, 20, 12.5 * U, rgba(C.red, h), 600);
      ctx.fillStyle = rgba(C.border, h); ctx.fillRect(0, 40, W, 1);
    }

    function breakpoint(t, a) {
      var u = (t - T_SWEEP_END) / 1.5;            // on screen for 1.5 s, the last 0.5 s of it a slow fade
      if (u < 0 || u > 1) return;
      var al = a * Math.min(1, u * 8) * (1 - smooth(0.66, 1, u));
      var s = "BREAKPOINT   .text:00401000   jmp OEP";
      var fs = (small ? 13 : 18) * U, w = Math.min(W - 24, s.length * fs * 0.62 + 40), h = fs * 2.6;
      var x = (W - w) / 2, y = H - PH - h - 18;   // just above the bottom panel, so the page stays visible behind it
      ctx.fillStyle = rgba(C.node, 0.92 * al); ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = rgba(C.hover, al); ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.textBaseline = "middle";
      text(s, W / 2, y + h / 2, fs, rgba(C.head, al), 700, "center");
    }

    function draw(t) {
      ctx.setTransform(SC, 0, 0, SC, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var fadeOut = skipAt >= 0 ? 1 - clamp((elapsed - skipAt) / 0.22, 0, 1) : 1;   // only a skip fades everything at once
      // the scan line: starts after layer 2, ends past the right edge
      var sweep = smooth(T_SWEEP, T_SWEEP_END, t);
      sx = sweep <= 0 ? -400 : -80 + sweep * (W + 520);
      ctx.globalAlpha = fadeOut;
      // the cover: opaque ahead of the line, and dissolving behind it so the real page shows through
      var x0 = sx - 300;
      if (x0 < W) {
        var gr = ctx.createLinearGradient(x0, 0, Math.max(sx, x0 + 1), 0);
        gr.addColorStop(0, rgba(C.bg, 0)); gr.addColorStop(1, rgba(C.bg, 1));
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
      wall(t, 1);
      if (sx > -100 && sx < W + 80) {   // the bright scan line
        var lg = ctx.createLinearGradient(sx - 36, 0, sx + 4, 0);
        lg.addColorStop(0, rgba(C.label, 0)); lg.addColorStop(1, rgba(C.label, 0.5));
        ctx.fillStyle = lg; ctx.fillRect(sx - 36, 0, 40, H);
        ctx.fillStyle = rgba(C.head, 0.95); ctx.fillRect(sx + 3, 0, 2, H);
      }
      var wa = smooth(T_STUB - 0.08, T_STUB + 0.1, t) * (1 - smooth(T_SWEEP - 0.12, T_SWEEP + 0.05, t));
      if (wa > 0.01) { if (t < T_CHA) stubLayer(t, wa); else chachaLayer(t, wa); }
      header(t, 1);
      panel(t, 1 - smooth(T - 1.0, T - 0.1, t));   // the entropy panel lingers after the sweep, then fades slowly
      breakpoint(t, 1);
      ctx.globalAlpha = 1;
    }

    function done() {
      if (ended) return;
      ended = true;
      window.__welcomeMs = Math.round(performance.now() - startedAt);
      removeEventListener("pointerdown", skip, true);
      removeEventListener("keydown", skip, true);
      cv.remove();
      release();
    }
    function skip(e) {
      if (e && e.type === "pointerdown") { e.preventDefault(); e.stopPropagation(); }   // the first tap only skips; it does not hit a link beneath
      if (skipAt < 0) skipAt = elapsed;
    }
    addEventListener("pointerdown", skip, true);
    addEventListener("keydown", skip, true);

    function frame(ts) {
      if (ended) return;
      if (!last) last = ts - 16;
      var gap = ts - last;
      if (gap < 14) { requestAnimationFrame(frame); return; }
      last = ts;
      elapsed += Math.min(0.05, gap / 1000);   // time only grows while frames run: a hidden tab pauses it instead of skipping ahead
      draw(elapsed);
      if (elapsed >= T_RELEASE) release();
      if (skipAt >= 0 ? elapsed - skipAt < 0.22 : elapsed < T) requestAnimationFrame(frame); else done();
    }
    draw(0);
    cv.style.background = "transparent";
    requestAnimationFrame(frame);
    (function guard() { if (document.hidden) setTimeout(guard, 1000); else setTimeout(done, T * 1000 + 3000); })();   // never leave the page covered
    return { stop: done, still: function (frac) { elapsed = frac * T; draw(elapsed); ended = true; window.__txCover = false; window.__txBlind = false; removeEventListener("pointerdown", skip, true); removeEventListener("keydown", skip, true); } };
  }

  // For checking the design: window.__welcomePlay() plays it now; window.__welcomeStill(0..1) paints one moment of it.
  window.__welcomePlay = function () { var o = document.getElementById("welcome"); if (o) o.remove(); try { return !!play(); } catch (err) { window.__txCover = false; window.__txBlind = false; return false; } };
  window.__welcomeStill = function (frac) {
    var o = document.getElementById("welcome"); if (o) o.remove();
    if (frac < 0) return 0;
    var r = play(); r.still(frac); document.getElementById("welcome").style.pointerEvents = "none"; return T;
  };

  if (eligible()) { try { play(); } catch (err) { window.__txCover = false; window.__txBlind = false; var c = document.getElementById("welcome"); if (c) c.remove(); } }
})();
