/**
 * Home HRT/KMC badge counts from tracking projections, not per-patient scans.
 */
(function (global) {
  'use strict';

  function readStoredCount(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (raw == null || raw === '') return null;
      var n = parseInt(raw, 10);
      return isNaN(n) ? null : n;
    } catch (e) {
      return null;
    }
  }

  function storeCount(key, value) {
    try {
      sessionStorage.setItem(key, String(value));
      sessionStorage.setItem(key + 'At', String(Date.now()));
    } catch (e) {}
  }

  function isActiveTrackingRow(row) {
    if (!row) return false;
    return String(row.status || '') !== 'complete';
  }

  async function countActiveFromApi(functionName) {
    if (!global.TrackingReader || typeof TrackingReader.call !== 'function') return null;
    if (typeof TrackingReader.enabled === 'function' && !TrackingReader.enabled()) return null;
    var user = firebase.auth && firebase.auth().currentUser;
    if (!user) return null;

    var filters = { periodStart: '2000-01-01', periodEnd: '9999-12-31' };
    var active = 0;
    var pageToken = null;
    var pages = 0;
    do {
      var result = await TrackingReader.call(
        functionName,
        TrackingReader.payload(filters, pageToken, { pageSize: 100 }),
        { retry: false }
      );
      var rows = (result && result.rows) || [];
      rows.forEach(function (row) {
        if (isActiveTrackingRow(row)) active += 1;
      });
      pageToken = result && result.nextPageToken;
      pages += 1;
    } while (pageToken && pages < 3);
    return active;
  }

  async function refreshFollowUpBadges() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        hrt: readStoredCount('hrtActiveFollowUpCount'),
        kmc: readStoredCount('kmcActiveFollowUpCount')
      };
    }

    var hrt = readStoredCount('hrtActiveFollowUpCount');
    var kmc = readStoredCount('kmcActiveFollowUpCount');

    var next = await Promise.all([
      countActiveFromApi('queryHrtTracking').catch(function (e) {
        console.warn('Home HRT badge used saved count', e);
        return null;
      }),
      countActiveFromApi('queryKmcTracking').catch(function (e) {
        console.warn('Home KMC badge used saved count', e);
        return null;
      })
    ]);

    if (typeof next[0] === 'number') {
      hrt = next[0];
      storeCount('hrtActiveFollowUpCount', hrt);
    }
    if (typeof next[1] === 'number') {
      kmc = next[1];
      storeCount('kmcActiveFollowUpCount', kmc);
    }

    return { hrt: hrt || 0, kmc: kmc || 0 };
  }

  global.HomeFollowUpBadges = {
    refreshFollowUpBadges: refreshFollowUpBadges
  };
})(typeof window !== 'undefined' ? window : this);
