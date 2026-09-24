const CACHE_NAME = "tdm-manufacturing-v3";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./product.html",
  "./mixer.html",
  "./oven.html",
  "./service.html",
  "./contact.html",
  "./account.html",
  "./manifest.json",
  "./logo.png",
  "./mixer.png",
  "./oven.png",
  "./icon-192x192.png",
  "./icon-512x512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) { const copy=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)); }
    return response;
  }).catch(() => caches.match("./index.html"))));
});
