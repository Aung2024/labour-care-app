
const CACHE_NAME = 'mch-care-v357-moh';
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
  './retroactive-data-entry.html',
  './provider-consent.html',
  './dashboard.html',
  './manifest.json',
  './css/vendor/bootstrap.min.css',
  './css/vendor/fontawesome-all.min.css',
  './css/style.css',
  './css/compact-app-bar.css',
  './css/dashboard-v3.css',
  './css/webfonts/fa-solid-900.woff2',
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
  './js/ui-dialogs.js',
  './js/session-manager.js',
  './js/role-display.js',
  './js/tracking-reader.js',
  './js/home-followup-badges.js',
  './js/report-facility.js',
  './js/dashboard-data.js',
  './js/dashboard-v3.js',
  './js/dashboard-metrics-config.js',
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
