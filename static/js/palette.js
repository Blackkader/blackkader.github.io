/*
 * Binary Ninja's command palette, for the Binary Ninja theme: press Ctrl+P (or click the hint in the status bar).
 * Type to search the sections, every CTF and writeup, the colour themes and a few actions; the arrow keys choose,
 * Enter runs, Esc closes. It exists only while that theme is active.
 */
(function palette() {
  "use strict";

  var root = document.documentElement;
  var wrap = null, input = null, list = null, items = [], shown = [], sel = 0, isOpen = false, chip = null;
  var CATS = { "go to": "acai", ctf: "lime", writeup: "tangerine", theme: "grape", action: "cherry" };
  var SECTIONS = [["About", "/#about"], ["Experience", "/#experience"], ["Education", "/#education"], ["Projects", "/#projects"], ["Writeups", "/posts"]];

  function active() { return root.getAttribute("data-theme") === "binja"; }
  function go(u) { return function () { if (window.__navTo) window.__navTo(u); else location.href = u; }; }
  function click(sel2) { return function () { var el = document.querySelector(sel2); if (el) el.click(); }; }

  function build() {
    var out = [], idx = [];
    try { idx = JSON.parse(document.getElementById("site-index").textContent) || []; } catch (e) {}
    SECTIONS.forEach(function (s) { out.push({ cat: "go to", t: s[0], sub: s[1], run: go(s[1]) }); });
    idx.forEach(function (i) { out.push({ cat: i.k === "ctf" ? "ctf" : "writeup", t: i.t, sub: i.c || "", run: go(i.u) }); });
    (window.__themes || []).forEach(function (th) {
      out.push({ cat: "theme", t: "Switch to " + th.name, sub: "theme", run: function () { var it = document.querySelector('.tm-item[data-theme-id="' + th.id + '"]'); if (it) it.click(); } });
    });
    out.push({ cat: "action", t: "Download CV", sub: "PDF", run: click("a.btn-cv") });
    out.push({ cat: "action", t: "Toggle animations", sub: "motion", run: click("[data-motion-toggle]") });
    out.push({ cat: "action", t: "Toggle the animated cursor", sub: "cursor", run: click("[data-cursor-toggle]") });
    out.push({ cat: "action", t: "Show clickable things", sub: "X", run: click("[data-xref-toggle]") });
    document.querySelectorAll(".social-rail a[href^='http'], .hero-social a[href^='http']").forEach(function (a) {
      var name = a.getAttribute("aria-label"); if (!name) return;
      if (out.some(function (o) { return o.t === "Open " + name; })) return;
      out.push({ cat: "action", t: "Open " + name, sub: a.hostname, run: function () { window.open(a.href, "_blank", "noopener"); } });
    });
    return out;
  }

  /* a letter-by-letter match: the closer together and the nearer the start of a word, the better */
  function score(q, text) {
    q = q.toLowerCase(); var t = text.toLowerCase(), qi = 0, s = 0, last = -2;
    for (var i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) { s += (i === 0 || " -_/".indexOf(t[i - 1]) >= 0) ? 8 : (last === i - 1 ? 5 : 1); last = i; qi++; }
    }
    return qi === q.length ? s - t.length * 0.02 : -1;
  }

  function render() {
    var q = input.value.trim(), res;
    if (!q) res = items.slice(0, 9);
    else res = items.map(function (it) { return { it: it, s: Math.max(score(q, it.t), score(q, it.cat + " " + it.t) - 2, it.sub ? score(q, it.sub) - 4 : -1) }; })
      .filter(function (r) { return r.s >= 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 9).map(function (r) { return r.it; });
    shown = res; sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.textContent = "";
    if (!shown.length) { var none = document.createElement("li"); none.className = "pal-none"; none.textContent = "Nothing matches “" + q + "”. Try a section, a CTF or a writeup name."; list.appendChild(none); return; }
    shown.forEach(function (it, i) {
      var li = document.createElement("li");
      li.className = "pal-item"; li.setAttribute("role", "option"); li.id = "pal-opt-" + i;
      li.setAttribute("aria-selected", String(i === sel));
      var cat = document.createElement("span"); cat.className = "pal-cat pal-" + (CATS[it.cat] || "acai"); cat.textContent = it.cat;
      var t = document.createElement("span"); t.className = "pal-t"; t.textContent = it.t;
      var sub = document.createElement("span"); sub.className = "pal-sub"; sub.textContent = it.sub || "";
      li.appendChild(cat); li.appendChild(t); li.appendChild(sub);
      li.addEventListener("mousemove", function () { if (sel !== i) { sel = i; mark(); } });
      li.addEventListener("click", function () { run(i); });
      list.appendChild(li);
    });
    input.setAttribute("aria-activedescendant", "pal-opt-" + sel);
  }
  function mark() {
    list.querySelectorAll(".pal-item").forEach(function (li, i) { li.setAttribute("aria-selected", String(i === sel)); if (i === sel) li.scrollIntoView({ block: "nearest" }); });
    input.setAttribute("aria-activedescendant", "pal-opt-" + sel);
  }
  function run(i) { var it = shown[i]; if (!it) return; close(); setTimeout(it.run, 30); }

  function ensure() {
    if (wrap) return;
    wrap = document.createElement("div");
    wrap.className = "pal-wrap";
    wrap.innerHTML = '<div class="pal" role="dialog" aria-modal="true" aria-label="Command palette">' +
      '<input class="pal-input" type="text" spellcheck="false" autocomplete="off" placeholder="Search commands, pages and writeups" aria-label="Search" aria-controls="pal-list">' +
      '<ul class="pal-list" id="pal-list" role="listbox"></ul>' +
      '<div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>⏎</kbd> run</span><span><kbd>esc</kbd> close</span></div></div>';
    document.body.appendChild(wrap);
    input = wrap.querySelector(".pal-input"); list = wrap.querySelector(".pal-list");
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) close(); });
    input.addEventListener("input", function () { sel = 0; render(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + Math.max(1, shown.length)) % Math.max(1, shown.length); mark(); }
      else if (e.key === "Enter") { e.preventDefault(); run(sel); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Tab") { e.preventDefault(); }
    });
  }
  function open() {
    if (!active()) return;
    ensure(); items = build(); input.value = ""; sel = 0; render();
    wrap.classList.add("on"); isOpen = true; input.focus();
  }
  function close() {
    if (!wrap || !isOpen) return;
    wrap.classList.remove("on"); isOpen = false;
  }

  document.addEventListener("keydown", function (e) {
    if (!active()) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") { e.preventDefault(); isOpen ? close() : open(); }
  });

  /* the hint in the status bar */
  function syncChip() {
    if (active()) {
      if (chip && chip.isConnected) return;
      var bar = document.querySelector(".statusbar .st-right");
      if (!bar) return;
      chip = document.createElement("span");
      chip.className = "st-palette"; chip.setAttribute("role", "button"); chip.tabIndex = 0;
      chip.textContent = "ctrl+p  palette";
      chip.addEventListener("click", open);
      chip.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      bar.insertBefore(chip, bar.firstChild);
    } else {
      if (chip) { chip.remove(); chip = null; }
      close();
    }
  }
  new MutationObserver(syncChip).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  syncChip();
})();
