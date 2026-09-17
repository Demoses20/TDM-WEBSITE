const CACHE_NAME = "tdm-manufacturing-v1";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./products.html",
    "./mixer.html",
    "./oven.html",
    "./logo.png",
    "./mixer.png",
    "./oven.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(FILES_TO_CACHE);
        })
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});