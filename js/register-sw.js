/**
 * MNCH v2 pilot: service worker disabled for online reliability.
 * Clears any prior SW registration and Cache Storage from older builds.
 * Runs immediately — do not wait for window "load".
 */
(function (global) {
  'use strict';

  if (global.__mnchPilotSwTeardown) return;
  global.__mnchPilotSwTeardown = true;

  if (!global.navigator || !('serviceWorker' in global.navigator)) return;

  function teardown() {
    var unregister = global.navigator.serviceWorker.getRegistrations
      ? global.navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (reg) { return reg.unregister(); }));
        })
      : Promise.resolve();

    var clearCaches = ('caches' in global)
      ? global.caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return global.caches.delete(key); }));
        })
      : Promise.resolve();

    return unregister.then(clearCaches);
  }

  function stillControlled() {
    try {
      return !!global.navigator.serviceWorker.controller;
    } catch (e) {
      return false;
    }
  }

  function runTeardown(reason) {
    return teardown().catch(function (e) {
      console.warn('[SW] disabled — cleanup failed' + (reason ? ' (' + reason + ')' : ''), e);
    });
  }

  runTeardown('immediate');

  if (stillControlled()) {
    global.navigator.serviceWorker.ready.then(function () {
      return runTeardown('ready');
    }).catch(function () {});
  }

  if (global.document && global.document.readyState !== 'complete') {
    global.addEventListener('load', function () {
      if (stillControlled()) runTeardown('load');
    }, { once: true });
  }
})(typeof window !== 'undefined' ? window : this);
