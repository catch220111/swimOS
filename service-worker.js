const CACHE_NAME = 'swimos-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png' 
];

// Install: Cache files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch: Serve from Cache if offline
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});