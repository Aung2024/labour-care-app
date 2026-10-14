/**
 * Registers the app service worker from any page under the site root.
 */
(function () {
  if (!('serviceWorker' in navigator)) return

  var reloading = false
  var hadController = !!navigator.serviceWorker.controller
  var pageStartedAt = Date.now()
  var backgroundPrecacheScheduled = false

  var isReloadNavigation = function () {
    try {
      var entries = performance.getEntriesByType('navigation')
      return !!(entries && entries[0] && entries[0].type === 'reload')
    } catch (e) {
      return false
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || reloading) return
    if (isReloadNavigation()) return
    if (Date.now() - pageStartedAt < 5000) return
    reloading = true
    window.location.reload()
  })

  var scheduleBackgroundPrecache = function (registration) {
    if (backgroundPrecacheScheduled || isReloadNavigation()) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    backgroundPrecacheScheduled = true

    var post = function () {
      if (!registration || !registration.active) return
      try {
        registration.active.postMessage({ type: 'PRECACHE_BACKGROUND' })
      } catch (e) {}
    }

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(post, { timeout: 10000 })
      return
    }
    setTimeout(post, 8000)
  }

  var register = function () {
    navigator.serviceWorker.register('./service-worker.js').then(function (registration) {
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
          if (worker.state === 'activated') {
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
