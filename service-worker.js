
const CACHE_NAME = 'mch-care-v364-moh';

const SHELL_PRECACHE = [
  './index.html',
  './login.html',
  './home.html',
  './list.html',
  './registration.html',
  './provider-consent.html',
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
  './js/user-cache.js',
  './js/nav-back.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Filled at runtime when pages are visited; avoid bulk precache competing with tracking APIs.
const BACKGROUND_PRECACHE = [];

const ASSET_FETCH_TIMEOUT_MS = 12000;
const PRECACHE_BATCH_SIZE = 2;
const PRECACHE_BATCH_DELAY_MS = 800;

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
      return cache.add(file).catch(function (error) {
        console.warn('[Service Worker] Skip cache', file, error);
      });
    })).then(function () {
      if (index >= list.length) return;
      return new Promise(function (resolve) {
        setTimeout(resolve, PRECACHE_BATCH_DELAY_MS);
      });
    }).then(nextBatch);
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

function runBackgroundPrecache() {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cacheFilesInBatches(cache, BACKGROUND_PRECACHE, PRECACHE_BATCH_SIZE);
  }).catch(function (error) {
    console.warn('[Service Worker] Background precache failed:', error);
  });
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

function isApiPath(pathname) {
  return pathname === '/api' || pathname.indexOf('/api/') === 0;
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
  var pathnameKey = requestUrl.origin + requestUrl.pathname;
  var fileName = path.split('/').pop();
  var dotPath = fileName ? './' + fileName : null;
  return caches.match(request).then(function (exact) {
    if (exact) return exact;
    return caches.match(pathnameKey).then(function (byOriginPath) {
      if (byOriginPath) return byOriginPath;
      return caches.match(path).then(function (byPath) {
        if (byPath) return byPath;
        return caches.match('.' + path).then(function (byDotPath) {
          if (byDotPath) return byDotPath;
          if (!dotPath) return null;
          return caches.match(dotPath);
        });
      });
    });
  });
}

function matchCachedAsset(request) {
  return caches.match(request).then(function (exact) {
    if (exact) return exact;
    return caches.match(request, { ignoreSearch: true });
  });
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
  if (event.data.type === 'PRECACHE_BACKGROUND') {
    event.waitUntil(runBackgroundPrecache());
  }
});

self.addEventListener('fetch', function (event) {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  var requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET') {
    return;
  }
  if (isRuntimeConfigPath(requestUrl.pathname) || isApiPath(requestUrl.pathname)) {
    return;
  }

  // HTML navigations: never intercept — browser + Netlify serve pages directly.
  // Intercepting caused false "Offline" 503 pages when the network was slow or uncached.
  if (
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').indexOf('text/html') !== -1
  ) {
    return;
  }

  event.respondWith(
    matchCachedAsset(event.request).then(function (cachedResponse) {
      if (cachedResponse) return cachedResponse;
      return networkFirstAsset(event.request, requestUrl);
    })
  );
});
