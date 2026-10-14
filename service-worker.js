
const CACHE_NAME = 'mch-care-v324-labourcare-2481a-vouchers';

// Installed in background after first session (not in install.waitUntil).
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
  './js/consent-manager.js',
  './js/audit-logger.js',
  './js/password-policy.js',
  './js/session-manager.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const BACKGROUND_PRECACHE = [
  './css/vouchers.css',
  './js/vendor/bootstrap.bundle.min.js',
  './js/page-performance.js',
  './js/offline-store.js',
  './js/offline-manager.js',
  './js/offline-sync.js',
  './js/offline-status-bar.js',
  './js/ui-dialogs.js',
  './js/role-display.js',
  './js/sync-manager.js',
  './js/status-manager.js',
  './js/anc-tracking-status.js',
  './js/baby-patient-utils.js',
  './js/home-followup-badges.js'
];

const ASSET_FETCH_TIMEOUT_MS = 8000;
const DOCUMENT_FETCH_TIMEOUT_MS = 10000;
const PRECACHE_BATCH_SIZE = 4;

var backgroundPrecacheCancelled = false;
var backgroundPrecachePromise = null;

function resolvedUrl(file) {
  try {
    return new URL(file, self.location.origin).href;
  } catch (e) {
    return file;
  }
}

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
    if (backgroundPrecacheCancelled || index >= list.length) return Promise.resolve();
    var batch = list.slice(index, index + batchSize);
    index += batchSize;
    return Promise.all(batch.map(function (file) {
      return cache.add(file).catch(function () {});
    })).then(nextBatch);
  }
  return nextBatch();
}

function shellHasRequiredPages(cache) {
  return cache.match(resolvedUrl('./login.html')).then(function (login) {
    if (!login) return false;
    return cache.match(resolvedUrl('./home.html')).then(function (home) {
      return !!home;
    });
  });
}

function deleteOldCaches() {
  return caches.keys().then(function (keyList) {
    return Promise.all(keyList.map(function (key) {
      if (key !== CACHE_NAME) {
        return caches.delete(key);
      }
    }));
  });
}

function runBackgroundPrecache() {
  if (backgroundPrecacheCancelled) return Promise.resolve();
  if (backgroundPrecachePromise) return backgroundPrecachePromise;
  backgroundPrecachePromise = caches.open(CACHE_NAME).then(function (cache) {
    return cacheFilesInBatches(cache, SHELL_PRECACHE, PRECACHE_BATCH_SIZE)
      .then(function () {
        if (backgroundPrecacheCancelled) return undefined;
        return cacheFilesInBatches(cache, BACKGROUND_PRECACHE, PRECACHE_BATCH_SIZE);
      })
      .then(function () {
        if (backgroundPrecacheCancelled) return undefined;
        return shellHasRequiredPages(cache).then(function (ready) {
          if (!ready) return undefined;
          return deleteOldCaches();
        });
      });
  }).catch(function () {
    backgroundPrecachePromise = null;
  }).then(function () {
    backgroundPrecachePromise = null;
  });
  return backgroundPrecachePromise;
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return shellHasRequiredPages(cache).then(function (ready) {
        if (!ready) return undefined;
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
    return caches.match(resolvedUrl(path)).then(function (byPath) {
      if (byPath) return byPath;
      return caches.match(resolvedUrl('.' + path));
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
    return cache.put(documentCacheKey(request, requestUrl), responseToCache);
  }).catch(function () {});
}

function networkFirstDocument(request) {
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

function networkFirstAsset(request, requestUrl) {
  return fetchWithTimeout(request, ASSET_FETCH_TIMEOUT_MS)
    .then(function (response) {
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response || fetch(request);
      }
      if (shouldCacheRequest(requestUrl)) {
        var responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          return cache.put(assetCacheKey(requestUrl), responseToCache);
        }).catch(function () {});
      }
      return response;
    })
    .catch(function () {
      return matchCachedAsset(request).then(function (fallbackResponse) {
        if (fallbackResponse) return fallbackResponse;
        return fetch(request);
      });
    });
}

self.addEventListener('message', function (event) {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CANCEL_PRECACHE') {
    backgroundPrecacheCancelled = true;
    backgroundPrecachePromise = null;
  }
  if (event.data.type === 'PRECACHE_BACKGROUND') {
    if (backgroundPrecacheCancelled) return;
    event.waitUntil(runBackgroundPrecache());
  }
});

self.addEventListener('fetch', function (event) {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  if (isHardReloadRequest(event.request)) {
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
