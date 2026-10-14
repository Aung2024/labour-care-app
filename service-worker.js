/**
 * Service worker is intentionally disabled for the MNCH v2 pilot.
 * js/register-sw.js unregisters workers and clears caches on each load.
 *
 * If this file is still registered from an old build, activate once with no
 * fetch handler so navigations are not intercepted.
 */
self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) { return caches.delete(key) }))
    })
  )
})
