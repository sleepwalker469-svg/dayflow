/* DAYFLOW service worker — offline caching for quick startup */
const CACHE = "dayflow-cache-v1";

const scopeUrl = self.registration && self.registration.scope ? self.registration.scope : self.location.origin + "/";
const base = new URL(scopeUrl); // используем scope как базу

const CORE = [
  new URL("./", base).toString(),
  new URL("./index.html", base).toString(),
  new URL("./styles.css", base).toString(),
  new URL("./app.js", base).toString(),
  new URL("./manifest.webmanifest", base).toString(),
  new URL("./icon.svg", base).toString(),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (req.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        if (req.mode === "navigate") {
          const idx = await caches.match(new URL("./index.html", base).toString());
          return idx || new Response("Offline", { status: 200 });
        }
        return new Response("Offline", { status: 200 });
      }
    })()
  );
});
