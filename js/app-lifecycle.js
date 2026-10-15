/**
 * Cooperative Firestore + bfcache lifecycle for full-page navigations (MPA).
 * Closes long-polling on pagehide to reduce ERR_SOCKET_NOT_CONNECTED on the next document load.
 */
(function (global) {
  'use strict';

  if (!global.document) return;

  var lastHiddenAt = 0;
  var RESUME_NETWORK_MS = 15000;
  var NAV_BREADCRUMB_KEY = 'mnchNavBreadcrumb';
  var bfcacheRecoverCallbacks = [];

  function getDb() {
    try {
      if (!global.firebase || !global.firebase.firestore) return null;
      return global.firebase.firestore();
    } catch (e) {
      return null;
    }
  }

  function enableFirestoreNetwork() {
    try {
      var db = getDb();
      if (db && typeof db.enableNetwork === 'function') {
        db.enableNetwork().catch(function () {});
      }
    } catch (e) {
      console.warn('[AppLifecycle] enableNetwork failed', e);
    }
  }

  function disableFirestoreNetwork() {
    try {
      var db = getDb();
      if (db && typeof db.disableNetwork === 'function') {
        db.disableNetwork().catch(function () {});
      }
    } catch (e) {
      console.warn('[AppLifecycle] disableNetwork failed', e);
    }
  }

  function writeNavBreadcrumb() {
    try {
      global.sessionStorage.setItem(NAV_BREADCRUMB_KEY, JSON.stringify({
        from: (global.location.pathname || '') + (global.location.search || ''),
        time: Date.now(),
        online: !!(global.navigator && global.navigator.onLine)
      }));
    } catch (e) { /* ignore */ }
  }

  function onBfcacheRecover(fn) {
    if (typeof fn === 'function') {
      bfcacheRecoverCallbacks.push(fn);
    }
  }

  function recoverPageFromBfcache() {
    if (typeof global.navigationInProgress !== 'undefined') {
      global.navigationInProgress = false;
    }
    enableFirestoreNetwork();
    bfcacheRecoverCallbacks.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        console.warn('[AppLifecycle] bfcache recover callback failed', e);
      }
    });
    try {
      global.dispatchEvent(new CustomEvent('mnch:bfcache-recover'));
    } catch (e) { /* ignore */ }
  }

  global.document.addEventListener('pagehide', function () {
    writeNavBreadcrumb();
    disableFirestoreNetwork();
  });

  global.document.addEventListener('visibilitychange', function () {
    if (global.document.visibilityState === 'hidden') {
      lastHiddenAt = Date.now();
      return;
    }
    if (global.document.visibilityState !== 'visible') return;
    enableFirestoreNetwork();
    var hiddenMs = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
    if (hiddenMs >= RESUME_NETWORK_MS) {
      global.setTimeout(enableFirestoreNetwork, 400);
    }
  });

  global.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      recoverPageFromBfcache();
    } else {
      enableFirestoreNetwork();
    }
  });

  global.addEventListener('focus', function () {
    enableFirestoreNetwork();
  });

  global.AppLifecycle = {
    enableFirestoreNetwork: enableFirestoreNetwork,
    disableFirestoreNetwork: disableFirestoreNetwork,
    recoverPageFromBfcache: recoverPageFromBfcache,
    onBfcacheRecover: onBfcacheRecover
  };
})(typeof window !== 'undefined' ? window : this);
