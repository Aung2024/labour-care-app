(function (global) {
  'use strict';

  var REQUEST_TIMEOUT_MS = 6000;
  var CHANGE_MARKER_PREFIX = 'clinicalChangeAt:';

  async function enqueue(collectionName, patientId, reason, userId) {
    var payload = {
      patientId: String(patientId),
      requestedBy: userId,
      reason: String(reason || 'clinical_update').slice(0, 80),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await firebase.firestore().collection(collectionName)
      .doc(String(patientId)).set(payload, { merge: true });
  }

  function markLocalChange(patientId) {
    if (!patientId) return;
    try {
      global.localStorage.setItem(CHANGE_MARKER_PREFIX + String(patientId), String(Date.now()));
    } catch (error) {
      // Storage can be full or blocked; callers fall back to their own TTLs.
    }
  }

  function lastLocalChangeAt(patientId) {
    if (!patientId) return 0;
    try {
      return parseInt(global.localStorage.getItem(CHANGE_MARKER_PREFIX + String(patientId)), 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  async function request(patientId, reason) {
    markLocalChange(patientId);
    if (!patientId || !global.firebase || !firebase.firestore) return false;
    var user = firebase.auth && firebase.auth().currentUser;
    if (!user) return false;
    await enqueue('clinical_refresh_v1_queue', patientId, reason, user.uid);
    return true;
  }

  // Without Firestore persistence an offline write never resolves, so callers
  // that await this before navigating would hang. Offline saves are re-queued
  // by SyncManager after upload, and a slow ack keeps writing in the background.
  function requestSafely(patientId, reason) {
    if (global.navigator && global.navigator.onLine === false) {
      markLocalChange(patientId);
      return Promise.resolve(false);
    }
    var pending = request(patientId, reason).catch(function (error) {
      console.warn('Could not queue backend refresh:', error);
      return false;
    });
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(false); }, REQUEST_TIMEOUT_MS);
    });
    return Promise.race([pending, timeout]);
  }

  global.AnalyticsRefreshQueue = {
    request: request,
    requestSafely: requestSafely,
    lastLocalChangeAt: lastLocalChangeAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
