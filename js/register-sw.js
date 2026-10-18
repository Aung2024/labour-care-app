/**
 * Registers the stable MNCH service worker without blocking page paint.
 * Updates never force-reload or take over an already-open page.
 */
(function (global) {
  'use strict';

  if (!global.navigator || !('serviceWorker' in global.navigator)) return;
  if (global.__mnchServiceWorkerRegistration) return;

  var showUpdateNotice = function () {
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
    message.textContent = 'A newer MNCH App version is ready. Finish your current work, then close and reopen the app.';
    message.style.flex = '1';

    var dismiss = global.document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = 'Dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss app update notice');
    dismiss.style.cssText = [
      'min-width:44px',
      'min-height:44px',
      'padding:8px',
      'border:1px solid #16a34a',
      'border-radius:8px',
      'background:#fff',
      'color:#166534',
      'font:inherit',
      'cursor:pointer',
      'touch-action:manipulation'
    ].join(';');
    dismiss.addEventListener('click', function () {
      notice.remove();
    });

    notice.appendChild(message);
    notice.appendChild(dismiss);
    (global.document.body || global.document.documentElement).appendChild(notice);
  };

  var watchForWaitingWorker = function (registration) {
    var notifyIfWaiting = function () {
      if (registration.waiting) {
        if (global.document && global.document.body) {
          showUpdateNotice();
        } else if (global.document) {
          global.document.addEventListener('DOMContentLoaded', showUpdateNotice, { once: true });
        }
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
