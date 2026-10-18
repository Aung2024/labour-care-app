/**
 * Registers the stable MNCH service worker without blocking page paint.
 * Updates never force-reload or take over an already-open page.
 */
(function (global) {
  'use strict';

  if (!global.navigator || !('serviceWorker' in global.navigator)) return;
  if (global.__mnchServiceWorkerRegistration) return;

  var UPDATE_ACK_KEY = 'mnchServiceWorkerUpdateAcknowledged';
  var hasAcknowledgedUpdate = function () {
    try {
      return global.localStorage.getItem(UPDATE_ACK_KEY) === 'true';
    } catch (error) {
      return false;
    }
  };
  var acknowledgeUpdate = function () {
    try {
      global.localStorage.setItem(UPDATE_ACK_KEY, 'true');
    } catch (error) {}
  };
  var clearAcknowledgedUpdate = function () {
    try {
      global.localStorage.removeItem(UPDATE_ACK_KEY);
    } catch (error) {}
  };

  var showUpdateNotice = function (registration) {
    if (!global.document || global.document.getElementById('mnchUpdateNotice')) return;

    var notice = global.document.createElement('div');
    notice.id = 'mnchUpdateNotice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = [
      'position:fixed',
      'left:12px',
      'right:12px',
      'bottom:max(12px, env(safe-area-inset-bottom))',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:12px',
      'min-height:56px',
      'padding:12px 14px',
      'border:1px solid #86efac',
      'border-radius:12px',
      'background:#f0fdf4',
      'color:#14532d',
      'box-shadow:0 8px 24px rgba(20,83,45,.2)',
      'font:600 14px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');

    var message = global.document.createElement('span');
    message.textContent = 'A newer MNCH App version is available. Tap Update to prepare it safely.';
    message.style.flex = '1';

    var updateButton = global.document.createElement('button');
    updateButton.type = 'button';
    updateButton.textContent = 'Update';
    updateButton.setAttribute('aria-label', 'Prepare the latest MNCH App update');
    updateButton.style.cssText = [
      'min-width:44px',
      'min-height:44px',
      'padding:8px 14px',
      'border:1px solid #16a34a',
      'border-radius:8px',
      'background:#16a34a',
      'color:#fff',
      'font:inherit',
      'cursor:pointer',
      'touch-action:manipulation'
    ].join(';');
    updateButton.addEventListener('click', function () {
      updateButton.disabled = true;
      updateButton.textContent = 'Preparing…';
      updateButton.style.opacity = '0.7';
      message.textContent = 'Preparing the latest MNCH App update. Your current work will not be interrupted.';

      var finishSafely = function () {
        acknowledgeUpdate();
        message.textContent = 'Update ready. Continue your current work; the new version will apply automatically the next time the app starts.';
        updateButton.textContent = 'Ready';
        updateButton.setAttribute('aria-label', 'MNCH App update is ready');
        global.setTimeout(function () {
          notice.remove();
        }, 3500);
      };

      if (registration.waiting) {
        finishSafely();
        try {
          var refreshCheck = registration.update();
          if (refreshCheck && typeof refreshCheck.catch === 'function') {
            refreshCheck.catch(function () {});
          }
        } catch (error) {}
        return;
      }

      registration.update().then(function () {
        if (registration.waiting) {
          finishSafely();
          return;
        }
        message.textContent = 'This device already has the latest MNCH App version.';
        updateButton.textContent = 'Up to date';
        global.setTimeout(function () {
          notice.remove();
        }, 2500);
      }).catch(function () {
        message.textContent = 'The update could not be checked. Keep working and try Update again when the connection is stable.';
        updateButton.disabled = false;
        updateButton.textContent = 'Try Update';
        updateButton.style.opacity = '1';
      });
    });

    notice.appendChild(message);
    notice.appendChild(updateButton);
    (global.document.body || global.document.documentElement).appendChild(notice);
  };

  var watchForWaitingWorker = function (registration) {
    var notifyIfWaiting = function () {
      if (!registration.waiting) {
        clearAcknowledgedUpdate();
        return;
      }
      if (hasAcknowledgedUpdate()) return;
      if (global.document && global.document.body) {
        showUpdateNotice(registration);
      } else if (global.document) {
        global.document.addEventListener('DOMContentLoaded', function () {
          showUpdateNotice(registration);
        }, { once: true });
      }
    };

    notifyIfWaiting();
    registration.addEventListener('updatefound', function () {
      var installingWorker = registration.installing;
      if (!installingWorker) return;
      installingWorker.addEventListener('statechange', function () {
        if (installingWorker.state === 'installed' && global.navigator.serviceWorker.controller) {
          notifyIfWaiting();
        }
      });
    });
  };

  global.__mnchServiceWorkerRegistration = global.navigator.serviceWorker.register(
    '/service-worker.js',
    {
      scope: '/',
      updateViaCache: 'none'
    }
  ).then(function (registration) {
    watchForWaitingWorker(registration);
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
