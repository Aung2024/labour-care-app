/**
 * Registers the app service worker from any page under the site root.
 * Ensures precache runs for flows that skip index.html / home.html.
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

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || reloading) return
    if (isReloadNavigation()) return
    if (Date.now() - pageStartedAt < 5000) return
    reloading = true
    window.location.reload()
  })

  var register = function () {
    navigator.serviceWorker.register('./service-worker.js').then(function (registration) {
      if (registration.waiting && navigator.serviceWorker.controller) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
      registration.addEventListener('updatefound', function () {
        var worker = registration.installing
        if (!worker) return
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })
    }).catch(function (e) {
      console.warn('[SW] register failed', e)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', register)
  } else {
    register()
  }
})()
