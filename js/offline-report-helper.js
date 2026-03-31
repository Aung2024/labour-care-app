/**
 * Offline reads for patient-scoped reports when navigator.onLine is false.
 * Requires: firebase.js, offline-store.js, offline-sync.js (LabourCareOffline).
 */
(function (global) {
  const OfflineReportBridge = {
    isActive: function () {
      return (
        typeof navigator !== "undefined" &&
        !navigator.onLine &&
        global.OfflineStore &&
        global.LabourCareOffline
      );
    },

    patientGet: function (patientId) {
      return OfflineStore.getDocument("patients/" + patientId).then(function (rec) {
        if (!rec || !rec.payload) {
          return { exists: false, id: patientId, data: function () { return null; } };
        }
        const data = LabourCareOffline.deserializeFromMirror(rec.payload);
        return { exists: true, id: patientId, data: function () { return data; } };
      });
    },

    subcollectionGet: function (patientId, col) {
      return OfflineStore.getAllByPrefix("patients/" + patientId + "/" + col + "/").then(function (rows) {
        const docs = rows.map(function (r) {
          const parts = r.path.split("/");
          const id = parts[parts.length - 1];
          return {
            id: id,
            data: function () {
              return LabourCareOffline.deserializeFromMirror(r.payload);
            }
          };
        });
        return {
          empty: docs.length === 0,
          size: docs.length,
          forEach: function (fn) {
            docs.forEach(fn);
          },
          docs: docs
        };
      });
    },

    recordsDocGet: function (patientId, docId) {
      return OfflineStore.getDocument("patients/" + patientId + "/records/" + docId).then(function (rec) {
        if (!rec || !rec.payload) {
          return { exists: false, id: docId, data: function () { return null; } };
        }
        return {
          exists: true,
          id: docId,
          data: function () {
            return LabourCareOffline.deserializeFromMirror(rec.payload);
          }
        };
      });
    }
  };

  global.OfflineReportBridge = OfflineReportBridge;
})(typeof window !== "undefined" ? window : globalThis);
