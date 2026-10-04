/* QuantNexus demo — landing page + voice-guided tour.
 *
 * The landing is an overlay on the dashboard page, not a separate page, on purpose:
 *  1. the 420 KB dashboard compiles behind it while the visitor reads, and
 *  2. the "Start" click is a user gesture on THIS page, so every later clip may
 *     play — browsers block audio on a page the visitor has not interacted with.
 *
 * The visitor's name is only ever rendered with textContent and kept in
 * sessionStorage; it is never spoken, sent anywhere, or written into HTML.
 */
(function () {
  "use strict";

  var CREDIT = "Designed and built by Arpit Jain · © 2026 Arpit Jain. All rights reserved.";
  var TOUR = null, idx = -1, curCue = 0, audio = new Audio(), playing = false;
  var actx = null, analyser = null, levelBuf = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k]; else if (k === "cls") n.className = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  // ── landing ───────────────────────────────────────────────────────────
  function buildLanding(capturedOn) {
    var nameInput = el("input", { id: "nx-name", maxlength: "40", autocomplete: "given-name", placeholder: "e.g. Priya" });
    nameInput.value = store("nx-name") || "";
    var start = el("button", { cls: "nx-btn nx-primary", id: "nx-start", text: "▶  Start the guided tour  ·  with voice" });
    var explore = el("button", { cls: "nx-btn", id: "nx-explore", text: "Explore on my own" });
    var welcomeName = el("h2", { id: "nx-welcome-name" });
    var landing = el("div", { id: "nx-landing", role: "dialog", "aria-label": "Welcome" }, [
      el("div", { cls: "nx-card" }, [
        el("div", { cls: "nx-kicker", text: "QUANTNEXUS · INTERACTIVE DEMO" }),
        el("h1", { cls: "nx-title", text: "An AI-assisted trading research desk." }),
        el("p", { cls: "nx-sub", text: "Built end to end: a nine-stage agent pipeline where Python does every calculation and the AI only gives judgement. Paper trading only." }),
        el("ul", { cls: "nx-points" }, [
          el("li", { text: "Scan → research → AI investment committee → risk → execution → monitoring" }),
          el("li", { text: "Every trade stress-tested with Monte Carlo price paths before it is debated" }),
          el("li", { text: "Pre-registered research — failures published next to the result that passed" }),
        ]),
        el("label", { cls: "nx-name" }, [el("span", { text: "Your name (optional)" }), nameInput]),
        el("div", { cls: "nx-actions" }, [start, explore]),
        el("div", { cls: "nx-meta" }, [
          document.createTextNode("Real data snapshot from " + capturedOn + " · not live · best on a desktop screen · "),
          el("a", { href: "request.html", text: "request a live walkthrough" }),
        ]),
        el("div", { cls: "nx-credit", text: CREDIT }),
        el("div", { cls: "nx-welcome", "aria-live": "polite" }, [
          el("div", { cls: "nx-orb", id: "nx-orb-big" }), welcomeName,
          el("p", { text: "I'm Nexus. Let me show you around." }),
        ]),
      ]),
    ]);
    document.body.appendChild(landing);
    start.addEventListener("click", function () {
      var n = nameInput.value.trim().slice(0, 40);
      store("nx-name", n);
      welcomeName.textContent = n ? "Welcome, " + n + "." : "Welcome.";
      unlockAudio();
      landing.classList.add("nx-greeting");
      startTour(0);
    });
    explore.addEventListener("click", function () { closeLanding(); showReplay(); });
    nameInput.addEventListener("keydown", function (e) { if (e.key === "Enter") start.click(); });
    start.focus();
  }
  function closeLanding() {
    var l = $("#nx-landing");
    if (!l) return;
    l.classList.add("nx-out");
    setTimeout(function () { l.remove(); }, 650);
  }

  // ── audio + level meter (drives the orb) ──────────────────────────────
  function unlockAudio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (!analyser) {
        var src = actx.createMediaElementSource(audio);
        analyser = actx.createAnalyser();
        analyser.fftSize = 512;
        levelBuf = new Uint8Array(analyser.fftSize);
        src.connect(analyser); analyser.connect(actx.destination);
        meter();
      }
      if (actx.state === "suspended") actx.resume();
    } catch (e) { /* no WebAudio: the orb just stays still, audio still plays */ }
  }
  function meter() {
    var lvl = 0;
    if (analyser && playing) {
      analyser.getByteTimeDomainData(levelBuf);
      var sum = 0;
      for (var i = 0; i < levelBuf.length; i++) { var v = (levelBuf[i] - 128) / 128; sum += v * v; }
      lvl = Math.min(1, Math.sqrt(sum / levelBuf.length) * 4);
    }
    document.documentElement.style.setProperty("--nx-level", lvl.toFixed(3));
    requestAnimationFrame(meter);
  }

  // ── dashboard driving ─────────────────────────────────────────────────
  function clickTab(label) {
    var b = Array.prototype.find.call(document.querySelectorAll("nav button, header button, button"), function (x) {
      return x.offsetParent && x.innerText.trim().toUpperCase().endsWith(label);
    });
    if (b) b.click();
  }
  function loadTicker(t) {
    var input = document.querySelector('input[aria-label="ticker"]');
    if (!input || !input.offsetParent) return;
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (input.form) input.form.requestSubmit ? input.form.requestSubmit() : input.form.submit();
  }
  // A focus is a LIST of targets: {sel}, {sel, rows:[...]} or {stream:true}.
  // Actions are timed to the NARRATION (cue start/end measured from the audio), and
  // cancelled when the visitor skips ahead, so nothing fires on the wrong stop.
  var timers = [];
  function at(sec, fn) { timers.push(setTimeout(fn, sec * 1000)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function clickRail(label) {
    var b = Array.prototype.find.call(document.querySelectorAll("[data-testid=workspace-rail] button"),
      function (x) { return x.innerText.trim() === label; });
    if (b) { b.click(); setTimeout(drawSpot, 700); }
  }

  // Types the stop's criteria into Sentinel's real form, then presses Run. The demo
  // replays a scan the build ran with EXACTLY these values (build_demo.py), so the
  // results on screen belong to the settings on screen.
  function setInput(el, v) {
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // Sentinel's criteria groups are an accordion (one open at a time), so each edit
  // first opens its own group. The group comes from the real criteria schema.
  var critGroups = null;
  function openGroup(name) {
    var head = Array.prototype.find.call(document.querySelectorAll("[data-testid=sentinel-criteria] button"),
      function (x) { var g = x.querySelector(".group-head"); return g && g.textContent.trim().indexOf(name) === 0; });
    if (head) head.click();
  }
  function sentinelDemo(stop) {
    if (!critGroups) {
      fetch("https://demo.invalid/api/v1/sentinel/criteria").then(function (r) { return r.json(); })
        .then(function (j) {
          critGroups = {};
          (j.criteria || []).forEach(function (c) { critGroups[c.key] = c.group; });
        }).catch(function () { critGroups = {}; });
    }
    var keys = Object.keys(stop.sentinel_edits);
    var c = stop.cues[1] || stop.cues[0];
    var step = Math.max(0.9, (c.end - c.start - 1.2) / keys.length);
    keys.forEach(function (k, i) {
      at(c.start + 0.2 + i * step, function () {
        if (!document.querySelector("[data-crit='" + k + "'] input") && critGroups && critGroups[k]) openGroup(critGroups[k]);
      });
      at(c.start + 0.55 + i * step, function () {
        var ins = document.querySelectorAll("[data-crit='" + k + "'] input");
        var v = stop.sentinel_edits[k];
        if (Array.isArray(v)) {
          if (ins[0]) setInput(ins[0], v[0]);
          if (ins[1]) setTimeout(function () { setInput(ins[1], v[1]); }, 120);
        } else if (ins[0]) setInput(ins[0], v);
        if (ins[0]) ins[0].scrollIntoView({ block: "nearest" });
      });
    });
    at(c.end - 0.2, function () {
      var run = Array.prototype.find.call(document.querySelectorAll("button"),
        function (b) { return b.offsetParent && /^Run scan/.test(b.innerText.trim()); });
      if (run) run.click();
      setTimeout(drawSpot, 900);
    });
  }

  // The Nexus stop opens the real assistant and asks its first suggested question,
  // so the narration plays over a real (captured) answer. Every other stop closes it.
  function chatDemo(on) {
    var panel = function () { return document.querySelector("[data-testid=nexus-chat]"); };
    var fab = document.querySelector("[data-testid=nexus-fab]");
    $("#nx-bar").classList.toggle("nx-left", on);   // keep the caption bar clear of the panel
    if (!on) { if (panel() && fab) fab.click(); return; }
    setTimeout(function () {
      if (!panel() && fab) fab.click();
      setTimeout(function () {
        var clear = document.querySelector("[aria-label='Clear conversation']");
        if (clear) clear.click();
        setTimeout(function () {
          var chip = document.querySelector(".nxc-chip:not([disabled])");
          if (chip) chip.click();
          setTimeout(drawSpot, 400);
        }, 250);
      }, 450);
    }, 1400);   // after the ticker has loaded, so the chip asks about TCS
  }

  function rectsFor(targets) {
    var out = [];
    (targets || []).forEach(function (h) {
      if (h.stream) {
        var head = Array.prototype.find.call(document.querySelectorAll(".panel-name"), function (n) {
          return n.textContent.trim().indexOf("Decision stream") === 0;
        });
        var box = head && head.closest(".flex.flex-col.h-full");
        if (box) out.push(box.getBoundingClientRect());
        return;
      }
      var root = document.querySelector(h.sel);
      if (!root || !root.getBoundingClientRect().width) return;
      if (!h.rows) { out.push(root.getBoundingClientRect()); return; }
      var rows = [];
      h.rows.forEach(function (name) {
        var hit = Array.prototype.find.call(root.querySelectorAll("*"), function (n) {
          return n.children.length === 0 && n.textContent.trim() === name;
        });
        var row = hit && (hit.closest("button, li, [role=button]") || hit.parentElement);
        if (row) rows.push(row.getBoundingClientRect());
      });
      // touching rows become one ring; separated rows keep their own
      rows.sort(function (a, b) { return a.top - b.top; }).forEach(function (r) {
        var last = out.length && out[out.length - 1];
        if (last && last.__rows && r.top - (last.top + last.height) < 6) {
          out[out.length - 1] = Object.assign(union([last, r]), { __rows: true });
        } else {
          out.push(Object.assign(union([r]), { __rows: true }));
        }
      });
    });
    return out.filter(function (r) { return r.width > 0 && r.height > 0; });
  }
  function currentFocus(stop) {
    var c = stop.cues[curCue] || stop.cues[0];
    return (c && c.focus) || (stop.highlight ? [stop.highlight] : [{ sel: "main" }]);
  }
  function union(rs) {
    var l = Math.min.apply(null, rs.map(function (r) { return r.left; })), t = Math.min.apply(null, rs.map(function (r) { return r.top; }));
    var r = Math.max.apply(null, rs.map(function (x) { return x.right; })), b = Math.max.apply(null, rs.map(function (x) { return x.bottom; }));
    return { left: l, top: t, width: r - l, height: b - t };
  }

  // ── spotlight (SVG, so it can cut more than one hole) ─────────────────
  function drawSpot() {
    var stop = TOUR && TOUR.stops[idx];
    var svg = $("#nx-scrim");
    if (!stop || stop.page === "landing") { svg.classList.remove("nx-on"); return; }
    var W = innerWidth, H = innerHeight, pad = 6;
    var rs = rectsFor(currentFocus(stop));
    if (!rs.length) rs = rectsFor([{ sel: "main" }]);   // a panel absent from the snapshot: frame the tab
    var d = "M0 0H" + W + "V" + H + "H0Z";
    var rings = "";
    rs.forEach(function (r) {
      var x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
      var w = Math.min(W - x, r.width + pad * 2), h = Math.min(H - y, r.height + pad * 2);
      d += "M" + x + " " + y + "h" + w + "v" + h + "h" + (-w) + "Z";
      rings += '<rect class="nx-ring" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
    });
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = '<path d="' + d + '"/>' + rings;
    svg.classList.add("nx-on");
  }

  // ── tour flow ─────────────────────────────────────────────────────────
  function buildChrome() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "nx-scrim"; svg.setAttribute("aria-hidden", "true");
    document.body.appendChild(svg);
    var bar = el("div", { id: "nx-bar", role: "region", "aria-label": "Guided tour" }, [
      el("div", { cls: "nx-row" }, [
        el("div", { cls: "nx-orb nx-small" }),
        el("div", { cls: "nx-caption", id: "nx-caption", "aria-live": "polite" }),
      ]),
      el("div", { cls: "nx-ctrls" }, [
        el("button", { id: "nx-prev", text: "◀ Back", "aria-label": "Previous stop" }),
        el("button", { id: "nx-play", text: "❚❚ Pause", "aria-label": "Pause or resume" }),
        el("button", { id: "nx-next", text: "Next ▶", "aria-label": "Next stop" }),
        el("div", { cls: "nx-grow" }, [el("div", { cls: "nx-fill", id: "nx-fill" })]),
        el("span", { cls: "nx-count", id: "nx-count" }),
        el("button", { id: "nx-exit", text: "✕ End tour", "aria-label": "End tour" }),
      ]),
    ]);
    document.body.appendChild(bar);
    document.body.appendChild(el("button", { id: "nx-replay", cls: "nx-btn nx-primary", text: "▶ Guided tour" }));
    $("#nx-prev").onclick = function () { go(idx - 1); };
    $("#nx-next").onclick = function () { go(idx + 1); };
    $("#nx-play").onclick = togglePlay;
    $("#nx-exit").onclick = endTour;
    $("#nx-replay").onclick = function () { unlockAudio(); hideReplay(); startTour(1); };
    addEventListener("resize", drawSpot);
    addEventListener("keydown", function (e) {
      if (idx < 0 || e.target.tagName === "INPUT") return;   // active from the welcome on
      if (e.key === "ArrowRight") go(idx + 1);
      else if (e.key === "ArrowLeft") go(idx - 1);
      else if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "Escape") endTour();
    });
    audio.addEventListener("timeupdate", caption);
    audio.addEventListener("ended", function () { playing = false; setTimeout(function () { if (!audio.paused || audio.ended) go(idx + 1); }, 450); });
  }
  function showReplay() { $("#nx-replay").classList.add("nx-on"); }
  function hideReplay() { $("#nx-replay").classList.remove("nx-on"); }

  function startTour(from) { go(from); }
  function go(i) {
    if (!TOUR) return;
    if (i >= TOUR.stops.length) return endTour();
    idx = Math.max(0, i);
    curCue = 0;
    var stop = TOUR.stops[idx];
    if (stop.page !== "landing") {
      closeLanding();
      $("#nx-bar").classList.add("nx-on");
      clickTab(stop.tab);
      if (stop.ticker) setTimeout(function () { loadTicker(stop.ticker); }, 400);
      chatDemo(!!stop.chat_demo);
      clearTimers();
      if (stop.rail) at(1.6, function () { clickRail(stop.rail); });
      if (stop.sentinel_edits) sentinelDemo(stop);
    }
    $("#nx-count").textContent = idx + " / " + (TOUR.stops.length - 1);
    $("#nx-caption").textContent = "";
    setTimeout(drawSpot, 350);
    setTimeout(drawSpot, 1500);         // a tab may lay out late
    audio.src = stop.audio;
    audio.currentTime = 0;
    var p = audio.play();
    playing = true;
    $("#nx-play").textContent = "❚❚ Pause";
    if (p && p.catch) p.catch(function () { playing = false; $("#nx-play").textContent = "▶ Play"; caption(true); });
  }
  function caption(force) {
    var stop = TOUR && TOUR.stops[idx];
    if (!stop) return;
    var t = audio.currentTime, ci = 0;
    stop.cues.forEach(function (c, i) { if (t >= c.start - 0.05) ci = i; });
    var cue = stop.cues[ci];
    if (ci !== curCue) { curCue = ci; drawSpot(); }   // the highlight moves with the sentence
    var cap = $("#nx-caption");
    if (force === true || cap.dataset.cue !== cue.text) {
      cap.dataset.cue = cue.text;
      cap.textContent = "";
      cap.appendChild(el("small", { text: label(stop) }));
      cap.appendChild(document.createTextNode(cue.text));
    }
    $("#nx-fill").style.width = Math.min(100, (t / stop.duration) * 100) + "%";
  }
  function label(stop) {
    if (stop.page === "landing") return "WELCOME";
    return stop.tab + (stop.label ? " · " + stop.label : "");
  }
  function togglePlay() {
    if (audio.paused) { unlockAudio(); audio.play(); playing = true; $("#nx-play").textContent = "❚❚ Pause"; }
    else { audio.pause(); playing = false; $("#nx-play").textContent = "▶ Play"; }
  }
  function endTour() {
    audio.pause(); playing = false; idx = -1; clearTimers();
    $("#nx-bar").classList.remove("nx-on");
    $("#nx-scrim").classList.remove("nx-on");
    closeLanding();
    chatDemo(false);
    showEnd();
  }
  // The exit card: what the product is, how to start, and whose work it is.
  function showEnd() {
    if ($("#nx-end")) return;
    var explore = el("button", { cls: "nx-btn nx-primary", text: "Explore the dashboard" });
    var replay = el("button", { cls: "nx-btn", text: "↻ Replay the tour" });
    var card = el("div", { id: "nx-end", role: "dialog", "aria-label": "End of tour" }, [
      el("div", { cls: "nx-end-card" }, [
        el("div", { cls: "nx-kicker", text: "QUANTNEXUS" }),
        el("h2", { text: "Thanks for taking the tour." }),
        el("p", { text: "Getting started is simple: bring your own AI API key and your broker's API keys, then build, research and paper trade." }),
        el("div", { cls: "nx-actions" }, [explore, replay, el("a", { cls: "nx-btn", href: "request.html", text: "Request a live walkthrough" })]),
        el("div", { cls: "nx-credit", text: CREDIT }),
      ]),
    ]);
    document.body.appendChild(card);
    var close = function () { card.remove(); showReplay(); };
    explore.onclick = close;
    replay.onclick = function () { card.remove(); unlockAudio(); startTour(1); };
    card.addEventListener("click", function (e) { if (e.target === card) close(); });
  }

  // ── boot ──────────────────────────────────────────────────────────────
  function boot() {
    buildChrome();
    Promise.all([
      fetch("tour/tour.json", { cache: "no-store" }).then(function (r) { return r.json(); }),
      fetch("data/index.json", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; }),
    ]).then(function (res) {
      TOUR = res[0];
      if (/[?&]notour\b/.test(location.search)) { showReplay(); return; }
      buildLanding(res[1].captured_on || "the capture date");
    }).catch(function () { /* no tour assets: the dashboard still works on its own */ });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
