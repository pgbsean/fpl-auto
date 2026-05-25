const CACHE_NAME = 'fpl-tracker-cache-v1';
const ASSETS = [
  './index.html',
  './manifest.json'
];

// Install Lifecycle Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch Lifecycle Event (Serves items from cache when offline)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
