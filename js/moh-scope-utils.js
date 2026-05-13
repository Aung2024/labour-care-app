/**
 * MOH (@moh.com) data scope helpers.
 * When a signed-in user has an @moh.com email, patient aggregates and lists
 * should only include patients whose creator account is also @moh.com.
 */
(function (global) {
  function normalizeEmail(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function isMohComEmail(email) {
    var n = normalizeEmail(email);
    return n.indexOf("@") !== -1 && n.endsWith("moh.com");
  }

  function shouldApplyMohPatientFilter(viewerEmail) {
    return isMohComEmail(viewerEmail);
  }

  /**
   * @param {Array<{id?:string, created_by?:string, createdBy?:string}>} patients
   * @param {firebase.firestore.Firestore} db
   * @param {function} smartFn optional window.smartFirestoreQuery
   */
  function filterPatientsByMohCreatorEmails(patients, db, smartFn) {
    if (!patients || !patients.length || !db) return Promise.resolve(patients || []);

    var uidSet = {};
    patients.forEach(function (p) {
      var cid = p.created_by || p.createdBy;
      if (cid) uidSet[cid] = true;
    });
    var uids = Object.keys(uidSet);
    if (!uids.length) return Promise.resolve([]);

    var queryFn =
      smartFn && typeof smartFn === "function"
        ? smartFn
        : function (refPromise, opts) {
            return refPromise.then(function (ref) {
              return ref.get();
            });
          };

    var mohOk = {};
    var chunkSize = 20;

    function loadChunk(start) {
      var chunk = uids.slice(start, start + chunkSize);
      if (!chunk.length) return Promise.resolve();
      return Promise.all(
        chunk.map(function (uid) {
          return queryFn(Promise.resolve(db.collection("users").doc(uid)), {
            preferCache: false,
            timeout: 6000,
            retries: 1,
            fallbackToCache: true
          })
            .then(function (snap) {
              if (snap && snap.exists) {
                var em = (snap.data() && snap.data().email) || "";
                if (isMohComEmail(em)) mohOk[uid] = true;
              }
            })
            .catch(function () {});
        })
      ).then(function () {
        return loadChunk(start + chunkSize);
      });
    }

    return loadChunk(0).then(function () {
      return patients.filter(function (p) {
        var c = p.created_by || p.createdBy;
        return c && mohOk[c];
      });
    });
  }

  global.MohScopeUtils = {
    normalizeEmail: normalizeEmail,
    isMohComEmail: isMohComEmail,
    shouldApplyMohPatientFilter: shouldApplyMohPatientFilter,
    filterPatientsByMohCreatorEmails: filterPatientsByMohCreatorEmails
  };
})(typeof window !== "undefined" ? window : this);
