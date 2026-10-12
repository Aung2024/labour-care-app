
const CACHE_NAME = 'mch-care-v314-labourcare-2481a-vouchers';
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
  './program-officer.html',
  './promo-voucher.html',
  './midwife-vouchers.html',
  './lab-vouchers.html',
  './admin.html',
  './patient-consent.html',
  './provider-consent.html',
  './patient-care-hub.html',
  './baby-patient-backfill.html',
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
  './vaccine-home.html',
  './vaccine-record.html',
  './vaccine-records.html',
  './vaccine-schedule.html',
  './transfer.html',
  './other-outcome.html',
  './dashboard.html',
  './midwife-report.html',
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
  './js/vendor/html2canvas.min.js',
  './js/vendor/qrcode.min.js',
  './js/vendor/jsqr.min.js',
  './js/firebase.js',
  './js/voucher-pricing.js',
  './js/voucher-invoice.js',
  './js/role-landing.js',
  './js/voucher-service.js',
  './js/program-officer.js',
  './js/promo-voucher.js',
  './js/midwife-vouchers.js',
  './js/lab-vouchers.js',
  './js/auth-guard.js',
  './js/nav-back.js',
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
  './js/joint-care-utils.js',
  './js/visit-edit-approval-badge.js',
  './js/other-facility-visits-ui.js',
  './js/lang-apply.js',
  './js/high-risk-utils.js',
  './js/anc-tracking-status.js',
  './js/kmc-utils.js',
  './js/baby-patient-utils.js',
  './js/submit-guard.js',
  './js/facility-config.js',
  './js/birth-delivery-anchor.js',
  './js/delivery-notes-utils.js',
  './js/offline-visit-number.js',
  './js/home-followup-badges.js',
  './js/choice-controls.js',
  './js/status-manager.js',
  './js/sent-transfer-hrt-view.js',
  './js/transfer-load-utils.js',
  './css/style.css',
  './css/program-officer.css',
  './css/vouchers.css',
  './css/voucher-invoice.css',
  './css/hrt-register.css',
  './css/choice-controls.css',
  './css/compact-app-bar.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/logos/momentum-global.png',
  './images/logos/jhpiego.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return Promise.all(FILES_TO_CACHE.map((url) => (
          cache.add(url).catch((error) => {
            console.warn('[Service Worker] Skip precache:', url, error);
          })
        )));
      })
      .then(() => {
        console.log('[Service Worker] Successfully cached app shell');
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

function isLoginRequest(requestUrl) {
  return /\/login\.html$/i.test(requestUrl.pathname);
}

function isAbortLike(error) {
  const message = String((error && error.message) || error || '');
  return (error && error.name === 'AbortError') || /abort|timeout|fail(ed)? to fetch/i.test(message);
}

function offlineFallbackResponse() {
  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

function fetchWithTimeout(request, timeoutMs) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  return Promise.race([fetch(request), timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function matchPage(page) {
  return caches.match(page, { ignoreSearch: true }).then((cached) => cached || null);
}

function documentCacheKey(requestUrl) {
  const parts = requestUrl.pathname.split('/');
  let name = parts[parts.length - 1] || 'index.html';
  if (!name || requestUrl.pathname.endsWith('/')) name = 'index.html';
  return './' + name;
}

function cachedDocumentFallback(request, requestUrl) {
  if (isLoginRequest(requestUrl)) {
    return matchPage('./login.html').then((cached) => cached || offlineFallbackResponse());
  }
  return caches.match(request, { ignoreSearch: true }).then((cached) => {
    if (cached) return cached;
    return matchPage(documentCacheKey(requestUrl)).then((page) => {
      if (page) return page;
      return matchPage('./login.html').then((login) => (
        login || matchPage('./index.html').then((index) => index || offlineFallbackResponse())
      ));
    });
  });
}

function rememberSuccessfulDocument(request, requestUrl, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return response;
  const cacheUrl = documentCacheKey(requestUrl);
  const responseToCache = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(cacheUrl, responseToCache));
  return response;
}

// Fetch event strategy:
// - HTML navigations (Back, Home, logout → login): cache first, refresh in the
//   background. Never wait on the network and never fall back to a role page.
// - Static assets: cache first, then network.
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.endsWith('/firebase.runtime-config.json')) {
    event.respondWith(fetch(event.request).catch(function () { return offlineFallbackResponse(); }));
    return;
  }

  const isDocumentRequest =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document';

  if (isDocumentRequest) {
    event.respondWith((async () => {
      const cached = isLoginRequest(requestUrl)
        ? await matchPage('./login.html')
        : (await caches.match(event.request, { ignoreSearch: true })) || await matchPage(documentCacheKey(requestUrl));
      fetchWithTimeout(event.request, 4000)
        .then((response) => rememberSuccessfulDocument(event.request, requestUrl, response))
        .catch(() => {});
      if (cached) return cached;
      try {
        const response = await fetchWithTimeout(event.request, 2500);
        return rememberSuccessfulDocument(event.request, requestUrl, response) || cachedDocumentFallback(event.request, requestUrl);
      } catch (error) {
        if (!isAbortLike(error)) {
          console.warn('[Service Worker] Document fetch failed:', error);
        }
        return cachedDocumentFallback(event.request, requestUrl);
      }
    })());
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
          if (!isAbortLike(error)) {
            console.warn('[Service Worker] Asset fetch failed:', error);
          }
          return caches.match(event.request).then((cached) => cached || offlineFallbackResponse());
        });
    })
  );
});
