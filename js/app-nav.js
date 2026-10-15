/**
 * Debounced full-page navigation (avoids double-tap races before document unload).
 */
(function (global) {
  'use strict';

  var navLockUntil = 0;
  var NAV_MUTEX_MS = 400;

  function navigateTo(url) {
    if (!url) return;
    var now = Date.now();
    if (now < navLockUntil) return;
    navLockUntil = now + NAV_MUTEX_MS;
    if (global.AppLifecycle && typeof global.AppLifecycle.disableFirestoreNetwork === 'function') {
      global.AppLifecycle.disableFirestoreNetwork();
    }
    global.location.assign(url);
  }

  global.AppNav = {
    navigateTo: navigateTo,
    navigateToHome: function () {
      navigateTo('home.html');
    },
    navigateToList: function () {
      navigateTo('list.html');
    }
  };
})(typeof window !== 'undefined' ? window : this);
