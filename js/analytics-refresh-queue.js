(function (global) {
  'use strict';

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

  async function request(patientId, reason) {
    if (!patientId || !global.firebase || !firebase.firestore) return false;
    var user = firebase.auth && firebase.auth().currentUser;
    if (!user) return false;
    await Promise.all([
      enqueue('tracking_v2_refresh_queue', patientId, reason, user.uid),
      enqueue('leaderboard_v3_refresh_queue', patientId, reason, user.uid)
    ]);
    return true;
  }

  function requestSafely(patientId, reason) {
    return request(patientId, reason).catch(function (error) {
      console.warn('Could not queue backend refresh:', error);
      return false;
    });
  }

  global.AnalyticsRefreshQueue = {
    request: request,
    requestSafely: requestSafely
  };
})(typeof window !== 'undefined' ? window : globalThis);
