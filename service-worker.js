
const CACHE_NAME = 'mch-care-v118-moh';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './home.html',
  './user-manual.html',
  './list.html',
  './login.html',
  './registration.html',
  './patient-transfers.html',
  './transfer-patient.html',
  './transfer-requests.html',
  './manage-midwives.html',
  './admin.html',
  './patient-consent.html',
  './provider-consent.html',
  './patient-care-hub.html',
  './patient-enhanced.html',
  './edit-patient.html',
  './antenatal-care.html',
  './antenatal-education.html',
  './antenatal-form.html',
  './antenatal-report.html',
  './antenatal-tests.html',
  './antenatal-tests-form.html',
  './antenatal-tests-list.html',
  './labour-care.html',
  './summary.html',
  './postpartum-care.html',
  './postpartum-form.html',
  './postpartum-history.html',
  './postpartum-report.html',
  './immediate-newborn-care.html',
  './immediate-newborn-care-form.html',
  './newborn-care-page.html',
  './newborn-report.html',
  './baby-care.html',
  './baby.html',
  './transfer.html',
  './other-outcome.html',
  './dashboard.html',
  './leaderboard.html',
  './high-risk-tracking.html',
  './kmc-tracking.html',
  './manifest.json',
  './css/vendor/bootstrap.min.css',
  './css/vendor/fontawesome-all.min.css',
  './css/webfonts/fa-solid-900.woff2',
  './css/webfonts/fa-regular-400.woff2',
  './css/webfonts/fa-brands-400.woff2',
  './js/vendor/bootstrap.bundle.min.js',
  './js/vendor/firebase-app.js',
  './js/vendor/firebase-auth.js',
  './js/vendor/firebase-firestore.js',
  './js/firebase.js',
  './js/auth-guard.js',
  './js/user-cache.js',
  './js/consent-manager.js',
  './js/offline-store.js',
  './js/offline-sync.js',
  './js/offline-manager.js',
  './js/offline-status-bar.js',
  './js/sync-manager.js',
  './js/ui-dialogs.js',
  './js/clinical-validator.js',
  './js/duplicate-detector.js',
  './js/session-manager.js',
  './js/audit-logger.js',
  './js/patient-session.js',
  './js/lang-apply.js',
  './js/high-risk-utils.js',
  './js/anc-tracking-status.js',
  './js/kmc-utils.js',
  './js/birth-delivery-anchor.js',
  './js/choice-controls.js',
  './js/status-manager.js',
  './js/sent-transfer-hrt-view.js',
  './js/transfer-load-utils.js',
  './js/user-cache.js',
  './css/style.css',
  './css/hrt-register.css',
  './css/choice-controls.css',
  './css/compact-app-bar.css',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        console.log('[Service Worker] Successfully cached all resources');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Cache failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

function shouldCacheRequest(requestUrl) {
  // Avoid caching runtime env config, auth-like endpoints, and query-heavy URLs.
  if (requestUrl.pathname.endsWith('/firebase.runtime-config.json')) return false;
  if (requestUrl.search) return false;
  return true;
}

// Fetch event strategy:
// - HTML/document navigation: network first, fallback to cache.
// - Static assets: cache first, then network.
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.endsWith('/firebase.runtime-config.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isDocumentRequest =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (isDocumentRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic' && shouldCacheRequest(requestUrl)) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch(async (error) => {
          console.error('[Service Worker] Document fetch failed:', error);
          const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
          if (cachedResponse) return cachedResponse;
          return caches.match('./index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          if (shouldCacheRequest(requestUrl)) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch((error) => {
          console.error('[Service Worker] Asset fetch failed:', error);
          return caches.match(event.request);
        });
    })
  );
});
