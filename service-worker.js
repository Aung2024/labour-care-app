
const CACHE_NAME = 'labour-care-v2';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/patient.html',
  '/record.html',
  '/summary.html',
  '/manifest.json',
  '/js/firebase.js',
  '/css/style.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
