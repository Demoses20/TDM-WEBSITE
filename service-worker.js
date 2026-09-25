const CACHE_NAME = 'tdm-app-v12-2-account-fix';
const APP_SHELL = [
  "./",
  "./index.html",
  "./product.html",
  "./cart.html",
  "./checkout.html",
  "./service.html",
  "./account.html",
  "./auth.html",
  "./login.html",
  "./signup.html",
  "./auth-common.js",
  "./customer-common.js",
  "./contact.html",
  "./admin-orders.html",
  "./manifest.json",
  "./logo.png",
  "./mixer.png",
  "./oven.png",
  "./icon-192x192.png",
  "./icon-512x512.png",
  "./app.css",
  "./app-common.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Always try the network first for HTML so GitHub Pages updates appear immediately.
  if (event.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname === "/") {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});
