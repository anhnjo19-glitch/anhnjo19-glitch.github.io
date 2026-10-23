/*! coi-serviceworker v0.1.7 - Guido Zuidhof - MIT License */
/* Sửa: dùng đường dẫn tương đối + tự reload + debug log */
if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

  self.addEventListener("message", (ev) => {
    if (ev.data && ev.data.type === "deregister") {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => clients.forEach((c) => c.navigate(c.url)));
    }
  });

  self.addEventListener("fetch", function (e) {
    if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin")
      return;
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const h = new Headers(r.headers);
          h.set("Cross-Origin-Embedder-Policy", "credentialless");
          h.set("Cross-Origin-Opener-Policy", "same-origin");
          return new Response(r.body, {
            status: r.status,
            statusText: r.statusText,
            headers: h,
          });
        })
        .catch((err) => console.error(err))
    );
  });
} else {
  (() => {
    if (window.crossOriginIsolated !== false) return;

    // Đăng ký service worker bằng đường dẫn tương đối
    if (!window.isSecureContext) {
      console.error("[COI] Trang không ở secure context (HTTPS/localhost).");
      return;
    }

    const script = document.createElement("script");
    script.src = "coi-serviceworker.js";
    const reloaded = window.sessionStorage.getItem("coiReloadedBySelf");

    if (reloaded !== "1") {
      window.sessionStorage.setItem("coiReloadedBySelf", "1");
      script.onload = () => window.location.reload();
      document.head.appendChild(script);
    } else {
      // Đã reload 1 lần mà vẫn không isolated → log lỗi
      console.error(
        "[COI] Sau khi reload vẫn chưa crossOriginIsolated. Kiểm tra Network tab xem header COOP/COEP có được chèn chưa."
      );
    }
  })();
}
