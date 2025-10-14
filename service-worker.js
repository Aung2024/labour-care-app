
const CACHE_NAME = 'mch-care-v3';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/list.html',
  '/patient-care-hub.html',
  '/patient-enhanced.html',
  '/antenatal-care.html',
  '/labour-care.html',
  '/postpartum-care.html',
  '/baby-care.html',
  '/summary.html',
  '/dashboard.html',
  '/manifest.json',
  '/js/firebase.js',
  '/js/patient-session.js',
  '/css/style.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
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
