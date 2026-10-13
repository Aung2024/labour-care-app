
const CACHE_NAME = 'mch-care-v316-labourcare-2481a-vouchers';

// Keep this list small. Other pages and heavy libraries are cached on first visit.
const CORE_SHELL = [
  './login.html',
  './index.html',
  './home.html',
  './list.html',
  './patient-care-hub.html',
  './lab-vouchers.html',
  './program-officer.html',
  './promo-voucher.html',
  './midwife-vouchers.html',
  './manifest.json',
  './css/vendor/bootstrap.min.css',
  './css/vendor/fontawesome-all.min.css',
  './css/webfonts/fa-solid-900.woff2',
  './css/style.css',
  './css/compact-app-bar.css',
  './css/vouchers.css',
  './js/vendor/bootstrap.bundle.min.js',
  './js/vendor/firebase-app.js',
  './js/vendor/firebase-auth.js',
  './js/vendor/firebase-firestore.js',
  './js/firebase.js',
  './js/auth-guard.js',
  './js/role-landing.js',
  './js/register-sw.js',
  './icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(CORE_SHELL.map((url) => (
        cache.add(url).catch((error) => {
          console.warn('[Service Worker] Skip precache:', url, error);
        })
      ))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => {
      if (key.indexOf('mch-care-') === 0 && key !== CACHE_NAME) {
        return caches.delete(key);
      }
      return undefined;
    }))).then(() => self.clients.claim())
  );
});

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

function documentCacheKey(requestUrl) {
  const parts = requestUrl.pathname.split('/');
  let name = parts[parts.length - 1] || 'index.html';
  if (!name || requestUrl.pathname.endsWith('/')) name = 'index.html';
  return './' + name;
}

function matchPage(page) {
  return caches.match(page, { ignoreSearch: true }).then((cached) => cached || null);
}

function cachedDocumentFallback(request, requestUrl) {
  if (isLoginRequest(requestUrl)) {
    return matchPage('./login.html').then((cached) => cached || offlineFallbackResponse());
  }
  return caches.match(request, { ignoreSearch: true }).then((cached) => {
    if (cached) return cached;
    return matchPage(documentCacheKey(requestUrl)).then((page) => {
      if (page) return page;
      return matchPage('./login.html').then((login) => login || offlineFallbackResponse());
    });
  });
}

function putInCache(requestUrl, response, request) {
  if (!response || response.status !== 200 || response.type !== 'basic') return response;
  const cacheUrl = requestUrl.pathname.endsWith('.html') || requestUrl.pathname.endsWith('/')
    ? documentCacheKey(requestUrl)
    : request;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(cacheUrl, copy));
  return response;
}

function fetchFresh(request, timeoutMs) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  return Promise.race([fetch(request), timeout]).finally(() => clearTimeout(timer));
}

// Cache first for same-origin GET. Do not re-fetch HTML in the background on
// every Back tap — that queued network work is what made pages feel frozen.
// Never fall back to a role page.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.endsWith('/firebase.runtime-config.json')) {
    event.respondWith(fetch(event.request).catch(() => offlineFallbackResponse()));
    return;
  }

  const isDocument =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document';

  if (isDocument) {
    event.respondWith((async () => {
      const cached = isLoginRequest(requestUrl)
        ? await matchPage('./login.html')
        : (await caches.match(event.request, { ignoreSearch: true })) || await matchPage(documentCacheKey(requestUrl));
      if (cached) return cached;
      try {
        const response = await fetchFresh(event.request, 2500);
        return putInCache(requestUrl, response, event.request) || cachedDocumentFallback(event.request, requestUrl);
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
        .then((response) => putInCache(requestUrl, response, event.request))
        .catch((error) => {
          if (!isAbortLike(error)) {
            console.warn('[Service Worker] Asset fetch failed:', error);
          }
          return caches.match(event.request).then((cached) => cached || offlineFallbackResponse());
        });
    })
  );
});
