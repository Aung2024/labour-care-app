
const CACHE_NAME = 'mch-care-v18';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './home.html',
  './high-risk-tracking.html',
  './overall-patient-report.html',
  './list.html',
  './login.html',
  './registration.html',
  './registration-success.html',
  './privacy-policy.html',
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
  './education-pregnancy-health.html',
  './education-breastfeeding.html',
  './education-nutrition.html',
  './education-self-care.html',
  './newsummary.html',
  './feedback-form.html',
  './vaccine-home.html',
  './vaccine-record.html',
  './vaccine-records.html',
  './labour-care.html',
  './labour-care-entry.html',
  './labour-care-setup.html',
  './labour-monitoring.html',
  './labour-emergencies.html',
  './labour-protocols.html',
  './summary.html',
  './summary-view.html',
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
  './transfer-patient.html',
  './transfer-requests.html',
  './other-outcome.html',
  './dashboard.html',
  './settings.html',
  './manifest.json',
  './js/firebase.js',
  './js/register-sw.js',
  './js/lang-apply.js',
  './js/high-risk-utils.js',
  './js/edd-display.js',
  './js/patient-session.js',
  './js/status-manager.js',
  './js/auth-guard.js',
  './js/session-manager.js',
  './js/audit-logger.js',
  './js/offline-manager.js',
  './js/offline-status-bar.js',
  './js/sync-manager.js',
  './js/offline-store.js',
  './js/offline-sync.js',
  './js/offline-report-helper.js',
  './js/ui-dialogs.js',
  './js/clinical-validator.js',
  './js/data-linkage.js',
  './js/duplicate-detector.js',
  './js/consent-manager.js',
  './js/rbac-manager.js',
  './js/user-cache.js',
  './js/data-masking.js',
  './js/township-region.js',
  './js/page-performance.js',
  './js/form-wizard.js',
  './js/network-diagnostics.js',
  './js/password-policy.js',
  './css/style.css',
  './css/form-wizard-dangers.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './languages/en.json',
  './languages/my.json',
  './languages/language-manager.js'
];

// Install event - cache resources (per-URL: one 404 must not abort the whole precache)
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return Promise.all(
        FILES_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[Service Worker] Skip precache (failed):', url, err && err.message);
          })
        )
      );
    })
      .then(() => {
        console.log('[Service Worker] Precache pass finished');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Install failed:', error);
        return self.skipWaiting();
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
// IMPORTANT: precache stores e.g. /antenatal-form.html but navigation is often
// /antenatal-form.html?patient=... — default Cache.match does NOT ignore query string,
// so offline navigations failed with ERR_FAILED until we use ignoreSearch: true.
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        console.error('[Service Worker] Fetch failed:', error);
        const docFallback =
          event.request.mode === 'navigate' || event.request.destination === 'document'
            ? await cache.match(event.request, { ignoreSearch: true })
            : null;
        if (docFallback) {
          return docFallback;
        }
        return (await cache.match('./index.html')) || Response.error();
      }
    })()
  );
});
