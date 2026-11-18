/*
 * The "return" pill on a writeup: it floats at the bottom-left of the screen the whole time, so the reader can leave from
 * anywhere on the page. It sends them back to the page they came from on this site (the
 * Writeups list, a CTF page, another writeup, the home page), named in the link. If they landed on the writeup
 * directly, from outside or from a reload with nothing remembered, the link stays what the server wrote: the CTF page.
 *
 * The page a visitor was on is remembered in sessionStorage (this tab only) and updated on every arrival, including
 * the page changes nav.js makes without a reload. Nothing leaves the browser.
 */
(function returnBox() {
  "use strict";

  var KEY = "pageTrail";

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (err) { return {}; }
  }
  function write(v) {
    try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (err) {}
  }
  function norm(p) { return p.replace(/\/+$/, "") || "/"; }
  function nameOf(path, title) {
    if (norm(path) === "/") return "home";
    if (norm(path) === "/posts") return "writeups";
    return (title || "").trim() || "the previous page";
  }

  // Called on every arrival: the page we were on becomes "previous", unless this is the same page again (a reload).
  function arrive() {
    var st = read(), now = { path: location.pathname, href: location.pathname + location.search + location.hash, title: document.title };
    if (st.cur && norm(st.cur.path) !== norm(now.path)) st.prev = st.cur;
    st.cur = now;
    write(st);
    fill(st.prev);
  }

  // The pill lives on <body> (not inside the page content), so page transitions and effects on the content never move it.
  // It exists only while the current page is a writeup (the page leaves a #return-data marker with the fallback).
  function fill(prev) {
    var old = document.getElementById("return-link"), data = document.getElementById("return-data");
    if (old) old.remove();
    if (!data) return;
    var ok = prev && prev.href && norm(prev.path) !== norm(location.pathname);
    var href = ok ? prev.href : data.dataset.href;
    var name = ok ? nameOf(prev.path, prev.title) : data.dataset.text;
    var a = document.createElement("a");
    a.id = "return-link";
    a.className = "return-pill";
    a.setAttribute("href", href);
    a.setAttribute("aria-label", "Return to " + name);
    var lead = document.createElement("span");
    lead.textContent = "\u25C2 return";
    var tail = document.createElement("span");
    tail.className = "rp-to";
    tail.textContent = "\u00A0to " + name;
    a.appendChild(lead);
    a.appendChild(tail);
    document.body.appendChild(a);
  }

  window.addEventListener("hashchange", function () {   // scrolling to a section of the same page: remember where we were on it
    var st = read();
    if (st.cur && norm(st.cur.path) === norm(location.pathname)) { st.cur.href = location.pathname + location.search + location.hash; write(st); }
  });
  window.addEventListener("pagechange", arrive);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrive); else arrive();
})();
