/*
 * Page changes without reloading the page.
 *
 * A normal link click throws the whole page away, fetches the next one over the network and sets everything up
 * again (styles, scripts, canvases, cursor). That takes a noticeable moment, and on a real connection it is a dead
 * dark gap before any animation can start. Here the click is intercepted instead:
 *
 *   1. the screen fades to the transition's dark colour at once (about 100 ms);
 *   2. the next page's HTML is fetched in the background (usually already fetched when the pointer was over the link);
 *   3. only the <main> content, the title and the address are swapped, while the screen is covered;
 *   4. the theme's transition plays straight away on the same page, so the cursor, the backgrounds and the fonts
 *      never restart.
 *
 * Anything unusual (a failed fetch, a non-page link, an old browser) falls back to the browser's normal navigation,
 * so a link can never be dead. Back and forward work through the history API and restore the scroll position.
 */
(function navigation() {
  "use strict";

  var root = document.documentElement;
  if (!window.fetch || !window.DOMParser || !window.URL || !window.Promise || !history.pushState || !Element.prototype.replaceChildren) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var COVER_MS = 100;        // how long the cover takes to hide the old page before the content is swapped
  var TIMEOUT_MS = 8000;     // a page that has not arrived by then is opened the normal way
  var TTL_MS = 120000;       // fetched pages are kept this long
  var times = window.__navTimes = {};     // timestamps of the last page change, for measuring
  var cache = new Map();
  var token = 0;
  var quietUntil = 0;       // scroll events right after a swap are the browser adjusting to new content: not the visitor

  function key(u) { return u.pathname.replace(/\/+$/, "") + u.search; }
  var current = key(location);
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function decode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  /* ---- fetching and keeping pages ---- */
  function fetchPage(u) {
    var k = u.origin + u.pathname + u.search, hit = cache.get(k);
    if (hit && Date.now() - hit.t < TTL_MS) return hit.p;
    var p = fetch(u.pathname + u.search, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok || !/text\/html/i.test(res.headers.get("content-type") || "")) throw new Error("not a page");
      // parsed here, as soon as the text arrives, so the click itself has less to do
      return res.text().then(function (text) { return { doc: new DOMParser().parseFromString(text, "text/html"), url: new URL(res.url) }; });
    });
    p.catch(function () { cache.delete(k); });
    cache.set(k, { p: p, t: Date.now() });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return p;
  }
  function quiet(p) { p.catch(function () {}); }

  // The link as a URL if this script handles it (an internal page), otherwise null.
  function pageLink(a) {
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return null;
    if (/^\/static\//.test(u.pathname)) return null;     // files (the CV, images) are not pages
    return u;
  }

  /* ---- warm the next page up: when the pointer rests on a link, a finger touches it, or it gets keyboard focus ---- */
  var hoverTimer = 0;
  function warm(e) {
    var a = e.target.closest && e.target.closest("a[href]"), u = pageLink(a);
    if (!u || key(u) === current) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () { quiet(fetchPage(u)); }, e.type === "mouseover" ? 40 : 0);
  }
  document.addEventListener("mouseover", warm, { passive: true });
  document.addEventListener("touchstart", warm, { passive: true });
  document.addEventListener("focusin", warm);
  function warmTabs() {
    document.querySelectorAll(".tabbar a[href]").forEach(function (a) {
      var u = pageLink(a);
      if (u && key(u) !== current) quiet(fetchPage(u));
    });
  }
  // The links in the page's own content (the cards): a few, when the browser is idle, unless data is precious.
  function warmContent() {
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return;
    var seen = 0;
    document.querySelectorAll("main a[href]").forEach(function (a) {
      var u = pageLink(a);
      if (u && key(u) !== current && seen < 8) { seen++; quiet(fetchPage(u)); }
    });
  }
  var idle = window.requestIdleCallback || function (fn) { setTimeout(fn, 1200); };
  idle(function () { warmTabs(); warmContent(); });
  window.addEventListener("pagechange", function () { idle(warmContent); });

  /* ---- the cover that hides the old page ---- */
  function showCover() {
    var c = document.getElementById("tx-pre");
    if (!c) {
      c = document.createElement("div");
      c.id = "tx-pre";
      c.setAttribute("aria-hidden", "true");
      document.body.appendChild(c);
    }
    window.__txCover = true;                 // a page change is in progress (the scan wave waits for it to end)
    window.__txBlind = true;                 // the old page is hidden: the background animation has nothing to show until the swap
    void c.offsetWidth;                      // so the fade starts from the first frame
    c.classList.add("on");
    return c;
  }
  function finishCover(c, played) {
    if (!c) return;
    if (played) { c.remove(); return; }      // the transition's canvas now carries the cover: same colour, no flash
    c.classList.remove("on");                // no animation to hand over to: just fade the cover away
    setTimeout(function () { c.remove(); window.__txCover = false; window.__txBlind = false; }, 160);
  }

  /* ---- swapping the page ---- */
  function swap(data, u, push, restoreY) {
    var doc = data.doc;
    var next = doc.querySelector("main"), main = document.querySelector("main");
    if (!next || !main) throw new Error("no <main>");

    if (push) {
      history.replaceState({ y: window.scrollY }, "");                    // remember where we were on the page we leave
      history.pushState({ y: 0 }, "", data.url.pathname + data.url.search + u.hash);
    }
    document.title = doc.title || document.title;
    main.className = next.className;
    main.replaceChildren.apply(main, Array.prototype.map.call(next.childNodes, function (n) { return document.importNode(n, true); }));
    current = key(location);

    var target = u.hash.length > 1 ? document.getElementById(decode(u.hash.slice(1))) : null;
    root.style.scrollBehavior = "auto";      // jump, don't glide, to the new page's start
    if (typeof restoreY === "number" && restoreY > 0) window.scrollTo(0, restoreY);
    else if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    root.style.scrollBehavior = "";
    quietUntil = performance.now() + 400;
    try { history.replaceState({ y: window.scrollY }, ""); } catch (e) {}   // this history entry now knows where it is scrolled to

    main.setAttribute("tabindex", "-1");     // keyboard focus continues from the new content, not from a link that no longer exists
    main.focus({ preventScroll: true });
    if (window.__pageInit) window.__pageInit();   // copy buttons, reveal, status bar, tabs, card titles for the new content
    window.dispatchEvent(new Event("pagechange"));
  }

  function hard(u) { window.location.href = u.href; }

  function go(u, push, restoreY) {
    var my = ++token;
    var animate = push && !root.classList.contains("no-motion") && !reduce.matches;
    times = window.__navTimes = { click: performance.now() };
    var cover = animate ? showCover() : null;
    var timeout = new Promise(function (resolve, reject) { setTimeout(function () { reject(new Error("timeout")); }, TIMEOUT_MS); });
    Promise.race([Promise.all([fetchPage(u), animate ? delay(COVER_MS) : 0]), timeout]).then(function (r) {
      if (my !== token) return;              // a newer click took over
      times.ready = performance.now();
      swap(r[0], u, push, restoreY);
      times.swapped = performance.now();
      var played = animate ? (window.__txPlay ? window.__txPlay() : false) : false;
      window.__txBlind = false;              // the new page is under the transition: the background animation runs again
      times.played = performance.now();
      finishCover(cover, played);
    }).catch(function (err) {
      if (my === token) hard(u);
    });
  }

  // For other scripts (the command palette): go to an address of this site the same way a link click does.
  window.__navTo = function (href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) { location.href = u.href; return true; }
    if (key(u) === current) {                           // the page we are on: just scroll to the #part
      var target = u.hash.length > 1 ? document.getElementById(decode(u.hash.slice(1))) : null;
      if (target) target.scrollIntoView({ behavior: "smooth" }); else window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }
    go(u, true);
    return true;
  };

  /* ---- clicks ---- */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var u = pageLink(e.target.closest && e.target.closest("a[href]"));
    if (!u || key(u) === current) return;    // not a page of ours, or the page we are on (a #link just scrolls)
    e.preventDefault();
    go(u, true);
  }, true);

  /* ---- back and forward, and the scroll position ---- */
  try { history.scrollRestoration = "manual"; } catch (e) {}
  window.addEventListener("popstate", function (e) {
    var u = new URL(location.href);
    if (key(u) === current) return;          // only the #hash changed: the browser already scrolled
    go(u, false, e.state && typeof e.state.y === "number" ? e.state.y : 0);
  });
  var saveTimer = 0;
  window.addEventListener("scroll", function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (performance.now() < quietUntil) return;
      try { history.replaceState({ y: window.scrollY }, ""); } catch (e) {}
    }, 200);
  }, { passive: true });
  var entry = performance.getEntriesByType("navigation")[0];
  if (history.state && typeof history.state.y === "number" && entry && (entry.type === "reload" || entry.type === "back_forward")) {
    requestAnimationFrame(function () { root.style.scrollBehavior = "auto"; window.scrollTo(0, history.state.y); root.style.scrollBehavior = ""; });
  }
})();
