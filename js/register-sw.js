/**
 * MNCH v2 pilot: service worker disabled for online reliability.
 * Clears any prior SW registration and Cache Storage from dev builds.
 * Offline clinical data uses Firestore / Offline Manager (IndexedDB), not SW.
 */
(function () {
  if (!('serviceWorker' in navigator)) return

  var teardown = function () {
    var unregister = navigator.serviceWorker.getRegistrations
      ? navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (reg) { return reg.unregister() }))
        })
      : Promise.resolve()

    var clearCaches = ('caches' in window)
      ? caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return caches.delete(key) }))
        })
      : Promise.resolve()

    return unregister.then(clearCaches)
  }

  var CLEANUP_KEY = 'mnch-sw-cleanup-done'

  var run = function () {
    try {
      if (sessionStorage.getItem(CLEANUP_KEY) === '1') return
    } catch (e) {}

    teardown()
      .then(function () {
        try {
          sessionStorage.setItem(CLEANUP_KEY, '1')
        } catch (e2) {}
      })
      .catch(function (e) {
        console.warn('[SW] disabled — cleanup failed', e)
      })
  }

  if (document.readyState === 'complete') {
    run()
  } else {
    window.addEventListener('load', run)
  }
})()
