/* QuantNexus demo shim — serves a fixed, scrubbed snapshot instead of the live API.
 *
 * Loaded BEFORE the app script, so window.fetch and window.WebSocket are replaced
 * before the first request. Nothing here can reach a real backend: API_BASE is
 * rewritten to DEMO_BASE at build time and the page's CSP limits connect-src to
 * 'self'. Every response comes from data/index.json + data/<file>.json.
 *
 * Absence is represented, never substituted: a request the snapshot does not hold
 * returns 404 with a reason, never an invented payload.
 */
(function () {
  "use strict";
  var DEMO_BASE = "https://demo.invalid";
  var realFetch = window.fetch.bind(window);
  var indexP = realFetch("data/index.json", { cache: "no-store" }).then(function (r) { return r.json(); });
  var fileCache = {};
  window.__demoMisses = [];

  function respond(status, body) {
    return new Response(JSON.stringify(body), {
      status: status, headers: { "Content-Type": "application/json" },
    });
  }
  function disabled(what) {
    return respond(403, { detail: "Disabled in the demo (" + what + "). Request a live walkthrough to see it run." });
  }
  function load(file) {
    if (!fileCache[file]) {
      fileCache[file] = realFetch("data/" + file, { cache: "no-store" }).then(function (r) { return r.json(); });
    }
    return fileCache[file];
  }

  function handle(key, method, idx) {
    var path = key.split("?")[0];
    var ticker = (path.match(/^\/api\/v1\/stock\/([^/]+)\//) || [])[1];

    if (path === "/api/v1/search/ticker") {
      var q = decodeURIComponent((key.match(/[?&]q=([^&]*)/) || [])[1] || "").toUpperCase();
      var matches = idx.tickers
        .filter(function (t) { return !q || t.toUpperCase().indexOf(q) !== -1; })
        .map(function (t) { return { symbol: t, name: t + " (in demo snapshot)", source: "demo" }; });
      return Promise.resolve(respond(200, { query: q, matches: matches, count: matches.length }));
    }
    if (method === "POST" && path === "/api/v1/sentinel/scan") {
      return Promise.resolve(idx.files["/api/v1/sentinel/status/demo"]
        ? respond(200, { scan_id: "demo", status: "QUEUED", criteria_rejected: [] })
        : disabled("Sentinel scan"));
    }
    if (method !== "GET") return Promise.resolve(disabled(method + " " + path));
    // Never captured by design: credentials, providers, broker and config surfaces.
    if ((path.indexOf("/api/v1/admin/") === 0 && path !== "/api/v1/admin/gate") ||
        path.indexOf("/api/v1/broker/") === 0 ||
        ["/api/v1/providers", "/api/v1/thresholds", "/health"].indexOf(path) !== -1) {
      return Promise.resolve(disabled("admin"));
    }

    var file = idx.files[key] || idx.files[path];
    if (file) return load(file).then(function (body) { return respond(200, body); });

    window.__demoMisses.push(key);
    if (ticker) {
      return Promise.resolve(respond(404, {
        detail: decodeURIComponent(ticker) + " is not in the demo snapshot. Try: " + idx.tickers.join(", "),
      }));
    }
    return Promise.resolve(respond(404, { detail: "Not captured in the demo snapshot." }));
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf(DEMO_BASE) !== 0) return realFetch(input, init);
    var method = ((init && init.method) || "GET").toUpperCase();
    var key = url.slice(DEMO_BASE.length);
    return indexP.then(function (idx) { return handle(key, method, idx); });
  };

  // The event feed: one HYDRATION frame from the snapshot, then silence.
  function DemoSocket() {
    var self = this;
    this.readyState = 0;
    setTimeout(function () {
      self.readyState = 1;
      if (self.onopen) self.onopen({});
      indexP.then(function (idx) {
        var f = idx.files["/ws/v1/events"];
        return f ? load(f) : { type: "HYDRATION", events: [] };
      }).then(function (frame) {
        if (self.onmessage) self.onmessage({ data: JSON.stringify(frame) });
      });
    }, 50);
  }
  DemoSocket.prototype.send = function () {};
  DemoSocket.prototype.close = function () { this.readyState = 3; };
  var RealWS = window.WebSocket;
  window.WebSocket = function (url, p) {
    return String(url).indexOf("wss://demo.invalid") === 0 ? new DemoSocket() : new RealWS(url, p);
  };

  // The persistent chip. The dashboard's brand is refusing to fabricate, so the
  // demo says what it is on every screen.
  function chip() {
    indexP.then(function (idx) {
      var el = document.createElement("div");
      el.id = "demo-chip";
      el.innerHTML = "DEMO &mdash; real data snapshot from " + idx.captured_on +
        " &middot; not live &middot; <a href=\"request.html\">Request a live walkthrough &rarr;</a>";
      el.setAttribute("style", "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);" +
        "z-index:99999;padding:6px 14px;border-radius:999px;font:600 12px/1.4 'JetBrains Mono',monospace;" +
        "background:#f5b301;color:#111;box-shadow:0 2px 10px rgba(0,0,0,.35);max-width:calc(100vw - 32px);" +
        "text-align:center");
      var a = el.querySelector("a"); a.setAttribute("style", "color:#111;text-decoration:underline");
      document.body.appendChild(el);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", chip);
  else chip();
})();
