/*! coi-serviceworker v0.1.7 - Guido Zuidhof, MIT License */
if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", (e) => {
    if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;
    e.respondWith(
      fetch(e.request).then((r) => {
        const h = new Headers(r.headers);
        h.set("Cross-Origin-Embedder-Policy", "require-corp");
        h.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
      }).catch((err) => console.error(err))
    );
  });
} else {
  (() => {
    if (window.crossOriginIsolated !== false) return;
    const s = document.createElement("script");
    s.src = "/coi-serviceworker.js";
    if (window.sessionStorage.getItem("coiReloadedBySelf") !== "1") {
      window.sessionStorage.setItem("coiReloadedBySelf", "1");
      s.onload = () => window.location.reload();
      document.head.appendChild(s);
    }
  })();
}
