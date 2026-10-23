(function (global) {
  'use strict'

  const normalizePath = (target) => {
    const url = new URL(target, global.location.href)
    if (url.origin !== global.location.origin || !/\.html$/i.test(url.pathname)) {
      throw new Error('Invalid application route')
    }
    return url
  }

  const showNavigationFailure = (message) => {
    const existing = global.document && global.document.getElementById('appNavigationNotice')
    if (existing) existing.remove()
    if (!global.document || !global.document.body) return

    const notice = global.document.createElement('div')
    notice.id = 'appNavigationNotice'
    notice.setAttribute('role', 'alert')
    notice.style.cssText = [
      'position:fixed',
      'left:12px',
      'right:12px',
      'bottom:max(12px,env(safe-area-inset-bottom))',
      'z-index:2147483646',
      'padding:14px 16px',
      'border:1px solid #f59e0b',
      'border-radius:12px',
      'background:#fffbeb',
      'color:#78350f',
      'font:600 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';')
    notice.textContent = message || 'This screen is not available right now. Reconnect and try again.'
    global.document.body.appendChild(notice)
  }

  const warmRoutes = (routes) => {
    if (!Array.isArray(routes) || !global.navigator.serviceWorker) return
    global.navigator.serviceWorker.ready.then((registration) => {
      const worker = registration.active
      if (!worker) return
      worker.postMessage({ type: 'WARM_ROUTES', routes })
    }).catch(() => {})
  }

  const open = (target, options = {}) => {
    let url
    try {
      url = normalizePath(target)
    } catch (error) {
      showNavigationFailure('This application screen is not configured correctly.')
      return false
    }

    const navigate = () => {
      global.location.assign(url.href)
    }

    if (!global.caches || typeof global.caches.match !== 'function') {
      navigate()
      return true
    }

    global.caches.match(url.href, { ignoreSearch: true }).then((cached) => {
      if (cached || global.navigator.onLine !== false || options.allowOfflineRequest === true) {
        navigate()
        return
      }
      showNavigationFailure('Reconnect to the internet, then try opening this screen again.')
    }).catch(navigate)
    return true
  }

  global.AppNavigation = {
    open,
    warmRoutes,
    showNavigationFailure
  }
})(window)
