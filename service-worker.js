/**
 * MNCH v2 stable PWA shell.
 *
 * Contract:
 * - HTML is network-first with browser navigation preload and a bounded timeout.
 * - Versioned application assets are cache-first to avoid mobile request fan-out.
 * - API and runtime Firebase configuration requests are never intercepted.
 * - Updates never force-reload an open page or claim an active client.
 */
// Bump this release identifier whenever application HTML or JavaScript changes.
// A new namespace lets the worker validate the new shell before removing legacy
// caches, while the active worker remains in control of open pages.
const RELEASE_ID = '20261018-navigation-stability';
const CACHE_NAME = `mnch-v2-shell-${RELEASE_ID}`;
const NETWORK_TIMEOUT_MS = 8000;
const CACHE_BATCH_SIZE = 6;
const OFFLINE_PAGE = '/offline.html';

const REQUIRED_SHELL = [
  '/index.html',
  '/login.html',
  '/home.html',
  '/list.html',
  '/patient-enhanced.html',
  '/patient-consent.html',
  '/antenatal-form.html',
  OFFLINE_PAGE,
  '/manifest.json',
  '/css/vendor/bootstrap.min.css',
  '/css/vendor/fontawesome-all.min.css',
  '/css/style.css',
  '/js/vendor/firebase-app.js',
  '/js/vendor/firebase-auth.js',
  '/js/vendor/firebase-firestore.js',
  '/js/firebase.js',
  '/js/register-sw.js',
  '/js/auth-guard.js',
  '/js/user-cache.js',
  '/js/consent-manager.js',
  '/js/audit-logger.js',
  '/js/password-policy.js',
  '/js/session-manager.js',
  '/js/offline-store.js',
  '/js/offline-sync.js',
  '/js/offline-manager.js',
  '/js/offline-status-bar.js',
  '/js/status-manager.js',
  '/js/high-risk-utils.js',
  '/js/anc-tracking-status.js',
  '/js/kmc-utils.js',
  '/js/birth-delivery-anchor.js',
  '/js/tracking-reader.js',
  '/js/home-followup-badges.js',
  '/js/analytics-refresh-queue.js',
  '/js/sync-manager.js',
  '/js/ui-dialogs.js',
  '/js/page-performance.js',
  '/js/rbac-manager.js',
  '/js/role-display.js',
  '/js/baby-patient-utils.js',
  '/js/service-closure.js',
  '/js/clinical-validator.js',
  '/js/duplicate-detector.js',
  '/js/submit-guard.js',
  '/js/data-linkage.js',
  '/js/joint-care-utils.js',
  '/js/offline-visit-number.js',
  '/js/anc-workflow-utils.js',
  '/js/clinical-refer-flow.js',
  '/js/choice-controls.js',
  '/js/delivery-notes-utils.js',
  '/js/lang-apply.js',
  '/js/quality-scoring.js',
  '/js/quality-improvement.js',
  '/js/quality-target-banner.js',
  '/js/other-facility-visits-ui.js',
  '/css/compact-app-bar.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const OPTIONAL_SHELL = [
  '/patient-care-hub.html',
  '/high-risk-tracking.html',
  '/kmc-tracking.html',
  '/vaccine-home.html',
  '/immediate-newborn-care.html',
  '/newborn-care-page.html',
  '/css/compact-app-bar.css',
  '/images/moh-logo.png'
];

const STATIC_ASSET_PATTERN = /\.(?:js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|json)$/i;
const LEGACY_CACHE_PATTERN = /^(?:labour-care-|mch-care-|mnch-v2-)/;

const normalizeDocumentPath = (pathname) => {
  if (!pathname || pathname === '/') return '/index.html';
  if (pathname.endsWith('/')) return pathname + 'index.html';
  return pathname;
};

const cacheKeyForRequest = (requestUrl, isDocument) => {
  const pathname = isDocument
    ? normalizeDocumentPath(requestUrl.pathname)
    : requestUrl.pathname;
  return new Request(requestUrl.origin + pathname, { method: 'GET' });
};

const isCacheableResponse = (response) => {
  return !!response &&
    response.status === 200 &&
    (response.type === 'basic' || response.type === 'default');
};

const fetchWithTimeout = (request, timeoutMs) => {
  if (typeof AbortController === 'undefined') {
    return Promise.race([
      fetch(request),
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('network-timeout')), timeoutMs);
      })
    ]);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(request, { signal: controller.signal }).then((response) => {
    clearTimeout(timeoutId);
    return response;
  }).catch((error) => {
    clearTimeout(timeoutId);
    throw error;
  });
};

const cacheInBatches = async (cache, urls) => {
  for (let index = 0; index < urls.length; index += CACHE_BATCH_SIZE) {
    const batch = urls.slice(index, index + CACHE_BATCH_SIZE);
    await Promise.all(batch.map((url) => cache.add(url)));
  }
};

const cacheOptionalInBatches = async (cache, urls) => {
  for (let index = 0; index < urls.length; index += CACHE_BATCH_SIZE) {
    const batch = urls.slice(index, index + CACHE_BATCH_SIZE);
    await Promise.all(batch.map((url) => {
      return cache.add(url).catch((error) => {
        console.warn('[SW] Optional shell item unavailable:', url, error);
      });
    }));
  }
};

const cacheRequiredShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  await cacheInBatches(cache, REQUIRED_SHELL);
  const requiredMatches = await Promise.all(
    REQUIRED_SHELL.map((url) => cache.match(url))
  );
  if (requiredMatches.some((response) => !response)) {
    throw new Error('required-shell-incomplete');
  }

  await cacheOptionalInBatches(cache, OPTIONAL_SHELL);
};

const hasCompleteRequiredShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  const requiredMatches = await Promise.all(
    REQUIRED_SHELL.map((url) => cache.match(url))
  );
  return requiredMatches.every(Boolean);
};

const deleteLegacyCaches = async () => {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map((cacheName) => {
      if (cacheName === CACHE_NAME || !LEGACY_CACHE_PATTERN.test(cacheName)) {
        return Promise.resolve(false);
      }
      return caches.delete(cacheName);
    })
  );
};

const cacheResponse = async (cacheKey, response) => {
  if (!isCacheableResponse(response)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey, response.clone());
  } catch (cacheError) {
    console.warn('[SW] Response was delivered but could not be cached', {
      pathname: new URL(cacheKey.url).pathname,
      cache: CACHE_NAME
    });
  }
};

const networkFirst = async (request, options) => {
  const requestUrl = new URL(request.url);
  const cacheKey = cacheKeyForRequest(requestUrl, options.isDocument);

  try {
    let networkResponse = null;
    if (options.preloadResponse) {
      try {
        networkResponse = await options.preloadResponse;
      } catch (preloadError) {
        console.warn('[SW] Navigation preload unavailable; using worker fetch', {
          pathname: requestUrl.pathname
        });
      }
    }
    if (!networkResponse) {
      networkResponse = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    }
    await cacheResponse(cacheKey, networkResponse);
    return networkResponse;
  } catch (networkError) {
    const cachedResponse = await caches.match(cacheKey);
    if (cachedResponse) {
      console.warn('[SW] Serving cached response after network failure', {
        pathname: requestUrl.pathname,
        reason: networkError && networkError.name === 'AbortError' ? 'timeout' : 'network-error',
        cache: CACHE_NAME
      });
      return cachedResponse;
    }

    if (options.isDocument) {
      const offlineResponse = await caches.match(OFFLINE_PAGE);
      if (offlineResponse) {
        console.warn('[SW] Serving offline fallback', {
          pathname: requestUrl.pathname,
          reason: networkError && networkError.name === 'AbortError' ? 'timeout' : 'network-error',
          cache: CACHE_NAME
        });
        const offlineHtml = await offlineResponse.text();
        const fallbackReason = networkError && networkError.name === 'AbortError'
          ? 'timeout'
          : 'network-error';
        return new Response(
          offlineHtml.replace('data-fallback-reason="unknown"', `data-fallback-reason="${fallbackReason}"`),
          {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          }
        );
      }
    }

    return Response.error();
  }
};

const cacheFirst = async (request) => {
  const requestUrl = new URL(request.url);
  const cacheKey = cacheKeyForRequest(requestUrl, false);
  const cachedResponse = await caches.match(cacheKey);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    await cacheResponse(cacheKey, networkResponse);
    return networkResponse;
  } catch (networkError) {
    console.warn('[SW] Static asset unavailable', {
      pathname: requestUrl.pathname,
      reason: networkError && networkError.name === 'AbortError' ? 'timeout' : 'network-error',
      cache: CACHE_NAME
    });
    return Response.error();
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(cacheRequiredShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    hasCompleteRequiredShell().then((isComplete) => {
      if (!isComplete) {
        throw new Error('required-shell-incomplete-on-activate');
      }
      return deleteLegacyCaches().then(() => {
        if (!self.registration.navigationPreload) return undefined;
        return self.registration.navigationPreload.enable();
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const pathname = requestUrl.pathname;
  if (
    pathname === '/service-worker.js' ||
    pathname.endsWith('/firebase.runtime-config.json') ||
    pathname === '/api' ||
    pathname.startsWith('/api/')
  ) {
    return;
  }

  const acceptHeader = request.headers.get('accept') || '';
  const isDocument =
    request.mode === 'navigate' ||
    acceptHeader.includes('text/html');
  const isStaticAsset = STATIC_ASSET_PATTERN.test(pathname);

  if (!isDocument && !isStaticAsset) return;

  if (isDocument) {
    event.respondWith(networkFirst(request, {
      isDocument: true,
      preloadResponse: event.preloadResponse
    }));
    return;
  }

  event.respondWith(cacheFirst(request));
});
