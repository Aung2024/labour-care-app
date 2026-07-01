/**
 * Resolve next clinical visit number offline/online using Firestore cache + pending queue.
 */
(function (global) {
  'use strict';

  function visitRaw(record) {
    if (!record) return {};
    return record.data !== undefined ? record.data : record;
  }

  function parseVisitNum(data, fields) {
    data = data || {};
    fields = fields || ['visitNumber', 'visit_number'];
    for (var i = 0; i < fields.length; i++) {
      var n = parseInt(data[fields[i]], 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return null;
  }

  function recordPatientId(record) {
    var d = visitRaw(record);
    return d.patientId || d.patient_id || null;
  }

  function statsFromRecords(records, fields) {
    var max = 0;
    var count = 0;
    (records || []).forEach(function (item) {
      var data = visitRaw(item);
      count++;
      var n = parseVisitNum(data, fields);
      if (n != null && n > max) max = n;
    });
    return { max: max, count: count };
  }

  async function getFirestoreCollectionDocs(patientId, collectionName) {
    if (!patientId || !global.firebase) return [];
    try {
      var snap = await firebase.firestore()
        .collection('patients')
        .doc(patientId)
        .collection(collectionName)
        .get();
      var out = [];
      if (snap && snap.forEach) {
        snap.forEach(function (doc) {
          out.push({ id: doc.id, data: doc.data() || {} });
        });
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  async function getPendingForPatient(storeName, patientId) {
    if (!global.OfflineManager || !patientId) return [];
    var pending = await OfflineManager.getPendingRecords(storeName);
    return pending.filter(function (r) {
      return recordPatientId(r) === patientId;
    });
  }

  /**
   * @param {object} options
   * @param {string} options.patientId
   * @param {string} options.collectionName Firestore subcollection
   * @param {string} [options.pendingStore] IndexedDB pending store
   * @param {string[]} [options.visitNumberFields]
   * @param {number} [options.maxVisitNumber] cap (e.g. PNC = 4)
   */
  async function resolveNextVisitNumber(options) {
    options = options || {};
    var patientId = options.patientId;
    var fields = options.visitNumberFields || ['visitNumber', 'visit_number'];
    if (!patientId) return 1;

    var cloud = await getFirestoreCollectionDocs(patientId, options.collectionName);
    var pending = options.pendingStore
      ? await getPendingForPatient(options.pendingStore, patientId)
      : [];

    var cloudStats = statsFromRecords(cloud, fields);
    var pendingStats = statsFromRecords(pending, fields);
    var next = Math.max(cloudStats.max, pendingStats.max, 0);

    if (next === 0) {
      next = Math.max(cloudStats.count + pendingStats.count, 0) + 1;
    } else {
      next = next + 1;
    }

    if (options.maxVisitNumber) {
      next = Math.min(next, options.maxVisitNumber);
    }
    return Math.max(1, next);
  }

  global.OfflineVisitNumber = {
    resolveNextVisitNumber: resolveNextVisitNumber,
    getFirestoreCollectionDocs: getFirestoreCollectionDocs,
    getPendingForPatient: getPendingForPatient
  };
})(typeof window !== 'undefined' ? window : this);
