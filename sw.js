const CACHE_NAME = 'ddt-cache-v4';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './styles.css',
  './print.html',
  './print.css',
  './manifest.json'
];

const NETWORK_FIRST_PATHS = new Set([
  '/',
  './',
  '/index.html',
  './index.html',
  '/app.js',
  './app.js',
  '/db.js',
  './db.js'
]);

const CACHE_FIRST_PATHS = new Set([
  '/styles.css',
  './styles.css',
  '/print.css',
  './print.css',
  '/manifest.json',
  './manifest.json'
]);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const path = url.pathname;

  if (NETWORK_FIRST_PATHS.has(path)) {
    console.log('[SW] network-first:', path);
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          console.log('[SW] cache fallback:', path);
          return caches.match(event.request);
        })
    );
    return;
  }

  if (CACHE_FIRST_PATHS.has(path)) {
    console.log('[SW] cache-first:', path);
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
