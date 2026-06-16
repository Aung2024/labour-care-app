/**
 * Shared Firestore load helpers for transfer pages (Safari / iOS / iPad compatible).
 */
(function (global) {
  'use strict';

  function isAppleMobileOrTablet() {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function smartQuery(queryOrDocRefPromise, options) {
    var fn = global.smartFirestoreQuery;
    var base = {
      preferCache: isAppleMobileOrTablet(),
      timeout: 10000,
      retries: 2,
      fallbackToCache: true
    };
    var opts = Object.assign(base, options || {});
    if (typeof fn === 'function') {
      return fn(queryOrDocRefPromise, opts);
    }
    return queryOrDocRefPromise.then(function (q) { return q.get(); });
  }

  async function mapWithConcurrency(items, limit, fn) {
    var out = [];
    var batchSize = Math.max(1, limit || 6);
    for (var i = 0; i < items.length; i += batchSize) {
      var batch = items.slice(i, i + batchSize);
      var part = await Promise.all(batch.map(fn));
      out.push.apply(out, part);
    }
    return out;
  }

  function cacheRead(key, maxAgeMs) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.at == null) return null;
      if (Date.now() - parsed.at > (maxAgeMs || 180000)) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function cacheWrite(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data }));
    } catch (e) { /* quota */ }
  }

  async function batchGetPatientDocs(db, patientIds) {
    var map = new Map();
    var ids = Array.from(new Set((patientIds || []).filter(Boolean)));
    if (!ids.length) return map;

    for (var i = 0; i < ids.length; i += 10) {
      var chunk = ids.slice(i, i + 10);
      var refs = chunk.map(function (id) { return db.collection('patients').doc(id); });
      try {
        var snaps;
        if (typeof db.getAll === 'function') {
          snaps = await db.getAll.apply(db, refs);
        } else {
          snaps = await Promise.all(refs.map(function (ref) {
            return smartQuery(Promise.resolve(ref), { timeout: 8000, retries: 1 });
          }));
        }
        (snaps || []).forEach(function (snap) {
          if (snap && snap.exists && snap.id) {
            map.set(snap.id, { id: snap.id, ...(snap.data() || {}) });
          }
        });
      } catch (e) {
        console.warn('batchGetPatientDocs chunk failed', e);
      }
    }
    return map;
  }

  global.TransferLoadUtils = {
    isAppleMobileOrTablet: isAppleMobileOrTablet,
    smartQuery: smartQuery,
    mapWithConcurrency: mapWithConcurrency,
    cacheRead: cacheRead,
    cacheWrite: cacheWrite,
    batchGetPatientDocs: batchGetPatientDocs
  };
})(typeof window !== 'undefined' ? window : this);
