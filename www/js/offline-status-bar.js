/**
 * Global Offline Status Bar
 * Self-injecting sticky bar that shows online/offline mode on every page.
 * Reads state from localStorage -- no IndexedDB dependency.
 */
(function () {
  'use strict';

  var OFFLINE_KEY = 'offlineMode';
  var BAR_ID = 'globalOfflineStatusBar';
  var BAR_HEIGHT = '32px';

  function isOffline() {
    return localStorage.getItem(OFFLINE_KEY) === 'true';
  }

  function createBar() {
    if (document.getElementById(BAR_ID)) return;

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:' + BAR_HEIGHT +
      ';z-index:999999;display:flex;align-items:center;justify-content:center;' +
      'font-size:0.8rem;font-weight:600;font-family:sans-serif;transition:all 0.3s ease;';

    document.body.prepend(bar);
    document.body.style.paddingTop = BAR_HEIGHT;

    updateBar();
  }

  function updateBar() {
    var bar = document.getElementById(BAR_ID);
    if (!bar) return;

    if (isOffline()) {
      bar.style.background = 'linear-gradient(90deg, #d97706, #f59e0b)';
      bar.style.color = '#fff';
      bar.innerHTML =
        '<i class="fas fa-exclamation-triangle" style="margin-right:6px;font-size:0.75rem;"></i>' +
        '<span>OFFLINE MODE</span>';
      bar.style.opacity = '1';
    } else {
      bar.style.background = 'linear-gradient(90deg, #059669, #10b981)';
      bar.style.color = '#fff';
      bar.innerHTML =
        '<i class="fas fa-wifi" style="margin-right:6px;font-size:0.75rem;"></i>' +
        '<span>ONLINE</span>';
      bar.style.opacity = '1';
      bar.style.height = BAR_HEIGHT;
      bar.style.overflow = '';
      document.body.style.paddingTop = BAR_HEIGHT;
    }
  }

  window.addEventListener('online', updateBar);
  window.addEventListener('offline', updateBar);

  window.addEventListener('storage', function (e) {
    if (e.key === OFFLINE_KEY) updateBar();
  });

  function init() {
    createBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
