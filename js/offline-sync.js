/**
 * Local-first sync: mirror Firestore docs in IndexedDB, outbox with first-to-cloud-wins.
 * Depends: firebase, OfflineStore, smartFirestoreQuery (optional).
 */
(function (global) {
  const CLOUD_WRITE_MS = 10000;

  function nowMs() {
    return Date.now();
  }

  function firestoreTimestampToMs(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    return 0;
  }

  /** Plain JSON-safe copy for IndexedDB (Timestamps → {seconds,nanoseconds}) */
  function serializeForMirror(data) {
    if (data === null || data === undefined) return data;
    if (data instanceof Date) return { __date: data.toISOString() };
    if (typeof data.toMillis === "function" && typeof data.seconds === "number") {
      return { __ts: { seconds: data.seconds, nanoseconds: data.nanoseconds || 0 } };
    }
    if (Array.isArray(data)) {
      return data.map(serializeForMirror);
    }
    if (typeof data === "object") {
      const out = {};
      Object.keys(data).forEach(function (k) {
        try {
          const v = data[k];
          if (v && typeof v.isEqual === "function") return;
          if (v && typeof v._methodName === "string") return;
          out[k] = serializeForMirror(v);
        } catch (e) {
          /* skip FieldValue etc */
        }
      });
      return out;
    }
    return data;
  }

  function deserializeFromMirror(data) {
    if (data === null || data === undefined) return data;
    if (data.__ts && typeof data.__ts.seconds === "number" && global.firebase && firebase.firestore) {
      return new firebase.firestore.Timestamp(data.__ts.seconds, data.__ts.nanoseconds || 0);
    }
    if (data.__date && typeof data.__date === "string") {
      return new Date(data.__date);
    }
    if (Array.isArray(data)) {
      return data.map(deserializeFromMirror);
    }
    if (typeof data === "object") {
      const out = {};
      Object.keys(data).forEach(function (k) {
        out[k] = deserializeFromMirror(data[k]);
      });
      return out;
    }
    return data;
  }

  function docServerTimeMs(plainPayload) {
    const p = plainPayload || {};
    const u = p.updated_at || p.updatedAt || p.modified_at;
    if (u && typeof u.toMillis === "function") return u.toMillis();
    if (u && typeof u.seconds === "number") return u.seconds * 1000;
    const c = p.created_at || p.createdAt;
    if (c && typeof c.toMillis === "function") return c.toMillis();
    if (c && typeof c.seconds === "number") return c.seconds * 1000;
    return 0;
  }

  function scopeKey(uid, role, township) {
    return (uid || "") + "|" + (role || "") + "|" + (township || "");
  }

  const LabourCareOffline = {
    serializeForMirror: serializeForMirror,
    deserializeFromMirror: deserializeFromMirror,

    isOnline: function () {
      return typeof navigator !== "undefined" && navigator.onLine;
    },

    setOfflineBanner: function (show, message) {
      const el = document.getElementById("labourCareOfflineBanner");
      if (!el) return;
      el.style.display = show ? "flex" : "none";
      if (message) el.querySelector(".labourCareOfflineBannerText").textContent = message;
    },

    /** Ingest one patient root doc from Firestore snapshot */
    ingestPatientRoot: function (docSnap) {
      if (!docSnap || !docSnap.id) return Promise.resolve();
      const path = "patients/" + docSnap.id;
      const data = docSnap.data ? docSnap.data() : docSnap;
      const plain = serializeForMirror(data);
      const rec = {
        path: path,
        payload: plain,
        baseServerUpdatedAt: Math.max(nowMs(), docServerTimeMs(data)),
        syncStatus: "synced",
        localUpdatedAt: nowMs()
      };
      return OfflineStore.putDocument(rec);
    },

    ingestSubDoc: function (patientId, subCollection, subId, data) {
      const path = "patients/" + patientId + "/" + subCollection + "/" + subId;
      const plain = serializeForMirror(data);
      const rec = {
        path: path,
        payload: plain,
        baseServerUpdatedAt: docServerTimeMs(data) || nowMs(),
        syncStatus: "synced",
        localUpdatedAt: nowMs()
      };
      return OfflineStore.putDocument(rec);
    },

    getPatientPayload: function (patientId) {
      return OfflineStore.getDocument("patients/" + patientId).then(function (rec) {
        if (!rec || !rec.payload) return null;
        return deserializeFromMirror(rec.payload);
      });
    },

    /** Normalize role strings from Firestore (spacing, case). */
    normalizeRoleKey: function (role) {
      return String(role || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
    },

    /** Township (TMO) or region (Regional Officer) from localStorage for scoped pull/sync */
    scopeFilterValueForRole: function (role) {
      const r = LabourCareOffline.normalizeRoleKey(role);
      if (r === "tmo") return localStorage.getItem("userTownship") || null;
      if (r === "regional officer") return localStorage.getItem("userRegion") || null;
      return null;
    },

    /** Patients visible to role (from mirror only) */
    getMirroredPatientList: function (uid, role, township) {
      return OfflineStore.getAllByPrefix("patients/").then(function (rows) {
        const byId = {};
        rows.forEach(function (r) {
          const parts = r.path.split("/");
          if (parts.length !== 2 || parts[0] !== "patients") return;
          const id = parts[1];
          if (!byId[id]) byId[id] = { id: id };
        });
        let list = Object.keys(byId).map(function (id) {
          return id;
        });
        return Promise.all(
          list.map(function (id) {
            return OfflineStore.getDocument("patients/" + id).then(function (rec) {
              if (!rec || !rec.payload) return null;
              const data = deserializeFromMirror(rec.payload);
              return { id: id, data: data, rec: rec };
            });
          })
        ).then(function (entries) {
          const out = [];
          const nr = LabourCareOffline.normalizeRoleKey(role);
          entries.forEach(function (e) {
            if (!e || !e.data) return;
            const d = e.data;
            const createdByMe = d.created_by === uid || d.createdBy === uid;
            const team = d.care_team_midwife_ids;
            const onTeam = Array.isArray(team) && team.indexOf(uid) !== -1;

            let include = false;
            if (nr === "super admin" || nr === "admin") {
              include = true;
            } else if (nr === "central") {
              include = true;
            } else if (nr === "tmo") {
              include = !!(township && d.township === township);
            } else if (nr === "regional officer") {
              include = !!(township && d.region === township);
            } else if (nr === "midwife" || nr === "") {
              include = createdByMe || onTeam;
            } else {
              // Any other role label (e.g. custom spelling): still show patients this user created offline
              include = createdByMe || onTeam;
            }

            if (include) {
              out.push({ id: e.id, ...d });
            }
          });
          return out;
        });
      });
    },

    saveAnalyticsBundle: function (uid, role, township, bundle) {
      const key = "analyticsBundle_" + scopeKey(uid, role, township);
      return OfflineStore.setMeta(key, {
        savedAt: nowMs(),
        bundle: bundle
      });
    },

    loadAnalyticsBundle: function (uid, role, township) {
      const key = "analyticsBundle_" + scopeKey(uid, role, township);
      return OfflineStore.getMeta(key);
    },

    /** After successful online buildAnalyticsData */
    persistAnalyticsFromBuild: function (uid, role, township, analyticsData) {
      return this.saveAnalyticsBundle(uid, role, township, JSON.parse(JSON.stringify(analyticsData)));
    },

    raceCloudWrite: function (promiseFactory, timeoutMs) {
      const ms = timeoutMs || CLOUD_WRITE_MS;
      return Promise.race([
        promiseFactory(),
        new Promise(function (_, reject) {
          setTimeout(function () {
            reject(new Error("cloud_timeout"));
          }, ms);
        })
      ]);
    },

    /**
     * Save new patient: mirror first, then cloud. Returns { localOk, cloudOk }.
     * patientPlain: object without FieldValues for mirror; firestorePayloadFn() adds server timestamps for cloud.
     */
    saveNewPatientWithSync: function (patientId, patientPlainForMirror, firestorePayload) {
      const path = "patients/" + patientId;
      const plain = serializeForMirror(patientPlainForMirror);
      const rec = {
        path: path,
        payload: plain,
        baseServerUpdatedAt: 0,
        syncStatus: "pending",
        localUpdatedAt: nowMs()
      };
      const db = firebase.firestore();
      return OfflineStore.putDocument(rec).then(function () {
        return LabourCareOffline.raceCloudWrite(function () {
          return db.collection("patients").doc(patientId).set(firestorePayload);
        }).then(
          function () {
            rec.syncStatus = "synced";
            rec.baseServerUpdatedAt = nowMs();
            return OfflineStore.putDocument(rec).then(function () {
              return { localOk: true, cloudOk: true };
            });
          },
          function (err) {
            console.warn("Cloud save pending:", err && err.message);
            return OfflineStore.addOutbox({
              path: path,
              op: "set",
              payload: serializeForMirror(firestorePayload),
              baseServerUpdatedAt: 0,
              createdAt: nowMs(),
              retries: 0
            }).then(function () {
              return { localOk: true, cloudOk: false };
            });
          }
        );
      });
    },

    /** Process outbox: first-to-cloud-wins using server doc read */
    flushOutbox: function () {
      if (!LabourCareOffline.isOnline()) {
        return Promise.resolve({ processed: 0, skipped: 0, errors: 0 });
      }
      const db = firebase.firestore();
      return OfflineStore.getAllOutbox().then(function (items) {
        let processed = 0;
        let skipped = 0;
        let errors = 0;
        return items
          .reduce(function (chain, item) {
            return chain.then(function () {
              const path = item.path;
              const parts = path.split("/");
              if (parts[0] !== "patients" || !parts[1]) {
                return OfflineStore.deleteOutbox(item.id).then(function () {
                  processed++;
                });
              }
              const pid = parts[1];
              const ref = db.collection("patients").doc(pid);
              return ref.get({ source: "server" }).then(function (serverDoc) {
                const sd = serverDoc.exists ? serverDoc.data() : null;
                const serverMs = sd
                  ? Math.max(
                      firestoreTimestampToMs(sd.updated_at || sd.updatedAt),
                      firestoreTimestampToMs(sd.created_at || sd.createdAt)
                    )
                  : 0;
                const base = item.baseServerUpdatedAt || 0;
                if (serverDoc.exists && serverMs > base && base > 0) {
                  skipped++;
                  return OfflineStore.deleteOutbox(item.id);
                }
                const payload = deserializeFromMirror(item.payload);
                const withTs = Object.assign({}, payload, {
                  updated_at: firebase.firestore.FieldValue.serverTimestamp()
                });
                if (withTs.created_at == null && withTs.createdAt == null) {
                  withTs.created_at = firebase.firestore.FieldValue.serverTimestamp();
                }
                return ref.set(withTs, { merge: true }).then(function () {
                  processed++;
                  return OfflineStore.deleteOutbox(item.id);
                });
              }).catch(function () {
                errors++;
              });
            });
          }, Promise.resolve())
          .then(function () {
            return { processed: processed, skipped: skipped, errors: errors };
          });
      });
    },

    /** Full pull: patient roots for scope + deep subdocs for analytics (best-effort) */
    fullPullForScope: function (uid, role, township) {
      if (!LabourCareOffline.isOnline()) {
        return Promise.reject(
          new Error("You are offline. Connect to the internet, then tap Sync again.")
        );
      }
      const db = firebase.firestore();
      const qFn = global.smartFirestoreQuery || function (p, o) {
        return p.then(function (qr) {
          return qr.get();
        });
      };

      function runQuery(q) {
        return qFn(Promise.resolve(q), {
          timeout: 15000,
          retries: 1,
          fallbackToCache: true
        });
      }

      let patientSnaps = [];

      const r = LabourCareOffline.normalizeRoleKey(role);
      const scope = township;

      if (r === "super admin" || r === "admin") {
        return runQuery(db.collection("patients")).then(function (snap) {
          patientSnaps = [];
          if (snap && snap.forEach) {
            snap.forEach(function (d) {
              patientSnaps.push(d);
            });
          }
          return LabourCareOffline._deepMirrorPatients(patientSnaps);
        });
      }
      if (r === "central") {
        return runQuery(db.collection("patients")).then(function (snap) {
          patientSnaps = [];
          if (snap && snap.forEach) {
            snap.forEach(function (d) {
              patientSnaps.push(d);
            });
          }
          return LabourCareOffline._deepMirrorPatients(patientSnaps);
        });
      }
      if (r === "regional officer" && scope) {
        return runQuery(db.collection("patients").where("region", "==", scope)).then(function (snap) {
          patientSnaps = [];
          if (snap && snap.forEach) {
            snap.forEach(function (d) {
              patientSnaps.push(d);
            });
          }
          return LabourCareOffline._deepMirrorPatients(patientSnaps);
        });
      }
      if (r === "tmo" && scope) {
        return runQuery(db.collection("patients").where("township", "==", scope)).then(function (snap) {
          patientSnaps = [];
          if (snap && snap.forEach) {
            snap.forEach(function (d) {
              patientSnaps.push(d);
            });
          }
          return LabourCareOffline._deepMirrorPatients(patientSnaps);
        });
      }
      return Promise.all([
        runQuery(db.collection("patients").where("created_by", "==", uid)),
        runQuery(db.collection("patients").where("createdBy", "==", uid))
      ]).then(function (results) {
        const map = {};
        results.forEach(function (snap) {
          if (snap && snap.forEach) {
            snap.forEach(function (d) {
              map[d.id] = d;
            });
          }
        });
        patientSnaps = Object.values(map);
        return LabourCareOffline._deepMirrorPatients(patientSnaps);
      });
    },

    _deepMirrorPatients: function (docSnaps) {
      const db = firebase.firestore();
      return Promise.all(
        docSnaps.map(function (d) {
          return LabourCareOffline.ingestPatientRoot(d).then(function () {
            const id = d.id;
            const pref = db.collection("patients").doc(id);
            return Promise.all([
              pref.collection("antenatal_visits").limit(50).get().catch(function () {
                return { forEach: function () {} };
              }),
              pref.collection("postpartum_visits").limit(50).get().catch(function () {
                return { forEach: function () {} };
              }),
              pref.collection("testRecords").limit(50).get().catch(function () {
                return { forEach: function () {} };
              }),
              pref.collection("immediate_newborn_care").limit(10).get().catch(function () {
                return { forEach: function () {} };
              }),
              pref.collection("newborn_care").limit(10).get().catch(function () {
                return { forEach: function () {} };
              }),
              pref.collection("records").doc("summary").get().catch(function () {
                return { exists: false };
              }),
              pref.collection("records").doc("birthRecord").get().catch(function () {
                return { exists: false };
              }),
              pref.collection("records").doc("endTreatment").get().catch(function () {
                return { exists: false };
              }),
              pref.collection("records").doc("transferRecord").get().catch(function () {
                return { exists: false };
              }),
              pref.collection("records").doc("outcomeRecord").get().catch(function () {
                return { exists: false };
              })
            ]).then(function (results) {
              const av = results[0];
              const pv = results[1];
              const tr = results[2];
              const imm = results[3];
              const nb = results[4];
              const subWrites = [];
              if (av && av.forEach) {
                av.forEach(function (sub) {
                  subWrites.push(LabourCareOffline.ingestSubDoc(id, "antenatal_visits", sub.id, sub.data()));
                });
              }
              if (pv && pv.forEach) {
                pv.forEach(function (sub) {
                  subWrites.push(LabourCareOffline.ingestSubDoc(id, "postpartum_visits", sub.id, sub.data()));
                });
              }
              if (tr && tr.forEach) {
                tr.forEach(function (sub) {
                  subWrites.push(LabourCareOffline.ingestSubDoc(id, "testRecords", sub.id, sub.data()));
                });
              }
              if (imm && imm.forEach) {
                imm.forEach(function (sub) {
                  subWrites.push(LabourCareOffline.ingestSubDoc(id, "immediate_newborn_care", sub.id, sub.data()));
                });
              }
              if (nb && nb.forEach) {
                nb.forEach(function (sub) {
                  subWrites.push(LabourCareOffline.ingestSubDoc(id, "newborn_care", sub.id, sub.data()));
                });
              }
              ["summary", "birthRecord", "endTreatment", "transferRecord", "outcomeRecord"].forEach(function (name, i) {
                const doc = results[5 + i];
                if (doc && doc.exists) {
                  subWrites.push(LabourCareOffline.ingestSubDoc(id, "records", name, doc.data()));
                }
              });
              return Promise.all(subWrites);
            });
          });
        })
      );
    },

    /** Build analytics-shaped patients from mirror (offline dashboard) */
    buildAnalyticsPatientsFromMirror: function () {
      return OfflineStore.getAllByPrefix("patients/").then(function (rows) {
        const patientIds = {};
        rows.forEach(function (r) {
          const p = r.path.split("/");
          if (p.length >= 2 && p[0] === "patients") {
            patientIds[p[1]] = true;
          }
        });
        return Promise.all(
          Object.keys(patientIds).map(function (pid) {
            return LabourCareOffline._assembleAnalyticsEntryFromMirror(pid);
          })
        );
      });
    },

    _assembleAnalyticsEntryFromMirror: function (patientId) {
      const prefix = "patients/" + patientId + "/";
      return OfflineStore.getAllByPrefix(prefix).then(function (subs) {
        const antenatalVisits = [];
        const postpartumVisits = [];
        const testRecords = [];
        let summary = null;
        let birthRecord = null;
        let endTreatment = null;
        let transferRecord = null;
        let outcomeRecord = null;

        subs.forEach(function (r) {
          const parts = r.path.split("/");
          const col = parts[2];
          const sid = parts[3];
          const data = deserializeFromMirror(r.payload);
          if (col === "antenatal_visits") {
            antenatalVisits.push({ id: sid, data: data });
          } else if (col === "postpartum_visits") {
            postpartumVisits.push({ id: sid, data: data });
          } else if (col === "testRecords") {
            testRecords.push({ id: sid, data: data });
          } else if (col === "records") {
            if (sid === "summary") summary = data;
            if (sid === "birthRecord") birthRecord = { id: sid, data: data };
            if (sid === "endTreatment") endTreatment = { id: sid, data: data };
            if (sid === "transferRecord") transferRecord = { id: sid, data: data };
            if (sid === "outcomeRecord") outcomeRecord = { id: sid, data: data };
          }
        });

        return OfflineStore.getDocument("patients/" + patientId).then(function (rootRec) {
          const profile = rootRec && rootRec.payload ? deserializeFromMirror(rootRec.payload) : {};
          return {
            id: patientId,
            profile: profile,
            antenatalVisits: antenatalVisits,
            postpartumVisits: postpartumVisits,
            testRecords: testRecords,
            summary: summary,
            birthRecord: birthRecord,
            endTreatment: endTreatment,
            transferRecord: transferRecord,
            outcomeRecord: outcomeRecord,
            matchesDateFilter: true
          };
        });
      });
    }
  };

  global.LabourCareOffline = LabourCareOffline;

  global.addEventListener("online", function () {
    LabourCareOffline.setOfflineBanner(false);
  });
  global.addEventListener("offline", function () {
    LabourCareOffline.setOfflineBanner(true, "Working offline — showing saved data. Tap Sync when connected.");
  });
})(typeof window !== "undefined" ? window : globalThis);
