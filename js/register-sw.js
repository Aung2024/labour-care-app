/**
 * Registers the service worker (V2-style). Hard reload bypasses the SW in fetch;
 * cancel background precache on reload so connections stay free.
 */
(function () {
  if (!('serviceWorker' in navigator)) return

  var updateAcknowledged = false

  var showUpdateNotice = function (registration) {
    if (updateAcknowledged || document.getElementById('mnchUpdateNotice')) return
    var notice = document.createElement('aside')
    notice.id = 'mnchUpdateNotice'
    notice.setAttribute('role', 'status')
    notice.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px',
      'bottom:max(12px, env(safe-area-inset-bottom))',
      'z-index:2147483647', 'display:flex', 'align-items:center',
      'gap:12px', 'min-height:56px', 'padding:12px 14px',
      'border:1px solid #93c5fd', 'border-radius:12px',
      'background:#eff6ff', 'color:#1e3a8a',
      'box-shadow:0 8px 24px rgba(30,64,175,.2)',
      'font:600 14px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';')
    var message = document.createElement('span')
    message.textContent = 'A newer app version is ready. Update when you finish, then close and reopen this tab.'
    message.style.flex = '1'
    var updateButton = document.createElement('button')
    updateButton.type = 'button'
    updateButton.textContent = 'Update'
    updateButton.setAttribute('aria-label', 'Prepare the latest app update')
    updateButton.style.cssText = [
      'min-width:44px', 'min-height:44px', 'padding:8px 14px',
      'border:1px solid #2563eb', 'border-radius:8px',
      'background:#2563eb', 'color:#fff', 'font:inherit',
      'cursor:pointer', 'touch-action:manipulation'
    ].join(';')
    updateButton.addEventListener('click', function () {
      updateAcknowledged = true
      updateButton.disabled = true
      updateButton.textContent = 'Ready'
      message.textContent = 'Update ready. Close this tab and reopen the app for the safest upgrade.'
      try {
        var updatePromise = registration.update()
        if (updatePromise && typeof updatePromise.catch === 'function') {
          updatePromise.catch(function () {})
        }
      } catch (e) {}
      window.setTimeout(function () { notice.remove() }, 6000)
    })
    notice.appendChild(message)
    notice.appendChild(updateButton)
    ;(document.body || document.documentElement).appendChild(notice)
  }

  var watchForWaitingWorker = function (registration) {
    var notify = function () {
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateNotice(registration)
      }
    }
    notify()
    registration.addEventListener('updatefound', function () {
      var installing = registration.installing
      if (!installing) return
      installing.addEventListener('statechange', function () {
        if (installing.state === 'installed') notify()
      })
    })
  }

  var scheduleBackgroundPrecache = function (registration) {
    if (!registration || !registration.active) return
    try {
      registration.active.postMessage({ type: 'PRECACHE_BACKGROUND' })
    } catch (e) {}
  }

  var register = function () {
    navigator.serviceWorker.register('./service-worker.js', {
      updateViaCache: 'none'
    }).then(function (registration) {
      watchForWaitingWorker(registration)
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
