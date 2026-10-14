
const CACHE_NAME = 'mch-care-v318-labourcare-2481a-vouchers';

const SHELL_PRECACHE = [
  './index.html',
  './login.html',
  './home.html',
  './list.html',
  './manifest.json',
  './css/vendor/bootstrap.min.css',
  './css/vendor/fontawesome-all.min.css',
  './css/style.css',
  './css/compact-app-bar.css',
  './css/webfonts/fa-solid-900.woff2',
  './js/vendor/firebase-app.js',
  './js/vendor/firebase-auth.js',
  './js/vendor/firebase-firestore.js',
  './js/firebase.js',
  './js/register-sw.js',
  './js/auth-guard.js',
  './js/role-landing.js',
  './js/user-cache.js',
  './js/nav-back.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const BACKGROUND_PRECACHE = [
  './registration.html',
  './patient-care-hub.html',
  './patient-care-hub-lcg.html',
  './patient-enhanced.html',
  './provider-consent.html',
  './dashboard.html',
  './midwife-vouchers.html',
  './lab-vouchers.html',
  './program-officer.html',
  './promo-voucher.html',
  './css/vouchers.css',
  './js/vendor/bootstrap.bundle.min.js',
  './js/page-performance.js',
  './js/consent-manager.js',
  './js/offline-store.js',
  './js/offline-sync.js',
  './js/offline-manager.js',
  './js/offline-status-bar.js',
  './js/ui-dialogs.js',
  './js/session-manager.js',
  './js/role-display.js',
  './js/sync-manager.js',
  './js/status-manager.js',
  './js/home-followup-badges.js',
  './js/anc-tracking-status.js',
  './js/baby-patient-utils.js',
  './js/audit-logger.js',
  './js/nav-back.js'
];

const ASSET_FETCH_TIMEOUT_MS = 8000;
const DOCUMENT_FETCH_TIMEOUT_MS = 10000;
const PRECACHE_BATCH_SIZE = 4;

function uniqueCacheFiles(files) {
  var seen = {};
  return files.filter(function (file) {
    if (seen[file]) return false;
    seen[file] = true;
    return true;
  });
}

function cacheFilesInBatches(cache, files, batchSize) {
  var list = uniqueCacheFiles(files);
  var index = 0;
  function nextBatch() {
    if (index >= list.length) return Promise.resolve();
    var batch = list.slice(index, index + batchSize);
    index += batchSize;
    return Promise.all(batch.map(function (file) {
      return fetch(file, { credentials: 'same-origin' }).then(function (response) {
        if (!response || !response.ok) return undefined;
        return cache.put(file, response);
      }).catch(function () {
        return undefined;
      });
    })).then(nextBatch);
  }
  return nextBatch();
}

function shellHasRequiredPages(cache) {
  return cache.match('./login.html').then(function (login) {
    if (!login) return false;
    return cache.match('./home.html').then(function (home) {
      return !!home;
    });
  });
}

function deleteOldCaches() {
  return caches.keys().then(function (keyList) {
    return Promise.all(keyList.map(function (key) {
      if (key !== CACHE_NAME) {
        console.log('[Service Worker] Removing old cache:', key);
        return caches.delete(key);
      }
    }));
  });
}

var backgroundPrecachePromise = null;

function runBackgroundPrecache() {
  if (backgroundPrecachePromise) return backgroundPrecachePromise;
  backgroundPrecachePromise = caches.open(CACHE_NAME).then(function (cache) {
    return cacheFilesInBatches(cache, BACKGROUND_PRECACHE, PRECACHE_BATCH_SIZE);
  }).catch(function (error) {
    backgroundPrecachePromise = null;
    console.warn('[Service Worker] Background precache failed:', error);
  });
  return backgroundPrecachePromise;
}

self.addEventListener('install', function (event) {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        console.log('[Service Worker] Caching app shell');
        return cacheFilesInBatches(cache, SHELL_PRECACHE, PRECACHE_BATCH_SIZE);
      })
      .then(function () {
        console.log('[Service Worker] App shell cache ready');
      })
      .catch(function (error) {
        console.error('[Service Worker] Shell cache failed:', error);
      })
  );
});

self.addEventListener('activate', function (event) {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return shellHasRequiredPages(cache).then(function (ready) {
        if (!ready) {
          console.warn('[Service Worker] Shell incomplete — keeping previous caches');
          return;
        }
        return deleteOldCaches();
      });
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

function fetchWithTimeout(request, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error('fetch-timeout'));
    }, timeoutMs);
    fetch(request).then(function (response) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    }).catch(function (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function isHardReloadRequest(request) {
  if (request.cache === 'reload') return true;
  var pragma = request.headers.get('pragma') || '';
  return pragma.indexOf('no-cache') !== -1;
}

function cacheDocumentResponse(request, response) {
  var requestUrl = new URL(request.url);
  if (!response || response.status !== 200 || response.type !== 'basic' || !shouldCacheRequest(requestUrl)) {
    return;
  }
  var responseToCache = response.clone();
  caches.open(CACHE_NAME).then(function (cache) {
    cache.put(documentCacheKey(request, requestUrl), responseToCache);
  });
}

function networkFirstDocument(request) {
  if (isHardReloadRequest(request)) {
    return fetchWithTimeout(request, DOCUMENT_FETCH_TIMEOUT_MS)
      .then(function (response) {
        cacheDocumentResponse(request, response);
        return response;
      })
      .catch(function () {
        return matchCachedDocument(request).then(function (cached) {
          return cached || offlineDocumentResponse();
        });
      });
  }

  // Normal navigation: cached HTML immediately, refresh in background (fast Back/Home).
  return matchCachedDocument(request).then(function (cached) {
    var networkUpdate = fetchWithTimeout(request, DOCUMENT_FETCH_TIMEOUT_MS)
      .then(function (response) {
        cacheDocumentResponse(request, response);
        return response;
      });
    if (cached) {
      networkUpdate.catch(function () {});
      return cached;
    }
    return networkUpdate.catch(function () {
      return offlineDocumentResponse();
    });
  });
}

function networkFirstAsset(request, requestUrl) {
  return fetchWithTimeout(request, ASSET_FETCH_TIMEOUT_MS)
    .then(function (response) {
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response || new Response('', { status: 502, statusText: 'Bad Gateway' });
      }
      if (shouldCacheRequest(requestUrl)) {
        var responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(assetCacheKey(requestUrl), responseToCache);
        });
      }
      return response;
    })
    .catch(function () {
      return matchCachedAsset(request).then(function (fallbackResponse) {
        return fallbackResponse || new Response('', { status: 504, statusText: 'Offline' });
      });
    });
}

self.addEventListener('message', function (event) {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'PRECACHE_BACKGROUND') {
    event.waitUntil(runBackgroundPrecache());
  }
});

self.addEventListener('fetch', function (event) {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  var requestUrl = new URL(event.request.url);
  if (isRuntimeConfigPath(requestUrl.pathname)) {
    return;
  }

  var isDocumentRequest =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isDocumentRequest) {
    event.respondWith(networkFirstDocument(event.request));
    return;
  }

  event.respondWith(
    matchCachedAsset(event.request).then(function (cachedResponse) {
      if (cachedResponse) return cachedResponse;
      return networkFirstAsset(event.request, requestUrl);
    })
  );
});
