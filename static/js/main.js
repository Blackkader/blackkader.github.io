// Framing guard. GitHub Pages cannot send X-Frame-Options and a <meta> CSP ignores frame-ancestors, so a page on
// another site could frame this one (clickjacking). If we are framed, hide the page and try to break out.
if (window.top !== window.self) {
  document.documentElement.style.display = "none";
  try { window.top.location.href = window.self.location.href; } catch (e) { /* cross-origin top: staying hidden is enough */ }
}

const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function initCopyButtons() {
document.querySelectorAll(".post-body pre").forEach((pre) => {
  if (pre.parentNode.classList.contains("code-wrap")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy-btn";
  btn.setAttribute("aria-label", "Copy code");
  btn.innerHTML = COPY_ICON;
  // The button lives on a non-scrolling wrapper so it stays pinned to the
  // top-right corner while the code scrolls horizontally.
  const wrap = document.createElement("div");
  wrap.className = "code-wrap";
  pre.parentNode.insertBefore(wrap, pre);
  wrap.appendChild(pre);
  wrap.appendChild(btn);

  btn.addEventListener("click", () => {
    const code = pre.querySelector("code") || pre;
    navigator.clipboard.writeText(code.textContent).then(() => {
      btn.innerHTML = CHECK_ICON;
      btn.classList.add("copied");
      setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.classList.remove("copied");
      }, 1500);
    });
  });
});
}

/* ---------- Theme picker: six themes, chosen from a small menu ---------- */
(function themePicker() {
  const btn = document.querySelector("[data-theme-toggle]");
  if (!btn) return;
  const root = document.documentElement;
  // id is what is stored; attr is the data-theme value (none for Ember & Ash).
  const THEMES = [
    { id: "idadark", attr: "ida",   tone: "dark", label: "ida dark", name: "IDA Dark" },
    { id: "ida",    attr: "ida",    label: "ida light", name: "IDA Light" },
    { id: "binja",  attr: "binja",  label: "binja",  name: "Binary Ninja" },
    { id: "ghidra", attr: "ghidra", label: "ghidra", name: "Ghidra" },
    { id: "ember",  attr: null,     label: "e&a",    name: "Ember & Ash" },
    { id: "deco",   attr: "deco",   label: "electro", name: "Electro" },
    { id: "e33",    attr: "e33",    label: "e33",    name: "Expedition 33" },
  ];
  // IDA comes in two tones that share one data-theme: the dark one adds data-tone="dark".
  const current = () => THEMES.find((t) => t.attr === root.getAttribute("data-theme") && (t.tone || null) === root.getAttribute("data-tone")) || THEMES[0];
  window.__themes = THEMES;

  const menu = document.createElement("div");
  menu.className = "theme-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Colour theme");
  menu.hidden = true;
  THEMES.forEach((t) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "tm-item";
    item.setAttribute("role", "menuitemradio");
    item.dataset.themeId = t.id;
    item.innerHTML = '<span class="tm-name"></span>';
    item.querySelector(".tm-name").textContent = t.name;
    menu.appendChild(item);
  });
  document.body.appendChild(menu);

  const apply = (t) => {
    if (t.attr) root.setAttribute("data-theme", t.attr); else root.removeAttribute("data-theme");
    if (t.tone) root.setAttribute("data-tone", t.tone); else root.removeAttribute("data-tone");
    btn.textContent = "theme: " + t.label;
    menu.querySelectorAll(".tm-item").forEach((i) => i.setAttribute("aria-checked", String(i.dataset.themeId === t.id)));
  };
  const place = () => {
    const r = btn.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 4) + "px";
    menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + "px";
  };
  const close = (focusBtn) => {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (focusBtn) btn.focus();
  };
  const open = () => {
    place();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    const on = menu.querySelector('[aria-checked="true"]') || menu.querySelector(".tm-item");
    on.focus();
  };
  const items = () => Array.from(menu.querySelectorAll(".tm-item"));

  apply(current());
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden ? open() : close(); });
  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".tm-item");
    if (!item) return;
    const t = THEMES.find((x) => x.id === item.dataset.themeId);
    apply(t);
    try { localStorage.setItem("theme", t.id); } catch (err) {}
    close(true);
  });
  menu.addEventListener("keydown", (e) => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(true); }
  });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  window.addEventListener("resize", () => { if (!menu.hidden) place(); });
  window.addEventListener("scroll", () => { if (!menu.hidden) close(); }, { passive: true });
})();

/* ---------- Cursor toggle: visitors can switch the animated cursor off and get the normal one back ---------- */
(function cursorToggle() {
  const btn = document.querySelector("[data-cursor-toggle]");
  if (!btn) return;
  const root = document.documentElement;
  const sync = () => {
    const on = !root.classList.contains("no-cursor");
    btn.textContent = "cursor: " + (on ? "on" : "off");
    btn.setAttribute("aria-pressed", String(on));
  };
  sync();
  btn.addEventListener("click", () => {
    const off = !root.classList.contains("no-cursor");
    root.classList.toggle("no-cursor", off);
    try { localStorage.setItem("cursor", off ? "off" : "on"); } catch (e) {}
    sync();
    window.dispatchEvent(new Event("cursorfx"));   // cursor.js builds or removes the animated cursor
  });
})();

/* ---------- Motion toggle: switches every animation off, for slow devices or visitors who prefer calm ---------- */
(function motionToggle() {
  const btn = document.querySelector("[data-motion-toggle]");
  if (!btn) return;
  const root = document.documentElement;
  const sync = () => {
    const on = !root.classList.contains("no-motion");
    btn.textContent = "motion: " + (on ? "on" : "off");
    btn.setAttribute("aria-pressed", String(on));
  };
  sync();
  btn.addEventListener("click", () => {
    const off = !root.classList.contains("no-motion");
    root.classList.toggle("no-motion", off);
    try { localStorage.setItem("motion", off ? "off" : "on"); } catch (e) {}
    sync();
    window.dispatchEvent(new Event("motionfx"));   // the background canvases start or stop
  });
})();

/* ---------- Reveal blocks as they scroll into view ---------- */
function initReveal() {
  const items = document.querySelectorAll(".reveal:not(.revealed)");
  if (!items.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    items.forEach((el) => el.classList.add("revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0, rootMargin: "0px 0px -6% 0px" }
  );
  items.forEach((el) => observer.observe(el));

  // Safety net: never leave content invisible.
  setTimeout(() => items.forEach((el) => el.classList.add("revealed")), 900);
}

/* ---------- Live address in the status bar + active tab ---------- */
const addressTracker = (function () {
  const addrEl = document.querySelector("[data-st-addr]");
  const symEl = document.querySelector("[data-st-sym]");
  const tabs = Array.from(document.querySelectorAll(".tab[data-tab]"));
  let blocks = [], onPosts = false;
  let ticking = false;

  const update = () => {
    ticking = false;
    if (!blocks.length || !addrEl || !symEl) return;
    const mid = window.innerHeight * 0.45;
    let cur = blocks[0];
    for (const b of blocks) {
      if (b.getBoundingClientRect().top <= mid) cur = b;
    }
    const rect = cur.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (mid - rect.top) / Math.max(1, rect.height)));
    const base = parseInt(cur.dataset.addr, 16);
    const addr = (base + Math.floor(frac * 0x170)).toString(16).toUpperCase().padStart(8, "0");
    addrEl.textContent = ".text:" + addr;
    symEl.textContent = cur.dataset.sym;

    const curTop = rect.top;
    const activeTabs = new Set(
      blocks.filter((b) => Math.abs(b.getBoundingClientRect().top - curTop) < 3).map((b) => b.dataset.tab)
    );
    if (onPosts) activeTabs.add("writeups");
    tabs.forEach((t) => t.classList.toggle("active", activeTabs.has(t.dataset.tab)));
  };

  const schedule = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  // Runs on first load and after every page change: each page has its own blocks.
  return {
    refresh() {
      blocks = Array.from(document.querySelectorAll("[data-sym][data-addr]"));
      onPosts = location.pathname.startsWith("/posts");
      update();
    },
  };
})();

/* ---------- Easter egg: typing "nop" glitches the page ---------- */
(function patchEgg() {
  const CODE = ["n", "o", "p"];
  let progress = 0;
  let active = false;

  const run = () => {
    active = true;
    const symEl = document.querySelector("[data-st-sym]");
    const prevSym = symEl ? symEl.textContent : "";
    if (symEl) symEl.textContent = "patching...";
    document.body.classList.add("egg-glitch");

    setTimeout(() => {
      document.body.classList.remove("egg-glitch");
      if (symEl) symEl.textContent = prevSym;
      active = false;
    }, 900);
  };

  document.addEventListener("keydown", (e) => {
    if (active || e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea, [contenteditable]")) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    progress = key === CODE[progress] ? progress + 1 : key === CODE[0] ? 1 : 0;
    if (progress === CODE.length) {
      progress = 0;
      run();
    }
  });

  console.log(
    "%cYou read the source for fun? Same. Say hi.",
    "font: 13px monospace; color: #e0a45c; background: #131415; padding: 4px 8px;"
  );
})();

/* ---------- Tab row: fade at an edge when tabs are hidden there, and keep the active tab in view ---------- */
(function tabHints() {
  const bar = document.querySelector(".tabs");
  if (!bar) return;

  const update = () => {
    const max = bar.scrollWidth - bar.clientWidth;
    bar.classList.toggle("fade-left", max > 2 && bar.scrollLeft > 4);
    bar.classList.toggle("fade-right", max > 2 && bar.scrollLeft < max - 4);
  };

  let shown = null;
  const reveal = () => {
    const active = bar.querySelector(".tab.active");
    if (!active || active === shown) return;
    shown = active;
    if (bar.scrollWidth <= bar.clientWidth + 2) return;
    const left = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  };

  bar.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", () => { update(); reveal(); });
  new MutationObserver(reveal).observe(bar, { subtree: true, attributes: true, attributeFilter: ["class"] });
  update();
  reveal();
})();

/* ---- Clickable affordances: the scan wave and the X-ray view ---- */
(() => {
  const CLICK = 'a[href], button, summary, [role="button"], [data-xref-toggle]';
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const visible = () => [...document.querySelectorAll(CLICK)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
      && !el.closest(".statusbar") && getComputedStyle(el).visibility !== "hidden";
  }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);

  /* The scan wave: every clickable on screen lights up in turn, top to bottom. */
  let scans = 0, stopped = false, timer = 0;
  function scan() {
    if (document.documentElement.classList.contains("no-motion")) return;
    if (stopped || document.hidden || window.__txCover || document.prerendering) { timer = setTimeout(scan, 1500); return; }
    visible().slice(0, 24).forEach((el, i) => {
      el.style.setProperty("--xd", Math.min(i * 70, 1000) + "ms");
      el.classList.remove("xref-ping");
      void el.offsetWidth;
      el.classList.add("xref-ping");
      setTimeout(() => el.classList.remove("xref-ping"), 2600);
    });
    scans++;   // one gentle pass per page, no repeats
  }
  if (!reduce) timer = setTimeout(scan, 1600);
  // Once someone has clicked something, they have found it: stop nudging.
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(CLICK)) { stopped = true; clearTimeout(timer); } }, true);

  /* The X-ray view: outline every clickable and label where it leads. */
  let layer = null, on = false, raf = 0;
  const label = (el) => {
    if (el.matches("[data-theme-toggle]")) return "switch theme";
    if (el.matches(".copy-btn")) return "copy code";
    if (el.matches("summary")) return "expand";
    const href = el.getAttribute("href");
    if (!href) return "click";
    if (/^https?:/.test(href)) return "↗ " + new URL(href).hostname.replace(/^www\./, "");
    if (href.startsWith("mailto:")) return "mail";
    const path = href.replace(/^\//, "");
    return "\u2192 " + (path || "home");
  };
  function draw() {
    raf = 0;
    if (!on) return;
    layer.textContent = "";
    visible().slice(0, 60).forEach((el) => {
      const r = el.getBoundingClientRect(), tag = document.createElement("span");
      tag.className = "xref-tag";
      tag.textContent = label(el);
      tag.style.left = Math.max(2, Math.min(r.left, innerWidth - 120)) + "px";
      tag.style.top = Math.max(2, r.top - 16) + "px";
      tag.style.maxWidth = Math.max(44, r.width - (el.matches("a.post-card") ? 96 : 0)) + "px";
      layer.appendChild(tag);
    });
  }
  const schedule = () => { if (on && !raf) raf = requestAnimationFrame(draw); };
  function toggle(force) {
    on = typeof force === "boolean" ? force : !on;
    document.documentElement.classList.toggle("xref-view", on);
    if (on) {
      layer = layer || Object.assign(document.createElement("div"), { id: "xref-layer" });
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
      stopped = true; clearTimeout(timer);
      draw();
    } else if (layer) layer.remove();
  }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "x" && !e.ctrlKey && !e.metaKey && !e.altKey && !/input|textarea|select/i.test(e.target.tagName)) toggle();
    if (e.key === "Escape" && on) toggle(false);
  });
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-xref-toggle]")) toggle(); });

  // A new page (nav.js swaps content without reloading): one gentle scan again, and the X-ray labels follow the new links.
  window.__xrefPage = () => {
    stopped = false; clearTimeout(timer);
    if (!reduce) timer = setTimeout(scan, 1600);
    if (on) schedule();
  };
})();

/* ---- Pause everything while this tab is in the background ---- */
(() => {
  const root = document.documentElement;
  const sync = () => root.classList.toggle("tab-hidden", document.hidden);
  document.addEventListener("visibilitychange", sync);
  sync();
})();

// Card titles stay on one line: shrink a long name until all of it fits the box.
(() => {
  const titles = () => document.querySelectorAll(".post-card h3, .post-card h4");
  function fit() {
    titles().forEach((h) => {
      h.style.fontSize = "";
      let size = parseFloat(getComputedStyle(h).fontSize);
      while (h.scrollWidth > h.clientWidth + 0.5 && size > 10) { size -= 0.5; h.style.fontSize = size + "px"; }
    });
  }
  window.__fitCards = fit;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(fit, 120); });
  new MutationObserver(() => requestAnimationFrame(fit)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });   // each theme has its own title font
})();

/* ---- What belongs to the page, not the site. Runs now, and again after every page change (nav.js) ---- */
window.__pageInit = function () {
  initCopyButtons();
  initReveal();
  addressTracker.refresh();
  if (window.__xrefPage) window.__xrefPage();
  if (window.__fitCards) window.__fitCards();
};
window.__pageInit();
