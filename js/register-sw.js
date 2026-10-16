/**
 * Registers the service worker (V2-style). Hard reload bypasses the SW in fetch;
 * cancel background precache on reload so connections stay free.
 */
(function () {
  if (!('serviceWorker' in navigator)) return

  var reloading = false
  var hadController = !!navigator.serviceWorker.controller
  var pageStartedAt = Date.now()

  var isReloadNavigation = function () {
    try {
      var entries = performance.getEntriesByType('navigation')
      return !!(entries && entries[0] && entries[0].type === 'reload')
    } catch (e) {
      return false
    }
  }

  var cancelBackgroundPrecache = function (registration) {
    var worker = (registration && registration.active) ||
      (navigator.serviceWorker && navigator.serviceWorker.controller)
    if (!worker) return
    try {
      worker.postMessage({ type: 'CANCEL_PRECACHE' })
    } catch (e) {}
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || reloading) return
    if (isReloadNavigation()) return
    if (Date.now() - pageStartedAt < 5000) return
    reloading = true
    window.location.reload()
  })

  var scheduleBackgroundPrecache = function (registration) {
    if (isReloadNavigation()) {
      cancelBackgroundPrecache(registration)
      return
    }
    if (!registration || !registration.active) return
    try {
      registration.active.postMessage({ type: 'PRECACHE_BACKGROUND' })
    } catch (e) {}
  }

  var register = function () {
    if (isReloadNavigation()) {
      cancelBackgroundPrecache(null)
    }
    navigator.serviceWorker.register('./service-worker.js', {
      updateViaCache: 'none'
    }).then(function (registration) {
      // Do not rely only on the browser's periodic update check. Existing
      // browsers can otherwise keep an older worker/cache indefinitely.
      try {
        var updatePromise = registration.update()
        if (updatePromise && typeof updatePromise.catch === 'function') {
          updatePromise.catch(function () {})
        }
      } catch (e) {}
      if (registration.active) {
        scheduleBackgroundPrecache(registration)
      }
      navigator.serviceWorker.ready.then(function (readyRegistration) {
        scheduleBackgroundPrecache(readyRegistration)
      })
      registration.addEventListener('updatefound', function () {
        var worker = registration.installing
        if (!worker) return
        worker.addEventListener('statechange', function () {
          if (worker.state === 'activated' && !isReloadNavigation()) {
            scheduleBackgroundPrecache(registration)
          }
        })
      })
    }).catch(function (e) {
      console.warn('[SW] register failed', e)
    })
  }

  var deferRegister = function () {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(function () { register() }, { timeout: 3000 })
      return
    }
    setTimeout(register, 0)
  }

  if (document.readyState === 'complete') {
    deferRegister()
  } else {
    window.addEventListener('load', deferRegister)
  }
})()
