/*
 * Image preview for the writeups: a click (or tap) on a screenshot opens it large and centred over a blurred page.
 * The + and - buttons (or the + - 0 keys, or Ctrl and the mouse wheel) zoom in and out; the percentage is the zoom
 * against the picture's real size and a click on it fits the picture to the screen again. Click the image to jump
 * between fitted and real size (scroll to look around); click outside it, press the close button or Esc to close. On a phone the back button closes it too. Works with the page changes nav.js makes (it listens for
 * "pagechange"), and every screenshot can also be opened from the keyboard.
 */
(function lightbox() {
  "use strict";

  var root = document.documentElement;
  var SEL = ".post-body img";
  var box = null, scroller = null, big = null, btn = null, tools = null, bMinus = null, bPlus = null, bPct = null, hideTimer = 0;
  var z = 1, fitW = 0, STEP = 1.25, ZMIN = 0.5, ZMAX = 8;
  var open = false, pushed = false, opener = null;

  function usable(img) {
    if (!img || img.closest("a[href]")) return false;
    var w = img.getAttribute("width");
    return !(w && +w < 80) && !(img.naturalWidth && img.naturalWidth < 80);
  }

  // Make each screenshot reachable and announced as a button (the cursor and the keyboard then treat it as clickable).
  function prep() {
    document.querySelectorAll(SEL).forEach(function (img) {
      if (img.dataset.lb || !usable(img)) return;
      img.dataset.lb = "1";
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", "Enlarge image");
      img.setAttribute("aria-haspopup", "dialog");
    });
  }

  function tool(cls, label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lb-tool " + cls;
    b.setAttribute("aria-label", label);
    return b;
  }

  // The zoom is a multiple of the fitted size (1 = fitted); the label shows it against the real size.
  function setZoom(next) {
    if (!open || !big.naturalWidth) return;
    if (z === 1) { fitW = big.offsetWidth; }
    var nz = Math.min(ZMAX, Math.max(ZMIN, next));
    if (Math.abs(nz - 1) < 0.001) nz = 1;
    var fx = (scroller.scrollLeft + scroller.clientWidth / 2) / (scroller.scrollWidth || 1);
    var fy = (scroller.scrollTop + scroller.clientHeight / 2) / (scroller.scrollHeight || 1);
    z = nz;
    if (z === 1) { big.style.width = ""; big.style.height = ""; box.classList.remove("zoom"); }
    else { big.style.width = Math.round(fitW * z) + "px"; big.style.height = "auto"; box.classList.add("zoom"); }
    scroller.scrollLeft = fx * scroller.scrollWidth - scroller.clientWidth / 2;       // keep looking at the same spot
    scroller.scrollTop = fy * scroller.scrollHeight - scroller.clientHeight / 2;
    label();
  }

  function zoomBy(f) { setZoom(z * f); }

  function toggleReal() {
    if (z !== 1) { setZoom(1); return; }
    var fw = big.offsetWidth - 2;
    var real = fw > 0 ? big.naturalWidth / fw : 2;
    setZoom(real > 1.02 ? real : 2);
  }

  function label() {
    if (!bPct) return;
    var w = z === 1 ? big.offsetWidth : fitW * z;
    var pct = big.naturalWidth && w ? Math.round((w - 2) / big.naturalWidth * 100) : 100;
    bPct.textContent = pct + "%";
    bMinus.disabled = z <= ZMIN + 0.001;
    bPlus.disabled = z >= ZMAX - 0.001;
  }

  function build() {
    box = document.createElement("div");
    box.className = "lb";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    big = document.createElement("img");
    big.className = "lb-img";
    big.alt = "";
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lb-close";
    btn.setAttribute("aria-label", "Close image");
    tools = document.createElement("div");
    tools.className = "lb-tools";
    tools.setAttribute("role", "group");
    tools.setAttribute("aria-label", "Zoom");
    bMinus = tool("lb-minus", "Zoom out");
    bPct = tool("lb-pct", "Fit to screen");
    bPlus = tool("lb-plus", "Zoom in");
    tools.appendChild(bMinus); tools.appendChild(bPct); tools.appendChild(bPlus);
    scroller = document.createElement("div");   // the picture scrolls in here; the buttons stay outside it, so they never move
    scroller.className = "lb-scroll";
    scroller.appendChild(big);
    box.appendChild(scroller);
    box.appendChild(tools);
    box.appendChild(btn);
    document.body.appendChild(box);
    box.addEventListener("click", function (e) {
      if (e.target === big) { toggleReal(); return; }                   // the image itself: real size and back
      var t = e.target.closest && e.target.closest(".lb-tools button");
      if (t) {                                                          // the zoom buttons
        if (t === bMinus) zoomBy(1 / STEP); else if (t === bPlus) zoomBy(STEP); else setZoom(1);
        return;
      }
      if (e.target.closest && e.target.closest(".lb-tools")) return;
      close();                                                          // the blurred page around it, or the close button
    });
  }

  function show(img) {
    if (!box) build();
    clearTimeout(hideTimer);
    opener = img;
    big.src = img.currentSrc || img.src;
    big.alt = img.alt || "";
    box.setAttribute("aria-label", img.alt ? "Image preview: " + img.alt : "Image preview");
    box.classList.remove("zoom");
    z = 1; fitW = 0; big.style.width = ""; big.style.height = "";
    bPct.textContent = "";
    if (big.complete) label(); else big.addEventListener("load", label, { once: true });
    root.style.setProperty("--lb-sbw", Math.max(0, window.innerWidth - root.clientWidth) + "px");   // the page must not jump when its scrollbar goes
    root.classList.add("lb-open");
    box.hidden = false;
    void box.offsetWidth;
    box.classList.add("on");
    open = true;
    btn.focus({ preventScroll: true });
    try { history.pushState({ lb: 1, y: window.scrollY }, ""); pushed = true; } catch (err) { pushed = false; }   // so a phone's back button closes it
  }

  function hide(instant) {
    if (!open) return;
    open = false;
    box.classList.remove("on");
    root.classList.remove("lb-open");
    var done = function () { box.hidden = true; big.removeAttribute("src"); box.classList.remove("zoom"); big.style.width = ""; big.style.height = ""; z = 1; };
    clearTimeout(hideTimer);
    if (instant) done(); else hideTimer = setTimeout(done, 180);
    if (opener && document.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (err) {} }
    opener = null;
  }

  // Closing by hand also removes the history entry that was added when it opened.
  function close() {
    var wasPushed = pushed;
    pushed = false;
    hide(false);
    if (wasPushed) { try { history.back(); } catch (err) {} }
  }

  document.addEventListener("click", function (e) {
    if (open || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var img = e.target.closest && e.target.closest(SEL);
    if (!usable(img)) return;
    e.preventDefault();
    show(img);
  });

  document.addEventListener("keydown", function (e) {
    if (open) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(STEP); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / STEP); }
      else if (e.key === "0") { e.preventDefault(); setZoom(1); }
      else if (e.key === "Tab") {                                                     // focus stays on the buttons
        e.preventDefault();
        var stops = [btn, bMinus, bPct, bPlus].filter(function (b) { return !b.disabled; });
        var i = stops.indexOf(document.activeElement);
        stops[(i + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus({ preventScroll: true });
      }
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(SEL + "[data-lb]")) {
      e.preventDefault();
      show(e.target);
    }
  });

  // Ctrl and the mouse wheel (or a trackpad pinch) zoom the picture instead of the page.
  document.addEventListener("wheel", function (e) {
    if (!open) return;
    if (e.ctrlKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? STEP : 1 / STEP); }
  }, { passive: false });
  window.addEventListener("resize", function () { if (open && z === 1) label(); });

  // The browser's back button (or swipe) while it is open: close it, and stay on the page.
  window.addEventListener("popstate", function () { if (open) { pushed = false; hide(false); } });
  // Another page arrived while it was open: it goes without a trace.
  window.addEventListener("pagechange", function () { pushed = false; hide(true); prep(); });

  prep();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", prep);
  window.addEventListener("load", prep);   // images that were still loading when their size was checked
})();
