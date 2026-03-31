/**
 * Legacy global bar (manual "Offline Mode" toggle) — disabled.
 * Automatic offline UX uses navigator.onLine + LabourCareOffline banner on home/list.
 */
(function () {
  'use strict';
  try {
    localStorage.removeItem('offlineMode');
  } catch (e) {}
})();
