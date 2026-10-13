
const CACHE_NAME = 'mch-care-v356-moh';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './home.html',
  './user-manual.html',
  './list.html',
  './joint-care.html',
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
  './patient-care-hub-lcg.html',
  './township-report.html',
  './baby-patient-backfill.html',
  './retroactive-data-entry.html',
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
  './visit-edit.html',
  './visit-edit-approvals.html',
  './immediate-newborn-care.html',
  './immediate-newborn-care-form.html',
  './newborn-care-page.html',
  './newborn-report.html',
  './baby-care.html',
  './baby.html',
  './quality-improvement.html',
  './quality-clinical-database.html',
  './quality-hardcopy-upload.html',
  './quality-periodic-readiness.html',
  './quality-readiness-checklist.html',
  './quality-facility-visit.html',
  './quality-virtual-visits.html',
  './quality-facility-reports.html',
  './quality-competency.html',
  './quality-newborn.html',
  './quality-antenatal.html',
  './quality-review-actions.html',
  './vaccine-home.html',
  './vaccine-record.html',
  './vaccine-records.html',
  './vaccine-schedule.html',
  './transfer.html',
  './other-outcome.html',
  './dashboard.html',
  './midwife-report.html',
  './monthly-report.html',
  './css/monthly-report.css',
  './js/monthly-report.js',
  './leaderboard.html',
  './high-risk-tracking.html',
  './kmc-tracking.html',
  './manifest.json',
  './css/vendor/bootstrap.min.css',
  './css/vendor/fontawesome-all.min.css',
  './css/dashboard-v3.css',
  './css/webfonts/fa-solid-900.woff2',
  './css/webfonts/fa-regular-400.woff2',
  './css/webfonts/fa-brands-400.woff2',
  './js/vendor/bootstrap.bundle.min.js',
  './js/vendor/firebase-app.js',
  './js/vendor/firebase-auth.js',
  './js/vendor/firebase-firestore.js',
  './js/firebase.js',
  './js/auth-guard.js',
  './js/register-sw.js',
  './js/nav-back.js',
  './js/page-performance.js',
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
  './js/account-names.js',
  './js/role-display.js',
  './js/joint-care-utils.js',
  './js/visit-edit-approval-badge.js',
  './js/other-facility-visits-ui.js',
  './js/lang-apply.js',
  './js/high-risk-utils.js',
  './js/anc-tracking-status.js',
  './js/kmc-utils.js',
  './js/tracking-reader.js',
  './js/township-region.js',
  './js/baby-patient-utils.js',
  './js/service-closure.js',
  './js/submit-guard.js',
  './js/facility-config.js',
  './js/report-facility.js',
  './js/birth-delivery-anchor.js',
  './js/delivery-notes-utils.js',
  './js/offline-visit-number.js',
  './js/anc-workflow-utils.js',
  './js/infection-alerts.js',
  './js/analytics-refresh-queue.js',
  './js/retroactive-data-rules.js',
  './js/retroactive-data-service.js',
  './js/retroactive-data-page.js',
  './js/dashboard-metrics-config.js',
  './js/dashboard-data.js',
  './js/dashboard-charts.js',
  './js/dashboard-v3.js',
  './js/home-followup-badges.js',
  './js/choice-controls.js',
  './js/status-manager.js',
  './js/sent-transfer-hrt-view.js',
  './js/transfer-load-utils.js',
  './js/quality-scoring.js',
  './js/quality-possible-causes.js',
  './js/quality-improvement.js',
  './js/quality-target-banner.js',
  './js/rbac-manager.js',
  './css/quality-improvement.css',
  './css/style.css',
  './css/hrt-register.css',
  './css/choice-controls.css',
  './css/compact-app-bar.css',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

function uniqueCacheFiles(files) {
  var seen = {};
  return files.filter(function (file) {
    if (seen[file]) return false;
    seen[file] = true;
    return true;
  });
}

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        console.log('[Service Worker] Caching app shell');
        return Promise.all(uniqueCacheFiles(FILES_TO_CACHE).map(function (file) {
          return cache.add(file).catch(function (error) {
            console.warn('[Service Worker] Skip cache', file, error);
          });
        }));
      })
      .then(function () {
        console.log('[Service Worker] App shell cache ready');
        return self.skipWaiting();
      })
      .catch(function (error) {
        console.error('[Service Worker] Cache failed:', error);
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

function isRuntimeConfigPath(pathname) {
  return pathname.endsWith('/firebase.runtime-config.json');
}

function isStaticAssetPath(pathname) {
  return /\.(js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|json)$/i.test(pathname);
}

function shouldCacheRequest(requestUrl) {
  if (isRuntimeConfigPath(requestUrl.pathname)) return false;
  if (isStaticAssetPath(requestUrl.pathname)) return true;
  // Keep HTML/document cache keys query-free so patient IDs are not stored.
  if (requestUrl.search) return false;
  return true;
}

function assetCacheKey(requestUrl) {
  return requestUrl.origin + requestUrl.pathname;
}

function documentCacheKey(request, requestUrl) {
  if (requestUrl.search) return requestUrl.origin + requestUrl.pathname;
  return request;
}

function matchCachedDocument(request) {
  var requestUrl = new URL(request.url);
  var path = requestUrl.pathname;
  if (path.endsWith('/')) path += 'index.html';
  return caches.match(request).then(function (exact) {
    if (exact) return exact;
    return caches.match(path).then(function (byPath) {
      if (byPath) return byPath;
      return caches.match('.' + path);
    });
  });
}

function matchCachedAsset(request) {
  return caches.match(request).then(function (exact) {
    if (exact) return exact;
    return caches.match(request, { ignoreSearch: true });
  });
}

function offlineDocumentResponse() {
  return new Response(
    '<!DOCTYPE html><html><body><p>Offline. Open the app once on a working network, then try again.</p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function networkFirstDocument(request) {
  var requestUrl = new URL(request.url);
  var networkPromise = fetch(request).then(function (response) {
    if (response && response.status === 200 && response.type === 'basic' && shouldCacheRequest(requestUrl)) {
      var responseToCache = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(documentCacheKey(request, requestUrl), responseToCache);
      });
    }
    return response;
  });

  var timeoutPromise = new Promise(function (resolve) {
    setTimeout(function () { resolve(null); }, 4000);
  });

  return Promise.race([
    networkPromise,
    timeoutPromise.then(function () {
      return matchCachedDocument(request).then(function (cachedResponse) {
        return cachedResponse || networkPromise;
      });
    })
  ]).catch(function () {
    return matchCachedDocument(request).then(function (cachedResponse) {
      if (cachedResponse) return cachedResponse;
      return caches.match('./home.html').then(function (homeFallback) {
        if (homeFallback) return homeFallback;
        return caches.match('./index.html').then(function (indexFallback) {
          return indexFallback || offlineDocumentResponse();
        });
      });
    });
  });
}

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event strategy:
// - HTML/document navigation: network first, cache after 4s on slow links.
// - Static assets: cache first, ignore ?v= so versioned script tags match precache.
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  // Do not intercept runtime config. A failed SW fetch previously forced
  // login onto the embedded pilot project and blocked hard refresh.
  if (isRuntimeConfigPath(requestUrl.pathname)) {
    return;
  }

  const isDocumentRequest =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (isDocumentRequest) {
    event.respondWith(networkFirstDocument(event.request));
    return;
  }

  event.respondWith(
    matchCachedAsset(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response || new Response('', { status: 502, statusText: 'Bad Gateway' });
          }
          if (shouldCacheRequest(requestUrl)) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(assetCacheKey(requestUrl), responseToCache));
          }
          return response;
        })
        .catch(function () {
          return matchCachedAsset(event.request).then(function (fallbackResponse) {
            return fallbackResponse || new Response('', { status: 504, statusText: 'Offline' });
          });
        });
    })
  );
});
