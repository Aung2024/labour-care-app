/**
 * Registers the stable MNCH service worker without blocking page paint.
 * Updates never force-reload or take over an already-open page.
 */
(function (global) {
  'use strict';

  if (!global.navigator || !('serviceWorker' in global.navigator)) return;
  if (global.__mnchServiceWorkerRegistration) return;

  global.__mnchServiceWorkerRegistration = global.navigator.serviceWorker.register(
    '/service-worker.js',
    {
      scope: '/',
      updateViaCache: 'none'
    }
  ).then(function (registration) {
    try {
      var updatePromise = registration.update();
      if (updatePromise && typeof updatePromise.catch === 'function') {
        updatePromise.catch(function () {});
      }
    } catch (e) {
      /* Registration is still usable when an explicit update check fails. */
    }
    return registration;
  }).catch(function (error) {
    console.warn('[SW] Registration failed; app will continue online', error);
    return null;
  });
})(typeof window !== 'undefined' ? window : this);
