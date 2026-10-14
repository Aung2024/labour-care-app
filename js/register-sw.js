/**
 * Registers the app service worker from any page under the site root.
 * V2-style: defer registration; background precache only after idle (no install contention).
 */
(function () {
  if (!('serviceWorker' in navigator)) return

  var backgroundPrecacheScheduled = false

  var isReloadNavigation = function () {
    try {
      var entries = performance.getEntriesByType('navigation')
      return !!(entries && entries[0] && entries[0].type === 'reload')
    } catch (e) {
      return false
    }
  }

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

    setTimeout(function () {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(post, { timeout: 20000 })
        return
      }
      post()
    }, 12000)
  }

  var register = function () {
    navigator.serviceWorker.register('./service-worker.js').then(function (registration) {
      navigator.serviceWorker.ready.then(function (readyRegistration) {
        scheduleBackgroundPrecache(readyRegistration)
      })
    }).catch(function (e) {
      console.warn('[SW] register failed', e)
    })
  }

  var deferRegister = function () {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(function () { register() }, { timeout: 4000 })
      return
    }
    setTimeout(register, 500)
  }

  if (document.readyState === 'complete') {
    deferRegister()
  } else {
    window.addEventListener('load', deferRegister)
  }
})()
