
const CACHE_NAME = 'mch-care-v8';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './home.html',
  './list.html',
  './login.html',
  './registration.html',
  './patient-care-hub.html',
  './patient-care-hub-lcg.html',
  './patient-enhanced.html',
  './patient-consent.html',
  './edit-patient.html',
  './antenatal-care.html',
  './antenatal-form.html',
  './antenatal-report.html',
  './antenatal-tests.html',
  './antenatal-tests-form.html',
  './antenatal-tests-list.html',
  './antenatal-education.html',
  './labour-care.html',
  './labour-care-entry.html',
  './labour-care-setup.html',
  './labour-monitoring.html',
  './labour-emergencies.html',
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
  './baby-report.html',
  './transfer.html',
  './other-outcome.html',
  './dashboard.html',
  './settings.html',
  './manifest.json',
  './js/firebase.js',
  './js/patient-session.js',
  './js/status-manager.js',
  './js/auth-guard.js',
  './js/session-manager.js',
  './js/audit-logger.js',
  './js/offline-manager.js',
  './js/offline-status-bar.js',
  './js/sync-manager.js',
  './js/clinical-validator.js',
  './js/data-linkage.js',
  './js/duplicate-detector.js',
  './js/consent-manager.js',
  './js/rbac-manager.js',
  './js/user-cache.js',
  './js/township-region.js',
  './js/page-performance.js',
  './css/style.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './languages/en.json',
  './languages/my.json',
  './languages/language-manager.js'
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

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the new response
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        }).catch((error) => {
          console.error('[Service Worker] Fetch failed:', error);
          // Return a custom offline page if available
          return caches.match('./index.html');
        });
      })
  );
});
