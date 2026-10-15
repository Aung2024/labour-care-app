/**
 * Registers the app service worker from any page under the site root.
 * Asset-only caching; HTML navigations are not intercepted by the SW.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var register = function () {
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then(function (registration) {
      try { registration.update(); } catch (e) { /* ignore */ }
    }).catch(function (e) {
      console.warn('[SW] register failed', e);
    });
  };

  var deferRegister = function () {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(function () { register(); }, { timeout: 3000 });
      return;
    }
    setTimeout(register, 0);
  };

  if (document.readyState === 'complete') {
    deferRegister();
  } else {
    window.addEventListener('load', deferRegister);
  }
})();
