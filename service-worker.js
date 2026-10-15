/**
 * MNCH v2 stable PWA shell.
 *
 * Contract:
 * - HTML and application assets are network-first with a bounded timeout.
 * - Cached responses are used only when the network cannot answer.
 * - API and runtime Firebase configuration requests are never intercepted.
 * - Updates never force-reload an open page or claim an active client.
 */
const CACHE_NAME = 'mnch-v2-shell-v1-20261015';
const NETWORK_TIMEOUT_MS = 8000;
const OFFLINE_PAGE = '/offline.html';

const REQUIRED_SHELL = [
  '/index.html',
  '/login.html',
  '/home.html',
  '/list.html',
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
  '/js/offline-store.js',
  '/js/offline-sync.js',
  '/js/offline-manager.js',
  '/js/offline-status-bar.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const OPTIONAL_SHELL = [
  '/patient-care-hub.html',
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

const cacheRequiredShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(REQUIRED_SHELL);

  const requiredMatches = await Promise.all(
    REQUIRED_SHELL.map((url) => cache.match(url))
  );
  if (requiredMatches.some((response) => !response)) {
    throw new Error('required-shell-incomplete');
  }

  await Promise.all(
    OPTIONAL_SHELL.map((url) => {
      return cache.add(url).catch((error) => {
        console.warn('[SW] Optional shell item unavailable:', url, error);
      });
    })
  );
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

const networkFirst = async (request, options) => {
  const requestUrl = new URL(request.url);
  const cacheKey = cacheKeyForRequest(requestUrl, options.isDocument);

  try {
    const networkResponse = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (isCacheableResponse(networkResponse)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheKey, networkResponse.clone());
    }
    return networkResponse;
  } catch (networkError) {
    const cachedResponse = await caches.match(cacheKey);
    if (cachedResponse) return cachedResponse;

    if (options.isDocument) {
      const offlineResponse = await caches.match(OFFLINE_PAGE);
      if (offlineResponse) return offlineResponse;
    }

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
      return deleteLegacyCaches();
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

  event.respondWith(networkFirst(request, { isDocument }));
});
