/**
 * Registers the app service worker from any page under the site root.
 * Ensures precache runs for flows that skip index.html / home.html.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./service-worker.js').catch(function (e) {
      console.warn('[SW] register failed', e);
    });
  });
})();
